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
    .select("id,buyer_id,status,version,listing_id,quantity")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.buyer_id !== u.user.id) return bad("Not your order");

  if (order.status !== "CREATED") {
    return bad("Only CREATED orders can be cancelled");
  }

  // Transition to CANCELLED
  const { data: cancelled, error: te } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "CANCELLED",
    p_note: "Buyer cancelled before escrow",
  });

  if (te) return bad(te.message);

  // Optional: restore stock (if stock_qty used)
  const { data: listing } = await admin
    .from("market_listings")
    .select("id,stock_qty")
    .eq("id", order.listing_id)
    .maybeSingle();

  if (listing?.stock_qty !== null && listing?.stock_qty !== undefined) {
    await admin
      .from("market_listings")
      .update({ stock_qty: (Number(listing.stock_qty) + Number(order.quantity)) })
      .eq("id", order.listing_id);
  }

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "ORDER_CANCELLED",
    entity_type: "market_orders",
    entity_id: order_id,
    payload: {},
  });

  return ok({ order: cancelled });
});
