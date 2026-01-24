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
  const storage_path = String(body.storage_path ?? "").trim();
  const sort_order = body.sort_order === undefined ? 0 : Number(body.sort_order);

  if (!listing_id) return bad("listing_id required");
  if (!storage_path) return bad("storage_path required");
  if (!Number.isFinite(sort_order) || sort_order < 0) return bad("sort_order must be >= 0");

  // Ensure listing belongs to this seller
  const { data: listing, error: le } = await admin
    .from("market_listings")
    .select("id,seller_id")
    .eq("id", listing_id)
    .maybeSingle();

  if (le || !listing) return bad("Listing not found");
  if (listing.seller_id !== u.user.id) return bad("Not your listing");

  const { data: img, error } = await admin
    .from("market_listing_images")
    .insert({
      listing_id,
      storage_path,
      public_url: body.public_url ? String(body.public_url) : null,
      sort_order,
      meta: body.meta ?? {},
    })
    .select("*")
    .single();

  if (error) return bad(error.message);

  // Optionally set cover_image_id if requested or if none exists
  if (body.set_as_cover === true) {
    await admin.from("market_listings").update({ cover_image_id: img.id }).eq("id", listing_id);
  } else {
    const { data: cur } = await admin.from("market_listings").select("cover_image_id").eq("id", listing_id).single();
    if (!cur?.cover_image_id) {
      await admin.from("market_listings").update({ cover_image_id: img.id }).eq("id", listing_id);
    }
  }

  return ok({ image: img });
});
