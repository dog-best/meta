import { createPublicClient, encodeFunctionData, http, keccak256, stringToHex } from "viem";

import { createStockIdentity, getStockQuote, submitStockOrder } from "@/services/market/stocks";
import { fetchMarketChains, MarketChainConfig } from "@/services/market/chainConfig";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getSmartAccount, getStoredPrivateKey } from "@/utils/aaWallet";
import { ensureWalletAddressOnChain, getMyWalletForChain } from "@/services/market/usdcCheckout";

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

const IDENTITY_FACTORY_ABI = [
  {
    type: "function",
    name: "createIdentity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "storeId", type: "bytes32" },
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "identities",
    stateMutability: "view",
    inputs: [{ name: "storeId", type: "bytes32" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "vault", type: "address" },
      { name: "staking", type: "address" },
      { name: "pool", type: "address" },
      { name: "stable", type: "address" },
      { name: "fee", type: "uint24" },
    ],
  },
] as const;

const IDENTITY_ROUTER_ABI = [
  {
    type: "function",
    name: "buyExactIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "storeId", type: "bytes32" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sellExactIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "storeId", type: "bytes32" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

function toNumber(input: unknown, fallback = 0) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function toRaw(value: number, decimals: number, maxFraction = 12) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const fixed = safe.toFixed(Math.min(decimals, maxFraction));
  const [whole, fracRaw = ""] = fixed.split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const normalized = `${whole}${frac}`.replace(/^0+(\d)/, "$1");
  return BigInt(normalized || "0");
}

function normalizeHex(v: string | null | undefined) {
  const raw = String(v || "").trim();
  return raw.startsWith("0x") ? (raw as `0x${string}`) : null;
}

function isAddress(v: string | null | undefined) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(v || ""));
}

export function storeKeyFromStoreId(storeId: string) {
  return keccak256(stringToHex(String(storeId || "").trim()));
}

export function explorerTxUrl(chain: string, txHash: string) {
  const c = String(chain || "").toLowerCase();
  const h = String(txHash || "").trim();
  if (!h.startsWith("0x")) return null;
  const map: Record<string, string> = {
    sepolia: "https://sepolia.etherscan.io/tx/",
    ethereum: "https://etherscan.io/tx/",
    base_sepolia: "https://sepolia.basescan.org/tx/",
    base: "https://basescan.org/tx/",
    arbitrum_sepolia: "https://sepolia.arbiscan.io/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    polygon_amoy: "https://amoy.polygonscan.com/tx/",
    polygon: "https://polygonscan.com/tx/",
    optimism: "https://optimistic.etherscan.io/tx/",
    bnb: "https://bscscan.com/tx/",
    bnb_testnet: "https://testnet.bscscan.com/tx/",
  };
  const prefix = map[c];
  return prefix ? `${prefix}${h}` : null;
}

async function resolveTxHash(chain: MarketChainConfig, sendResult: any) {
  const txHash = String(sendResult?.hash ?? sendResult?.transactionHash ?? "");
  const userOpHash = String(sendResult?.userOpHash ?? sendResult?.userOperationHash ?? "");
  if (txHash.startsWith("0x")) return { txHash, userOpHash };
  if (!userOpHash.startsWith("0x")) return { txHash: "", userOpHash };

  try {
    const publicClient = createPublicClient({ transport: http(String(chain.rpc_url || "")) });
    const reqAny = publicClient.request as any;
    for (let i = 0; i < 40; i++) {
      const receipt: any =
        (await reqAny({
          method: "eth_getUserOperationReceipt" as any,
          params: [userOpHash as `0x${string}`],
        })) ??
        (await reqAny({
          method: "alchemy_getUserOperationReceipt" as any,
          params: [userOpHash as `0x${string}`],
        }));
      const opTx = String(receipt?.receipt?.transactionHash || receipt?.transactionHash || "");
      if (opTx.startsWith("0x")) {
        return { txHash: opTx, userOpHash };
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return { txHash: "", userOpHash };
  } catch {
    return { txHash: "", userOpHash };
  }
}

async function resolveStockChain(chainName: string) {
  const chains = await fetchMarketChains();
  const chain = (chains ?? []).find((c) => c.chain === chainName && c.active);
  if (!chain) throw new Error(`Active chain config not found for ${chainName}`);
  if (!isAddress(chain.identity_factory)) throw new Error(`identity_factory missing for ${chainName}`);
  if (!isAddress(chain.identity_router)) throw new Error(`identity_router missing for ${chainName}`);
  if (!isAddress(chain.identity_stable_address || chain.usdc_address)) throw new Error(`identity_stable_address missing for ${chainName}`);
  if (!chain.rpc_url) throw new Error(`rpc_url missing for ${chainName}`);
  return chain;
}

export async function createStockIdentityOnchain(input: {
  name: string;
  symbol: string;
  chain: string;
  slug?: string | null;
}) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { data: existing, error: existingErr } = await supabase
    .from("market_stock_identities")
    .select("id,slug,name,symbol,chain")
    .eq("store_id", user.id)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) {
    throw new Error(`Store already has a stock identity (${existing.slug || existing.symbol || existing.id})`);
  }

  const localKey = await getStoredPrivateKey(user.id);
  if (!localKey) {
    throw new Error("No wallet private key found on this device. Import your wallet key first.");
  }

  const authCheck = await requireLocalAuth("Create stock identity on-chain");
  if (!authCheck.ok) throw new Error(authCheck.message || "Authentication required");

  const chain = await resolveStockChain(input.chain);
  await ensureWalletAddressOnChain(chain);

  const { client, account, address } = await getSmartAccount(chain, user.id);
  const savedWallet = await getMyWalletForChain(chain.chain);
  if (savedWallet?.address && String(savedWallet.address).toLowerCase() !== String(address).toLowerCase()) {
    throw new Error(
      `Wallet key mismatch on this device.\n\nSaved wallet: ${savedWallet.address}\nThis device: ${address}\n\nImport the correct private key or use Wallet > Use this device wallet.`,
    );
  }
  const storeKey = storeKeyFromStoreId(user.id);
  const stableAddress = (chain.identity_stable_address || chain.usdc_address) as `0x${string}`;
  const factoryAddress = chain.identity_factory as `0x${string}`;
  const creationFeeRaw = 50_000_000n; // 50 USDC (6 decimals)

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [factoryAddress, creationFeeRaw],
  });

  await (client as any).sendTransaction({
    account,
    to: stableAddress,
    data: approveData,
  });

  const createData = encodeFunctionData({
    abi: IDENTITY_FACTORY_ABI,
    functionName: "createIdentity",
    args: [storeKey as `0x${string}`, input.name.trim(), input.symbol.trim().toUpperCase()],
  });

  const createResult = await (client as any).sendTransaction({
    account,
    to: factoryAddress,
    data: createData,
  });
  const { txHash, userOpHash } = await resolveTxHash(chain, createResult);

  const publicClient = createPublicClient({ transport: http(String(chain.rpc_url || "")) });
  if (txHash.startsWith("0x")) {
    await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      confirmations: Math.max(1, Number(chain.confirmations_required || 1)),
      timeout: 180_000,
    });
  }

  const info = await publicClient.readContract({
    abi: IDENTITY_FACTORY_ABI,
    address: factoryAddress,
    functionName: "identities",
    args: [storeKey as `0x${string}`],
  }) as any;

  const tokenAddress = String(info?.token || "");
  const poolAddress = String(info?.pool || "");
  const vaultAddress = String(info?.vault || "");
  const stakingAddress = String(info?.staking || "");
  if (!isAddress(tokenAddress) || !isAddress(poolAddress)) {
    throw new Error("On-chain identity addresses not found after creation.");
  }

  const db = await createStockIdentity({
    name: input.name.trim(),
    symbol: input.symbol.trim().toUpperCase(),
    chain: input.chain,
    slug: input.slug ?? undefined,
    tx_hash: txHash || undefined,
    user_op_hash: userOpHash || undefined,
    token_address: tokenAddress,
    pool_address: poolAddress,
    vault_address: vaultAddress,
    staking_address: stakingAddress,
    store_key: storeKey,
  });

  return {
    ...db,
    tx_hash: txHash || null,
    user_op_hash: userOpHash || null,
    explorer_url: txHash ? explorerTxUrl(chain.chain, txHash) : null,
  };
}

export async function submitStockTradeOnchain(input: {
  slug: string;
  side: "buy" | "sell";
  amount_usdc?: number;
  quantity?: number;
  max_slippage_bps?: number;
}) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const authCheck = await requireLocalAuth(input.side === "buy" ? "Confirm stock buy" : "Confirm stock sell");
  if (!authCheck.ok) throw new Error(authCheck.message || "Authentication required");

  const quoteRes = await getStockQuote({
    slug: input.slug,
    side: input.side,
    amount_usdc: input.amount_usdc,
    quantity: input.quantity,
    max_slippage_bps: input.max_slippage_bps ?? 1200,
  });

  const chainName = String(quoteRes?.identity?.chain || "");
  const chain = await resolveStockChain(chainName);
  await ensureWalletAddressOnChain(chain);

  const { client, account, address } = await getSmartAccount(chain, user.id);
  const savedWallet = await getMyWalletForChain(chain.chain);
  if (savedWallet?.address && String(savedWallet.address).toLowerCase() !== String(address).toLowerCase()) {
    throw new Error(
      `Wallet key mismatch on this device.\n\nSaved wallet: ${savedWallet.address}\nThis device: ${address}\n\nImport the correct private key or use Wallet > Use this device wallet.`,
    );
  }
  const routerAddress = chain.identity_router as `0x${string}`;
  const stableAddress = (chain.identity_stable_address || chain.usdc_address) as `0x${string}`;
  const tokenAddress = normalizeHex(String(quoteRes?.identity?.token_address || ""));
  if (!tokenAddress) throw new Error("Identity token address missing. Re-create identity on-chain or sync DB.");

  const storeId = String(quoteRes?.identity?.store_id || "");
  if (!storeId) throw new Error("Stock store reference missing.");
  const storeKey = storeKeyFromStoreId(storeId);
  const slippageBps = toNumber(input.max_slippage_bps, 1200);
  const slippage = Math.max(0.0001, Math.min(0.95, slippageBps / 10_000));

  let tradeData: `0x${string}`;
  if (input.side === "buy") {
    const amountInRaw = toRaw(toNumber(quoteRes?.quote?.notional_usdc, 0), 6, 6);
    const amountOutMinRaw = toRaw(toNumber(quoteRes?.quote?.quantity, 0) * (1 - slippage), 18, 12);
    if (amountInRaw <= 0n || amountOutMinRaw <= 0n) throw new Error("Invalid buy quote amount.");

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [routerAddress, amountInRaw],
    });
    await (client as any).sendTransaction({
      account,
      to: stableAddress,
      data: approveData,
    });

    tradeData = encodeFunctionData({
      abi: IDENTITY_ROUTER_ABI,
      functionName: "buyExactIn",
      args: [storeKey as `0x${string}`, amountInRaw, amountOutMinRaw, 0n],
    });
  } else {
    const amountInRaw = toRaw(toNumber(quoteRes?.quote?.quantity, 0), 18, 12);
    const amountOutMinRaw = toRaw(toNumber(quoteRes?.quote?.notional_usdc, 0) * (1 - slippage), 6, 6);
    if (amountInRaw <= 0n || amountOutMinRaw <= 0n) throw new Error("Invalid sell quote amount.");

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [routerAddress, amountInRaw],
    });
    await (client as any).sendTransaction({
      account,
      to: tokenAddress,
      data: approveData,
    });

    tradeData = encodeFunctionData({
      abi: IDENTITY_ROUTER_ABI,
      functionName: "sellExactIn",
      args: [storeKey as `0x${string}`, amountInRaw, amountOutMinRaw, 0n],
    });
  }

  const sendResult = await (client as any).sendTransaction({
    account,
    to: routerAddress,
    data: tradeData,
  });
  const { txHash, userOpHash } = await resolveTxHash(chain, sendResult);

  if (!txHash.startsWith("0x")) {
    throw new Error("Trade submitted but transaction hash is not available yet. Retry in a few seconds.");
  }

  const publicClient = createPublicClient({ transport: http(String(chain.rpc_url || "")) });
  await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    confirmations: Math.max(1, Number(chain.confirmations_required || 1)),
    timeout: 180_000,
  });

  const out = await submitStockOrder({
    slug: input.slug,
    side: input.side,
    amount_usdc: input.amount_usdc,
    quantity: input.quantity,
    max_slippage_bps: input.max_slippage_bps ?? 1200,
    tx_hash: txHash,
    user_op_hash: userOpHash || undefined,
    execution_mode: "onchain",
    quote_snapshot: quoteRes?.quote ?? null,
  });

  return {
    ...out,
    tx_hash: txHash,
    user_op_hash: userOpHash || null,
    explorer_url: explorerTxUrl(chain.chain, txHash),
    quote: quoteRes?.quote ?? null,
  };
}
