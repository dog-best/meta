import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const url = new URL(req.url);

  const role = (url.searchParams.get("role") ?? "buyer").toLowerCase(); // buyer|seller|all
  const status = url.searchParams.get("status"); // optional filter
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  let query = admin
    .from("market_orders")
    .select(
      `
      id, buyer_id, seller_id, listing_id, quantity, unit_price, amount, currency, status, version,
      created_at, in_escrow_at, out_for_delivery_at, deliverable_uploaded_at, delivered_at, released_at, refunded_at, cancelled_at,
      fee_amount,
      market_listings (
        id, title, sub_category, category, delivery_type, currency, price_amount, cover_image_id, seller_id,
        market_listing_images!market_listings_cover_image_fk ( id, storage_path, public_url )
      )
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (role === "buyer") query = query.eq("buyer_id", u.user.id);
  else if (role === "seller") query = query.eq("seller_id", u.user.id);
  else query = query.or(`buyer_id.eq.${u.user.id},seller_id.eq.${u.user.id}`);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return bad(error.message);

  const items = (data ?? []).map((o: any) => ({
    ...o,
    listing: o.market_listings ?? null,
    cover_image: o.market_listings?.market_listing_images ?? null,
    market_listings: undefined,
  }));

  return ok({ items, count, limit, offset });
});
