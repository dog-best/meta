import { supabase } from "@/services/supabase";
import * as FileSystem from "expo-file-system";

/**
 * Uploads a local image URI to Supabase Storage and returns a public URL.
 * Bucket should be public for MVP.
 */
export async function uploadImageToSupabase(params: {
  bucket: string;
  path: string; // e.g. `${userId}/logo-${Date.now()}.jpg`
  localUri: string;
  contentType?: string;
}): Promise<string> {
  const { bucket, path, localUri, contentType = "image/jpeg" } = params;

  // Read file as base64 then convert to Uint8Array
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" as any }
);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Failed to get public URL");

  return data.publicUrl;
}

// Backward-compatible alias (some screens import uploadListingImage)
export const uploadListingImage = uploadImageToSupabase;
