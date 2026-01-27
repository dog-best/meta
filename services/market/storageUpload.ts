import { supabase } from "@/services/supabase";
import * as FileSystem from "expo-file-system";

/**
 * Uploads a local image URI to Supabase Storage and returns a public URL.
 * Bucket should be public for MVP.
 */
 type UploadParams = {
  bucket: string;
  path: string; // e.g. `${userId}/logo-${Date.now()}.jpg`
  localUri: string;
  contentType?: string;
  };

function decodeBase64(base64: string) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}


  // Read file as base64 then convert to Uint8Array
async function readFileAsBytes(localUri: string) {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: "base64" as any,
  });
  return decodeBase64(base64);
}

export async function uploadToSupabaseStorage(params: UploadParams) {
  const { bucket, path, localUri, contentType = "image/jpeg" } = params;
  const bytes = await readFileAsBytes(localUri);

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
 return { publicUrl: data?.publicUrl ?? null, storagePath: path };
}

export async function uploadImageToSupabase(params: UploadParams): Promise<string> {
  const { publicUrl } = await uploadToSupabaseStorage(params);
  if (!publicUrl) throw new Error("Failed to get public URL");

  return publicUrl;
}

// Backward-compatible alias (some screens import uploadListingImage)
export const uploadListingImage = uploadImageToSupabase;
