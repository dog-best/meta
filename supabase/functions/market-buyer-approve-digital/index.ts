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
    .select(
      `
      id, buyer_id, status, version, currency,
      market_listings ( id, category, delivery_type )
    `,
    )
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.buyer_id !== u.user.id) return bad("Not your order");

  const listing = order.market_listings;
  if (!listing) return bad("Listing missing");

  // Only for digital services
  if (listing.category !== "service" || listing.delivery_type !== "digital") {
    return bad("This approval endpoint is only for digital services");
  }

  if (order.status !== "DELIVERABLE_UPLOADED") {
    return bad("Order must be DELIVERABLE_UPLOADED");
  }

  if (order.currency !== "NGN") {
    return bad("Only NGN wallet release supported for now");
  }

  // Step 1: mark DELIVERED
  const { data: delivered, error: te } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "DELIVERED",
    p_note: "Buyer approved digital deliverable",
  });

  if (te) return bad(te.message);

  // Step 2: release escrow -> seller wallet credit -> RELEASED
  const { data: released, error: re } = await admin.rpc("market_wallet_release_to_seller", {
    p_order_id: order_id,
    p_expected_version: delivered.version, // important: use new version after DELIVERED
  });

  if (re) return bad(re.message);

  return ok({ order: released });
});
