import { bad, methodNotAllowed, ok } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  // optional auth (browse can be public in your app; keep it flexible)
  // If you want to require auth, uncomment:
  // const { data: u } = await supabase.auth.getUser();
  // if (!u.user) return unauth();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = url.searchParams.get("category"); // product|service
  const delivery_type = url.searchParams.get("delivery_type"); // physical|digital|in_person
  const currency = url.searchParams.get("currency"); // NGN|USDC
  const seller_id = url.searchParams.get("seller_id"); // optional
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  let query = admin
    .from("market_listings")
    .select(
      `
      id, seller_id, category, sub_category, title, description, price_amount, currency, delivery_type,
      stock_qty, is_active, created_at, updated_at, cover_image_id,
      market_listing_images!market_listings_cover_image_id_fkey ( id, storage_path, public_url ),
      market_seller_profiles ( user_id, business_name, market_username, display_name, logo_path, banner_path, is_verified, active )
    `,
      { count: "exact" },
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (delivery_type) query = query.eq("delivery_type", delivery_type);
  if (currency) query = query.eq("currency", currency);
  if (seller_id) query = query.eq("seller_id", seller_id);

  // basic search (title + sub_category). You can upgrade to FTS later.
  if (q) {
    // ilike across two columns
    query = query.or(`title.ilike.%${q}%,sub_category.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) return bad(error.message);

  // Normalize cover image object name (optional)
  const items = (data ?? []).map((l: any) => ({
    ...l,
    cover_image: l.market_listing_images ?? null,
    market_listing_images: undefined,
  }));

  return ok({ items, count, limit, offset });
});
