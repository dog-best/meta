import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const payload = await req.json().catch(() => ({}));

  // Minimal required: business_name
  const business_name = String(payload.business_name ?? "").trim();
  if (!business_name) return bad("business_name is required");

  const row = {
    user_id: u.user.id,
    market_username: payload.market_username ? String(payload.market_username).trim() : null,
    display_name: payload.display_name ? String(payload.display_name).trim() : null,
    business_name,
    bio: payload.bio ? String(payload.bio).trim() : null,
    phone: payload.phone ? String(payload.phone).trim() : null,
    location_text: payload.location_text ? String(payload.location_text).trim() : null,
    address: payload.address ?? {},
    logo_path: payload.logo_path ? String(payload.logo_path).trim() : null,
    banner_path: payload.banner_path ? String(payload.banner_path).trim() : null,
    offers_remote: !!payload.offers_remote,
    offers_in_person: !!payload.offers_in_person,
    active: payload.active === undefined ? true : !!payload.active,
  };

  const { data, error } = await admin
    .from("market_seller_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) return bad(error.message);
  return ok({ seller_profile: data });
});
