import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

function normalizeOrder(order: any) {
  const listing = order.market_listings ?? null;

  return {
    ...order,
    listing,
    cover_image: listing?.market_listing_images ?? null,
    seller_profile: listing?.market_seller_profiles ?? null,
    market_listings: undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const url = new URL(req.url);
  const order_id = url.searchParams.get("order_id");
  if (!order_id) return bad("order_id is required");

  const { data: order, error } = await admin
    .from("market_orders")
    .select(
      `
      *,
      market_listings (
        id, seller_id, title, sub_category, category, delivery_type, currency, price_amount, cover_image_id, is_active,
        market_listing_images!market_listings_cover_image_fk ( id, storage_path, public_url ),
        market_seller_profiles ( user_id, business_name, market_username, display_name, logo_path, banner_path, is_verified, active )
      )
    `,
    )
    .eq("id", order_id)
    .maybeSingle();

  if (error) return bad(error.message);
  if (!order) return bad("Order not found");

  // Must be buyer or seller
  if (order.buyer_id !== u.user.id && order.seller_id !== u.user.id) return bad("Not allowed");

  const [ledgerRes, otpRes, disputeRes, deliverableRes] = await Promise.all([
    admin.from("market_escrow_ledger").select("*").eq("order_id", order_id).maybeSingle(),
    admin.from("market_order_otps").select("order_id, expires_at, attempts, verified_at, created_at").eq("order_id", order_id).maybeSingle(),
    admin.from("market_disputes").select("*").eq("order_id", order_id).maybeSingle(),
    admin.from("market_deliverables").select("*").eq("order_id", order_id).maybeSingle(),
  ]);

  return ok({
    order: normalizeOrder(order),
    escrow_ledger: ledgerRes.data ?? null,
    otp: otpRes.data ?? null,
    dispute: disputeRes.data ?? null,
    deliverable: deliverableRes.data ?? null,
  });
});
