import { encodeFunctionData } from "viem";

import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getScopedWalletAddress, getSmartAccount } from "@/utils/aaWallet";
import { getPreferredMarketChain, MarketChainConfig } from "@/services/market/chainConfig";

const FN_USDC_DEPOSIT_INTENT = "market-usdc-deposit-intent";
const FN_USDC_RELEASE_INTENT = "market-usdc-release-intent";
const FN_USDC_DEPOSIT_SUBMIT = "market-usdc-deposit-submit";
const FN_USDC_RELEASE_SUBMIT = "market-usdc-release-submit";
const FN_CHAIN_TX_FINALIZE = "market-chain-tx-finalize";

export type StableSymbol = "USDC" | "USDT";

const ESCROW_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderKey", type: "bytes32" },
      { name: "seller", type: "address" },
      { name: "token", type: "address" },
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
  // Prefer direct table write so wallet creation does not depend on Edge Function JWT flow.
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const existing = await supabase
    .from("crypto_wallets")
    .select("id,user_id,chain,address")
    .eq("user_id", user.id)
    .eq("chain", chain)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("crypto_wallets")
      .update({ address, wallet_type: "aa" })
      .eq("id", existing.data.id)
      .select("user_id,chain,address")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("crypto_wallets")
    .insert({ user_id: user.id, chain, address, wallet_type: "aa" })
    .select("user_id,chain,address")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function ensureSmartAccount(chainConfig: MarketChainConfig) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  await ensureWalletAddressOnChain(chainConfig);
  const { address, client } = await getSmartAccount(chainConfig, user.id);
  return { address, client };
}

export async function ensureWalletAddressOnChain(chainConfig: MarketChainConfig) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const address = await getScopedWalletAddress(user.id);
  await registerWallet(chainConfig.chain, address);
  return { address };
}

export async function payStableForOrder(orderId: string, symbol: StableSymbol = "USDC") {
  const chain = await getPreferredMarketChain();
  if (!chain) throw new Error("No active chain configuration found.");

  const wallet = await getMyWalletForChain(chain.chain);
  if (!wallet) {
    throw new Error("No wallet address found. Generate a wallet in Market Account first.");
  }

  const localAuth = await requireLocalAuth(`Confirm ${symbol} deposit`);
  if (!localAuth.ok) throw new Error(localAuth.message || "Authentication required");

  const intent = await callFn<{
    ok: boolean;
    order_id: string;
    order_key: string;
    escrow_address: string;
    usdc_address?: string;
    usdt_address?: string;
    token_address?: string;
    seller_wallet: string;
    amount_raw: string;
    buyer_total_raw: string;
    fee_bps: number;
    chain: string;
  }>(FN_USDC_DEPOSIT_INTENT, { order_id: orderId, chain: chain.chain, token: symbol });

  const tokenAddress =
    intent.token_address ||
    (symbol === "USDT" ? intent.usdt_address : intent.usdc_address) ||
    intent.usdc_address ||
    "";

  if (!tokenAddress) {
    throw new Error(`${symbol} token address is not configured for this network.`);
  }

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { client, account, address } = await getSmartAccount(chain, user.id);

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [intent.escrow_address as `0x${string}`, BigInt(intent.buyer_total_raw)],
  });

  const depositData = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "deposit",
    args: [intent.order_key as `0x${string}`, intent.seller_wallet as `0x${string}`, tokenAddress as `0x${string}`, BigInt(intent.amount_raw)],
  });

  const sendResult = await (client as any).sendTransactions({
    account,
    requests: [
      { from: address as `0x${string}`, to: tokenAddress as `0x${string}`, data: approveData },
      { from: address as `0x${string}`, to: intent.escrow_address as `0x${string}`, data: depositData },
    ],
  });

  const txHash = String((sendResult as any)?.hash ?? (sendResult as any)?.transactionHash ?? "");

  await callFn<{ ok: boolean }>(FN_USDC_DEPOSIT_SUBMIT, {
    order_id: orderId,
    chain: chain.chain,
    token: symbol,
    tx_hash: txHash || null,
  });

  if (txHash) {
    // Strict finality: this may return pending until required confirmations are reached.
    await callFn<{ ok: boolean }>(FN_CHAIN_TX_FINALIZE, {
      order_id: orderId,
      chain: chain.chain,
      tx_hash: txHash,
      event_type: "DEPOSIT",
    }).catch(() => null);
  }

  return { ...intent, token_symbol: symbol, token_address: tokenAddress, tx_hash: txHash || null };
}

export async function payUsdcForOrder(orderId: string) {
  return payStableForOrder(orderId, "USDC");
}

export async function payUsdtForOrder(orderId: string) {
  return payStableForOrder(orderId, "USDT");
}

export async function releaseUsdcForOrder(orderId: string) {
  const chain = await getPreferredMarketChain();
  if (!chain) throw new Error("No active chain configuration found.");

  const wallet = await getMyWalletForChain(chain.chain);
  if (!wallet) {
    throw new Error("No wallet address found. Generate a wallet in Market Account first.");
  }

  const localAuth = await requireLocalAuth("Release escrow to seller");
  if (!localAuth.ok) throw new Error(localAuth.message || "Authentication required");

  const intent = await callFn<{
    ok: boolean;
    order_id: string;
    order_key: string;
    escrow_address: string;
    chain: string;
  }>(FN_USDC_RELEASE_INTENT, { order_id: orderId, chain: chain.chain });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { client, account, address } = await getSmartAccount(chain, user.id);

  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "release",
    args: [intent.order_key as `0x${string}`],
  });

  const sendResult = await (client as any).sendTransaction({
    from: address as `0x${string}`,
    to: intent.escrow_address as `0x${string}`,
    data,
  });

  const txHash = String((sendResult as any)?.hash ?? (sendResult as any)?.transactionHash ?? "");

  await callFn<{ ok: boolean }>(FN_USDC_RELEASE_SUBMIT, {
    order_id: orderId,
    chain: chain.chain,
    tx_hash: txHash || null,
  });

  if (txHash) {
    // Strict finality: this may return pending until required confirmations are reached.
    await callFn<{ ok: boolean }>(FN_CHAIN_TX_FINALIZE, {
      order_id: orderId,
      chain: chain.chain,
      tx_hash: txHash,
      event_type: "RELEASE",
    }).catch(() => null);
  }

  return { ...intent, tx_hash: txHash || null };
}
