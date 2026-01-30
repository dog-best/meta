import { supabase } from "@/services/supabase";

export type DeliverableAccess = "preview" | "final";
export type DeliverableKind = "image" | "audio" | "video" | "file" | "link";

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

export async function signedUrl(bucket: string, path: string, expiresSec = 900) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSec);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}

export async function signedUrlForDeliverable(d: OrderDeliverable, expiresSec = 900) {
  if (!d.storage_path) return null;
  return signedUrl(d.storage_bucket || "market-deliverables", d.storage_path, expiresSec);
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
