import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body.order_id ?? "");
  const storage_path_full = String(body.storage_path_full ?? "").trim();
  const storage_path_preview = String(body.storage_path_preview ?? "").trim();

  if (!order_id) return bad("order_id required");
  if (!storage_path_full) return bad("storage_path_full required");
  if (!storage_path_preview) return bad("storage_path_preview required");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,seller_id,status,version")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.seller_id !== u.user.id) return bad("Not your order");
  if (order.status !== "IN_ESCROW") return bad("Order must be IN_ESCROW (digital service) to upload deliverable");

  // Create deliverable record
  const { data: deliv, error } = await admin
    .from("market_deliverables")
    .upsert(
      { order_id, storage_path_full, storage_path_preview, uploaded_by: u.user.id },
      { onConflict: "order_id" },
    )
    .select("*")
    .single();

  if (error) return bad(error.message);

  // Move to DELIVERABLE_UPLOADED
  const { data: updated, error: te } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "DELIVERABLE_UPLOADED",
    p_note: "Seller uploaded deliverable",
  });

  if (te) return bad(te.message);

  return ok({ deliverable: deliv, order: updated });
});
