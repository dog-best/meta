import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";

async function requireAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not authenticated");
  return data.user;
}

export type CryptoAsset = "USDT" | "USDC" | "ETH";

export async function ensureCryptoWallet(chain = "base") {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from("crypto_wallets")
    .select("user_id,chain,address")
    .eq("user_id", user.id)
    .eq("chain", chain)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No wallet address. Generate one in Market Account.");
  return data;
}

export async function registerCryptoWallet(payload: { chain: string; address: string }) {
  const user = await requireAuth();
  const existing = await supabase
    .from("crypto_wallets")
    .select("id")
    .eq("user_id", user.id)
    .eq("chain", payload.chain)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("crypto_wallets")
      .update({ address: payload.address, wallet_type: "aa" })
      .eq("id", existing.data.id)
      .select("user_id,chain,address")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("crypto_wallets")
    .insert({ user_id: user.id, chain: payload.chain, address: payload.address, wallet_type: "aa" })
    .select("user_id,chain,address")
    .single();
  if (error) throw error;
  return data;
}

export async function getMyCryptoWallet(chain: string) {
  const user = await requireAuth();
  const { data, error } = await supabase
    .from("crypto_wallets")
    .select("user_id,chain,address")
    .eq("user_id", user.id)
    .eq("chain", chain)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getCryptoPrice(asset: CryptoAsset) {
  await requireAuth();
  return await callFn("get-crypto-price", { asset });
}

export async function convertCryptoToNgn(payload: {
  asset: CryptoAsset;
  amount: number;
  reference: string;
}) {
  await requireAuth();
  return await callFn("convert-crypto-to-ngn", payload);
}
