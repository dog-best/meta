import * as SecureStore from "expo-secure-store";
import { AlchemyChainMap, LocalAccountSigner, getChain } from "@alchemy/aa-core";
import { createAlchemySmartAccountClient } from "@alchemy/aa-alchemy";
import { createLightAccount } from "@alchemy/aa-accounts";
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

function getChainById(chainId: number) {
  return AlchemyChainMap.get(chainId) ?? getChain(chainId);
}

export async function getOrCreatePrivateKey(): Promise<`0x${string}`> {
  const existing = await SecureStore.getItemAsync(KEY_PRIVATE);
  if (existing && existing.startsWith("0x")) return existing as `0x${string}`;
  const pk = generatePrivateKey();
  await SecureStore.setItemAsync(KEY_PRIVATE, pk);
  return pk;
}

export async function getSmartAccount(chainConfig: MarketChainConfig) {
  const chain = getChainById(chainConfig.chain_id);
  const apiKey = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY as string | undefined;
  const gasPolicyId = process.env.EXPO_PUBLIC_ALCHEMY_GAS_POLICY_ID as string | undefined;

  const rpcUrl =
    chainConfig.rpc_url ||
    (apiKey && chain.rpcUrls?.alchemy?.http?.[0]?.replace("${ALCHEMY_API_KEY}", apiKey)) ||
    chain.rpcUrls?.default?.http?.[0];

  if (!rpcUrl && !apiKey) {
    throw new Error("Missing RPC URL or Alchemy API key.");
  }

  const pk = await getOrCreatePrivateKey();
  const signer = LocalAccountSigner.privateKeyToAccountSigner(pk as Hex);

  const account = await createLightAccount({
    chain,
    signer,
    transport: http(rpcUrl ?? ""),
  });

  const client = createAlchemySmartAccountClient({
    chain,
    account,
    ...(apiKey ? { apiKey } : { rpcUrl: rpcUrl ?? "" }),
    ...(gasPolicyId ? { gasManagerConfig: { policyId: gasPolicyId } } : {}),
  });

  return {
    chain,
    account,
    client,
    address: account.address,
  };
}

