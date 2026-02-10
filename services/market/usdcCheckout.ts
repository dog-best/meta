import { createPublicClient, encodeFunctionData, http } from "viem";

import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getSmartAccount } from "@/utils/aaWallet";
import { getPreferredMarketChain, MarketChainConfig } from "@/services/market/chainConfig";

const RPC_USDC_DEPOSIT_INTENT = "market_usdc_deposit_intent_rpc";
const RPC_USDC_RELEASE_INTENT = "market_usdc_release_intent_rpc";
const RPC_USDC_DEPOSIT_SUBMIT = "market_usdc_deposit_submit_rpc";
const RPC_USDC_RELEASE_SUBMIT = "market_usdc_release_submit_rpc";
const RPC_CHAIN_TX_FINALIZE = "market_chain_tx_finalize_rpc";

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

  // Reuse an existing address for this user first to avoid accidental address drift across chains.
  const existingForChain = await getMyWalletForChain(chainConfig.chain);
  if (existingForChain?.address) {
    return { address: existingForChain.address };
  }

  const { data: existingAny, error: anyErr } = await supabase
    .from("crypto_wallets")
    .select("address")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyErr) throw new Error(anyErr.message);
  if (existingAny?.address) {
    await registerWallet(chainConfig.chain, existingAny.address);
    return { address: existingAny.address };
  }

  // First-time generation: persist smart-account address.
  const { address } = await getSmartAccount(chainConfig, user.id);
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

  const intent: {
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
  } = await (async () => {
    const { data, error } = await supabase.rpc(RPC_USDC_DEPOSIT_INTENT, {
      p_order_id: orderId,
      p_chain: chain.chain,
      p_token: symbol,
    });
    if (error) throw new Error(error.message || "Could not create crypto deposit intent.");
    return data as any;
  })();

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
  const buyerAddress = String(address || "").toLowerCase();
  const sellerAddress = String(intent.seller_wallet || "").toLowerCase();
  if (buyerAddress && sellerAddress && buyerAddress === sellerAddress) {
    throw new Error("Buyer and seller wallet cannot be the same.");
  }

  // Pre-check balances to avoid opaque UserOp reverts.
  try {
    const rpcUrl = chain.rpc_url || "";
    if (rpcUrl) {
      const publicClient = createPublicClient({
        chain: (chain as any).viemChain ?? undefined,
        transport: http(rpcUrl),
      });
      const bal = await publicClient.readContract({
        abi: [
          {
            type: "function",
            name: "balanceOf",
            stateMutability: "view",
            inputs: [{ name: "owner", type: "address" }],
            outputs: [{ name: "bal", type: "uint256" }],
          },
        ],
        address: tokenAddress as `0x${string}`,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      if (BigInt(bal) < BigInt(intent.buyer_total_raw || "0")) {
        throw new Error("Insufficient token balance on smart account.");
      }
    }
  } catch (e) {
    // Surface as a normal error so user sees it.
    throw e;
  }

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

  // Send sequentially to get clearer errors.
  const approveTx = await (client as any).sendTransaction({
    account,
    to: tokenAddress as `0x${string}`,
    data: approveData,
  });
  const approveHash = String((approveTx as any)?.hash ?? (approveTx as any)?.transactionHash ?? "");

  const sendResult = await (client as any).sendTransaction({
    account,
    to: intent.escrow_address as `0x${string}`,
    data: depositData,
  });

  const txHash = String((sendResult as any)?.hash ?? (sendResult as any)?.transactionHash ?? approveHash ?? "");

  await supabase.rpc(RPC_USDC_DEPOSIT_SUBMIT, {
    p_order_id: orderId,
    p_chain: chain.chain,
    p_token: symbol,
    p_tx_hash: txHash || null,
  });
  if (txHash) {
    // Ensure tx hash is persisted even if RPC or trigger missed it.
    const { error: intentUpdErr } = await supabase
      .from("market_crypto_intents")
      .update({ tx_hash: txHash, status: "SUBMITTED" })
      .eq("order_id", orderId)
      .eq("intent_type", "DEPOSIT")
      .is("tx_hash", null);
    if (intentUpdErr) {
      // RLS can block direct updates; the RPC should still have stored it.
      console.log("[Checkout] deposit intent tx_hash update blocked", intentUpdErr.message);
    }
  }


  if (txHash) {
    // Strict finality: this may return pending until required confirmations are reached.
    await supabase
      .rpc(RPC_CHAIN_TX_FINALIZE, {
        p_order_id: orderId,
        p_chain: chain.chain,
        p_tx_hash: txHash,
        p_event_type: "DEPOSIT",
      })
      .catch(() => null);
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

  const intent: {
    ok: boolean;
    order_id: string;
    order_key: string;
    escrow_address: string;
    chain: string;
  } = await (async () => {
    const { data, error } = await supabase.rpc(RPC_USDC_RELEASE_INTENT, {
      p_order_id: orderId,
      p_chain: chain.chain,
    });
    if (error) throw new Error(error.message || "Could not create release intent.");
    return data as any;
  })();

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

  await supabase.rpc(RPC_USDC_RELEASE_SUBMIT, {
    p_order_id: orderId,
    p_chain: chain.chain,
    p_tx_hash: txHash || null,
  });
  if (txHash) {
    const { error: intentUpdErr } = await supabase
      .from("market_crypto_intents")
      .update({ tx_hash: txHash, status: "SUBMITTED" })
      .eq("order_id", orderId)
      .eq("intent_type", "RELEASE")
      .is("tx_hash", null);
    if (intentUpdErr) {
      console.log("[Checkout] release intent tx_hash update blocked", intentUpdErr.message);
    }
  }

  if (txHash) {
    // Strict finality: this may return pending until required confirmations are reached.
    await supabase
      .rpc(RPC_CHAIN_TX_FINALIZE, {
        p_order_id: orderId,
        p_chain: chain.chain,
        p_tx_hash: txHash,
        p_event_type: "RELEASE",
      })
      .catch(() => null);
  }

  return { ...intent, tx_hash: txHash || null };
}
