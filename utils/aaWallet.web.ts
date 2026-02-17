import { createWalletClient, custom } from "viem";
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from "viem/chains";

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

const EXTERNAL_WALLET_SENTINEL_PK = `0x${"f".repeat(64)}` as `0x${string}`;

function normalizeChainId(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function cleanAlchemyApiKey(raw?: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.replace(/^https?:\/\/[^/]+\/v2\//i, "");
}

function getFallbackChainById(chainId: number) {
  const map: Record<number, any> = {
    84532: baseSepolia,
    8453: base,
    11155111: sepolia,
    1: mainnet,
    137: polygon,
    42161: arbitrum,
    10: optimism,
  };
  return map[chainId] ?? null;
}

function getProvider() {
  if (typeof window === "undefined") return null;
  const anyWindow = window as any;
  return anyWindow.ethereum ?? null;
}

async function getConnectedExternalAddress() {
  const provider = getProvider();
  if (!provider?.request) return "";
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[] | undefined;
    const address = String(accounts?.[0] || "");
    return /^0x[a-fA-F0-9]{40}$/.test(address) ? (address as `0x${string}`) : "";
  } catch {
    return "";
  }
}

async function connectExternalAddress() {
  const provider = getProvider();
  if (!provider?.request) {
    throw new Error("No external wallet found. Install MetaMask or another EVM wallet.");
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[] | undefined;
  const address = String(accounts?.[0] || "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("External wallet connection failed. No valid wallet address returned.");
  }
  return address as `0x${string}`;
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

function toHexChainId(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

function buildChainForWallet(chainConfig: MarketChainConfig, chainOverride?: any) {
  if (chainOverride) return chainOverride;
  const chainId = normalizeChainId((chainConfig as any).chain_id);
  const fallback = getFallbackChainById(chainId);
  if (fallback) return fallback;

  const rpc = String(chainConfig.rpc_url || "").trim();
  return {
    id: chainId,
    name: String(chainConfig.chain || `Chain ${chainId}`),
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: rpc ? [rpc] : [] },
      public: { http: rpc ? [rpc] : [] },
    },
  } as any;
}

async function ensureProviderChain(chain: any, chainConfig: MarketChainConfig) {
  const provider = getProvider();
  if (!provider?.request) {
    throw new Error("No external wallet found. Install MetaMask or another EVM wallet.");
  }

  const chainId = normalizeChainId((chainConfig as any).chain_id);
  if (!chainId) throw new Error(`Invalid chain_id for ${chainConfig.chain}`);

  const targetHex = toHexChainId(chainId);
  let current = "";
  try {
    current = String(await provider.request({ method: "eth_chainId" }));
  } catch {
    current = "";
  }
  if (current.toLowerCase() === targetHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
    return;
  } catch (switchErr: any) {
    const code = Number(switchErr?.code);
    if (code !== 4902 && code !== -32603) {
      throw new Error(switchErr?.message || "Unable to switch external wallet network.");
    }
  }

  const rpcUrl = getRpcUrlForChain(chainConfig, chain);
  if (!rpcUrl) throw new Error(`Missing RPC URL for ${chainConfig.chain}.`);

  const explorer = String(chain?.blockExplorers?.default?.url || "").trim();
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: targetHex,
          chainName: String(chain?.name || chainConfig.chain || `Chain ${chainId}`),
          nativeCurrency: chain?.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [rpcUrl],
          blockExplorerUrls: explorer ? [explorer] : undefined,
        },
      ],
    });
  } catch (addErr: any) {
    throw new Error(addErr?.message || `Unable to add ${chainConfig.chain} to external wallet.`);
  }

  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: targetHex }],
  });
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

export async function getOrCreatePrivateKey(_scope?: string | null): Promise<`0x${string}`> {
  const connected = await getConnectedExternalAddress();
  if (!connected) {
    throw new Error("Connect your external wallet first.");
  }
  return EXTERNAL_WALLET_SENTINEL_PK;
}

export async function getStoredPrivateKey(_scope?: string | null): Promise<`0x${string}` | null> {
  const connected = await getConnectedExternalAddress();
  return connected ? EXTERNAL_WALLET_SENTINEL_PK : null;
}

export async function getWalletBackupSecret(_scope?: string | null) {
  throw new Error("External wallet manages backup and recovery. Seed/private key is not stored in this app.");
}

export async function hasWalletBackup(_scope?: string | null) {
  return true;
}

export async function markWalletBackedUp(_scope?: string | null) {
  // External wallet backup is managed by wallet provider.
}

export async function regenerateWalletKey(_scope?: string | null) {
  throw new Error("Regenerate is not supported on web. Create/switch accounts from your external wallet.");
}

export async function getScopedWalletAddress(_scope?: string | null) {
  return await connectExternalAddress();
}

export async function getSmartAccount(chainConfig: MarketChainConfig, _scope?: string | null) {
  const provider = getProvider();
  if (!provider?.request) {
    throw new Error("No external wallet found. Install MetaMask or another EVM wallet.");
  }

  const chainId = normalizeChainId((chainConfig as any).chain_id);
  if (!chainId) {
    throw new Error(`Invalid chain_id for ${chainConfig.chain}`);
  }

  const chain = buildChainForWallet(chainConfig);
  const rpcUrl = getRpcUrlForChain(chainConfig, chain);
  if (!rpcUrl) {
    throw new Error("Missing RPC URL or Alchemy API key.");
  }

  const address = await connectExternalAddress();
  await ensureProviderChain(chain, chainConfig);

  const walletClient = createWalletClient({
    chain: chain as any,
    transport: custom(provider as any),
  });

  const client = {
    account: address as `0x${string}`,
    sendTransaction: async (args: any) => {
      await ensureProviderChain(chain, chainConfig);
      const hash = await walletClient.sendTransaction({
        account: ((args?.account || args?.from || address) as string) as `0x${string}`,
        to: (args?.to as string) as `0x${string}`,
        data: args?.data as `0x${string}` | undefined,
        value:
          args?.value === undefined || args?.value === null
            ? undefined
            : BigInt(args.value),
        chain: chain as any,
      });
      return { hash };
    },
    sendTransactions: async (args: any) => {
      const requests = Array.isArray(args?.requests) ? args.requests : [];
      let last = "";
      for (const req of requests) {
        const out = await (client as any).sendTransaction({
          account: args?.account || address,
          ...req,
        });
        last = String(out?.hash || "");
      }
      return { hash: last || null };
    },
  };

  return {
    chain,
    account: address as `0x${string}`,
    client,
    address: address as `0x${string}`,
    rpcUrl,
  };
}

export async function deriveSmartAccountAddress(_chainConfig: MarketChainConfig, _privateKey: `0x${string}`) {
  const connected = await getConnectedExternalAddress();
  if (!connected) {
    throw new Error("Connect your external wallet first.");
  }
  return connected as `0x${string}`;
}

export async function getWalletPrivateKey(_scope?: string | null) {
  throw new Error("Private key access is disabled on web. Use your external wallet.");
}

export async function importPrivateKey(_scope: string | null | undefined, _rawKey: string) {
  // Web mode uses external wallets instead of private-key import.
  return await connectExternalAddress();
}

export function getRpcUrlForChain(chainConfig: MarketChainConfig, chainOverride?: any) {
  const chainId = normalizeChainId((chainConfig as any).chain_id);
  const chain = buildChainForWallet(chainConfig, chainOverride);
  const apiKey = cleanAlchemyApiKey(process.env.EXPO_PUBLIC_ALCHEMY_API_KEY);
  const explicitAlchemy = alchemyUrlForChainId(chainId, apiKey);
  return (
    explicitAlchemy ||
    (apiKey && chain?.rpcUrls?.alchemy?.http?.[0]?.replace("${ALCHEMY_API_KEY}", apiKey)) ||
    chainConfig.rpc_url ||
    chain?.rpcUrls?.default?.http?.[0] ||
    ""
  );
}
