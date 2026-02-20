import { supabase } from "@/services/supabase";

export type DeliverableAccess = "preview" | "final";
export type DeliverableKind = "image" | "audio" | "video" | "file" | "link";
const FN_ORDER_DELIVERABLE_URL = "market-order-deliverable-url";
const DEFAULT_DELIVERABLE_BUCKET = "market-deliverables";
export type SignedUrlOptions = { download?: boolean | string };

export type OrderDeliverable = {
  id: string;
  order_id: string;
  access: DeliverableAccess;
  kind: DeliverableKind;
  title: string | null;
  sort_order: number;
  storage_bucket: string;
  storage_path: string | null;
  link_url: string | null;
  mime_type: string | null;
  duration_sec: number | null;
  preview_seconds: number | null;
  meta: any;
  created_at: string;
};

function looksLikeHttpUrl(input?: string | null) {
  return /^https?:\/\//i.test(String(input || "").trim());
}

function decodeMaybe(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeStoragePath(bucket: string, rawPath: string) {
  const p = String(rawPath || "").trim();
  if (!p) return "";
  if (looksLikeHttpUrl(p)) return p;

  let out = p.replace(/^\/+/, "");
  out = decodeMaybe(out);
  const prefixA = `${bucket}/`;
  const prefixB = `public/${bucket}/`;
  if (out.startsWith(prefixB)) out = out.slice(prefixB.length);
  if (out.startsWith(prefixA)) out = out.slice(prefixA.length);
  return out;
}

function normalizeBucket(raw?: string | null) {
  const b = String(raw || "").trim();
  return b || DEFAULT_DELIVERABLE_BUCKET;
}

export async function listOrderDeliverables(orderId: string) {
  const { data, error } = await supabase
    .from("market_order_deliverables")
    .select(
      "id,order_id,access,kind,title,sort_order,storage_bucket,storage_path,link_url,mime_type,duration_sec,preview_seconds,meta,created_at",
    )
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as OrderDeliverable[];
}

export async function signedUrl(bucket: string, path: string, expiresSec = 900, options: SignedUrlOptions = {}) {
  const firstBucket = normalizeBucket(bucket);
  const candidateBuckets =
    firstBucket === DEFAULT_DELIVERABLE_BUCKET ? [firstBucket] : [firstBucket, DEFAULT_DELIVERABLE_BUCKET];
  const download = options.download;
  const signOptions =
    typeof download === "string" && download.trim()
      ? { download: download.trim() }
      : download
      ? { download: true }
      : undefined;

  let lastErr: any = null;
  for (const candidateBucket of candidateBuckets) {
    const normalizedPath = normalizeStoragePath(candidateBucket, path);
    if (!normalizedPath) continue;
    if (looksLikeHttpUrl(normalizedPath)) return normalizedPath;

    const { data, error } = await supabase.storage
      .from(candidateBucket)
      .createSignedUrl(normalizedPath, expiresSec, signOptions as any);
    if (!error) {
      return data?.signedUrl ?? null;
    }

    const msg = String(error.message || "");
    const code = String((error as any)?.code || "");
    lastErr = error;

    // Some Storage RLS policy SQL expressions can throw 22P02 on signed URL queries.
    // Fall back to public URL when possible so previews still render.
    if (code === "22P02" || msg.includes("22P02") || /invalid input syntax/i.test(msg)) {
      const pub = supabase.storage.from(candidateBucket).getPublicUrl(normalizedPath)?.data?.publicUrl || null;
      if (pub) return pub;
    }
  }

  if (lastErr) {
    const msg = String(lastErr.message || "");
    const code = String((lastErr as any)?.code || "");
    throw new Error(code ? `${msg} (code: ${code})` : msg);
  }
  return null;
}

async function signedUrlViaFunction(
  deliverableId: string,
  orderId: string,
  access: DeliverableAccess,
  bucket: string,
  path: string,
  expiresSec = 900,
  options: SignedUrlOptions = {},
) {
  const { data, error } = await supabase.functions.invoke(FN_ORDER_DELIVERABLE_URL, {
    body: {
      deliverable_id: deliverableId,
      order_id: orderId,
      access,
      storage_bucket: bucket,
      storage_path: path,
      expires_sec: expiresSec,
      download: typeof options.download === "boolean" ? options.download : !!options.download,
      filename: typeof options.download === "string" ? options.download : null,
    },
  });
  if (error) throw new Error(String(error.message || error));
  const url = String((data as any)?.url || "").trim();
  return url || null;
}

export async function signedUrlForDeliverable(d: OrderDeliverable, expiresSec = 900, options: SignedUrlOptions = {}) {
  if (!d.storage_path) return null;
  const bucket = normalizeBucket(d.storage_bucket);
  const normalizedPath = normalizeStoragePath(bucket, d.storage_path);
  if (!normalizedPath) return null;
  if (looksLikeHttpUrl(normalizedPath)) return normalizedPath;

  // Use Edge Function first so URL signing runs with service role
  // and bypasses client-side Storage policy/cast issues.
  try {
    const viaFn = await signedUrlViaFunction(d.id, d.order_id, d.access, bucket, normalizedPath, expiresSec, options);
    if (viaFn) return viaFn;
  } catch {
    // continue to direct call fallback
  }

  try {
    const direct = await signedUrl(bucket, normalizedPath, expiresSec, options);
    if (direct) return direct;
  } catch {
    // continue to public URL fallback
  }

  const pub = supabase.storage.from(bucket).getPublicUrl(normalizedPath)?.data?.publicUrl || null;
  return pub;
}

export function guessKindFromMime(mime: string | null, name: string | null): DeliverableKind {
  const m = (mime ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();

  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";

  if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")) return "image";
  if (n.endsWith(".mp3") || n.endsWith(".wav") || n.endsWith(".m4a") || n.endsWith(".aac")) return "audio";
  if (n.endsWith(".mp4") || n.endsWith(".mov") || n.endsWith(".webm") || n.endsWith(".mkv")) return "video";

  return "file";
}

export async function insertFileDeliverable(args: {
  orderId: string;
  access: DeliverableAccess;
  kind: DeliverableKind;
  title?: string | null;
  sortOrder?: number;
  bucket?: string;
  storagePath: string;
  mimeType?: string | null;
  meta?: any;
}) {
  const {
    orderId,
    access,
    kind,
    title = null,
    sortOrder = 0,
    bucket = "market-deliverables",
    storagePath,
    mimeType = null,
    meta = {},
  } = args;

  const { error } = await supabase.from("market_order_deliverables").insert({
    order_id: orderId,
    access,
    kind,
    title,
    sort_order: sortOrder,
    storage_bucket: bucket,
    storage_path: storagePath,
    mime_type: mimeType,
    meta,
  });

  if (error) throw new Error(error.message);
}
