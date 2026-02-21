import { createPublicClient, encodeFunctionData, http } from "viem";

import { type MarketChainConfig } from "@/services/market/chainConfig";
import { registerWallet } from "@/services/market/usdcCheckout";
import { supabase } from "@/services/supabase";
import { getSmartAccount } from "@/utils/aaWallet";

const FAUCET_ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "usdcClaimAmount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "usdtClaimAmount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "cooldownSeconds", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "nextClaimAt", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type FaucetStatus = {
  available: boolean;
  faucetAddress: string | null;
  usdcAmountRaw: bigint;
  usdtAmountRaw: bigint;
  cooldownSeconds: number;
  nextClaimAt: number;
  secondsLeft: number;
  canClaim: boolean;
};

function isAddress(v?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(v || "").trim());
}

function isHexHash(v?: string | null) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(v || "").trim());
}

function normalizeHexHash(v?: string | null) {
  const out = String(v || "").trim();
  return isHexHash(out) ? out : "";
}

function safeBigInt(input: unknown, fallback = 0n) {
  try {
    if (typeof input === "bigint") return input;
    const raw = String(input ?? "").trim();
    if (!raw) return fallback;
    if (!/^\d+$/.test(raw)) return fallback;
    return BigInt(raw);
  } catch {
    return fallback;
  }
}

function safeInt(input: unknown, fallback = 0) {
  const n = Number(input);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function envFaucetAddressForChain(chain: string) {
  const c = String(chain || "").trim().toLowerCase();
  if (c === "base_sepolia") return String(process.env.EXPO_PUBLIC_FAUCET_ADDRESS_BASE_SEPOLIA || "").trim();
  if (c === "polygon_amoy") return String(process.env.EXPO_PUBLIC_FAUCET_ADDRESS_POLYGON_AMOY || "").trim();
  return "";
}

function resolveFaucetAddress(chain: MarketChainConfig) {
  const fromConfig = String(chain.faucet_address || "").trim();
  if (isAddress(fromConfig)) return fromConfig;
  const fromEnv = envFaucetAddressForChain(chain.chain);
  if (isAddress(fromEnv)) return fromEnv;
  return "";
}

function rpcClient(chain: MarketChainConfig) {
  const rpc = String(chain.rpc_url || "").trim();
  if (!rpc) return null;
  return createPublicClient({ transport: http(rpc) });
}

export async function readFaucetStatus(chain: MarketChainConfig, walletAddress?: string | null): Promise<FaucetStatus> {
  const faucetAddress = resolveFaucetAddress(chain);
  const available = Boolean(chain.active && chain.faucet_active && isAddress(faucetAddress));

  const defaultUsdc = safeBigInt(chain.faucet_usdc_amount_raw, 0n);
  const defaultUsdt = safeBigInt(chain.faucet_usdt_amount_raw, 0n);
  const defaultCooldown = safeInt(chain.faucet_cooldown_seconds, 86_400);

  let usdcAmountRaw = defaultUsdc;
  let usdtAmountRaw = defaultUsdt;
  let cooldownSeconds = defaultCooldown;
  let nextClaimAt = 0;

  if (!available) {
    return {
      available: false,
      faucetAddress: isAddress(faucetAddress) ? faucetAddress : null,
      usdcAmountRaw,
      usdtAmountRaw,
      cooldownSeconds,
      nextClaimAt,
      secondsLeft: 0,
      canClaim: false,
    };
  }

  const client = rpcClient(chain);
  if (client) {
    try {
      const [usdc, usdt, cooldown] = await Promise.all([
        client.readContract({
          address: faucetAddress as `0x${string}`,
          abi: FAUCET_ABI,
          functionName: "usdcClaimAmount",
        }),
        client.readContract({
          address: faucetAddress as `0x${string}`,
          abi: FAUCET_ABI,
          functionName: "usdtClaimAmount",
        }),
        client.readContract({
          address: faucetAddress as `0x${string}`,
          abi: FAUCET_ABI,
          functionName: "cooldownSeconds",
        }),
      ]);

      usdcAmountRaw = safeBigInt(usdc, usdcAmountRaw);
      usdtAmountRaw = safeBigInt(usdt, usdtAmountRaw);
      cooldownSeconds = safeInt(cooldown, cooldownSeconds);
    } catch {
      // Keep DB/env defaults if chain read fails.
    }

    if (isAddress(walletAddress)) {
      try {
        const next = await client.readContract({
          address: faucetAddress as `0x${string}`,
          abi: FAUCET_ABI,
          functionName: "nextClaimAt",
          args: [walletAddress as `0x${string}`],
        });
        nextClaimAt = safeInt(next, 0);
      } catch {
        nextClaimAt = 0;
      }
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const secondsLeft = nextClaimAt > nowSec ? nextClaimAt - nowSec : 0;

  return {
    available: true,
    faucetAddress,
    usdcAmountRaw,
    usdtAmountRaw,
    cooldownSeconds,
    nextClaimAt,
    secondsLeft,
    canClaim: secondsLeft === 0,
  };
}

async function hashLooksLikeOnchainTx(chain: MarketChainConfig, hash: string) {
  const txHash = normalizeHexHash(hash);
  if (!txHash) return false;
  const client = rpcClient(chain);
  if (!client) return false;

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt) return true;
  } catch {
    // Continue to lower-level fallback.
  }

  try {
    const reqAny = client.request as any;
    const tx: any = await reqAny({
      method: "eth_getTransactionByHash",
      params: [txHash as `0x${string}`],
    });
    return String(tx?.hash || "").toLowerCase() === txHash.toLowerCase();
  } catch {
    return false;
  }
}

async function resolveUserOpToTxHash(chain: MarketChainConfig, userOpHash: string, attempts = 30, intervalMs = 3000) {
  const opHash = normalizeHexHash(userOpHash);
  if (!opHash) return "";

  const client = rpcClient(chain);
  if (!client) return "";

  try {
    const reqAny = client.request as any;
    for (let i = 0; i < attempts; i++) {
      try {
        const receipt: any =
          (await reqAny({
            method: "eth_getUserOperationReceipt",
            params: [opHash as `0x${string}`],
          })) ??
          (await reqAny({
            method: "alchemy_getUserOperationReceipt",
            params: [opHash as `0x${string}`],
          }));
        const txHash = normalizeHexHash(String(receipt?.receipt?.transactionHash || receipt?.transactionHash || ""));
        if (txHash) return txHash;
      } catch {
        // keep retrying
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } catch {
    return "";
  }

  return "";
}

export async function claimFaucet(chain: MarketChainConfig) {
  if (!chain.active) throw new Error(`Selected network ${chain.chain} is inactive.`);

  const faucetAddress = resolveFaucetAddress(chain);
  if (!isAddress(faucetAddress)) throw new Error(`Faucet is not configured for ${chain.chain}.`);
  if (!chain.faucet_active) throw new Error(`Faucet is disabled on ${chain.chain}.`);

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { client, account, address } = await getSmartAccount(chain, user.id);
  await registerWallet(chain.chain, address);

  const claimData = encodeFunctionData({
    abi: FAUCET_ABI,
    functionName: "claim",
    args: [],
  });

  const sendResult = await (client as any).sendTransaction({
    account,
    to: faucetAddress as `0x${string}`,
    data: claimData,
  });

  const directTxHash = normalizeHexHash(String((sendResult as any)?.transactionHash ?? ""));
  const resultHash = normalizeHexHash(String((sendResult as any)?.hash ?? ""));
  let userOpHash = normalizeHexHash(String((sendResult as any)?.userOpHash ?? (sendResult as any)?.userOperationHash ?? ""));

  let txHash = directTxHash;
  if (!txHash && resultHash) {
    if (await hashLooksLikeOnchainTx(chain, resultHash)) {
      txHash = resultHash;
    } else if (!userOpHash) {
      userOpHash = resultHash;
    }
  }

  if (!txHash && userOpHash) {
    txHash = await resolveUserOpToTxHash(chain, userOpHash, 25, 3000);
  }

  return {
    chain: chain.chain,
    faucetAddress,
    walletAddress: address,
    txHash: txHash || null,
    userOpHash: userOpHash || null,
  };
}
