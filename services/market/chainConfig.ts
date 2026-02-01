import * as SecureStore from "expo-secure-store";
import { supabase } from "@/services/supabase";

export type MarketChainConfig = {
  chain: string;
  chain_id: number;
  rpc_url: string | null;
  usdc_address: string;
  escrow_address: string;
  confirmations_required: number;
  active: boolean;
};

const KEY_CHAIN = "bc_market_chain_pref";

export async function fetchMarketChains() {
  const { data, error } = await supabase
    .from("market_chain_config")
    .select("chain,chain_id,rpc_url,usdc_address,escrow_address,confirmations_required,active")
    .order("active", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketChainConfig[];
}

export async function getPreferredMarketChain() {
  const saved = await SecureStore.getItemAsync(KEY_CHAIN);
  const chains = await fetchMarketChains();
  const active = chains.find((c) => c.active) ?? null;

  if (saved) {
    const match = chains.find((c) => c.chain === saved);
    if (match && match.active) return match;
  }

  if (active) {
    await SecureStore.setItemAsync(KEY_CHAIN, active.chain);
  }

  return active;
}

export async function setPreferredMarketChain(chain: string) {
  await SecureStore.setItemAsync(KEY_CHAIN, chain);
}

