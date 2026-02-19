import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

function clampExpires(input: unknown) {
  const n = Number(input ?? 900);
  if (!Number.isFinite(n)) return 900;
  return Math.min(3600, Math.max(60, Math.floor(n)));
}

function decodeMaybe(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(req);

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const deliverableId = String(body?.deliverable_id ?? "").trim();
  const orderId = String(body?.order_id ?? "").trim();
  let access = String(body?.access ?? "").trim().toLowerCase();
  let bucket = String(body?.storage_bucket ?? "").trim();
  let storagePath = String(body?.storage_path ?? "").trim();
  const expiresSec = clampExpires(body?.expires_sec);
  const wantsDownload =
    body?.download === true || String(body?.download ?? "").trim().toLowerCase() === "true";
  const filename = String(body?.filename ?? "").trim();

  if (!orderId && !deliverableId) return bad("order_id or deliverable_id required");

  let deliverable:
    | {
        id: string;
        order_id: string;
        access: string;
        storage_bucket: string;
        storage_path: string;
      }
    | null = null;

  if (deliverableId) {
    const { data: dById, error: dByIdErr } = await admin
      .from("market_order_deliverables")
      .select("id,order_id,access,storage_bucket,storage_path")
      .eq("id", deliverableId)
      .maybeSingle();
    if (dByIdErr) return bad(dByIdErr.message);
    if (!dById) return bad("Deliverable not found");
    deliverable = dById;
  }

  const resolvedOrderId = orderId || deliverable?.order_id || "";
  if (!resolvedOrderId) return bad("order_id required");

  const { data: order, error: orderErr } = await admin
    .from("market_orders")
    .select("id,buyer_id,seller_id,status")
    .eq("id", resolvedOrderId)
    .maybeSingle();
  if (orderErr) return bad(orderErr.message);
  if (!order) return bad("Order not found");

  const isBuyer = order.buyer_id === user.id;
  const isSeller = order.seller_id === user.id;
  if (!isBuyer && !isSeller) return bad("Not your order");

  if (deliverable && deliverable.order_id !== order.id) {
    return bad("deliverable_id does not belong to order_id");
  }

  if (!deliverable) {
    if (!bucket) return bad("storage_bucket required");
    if (!storagePath) return bad("storage_path required");

    const { data: dByPath, error: dByPathErr } = await admin
      .from("market_order_deliverables")
      .select("id,order_id,access,storage_bucket,storage_path")
      .eq("order_id", order.id)
      .eq("storage_bucket", bucket)
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (dByPathErr) return bad(dByPathErr.message);
    if (!dByPath) return bad("Deliverable not found");
    deliverable = dByPath;
  }

  const rowAccess = String(deliverable.access || "").trim().toLowerCase();
  const rowBucket = String(deliverable.storage_bucket || "").trim();
  const rowStoragePath = decodeMaybe(String(deliverable.storage_path || "").trim());

  if (access && access !== rowAccess) return bad("access mismatch for deliverable");
  if (bucket && bucket !== rowBucket) return bad("storage_bucket mismatch for deliverable");
  if (storagePath && decodeMaybe(storagePath) !== rowStoragePath) return bad("storage_path mismatch for deliverable");

  access = rowAccess;
  bucket = rowBucket;
  storagePath = rowStoragePath;

  if (!["preview", "final"].includes(access)) return bad("invalid deliverable access");
  if (!bucket) return bad("storage_bucket required");
  if (!storagePath) return bad("storage_path required");

  // Buyer can only access full files after delivery/release.
  if (isBuyer && access === "final") {
    const s = String(order.status || "").toUpperCase();
    if (!["DELIVERED", "RELEASED"].includes(s)) {
      return bad("Full deliverable not available yet");
    }
  }

  const signOptions =
    wantsDownload && filename
      ? { download: filename }
      : wantsDownload
      ? { download: true }
      : undefined;
  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresSec, signOptions as any);
  if (signErr) return bad(signErr.message, { code: (signErr as any)?.code ?? null });
  const url = String(signed?.signedUrl ?? "").trim();
  if (!url) return bad("Signed URL unavailable");

  return ok({ ok: true, url, expires_sec: expiresSec });
});
