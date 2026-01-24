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
  if (!listing_id) return bad("listing_id required");

  const { data: listing, error: le } = await admin
    .from("market_listings")
    .select("id,seller_id,is_active")
    .eq("id", listing_id)
    .maybeSingle();

  if (le || !listing) return bad("Listing not found");
  if (listing.seller_id !== u.user.id) return bad("Not your listing");

  const { data: updated, error } = await admin
    .from("market_listings")
    .update({ is_active: false })
    .eq("id", listing_id)
    .select("*")
    .single();

  if (error) return bad(error.message);

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "LISTING_DISABLED",
    entity_type: "market_listings",
    entity_id: listing_id,
    payload: {},
  });

  return ok({ listing: updated });
});
