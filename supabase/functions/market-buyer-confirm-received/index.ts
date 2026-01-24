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
    .select("id,buyer_id,status,version,currency")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.buyer_id !== u.user.id) return bad("Not your order");

  // For v1:
  // physical -> buyer confirms after DELIVERED
  // digital -> buyer confirms after DELIVERED (you can also allow DELIVERABLE_UPLOADED + preview/approve later)
  if (order.status !== "DELIVERED") return bad("Order must be DELIVERED before release");
  if (order.currency !== "NGN") return bad("Only NGN wallet release supported for now");

  const { data: released, error } = await admin.rpc("market_wallet_release_to_seller", {
    p_order_id: order_id,
    p_expected_version: order.version,
  });

  if (error) return bad(error.message);
  return ok({ order: released });
});
