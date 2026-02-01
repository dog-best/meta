import { encodeFunctionData } from "viem";

import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getSmartAccount } from "@/utils/aaWallet";
import { getPreferredMarketChain, MarketChainConfig } from "@/services/market/chainConfig";

const FN_USDC_DEPOSIT_INTENT = "market-usdc-deposit-intent";
const FN_USDC_RELEASE_INTENT = "market-usdc-release-intent";

const ESCROW_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderKey", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderKey", type: "bytes32" }],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
] as const;

export async function getMyWalletForChain(chain: string) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("crypto_wallets")
    .select("user_id,chain,address")
    .eq("user_id", user.id)
    .eq("chain", chain)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function registerWallet(chain: string, address: string) {
  return await callFn("create-crypto-wallet", { chain, address });
}

export async function ensureSmartAccount(chainConfig: MarketChainConfig) {
  const { address, client } = await getSmartAccount(chainConfig);
  const existing = await getMyWalletForChain(chainConfig.chain);
  if (!existing || existing.address?.toLowerCase() !== address.toLowerCase()) {
    await registerWallet(chainConfig.chain, address);
  }
  return { address, client };
}

export async function payUsdcForOrder(orderId: string) {
  const chain = await getPreferredMarketChain();
  if (!chain) throw new Error("No active chain configuration found.");

  const wallet = await getMyWalletForChain(chain.chain);
  if (!wallet) {
    throw new Error("No wallet address found. Generate a wallet in Market Account first.");
  }

  const auth = await requireLocalAuth("Confirm USDC deposit");
  if (!auth.ok) throw new Error(auth.message || "Authentication required");

  const intent = await callFn<{
    ok: boolean;
    order_id: string;
    order_key: string;
    escrow_address: string;
    usdc_address: string;
    seller_wallet: string;
    amount_raw: string;
    buyer_total_raw: string;
    fee_bps: number;
    chain: string;
  }>(FN_USDC_DEPOSIT_INTENT, { order_id: orderId, chain: chain.chain });

  const { client } = await getSmartAccount(chain);

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [intent.escrow_address as `0x${string}`, BigInt(intent.buyer_total_raw)],
  });

  const depositData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "deposit",
    args: [intent.order_key as `0x${string}`, intent.seller_wallet as `0x${string}`, BigInt(intent.amount_raw)],
  });

  await client.sendTransactions({
    requests: [
      { to: intent.usdc_address as `0x${string}`, data: approveData },
      { to: intent.escrow_address as `0x${string}`, data: depositData },
    ],
  });

  return intent;
}

export async function releaseUsdcForOrder(orderId: string) {
  const chain = await getPreferredMarketChain();
  if (!chain) throw new Error("No active chain configuration found.");

  const wallet = await getMyWalletForChain(chain.chain);
  if (!wallet) {
    throw new Error("No wallet address found. Generate a wallet in Market Account first.");
  }

  const auth = await requireLocalAuth("Release escrow to seller");
  if (!auth.ok) throw new Error(auth.message || "Authentication required");

  const intent = await callFn<{
    ok: boolean;
    order_id: string;
    order_key: string;
    escrow_address: string;
    chain: string;
  }>(FN_USDC_RELEASE_INTENT, { order_id: orderId, chain: chain.chain });

  const { client } = await getSmartAccount(chain);

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "release",
    args: [intent.order_key as `0x${string}`],
  });

  await client.sendTransaction({
    to: intent.escrow_address as `0x${string}`,
    data,
  });

  return intent;
}

