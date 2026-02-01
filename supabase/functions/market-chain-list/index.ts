import { ok, methodNotAllowed } from "../_shared/market/http.ts";
import { supabaseAdminClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const admin = supabaseAdminClient();

  const { data, error } = await admin
    .from("market_chain_config")
    .select("chain,chain_id,rpc_url,usdc_address,escrow_address,confirmations_required,active")
    .order("active", { ascending: false });

  if (error) {
    return ok({ chains: [], error: error.message });
  }

  return ok({ chains: data ?? [] });
});
