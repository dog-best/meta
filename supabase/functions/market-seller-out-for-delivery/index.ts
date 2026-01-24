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
  if (!order_id) return bad("order_id required");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,seller_id,status,version")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.seller_id !== u.user.id) return bad("Not your order");

  if (order.status !== "IN_ESCROW") return bad("Order must be IN_ESCROW");

  const { data: updated, error } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "OUT_FOR_DELIVERY",
    p_note: "Seller marked OUT_FOR_DELIVERY",
  });

  if (error) return bad(error.message);
  return ok({ order: updated });
});
