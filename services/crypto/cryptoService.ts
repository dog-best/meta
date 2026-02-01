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
  await requireAuth();
  return await callFn("create-crypto-wallet", payload);
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
