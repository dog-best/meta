import { createPublicClient, encodeFunctionData, http, keccak256, stringToHex } from "viem";

import { createStockIdentity, getStockQuote, submitStockOrder } from "@/services/market/stocks";
import { fetchMarketChains, MarketChainConfig } from "@/services/market/chainConfig";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getSmartAccount, getStoredPrivateKey } from "@/utils/aaWallet";
import { ensureWalletAddressOnChain, getMyWalletForChain, registerWallet } from "@/services/market/usdcCheckout";

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

const IDENTITY_CREATED_EVENT_SIG =
  "IdentityCreated(bytes32,address,address,address,address,address,uint24,string,string)";
const IDENTITY_CREATED_TOPIC0 = keccak256(stringToHex(IDENTITY_CREATED_EVENT_SIG));

function logCreate(step: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.log(`[stock-create] ${step}`, meta);
    return;
  }
  console.log(`[stock-create] ${step}`);
}

function logCreateError(step: string, err: unknown, meta?: Record<string, unknown>) {
  const message = String((err as any)?.message ?? err ?? "unknown");
  if (meta) {
    console.error(`[stock-create] ${step} FAILED`, { message, ...meta });
    return;
  }
  console.error(`[stock-create] ${step} FAILED`, { message });
}

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

function toHexBlock(n: bigint) {
  return `0x${n.toString(16)}`;
}

async function findLatestIdentityCreatedTxHash(
  publicClient: any,
  factoryAddress: `0x${string}`,
  storeKey: `0x${string}`,
) {
  try {
    const latest = await publicClient.getBlockNumber();
    const span = 200_000n;
    const from = latest > span ? latest - span : 0n;
    const logs = await publicClient.request({
      method: "eth_getLogs",
      params: [
        {
          address: factoryAddress,
          fromBlock: toHexBlock(from),
          toBlock: "latest",
          topics: [IDENTITY_CREATED_TOPIC0, storeKey],
        },
      ],
    }) as Array<{ transactionHash?: string }>;

    const last = Array.isArray(logs) && logs.length ? logs[logs.length - 1] : null;
    const txHash = String(last?.transactionHash || "");
    return txHash.startsWith("0x") ? txHash : null;
  } catch {
    return null;
  }
}

async function waitForIdentityInfo(
  publicClient: any,
  factoryAddress: `0x${string}`,
  storeKey: `0x${string}`,
  timeoutMs = 120_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const info = await publicClient.readContract({
      abi: IDENTITY_FACTORY_ABI,
      address: factoryAddress,
      functionName: "identities",
      args: [storeKey],
    }) as any;

    const tokenAddress = String(info?.token || "");
    const poolAddress = String(info?.pool || "");
    const vaultAddress = String(info?.vault || "");
    const stakingAddress = String(info?.staking || "");
    if (isAddress(tokenAddress) && isAddress(poolAddress)) {
      return { tokenAddress, poolAddress, vaultAddress, stakingAddress };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

export async function createStockIdentityOnchain(input: {
  name: string;
  symbol: string;
  chain: string;
  slug?: string | null;
}) {
  logCreate("start", {
    chain: input.chain,
    symbol: input.symbol,
    name: input.name,
    slug: input.slug ?? null,
  });
  try {
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = auth?.user;
    if (!user) throw new Error("Not authenticated");
    logCreate("auth_ok", { user_id: user.id });

    const { data: existing, error: existingErr } = await supabase
      .from("market_stock_identities")
      .select("id,slug,name,symbol,chain")
      .eq("store_id", user.id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (existing?.id) {
      throw new Error(`Store already has a stock identity (${existing.slug || existing.symbol || existing.id})`);
    }
    logCreate("store_identity_check_ok");

    const localKey = await getStoredPrivateKey(user.id);
    if (!localKey) {
      throw new Error("No wallet private key found on this device. Import your wallet key first.");
    }
    logCreate("local_wallet_key_ok");

    const authCheck = await requireLocalAuth("Create stock identity on-chain");
    if (!authCheck.ok) throw new Error(authCheck.message || "Authentication required");
    logCreate("local_auth_ok");

    const chain = await resolveStockChain(input.chain);
    logCreate("chain_resolved", {
      chain: chain.chain,
      chain_id: chain.chain_id,
      factory: chain.identity_factory,
      stable: chain.identity_stable_address || chain.usdc_address,
    });
    await ensureWalletAddressOnChain(chain);

    const { client, account, address } = await getSmartAccount(chain, user.id);
    logCreate("smart_account_ok", { wallet: address });
    const savedWallet = await getMyWalletForChain(chain.chain);
    if (savedWallet?.address && String(savedWallet.address).toLowerCase() !== String(address).toLowerCase()) {
      await registerWallet(chain.chain, address);
      logCreate("wallet_mapping_updated", { old_wallet: savedWallet.address, new_wallet: address });
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

    logCreate("approve_submit", { token: stableAddress, spender: factoryAddress, amount_raw: creationFeeRaw.toString() });
    await (client as any).sendTransaction({
      account,
      to: stableAddress,
      data: approveData,
    });
    logCreate("approve_sent");

    const createData = encodeFunctionData({
      abi: IDENTITY_FACTORY_ABI,
      functionName: "createIdentity",
      args: [storeKey as `0x${string}`, input.name.trim(), input.symbol.trim().toUpperCase()],
    });

    logCreate("create_submit", { factory: factoryAddress, store_key: storeKey });
    const createResult = await (client as any).sendTransaction({
      account,
      to: factoryAddress,
      data: createData,
    });
    let { txHash, userOpHash } = await resolveTxHash(chain, createResult);
    logCreate("create_sent", { tx_hash: txHash || null, user_op_hash: userOpHash || null });

    const publicClient = createPublicClient({ transport: http(String(chain.rpc_url || "")) });
    if (!txHash.startsWith("0x")) {
      throw new Error("Create transaction submitted, but hash is not available yet. Wait a moment and retry.");
    }

    const createReceipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: Math.max(1, Number(chain.confirmations_required || 1)),
        timeout: 180_000,
      });
    logCreate("create_receipt_ok", {
      tx_hash: txHash,
      status: String((createReceipt as any)?.status ?? ""),
      block_number: String((createReceipt as any)?.blockNumber ?? ""),
    });
    if ((createReceipt as any)?.status && String((createReceipt as any).status).toLowerCase() !== "success") {
      throw new Error(
        `On-chain create transaction failed on ${chain.chain}. Check wallet USDC balance and ensure this store has not already created on-chain.`,
      );
    }

    const info = await waitForIdentityInfo(publicClient, factoryAddress, storeKey as `0x${string}`);
    if (!info) {
      throw new Error("On-chain identity addresses not found yet after confirmed transaction. Please retry in a few seconds.");
    }
    logCreate("identity_info_ok", {
      token: info.tokenAddress,
      pool: info.poolAddress,
      vault: info.vaultAddress,
      staking: info.stakingAddress,
    });

    let tokenAddress = info.tokenAddress;
    let poolAddress = info.poolAddress;
    const vaultAddress = info.vaultAddress;
    const stakingAddress = info.stakingAddress;

    const upsertFromTx = async (useTxHash: string) =>
      await createStockIdentity({
        name: input.name.trim(),
        symbol: input.symbol.trim().toUpperCase(),
        chain: input.chain,
        slug: input.slug ?? undefined,
        tx_hash: useTxHash,
        user_op_hash: userOpHash || undefined,
        token_address: tokenAddress,
        pool_address: poolAddress,
        vault_address: vaultAddress,
        staking_address: stakingAddress,
        store_key: storeKey,
      });

    let db: any;
    try {
      logCreate("db_sync_submit", { tx_hash: txHash });
      db = await upsertFromTx(txHash);
      logCreate("db_sync_ok", { identity_id: db?.identity?.id ?? null, slug: db?.identity?.slug ?? null });
    } catch (e: any) {
      const m = String(e?.message ?? e ?? "").toLowerCase();
      logCreateError("db_sync", e, { tx_hash: txHash });
      // Recovery path for AA timing: use latest successful IdentityCreated tx for this store.
      if (m.includes("on-chain create transaction failed") || m.includes("transaction receipt not found")) {
        const recoveredTx = await findLatestIdentityCreatedTxHash(publicClient, factoryAddress, storeKey as `0x${string}`);
        logCreate("db_sync_recovery_attempt", { recovered_tx: recoveredTx, current_tx: txHash });
        if (recoveredTx && recoveredTx.toLowerCase() !== txHash.toLowerCase()) {
          txHash = recoveredTx;
          db = await upsertFromTx(txHash);
          logCreate("db_sync_recovery_ok", { tx_hash: txHash, identity_id: db?.identity?.id ?? null });
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    return {
      ...db,
      tx_hash: txHash || null,
      user_op_hash: userOpHash || null,
      explorer_url: txHash ? explorerTxUrl(chain.chain, txHash) : null,
    };
  } catch (e) {
    logCreateError("create_flow", e, {
      chain: input.chain,
      symbol: input.symbol,
      name: input.name,
    });
    throw e;
  }
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
    await registerWallet(chain.chain, address);
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
