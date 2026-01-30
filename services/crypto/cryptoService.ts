import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";

async function requireAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not authenticated");
  return data.user;
}

export type CryptoAsset = "USDT" | "USDC" | "ETH";

export async function ensureCryptoWallet() {
  await requireAuth();
  return await callFn("create-crypto-wallet", {});
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
