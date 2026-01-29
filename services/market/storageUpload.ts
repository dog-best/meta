import { supabase } from "@/services/supabase";
import * as FileSystem from "expo-file-system/legacy";

type UploadParams = {
  bucket: string;
  path: string; // e.g. `${userId}/logo/logo_${Date.now()}.jpg`
  localUri: string;
  contentType?: string;
  upsert?: boolean; // ✅ optional, won't break existing call sites
};

// ---------------- TIMEOUT WRAPPER ----------------
function withTimeout<T>(p: Promise<T>, ms: number, label = "Operation") {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

// Pure JS base64 decoder (no atob / no extra packages)
function base64ToUint8Array(base64: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let str = base64.replace(/=+$/, "");
  const bytesLength = (str.length * 3) >> 2;
  const bytes = new Uint8Array(bytesLength);

  let p = 0;
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str[i]);
    const enc2 = chars.indexOf(str[i + 1]);
    const enc3 = chars.indexOf(str[i + 2] || "A");
    const enc4 = chars.indexOf(str[i + 3] || "A");

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    bytes[p++] = chr1;
    if (str[i + 2] !== undefined) bytes[p++] = chr2;
    if (str[i + 3] !== undefined) bytes[p++] = chr3;
  }

  return bytes.slice(0, p);
}

async function readFileAsBytes(localUri: string) {
  // Reading large files can hang sometimes; give it a timeout too.
  const base64 = await withTimeout(
    FileSystem.readAsStringAsync(localUri, {
      encoding: "base64" as any, // ✅ works even when EncodingType is missing
    }),
    30000,
    "Reading file",
  );

  return base64ToUint8Array(base64);
}

export async function uploadToSupabaseStorage(params: UploadParams) {
  const { bucket, path, localUri, contentType = "image/jpeg", upsert = true } = params;

  // Ensure session exists so Storage request includes JWT
  const { data: sess, error: sessErr } = await withTimeout(
    supabase.auth.getSession(),
    15000,
    "Auth session check",
  );
  if (sessErr) throw sessErr;
  if (!sess.session) throw new Error("No session. Please sign in again.");

  const bytes = await readFileAsBytes(localUri);

  // Storage uploads can be slow on mobile networks; allow 2 minutes
  const uploadPromise = supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert,
  });

  const { error: uploadErr } = await withTimeout(uploadPromise, 120000, "Storage upload");
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { publicUrl: data?.publicUrl ?? null, storagePath: path };
}

export async function uploadImageToSupabase(params: UploadParams): Promise<string> {
  const { publicUrl } = await uploadToSupabaseStorage(params);
  if (!publicUrl) throw new Error("Failed to get public URL");
  return publicUrl;
}

// Backward-compatible alias
export const uploadListingImage = uploadImageToSupabase;
