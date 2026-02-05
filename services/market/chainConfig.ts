import * as SecureStore from "expo-secure-store";
import { supabase } from "@/services/supabase";
import { getSupabaseAnonKeyOrThrow, getSupabaseFunctionsBaseUrl } from "@/services/net";

export type MarketChainConfig = {
  chain: string;
  chain_id: number;
  rpc_url: string | null;
  usdc_address: string;
  usdt_address: string | null;
  escrow_address: string;
  confirmations_required: number;
  active: boolean;
};

const KEY_CHAIN = "bc_market_chain_pref";

export async function fetchMarketChains() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const base = getSupabaseFunctionsBaseUrl();
    const res = await fetch(`${base}/market-chain-list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: getSupabaseAnonKeyOrThrow(),
        Authorization: `Bearer ${accessToken || getSupabaseAnonKeyOrThrow()}`,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || "Failed to load chains");
    return (json?.chains ?? []) as MarketChainConfig[];
  } catch (e: any) {
    // Fallback to direct client query (may be blocked by RLS)
    const { data, error } = await supabase
      .from("market_chain_config")
      .select("chain,chain_id,rpc_url,usdc_address,usdt_address,escrow_address,confirmations_required,active")
      .order("active", { ascending: false });
    if (!error && data && data.length) return data as MarketChainConfig[];

    // Last fallback so UI is usable even if policies/functions are misconfigured.
    return [
      {
        chain: "base_sepolia",
        chain_id: 84532,
        rpc_url: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL ?? null,
        usdc_address: process.env.EXPO_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA ?? "",
        usdt_address: process.env.EXPO_PUBLIC_USDT_ADDRESS_BASE_SEPOLIA ?? null,
        escrow_address: process.env.EXPO_PUBLIC_ESCROW_ADDRESS_BASE_SEPOLIA ?? "",
        confirmations_required: 3,
        active: true,
      },
    ] satisfies MarketChainConfig[];
  }
}

export async function getPreferredMarketChain() {
  const saved = await SecureStore.getItemAsync(KEY_CHAIN);
  const chains = await fetchMarketChains();
  const active = chains.find((c) => c.active) ?? null;
  const fallback = chains[0] ?? null;

  if (saved) {
    const match = chains.find((c) => c.chain === saved);
    if (match) return match;
  }

  if (active) {
    await SecureStore.setItemAsync(KEY_CHAIN, active.chain);
    return active;
  }

  if (fallback) {
    await SecureStore.setItemAsync(KEY_CHAIN, fallback.chain);
    return fallback;
  }

  return null;
}

export async function setPreferredMarketChain(chain: string) {
  await SecureStore.setItemAsync(KEY_CHAIN, chain);
}
