import { supabase } from "@/services/supabase";

export type OrderDeliverable = {
  id: string;
  order_id: string;
  access: "preview" | "final";
  kind: "image" | "audio" | "video" | "file" | "link";
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
    .select("id,order_id,access,kind,title,sort_order,storage_bucket,storage_path,link_url,mime_type,duration_sec,preview_seconds,meta,created_at")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as OrderDeliverable[];
}

export async function signedUrlForDeliverable(d: OrderDeliverable, expiresSec = 600) {
  if (!d.storage_path) return null;
  const bucket = d.storage_bucket || "market-deliverables";

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(d.storage_path, expiresSec);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}
