import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const url = new URL(req.url);
  const include_inactive = url.searchParams.get("include_inactive") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  // Seller profile (storefront)
  const { data: seller_profile, error: se } = await admin
    .from("market_seller_profiles")
    .select("*")
    .eq("user_id", u.user.id)
    .maybeSingle();

  if (se) return bad(se.message);

  // Listings
  let listQ = admin
    .from("market_listings")
    .select(
      `
      id, seller_id, category, sub_category, title, description, price_amount, currency, delivery_type,
      stock_qty, is_active, created_at, updated_at, cover_image_id,
      market_listing_images!market_listings_cover_image_fk ( id, storage_path, public_url )
    `,
    )
    .eq("seller_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!include_inactive) listQ = listQ.eq("is_active", true);

  const { data: listings, error: le } = await listQ;
  if (le) return bad(le.message);

  // Stats (simple counts)
  // You can extend later with earnings, avg rating, etc.
  const statuses = [
    "CREATED",
    "IN_ESCROW",
    "OUT_FOR_DELIVERY",
    "DELIVERABLE_UPLOADED",
    "DELIVERED",
    "RELEASED",
    "DISPUTED",
    "REFUNDED",
    "CANCELLED",
  ] as const;

  const stats: Record<string, number> = {};
  for (const s of statuses) {
    const { count, error } = await admin
      .from("market_orders")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", u.user.id)
      .eq("status", s);
    if (error) return bad(error.message);
    stats[s] = count ?? 0;
  }

  const normalizedListings = (listings ?? []).map((l: any) => ({
    ...l,
    cover_image: l.market_listing_images ?? null,
    market_listing_images: undefined,
  }));

  return ok({
    seller_profile: seller_profile ?? null,
    listings: normalizedListings,
    stats,
  });
});
