import { ok, methodNotAllowed } from "../_shared/market/http.ts";
import { supabaseAdminClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(req);

  const admin = supabaseAdminClient();

  const { data, error } = await admin
    .from("market_chain_config")
    .select("chain,chain_id,rpc_url,usdc_address,usdt_address,escrow_address,faucet_address,faucet_active,faucet_cooldown_seconds,faucet_usdc_amount_raw,faucet_usdt_amount_raw,confirmations_required,active")
    .order("active", { ascending: false });

  if (error) {
    return ok({ chains: [], error: error.message });
  }

  return ok({ chains: data ?? [] });
});
