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

  // Pull order + listing rules
  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select(
      `
      id, seller_id, status, version, listing_id,
      market_listings ( id, category, delivery_type )
    `,
    )
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.seller_id !== u.user.id) return bad("Not your order");

  const listing = order.market_listings;
  if (!listing) return bad("Listing missing");

  // Only allowed for services (not physical products)
  if (listing.category !== "service") return bad("Only service orders can use seller-mark-delivered");
  if (!["digital", "in_person"].includes(listing.delivery_type)) return bad("Invalid service delivery_type");

  // Only allow if currently IN_ESCROW or DELIVERABLE_UPLOADED (optional)
  if (!["IN_ESCROW", "DELIVERABLE_UPLOADED"].includes(order.status)) {
    return bad("Order must be IN_ESCROW or DELIVERABLE_UPLOADED");
  }

  const { data: updated, error } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "DELIVERED",
    p_note: "Seller marked DELIVERED (service)",
  });

  if (error) return bad(error.message);
  return ok({ order: updated });
});
