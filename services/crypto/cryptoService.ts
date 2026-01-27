import { supabase } from "@/supabase/client";

async function requireAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not authenticated");
  return data.user;
}

export type CryptoAsset = "USDT" | "USDC" | "ETH";

export async function ensureCryptoWallet() {
  await requireAuth();
  const { data, error } = await supabase.functions.invoke("create-crypto-wallet", {
    body: {},
  });
  if (error) throw error;
  return data;
}

export async function getCryptoPrice(asset: CryptoAsset) {
  await requireAuth();
  const { data, error } = await supabase.functions.invoke("get-crypto-price", {
    body: { asset },
  });
  if (error) throw error;
  return data;
}

export async function convertCryptoToNgn(payload: {
  asset: CryptoAsset;
  amount: number;
  reference: string;
}) {
  await requireAuth();
  const { data, error } = await supabase.functions.invoke("convert-crypto-to-ngn", {
    body: payload,
  });
  if (error) throw error;
  return data;
}
