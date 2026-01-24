import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const listing_id = String(body.listing_id ?? "");
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  const delivery_address = body.delivery_address ?? {};

  if (!listing_id) return bad("listing_id required");
  if (!Number.isInteger(quantity) || quantity < 1) return bad("quantity must be >= 1");

  const { data: listing, error: le } = await admin
    .from("market_listings")
    .select("id,seller_id,price_amount,currency,is_active,stock_qty")
    .eq("id", listing_id)
    .maybeSingle();

  if (le || !listing || !listing.is_active) return bad("Listing not found or inactive");
  if (listing.seller_id === u.user.id) return bad("You cannot buy your own listing");

  if (listing.stock_qty !== null && listing.stock_qty < quantity) {
    return bad("Not enough stock");
  }

  const unit_price = Number(listing.price_amount);
  const amount = Number((unit_price * quantity).toFixed(2));

  const { data: order, error } = await admin
    .from("market_orders")
    .insert({
      buyer_id: u.user.id,
      seller_id: listing.seller_id,
      listing_id: listing.id,
      quantity,
      unit_price,
      amount,
      currency: listing.currency,
      status: "CREATED",
      delivery_address,
      note: body.note ? String(body.note) : null,
    })
    .select("*")
    .single();

  if (error) return bad(error.message);

  // Decrement stock (optional v1 behavior)
  if (listing.stock_qty !== null) {
    await admin
      .from("market_listings")
      .update({ stock_qty: listing.stock_qty - quantity })
      .eq("id", listing.id);
  }

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "ORDER_CREATED",
    entity_type: "market_orders",
    entity_id: order.id,
    payload: { listing_id, quantity, amount },
  });

  return ok({ order });
});
