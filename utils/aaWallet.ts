import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";
import { AlchemyChainMap, LocalAccountSigner, getChain } from "@alchemy/aa-core";
import { createAlchemySmartAccountClient } from "@alchemy/aa-alchemy";
import { createLightAccount } from "@alchemy/aa-accounts";
import { Wallet } from "ethers";
import { http, type Hex } from "viem";
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from "viem/chains";
import { generatePrivateKey } from "viem/accounts";

export type MarketChainConfig = {
  chain: string;
  chain_id: number;
  rpc_url: string | null;
  usdc_address: string;
  escrow_address: string;
  identity_factory?: string | null;
  identity_router?: string | null;
  identity_name_registry?: string | null;
  identity_stable_address?: string | null;
  confirmations_required: number;
  active: boolean;
};

const KEY_PRIVATE = "bc_aa_private_key_v1";
const KEY_MNEMONIC = "bc_aa_mnemonic_v1";
const KEY_BACKED_UP = "bc_aa_backed_up_v1";

function scopeKey(base: string, scope?: string | null) {
  const raw = (scope || "global").trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${base}__${safe}`;
}

function normalizeChainId(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePrivateKey(rawKey: string): `0x${string}` {
  const trimmed = String(rawKey || "").trim();
  const cleaned = trimmed.replace(/\s+/g, "");
  const hex = cleaned.startsWith("0x") ? cleaned.slice(2) : cleaned;
  if (/^[a-fA-F0-9]{64}$/.test(hex)) {
    return `0x${hex}` as `0x${string}`;
  }
  throw new Error("Private key must be 64 hex chars (with or without 0x).");
}

function cleanAlchemyApiKey(raw?: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.replace(/^https?:\/\/[^/]+\/v2\//i, "");
}

function getChainById(chainIdInput: number | string) {
  const chainId = normalizeChainId(chainIdInput);
  const alchemyChain = AlchemyChainMap.get(chainId);
  if (alchemyChain) return alchemyChain;
  const map: Record<number, any> = {
    84532: baseSepolia,
    8453: base,
    11155111: sepolia,
    1: mainnet,
    137: polygon,
    42161: arbitrum,
    10: optimism,
  };
  if (map[chainId]) return map[chainId];
  return AlchemyChainMap.get(chainId) ?? getChain(chainId);
}

export async function getOrCreatePrivateKey(scope?: string | null): Promise<`0x${string}`> {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const keyBackedUp = scopeKey(KEY_BACKED_UP, scope);

  const existing = await SecureStore.getItemAsync(keyPrivate);
  if (existing && existing.startsWith("0x")) return existing as `0x${string}`;
  const globalExisting = await SecureStore.getItemAsync(scopeKey(KEY_PRIVATE, null));
  if (globalExisting && globalExisting.startsWith("0x")) {
    await SecureStore.setItemAsync(keyPrivate, globalExisting);
    return globalExisting as `0x${string}`;
  }

  const created = Wallet.createRandom();
  const pk = (created.privateKey || generatePrivateKey()) as `0x${string}`;

  await SecureStore.setItemAsync(keyPrivate, pk);
  if (!scope) {
    await SecureStore.setItemAsync(scopeKey(KEY_PRIVATE, null), pk);
  }
  await SecureStore.setItemAsync(keyBackedUp, "false");
  return pk;
}

export async function getStoredPrivateKey(scope?: string | null): Promise<`0x${string}` | null> {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const existing = await SecureStore.getItemAsync(keyPrivate);
  if (existing && existing.startsWith("0x")) return existing as `0x${string}`;
  const globalExisting = await SecureStore.getItemAsync(scopeKey(KEY_PRIVATE, null));
  if (globalExisting && globalExisting.startsWith("0x")) return globalExisting as `0x${string}`;
  return null;
}

export async function getWalletBackupSecret(scope?: string | null) {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const keyMnemonic = scopeKey(KEY_MNEMONIC, scope);

  const pk = await SecureStore.getItemAsync(keyPrivate);
  if (pk && pk.startsWith("0x")) {
    return { type: "privateKey" as const, value: pk };
  }
  const mnemonic = await SecureStore.getItemAsync(keyMnemonic);
  if (mnemonic && mnemonic.trim().length > 0) {
    const derived = Wallet.fromPhrase(mnemonic.trim()).privateKey as `0x${string}`;
    await SecureStore.setItemAsync(keyPrivate, derived);
    await SecureStore.deleteItemAsync(keyMnemonic);
    return { type: "privateKey" as const, value: derived };
  }
  throw new Error("No wallet secret found.");
}

export async function hasWalletBackup(scope?: string | null) {
  return (await SecureStore.getItemAsync(scopeKey(KEY_BACKED_UP, scope))) === "true";
}

export async function markWalletBackedUp(scope?: string | null) {
  await SecureStore.setItemAsync(scopeKey(KEY_BACKED_UP, scope), "true");
}

export async function regenerateWalletKey(scope?: string | null) {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const keyBackedUp = scopeKey(KEY_BACKED_UP, scope);

  const created = Wallet.createRandom();
  const pk = (created.privateKey || generatePrivateKey()) as `0x${string}`;

  await SecureStore.setItemAsync(keyPrivate, pk);
  await SecureStore.setItemAsync(scopeKey(KEY_PRIVATE, null), pk);
  await SecureStore.deleteItemAsync(scopeKey(KEY_MNEMONIC, scope));
  await SecureStore.setItemAsync(keyBackedUp, "false");
  return pk;
}

export async function getScopedWalletAddress(scope?: string | null) {
  const pk = await getOrCreatePrivateKey(scope);
  return new Wallet(pk).address;
}

export async function getSmartAccount(chainConfig: MarketChainConfig, scope?: string | null) {
  const chainId = normalizeChainId((chainConfig as any).chain_id);
  if (!chainId) {
    throw new Error(`Invalid chain_id for ${chainConfig.chain}`);
  }
  const chain = getChainById(chainId);
  const normalizedConfig = { ...chainConfig, chain_id: chainId };
  const rpcUrl = getRpcUrlForChain(normalizedConfig, chain);
  if (!rpcUrl) {
    throw new Error("Missing RPC URL or Alchemy API key.");
  }

  const pk = await getOrCreatePrivateKey(scope);
  const signer = LocalAccountSigner.privateKeyToAccountSigner(pk as Hex);

  let account: any;
  try {
    account = await createLightAccount({
      chain: chain as any,
      signer,
      transport: http(rpcUrl) as any,
    });
  } catch (e: any) {
    const msg = String(e?.message || "Unknown error");
    throw new Error(
      `Smart account init failed (getCounterFactualAddress). chain=${chainConfig.chain} chain_id=${chainId} rpc=${rpcUrl}. ${msg}`,
    );
  }

  const apiKey = cleanAlchemyApiKey(process.env.EXPO_PUBLIC_ALCHEMY_API_KEY);
  const gasPolicyId = process.env.EXPO_PUBLIC_ALCHEMY_GAS_POLICY_ID as string | undefined;
  const canUseApiKeyClient = !!apiKey && !!chain?.rpcUrls?.alchemy?.http?.[0];
  const client = createAlchemySmartAccountClient({
    chain,
    account,
    ...(canUseApiKeyClient ? { apiKey } : { rpcUrl }),
    ...(gasPolicyId ? { gasManagerConfig: { policyId: gasPolicyId } } : {}),
  });

  return {
    chain,
    account,
    client,
    address: account.address,
    rpcUrl,
  };
}

function alchemyUrlForChainId(chainId: number, apiKey?: string) {
  const safeApiKey = cleanAlchemyApiKey(apiKey);
  if (!safeApiKey) return "";
  const map: Record<number, string> = {
    84532: `https://base-sepolia.g.alchemy.com/v2/${safeApiKey}`,
    8453: `https://base-mainnet.g.alchemy.com/v2/${safeApiKey}`,
    11155111: `https://eth-sepolia.g.alchemy.com/v2/${safeApiKey}`,
    1: `https://eth-mainnet.g.alchemy.com/v2/${safeApiKey}`,
    137: `https://polygon-mainnet.g.alchemy.com/v2/${safeApiKey}`,
    42161: `https://arb-mainnet.g.alchemy.com/v2/${safeApiKey}`,
    10: `https://opt-mainnet.g.alchemy.com/v2/${safeApiKey}`,
  };
  return map[chainId] ?? "";
}

export async function deriveSmartAccountAddress(chainConfig: MarketChainConfig, privateKey: `0x${string}`) {
  const chainId = normalizeChainId((chainConfig as any).chain_id);
  if (!chainId) {
    throw new Error(`Invalid chain_id for ${chainConfig.chain}`);
  }
  const chain = getChainById(chainId);
  const rpcUrl = getRpcUrlForChain({ ...chainConfig, chain_id: chainId }, chain);
  if (!rpcUrl) {
    throw new Error("Missing RPC URL or Alchemy API key.");
  }
  const signer = LocalAccountSigner.privateKeyToAccountSigner(privateKey as Hex);
  const account = await createLightAccount({
    chain: chain as any,
    signer,
    transport: http(rpcUrl) as any,
  });
  return account.address as `0x${string}`;
}

export async function getWalletPrivateKey(scope?: string | null) {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const pk = await SecureStore.getItemAsync(keyPrivate);
  if (pk && pk.startsWith("0x")) return pk;
  throw new Error("No private key found.");
}

export async function importPrivateKey(scope: string | null | undefined, rawKey: string) {
  const keyPrivate = scopeKey(KEY_PRIVATE, scope);
  const keyMnemonic = scopeKey(KEY_MNEMONIC, scope);
  const keyBackedUp = scopeKey(KEY_BACKED_UP, scope);

  const normalized = normalizePrivateKey(rawKey);
  const wallet = new Wallet(normalized);
  await SecureStore.setItemAsync(keyPrivate, wallet.privateKey);
  await SecureStore.setItemAsync(scopeKey(KEY_PRIVATE, null), wallet.privateKey);
  await SecureStore.deleteItemAsync(keyMnemonic);
  await SecureStore.setItemAsync(keyBackedUp, "true");
  return wallet.address;
}

export function getRpcUrlForChain(chainConfig: MarketChainConfig, chainOverride?: any) {
  const chainId = normalizeChainId((chainConfig as any).chain_id);
  const chain = chainOverride ?? getChainById(chainId);
  const apiKey = cleanAlchemyApiKey(process.env.EXPO_PUBLIC_ALCHEMY_API_KEY);
  const explicitAlchemy = alchemyUrlForChainId(chainId, apiKey);
  // Prefer explicit Alchemy endpoint first for AA stability.
  return (
    explicitAlchemy ||
    (apiKey && chain.rpcUrls?.alchemy?.http?.[0]?.replace("${ALCHEMY_API_KEY}", apiKey)) ||
    chainConfig.rpc_url ||
    chain.rpcUrls?.default?.http?.[0] ||
    ""
  );
}
