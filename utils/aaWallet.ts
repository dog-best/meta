import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";
import { AlchemyChainMap, LocalAccountSigner, getChain } from "@alchemy/aa-core";
import { createAlchemySmartAccountClient } from "@alchemy/aa-alchemy";
import { createLightAccount } from "@alchemy/aa-accounts";
import { Wallet } from "ethers";
import { http, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";

export type MarketChainConfig = {
  chain: string;
  chain_id: number;
  rpc_url: string | null;
  usdc_address: string;
  escrow_address: string;
  confirmations_required: number;
  active: boolean;
};

const KEY_PRIVATE = "bc_aa_private_key_v1";
const KEY_MNEMONIC = "bc_aa_mnemonic_v1";
const KEY_BACKED_UP = "bc_aa_backed_up_v1";

function getChainById(chainId: number) {
  return AlchemyChainMap.get(chainId) ?? getChain(chainId);
}

export async function getOrCreatePrivateKey(): Promise<`0x${string}`> {
  const existing = await SecureStore.getItemAsync(KEY_PRIVATE);
  if (existing && existing.startsWith("0x")) return existing as `0x${string}`;

  const created = Wallet.createRandom();
  const pk = (created.privateKey || generatePrivateKey()) as `0x${string}`;
  const phrase = created.mnemonic?.phrase ?? null;

  await SecureStore.setItemAsync(KEY_PRIVATE, pk);
  if (phrase) {
    await SecureStore.setItemAsync(KEY_MNEMONIC, phrase);
  }
  await SecureStore.setItemAsync(KEY_BACKED_UP, "false");
  return pk;
}

export async function getWalletBackupSecret() {
  const mnemonic = await SecureStore.getItemAsync(KEY_MNEMONIC);
  if (mnemonic && mnemonic.trim().length > 0) {
    return { type: "mnemonic" as const, value: mnemonic };
  }
  const pk = await SecureStore.getItemAsync(KEY_PRIVATE);
  if (pk && pk.startsWith("0x")) {
    return { type: "privateKey" as const, value: pk };
  }
  throw new Error("No wallet secret found.");
}

export async function hasWalletBackup() {
  return (await SecureStore.getItemAsync(KEY_BACKED_UP)) === "true";
}

export async function markWalletBackedUp() {
  await SecureStore.setItemAsync(KEY_BACKED_UP, "true");
}

export async function regenerateWalletKey() {
  const created = Wallet.createRandom();
  const pk = (created.privateKey || generatePrivateKey()) as `0x${string}`;
  const phrase = created.mnemonic?.phrase ?? null;

  await SecureStore.setItemAsync(KEY_PRIVATE, pk);
  if (phrase) {
    await SecureStore.setItemAsync(KEY_MNEMONIC, phrase);
  }
  await SecureStore.setItemAsync(KEY_BACKED_UP, "false");
  return pk;
}

export async function getSmartAccount(chainConfig: MarketChainConfig) {
  const chain = getChainById(chainConfig.chain_id);
  const rpcUrl = getRpcUrlForChain(chainConfig, chain);
  if (!rpcUrl) {
    throw new Error("Missing RPC URL or Alchemy API key.");
  }

  const pk = await getOrCreatePrivateKey();
  const signer = LocalAccountSigner.privateKeyToAccountSigner(pk as Hex);

  const account = await createLightAccount({
    chain,
    signer,
    transport: http(rpcUrl),
  });

  const apiKey = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY as string | undefined;
  const gasPolicyId = process.env.EXPO_PUBLIC_ALCHEMY_GAS_POLICY_ID as string | undefined;
  const client = createAlchemySmartAccountClient({
    chain,
    account,
    ...(apiKey ? { apiKey } : { rpcUrl }),
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

export function getRpcUrlForChain(chainConfig: MarketChainConfig, chainOverride?: any) {
  const chain = chainOverride ?? getChainById(chainConfig.chain_id);
  const apiKey = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY as string | undefined;
  return (
    chainConfig.rpc_url ||
    (apiKey && chain.rpcUrls?.alchemy?.http?.[0]?.replace("${ALCHEMY_API_KEY}", apiKey)) ||
    chain.rpcUrls?.default?.http?.[0] ||
    ""
  );
}
