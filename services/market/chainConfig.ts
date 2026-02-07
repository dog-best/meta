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

const KEY_CHAIN = "bc_market_chain_pref_v2";

export async function fetchMarketChains() {
  const normalize = (input: any): MarketChainConfig => ({
    chain: String(input?.chain ?? ""),
    chain_id: Number(input?.chain_id ?? 0),
    rpc_url: input?.rpc_url ? String(input.rpc_url) : null,
    usdc_address: String(input?.usdc_address ?? ""),
    usdt_address: input?.usdt_address ? String(input.usdt_address) : null,
    escrow_address: String(input?.escrow_address ?? ""),
    confirmations_required: Number(input?.confirmations_required ?? 3),
    active: Boolean(input?.active),
  });

  try {
    // Prefer direct DB query to avoid stale/misconfigured edge function responses.
    const { data: direct, error: directErr } = await supabase
      .from("market_chain_config")
      .select("chain,chain_id,rpc_url,usdc_address,usdt_address,escrow_address,confirmations_required,active")
      .order("active", { ascending: false });
    if (!directErr && direct && direct.length) {
      const directNorm = direct.map(normalize);
      const hasValidTokens = directNorm.some((c) => /^0x[a-fA-F0-9]{40}$/.test(c.usdc_address || ""));
      if (hasValidTokens) return directNorm;
    }

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
    const fromFn = (json?.chains ?? []).map(normalize);
    // Guard against stale function deployments returning empty token addresses.
    const hasValidTokens = fromFn.some((c) => /^0x[a-fA-F0-9]{40}$/.test(c.usdc_address || ""));
    if (fromFn.length && hasValidTokens) return fromFn;
    throw new Error("Chain config payload missing token addresses");
  } catch (e: any) {
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
    if (match?.active) return match;
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
