import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const url = new URL(req.url);
  const order_id = url.searchParams.get("order_id");
  if (!order_id) return bad("order_id is required");

  // Fetch order + listing + cover image
  const { data: order, error } = await admin
    .from("market_orders")
    .select(
      `
      *,
      market_listings (
        id, title, sub_category, category, delivery_type, currency, price_amount, cover_image_id, seller_id,
        market_listing_images!market_listings_cover_image_fk ( id, storage_path, public_url ),
        market_seller_profiles ( user_id, business_name, market_username, display_name, logo_path, banner_path, is_verified, active )
      )
    `,
    )
    .eq("id", order_id)
    .maybeSingle();

  if (error) return bad(error.message);
  if (!order) return bad("Order not found");

  const isParty = order.buyer_id === u.user.id || order.seller_id === u.user.id;
  if (!isParty) return bad("Not allowed");

  // Get related rows (optional)
  const [ledgerRes, otpRes, disputeRes, deliverableRes] = await Promise.all([
    admin.from("market_escrow_ledger").select("*").eq("order_id", order_id).maybeSingle(),
    admin.from("market_order_otps").select("order_id, expires_at, attempts, verified_at, created_at").eq("order_id", order_id).maybeSingle(),
    admin.from("market_disputes").select("*").eq("order_id", order_id).maybeSingle(),
    admin.from("market_deliverables").select("*").eq("order_id", order_id).maybeSingle(),
  ]);

  // NOTE: We intentionally do NOT return otp_hash
  const ledger = ledgerRes.data ?? null;
  const otp = otpRes.data ?? null;
  const dispute = disputeRes.data ?? null;
  const deliverable = deliverableRes.data ?? null;

  return ok({
    order: {
      ...order,
      listing: order.market_listings ?? null,
      cover_image: order.market_listings?.market_listing_images ?? null,
      seller_profile: order.market_listings?.market_seller_profiles ?? null,
      market_listings: undefined,
      escrow_ledger: ledger,
      otp,
      dispute,
      deliverable,
    },
  });
});
