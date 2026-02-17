import React, { useEffect } from "react";

import { createAppKit, useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import {
  clearWalletConnectConnection,
  parseChainIdFromCaipAddress,
  setWalletConnectConnection,
  setWalletConnectRuntime,
} from "@/services/wallet/walletConnectSession";

const projectId = String(process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || "").trim();

const metadata = {
  name: "Best City",
  description: "Best City wallet connection",
  url: "https://bestcity.app",
  icons: ["https://bestcity.app/icon.png"],
};

const networks = [mainnet, sepolia, base, baseSepolia, polygon, arbitrum, optimism] as any;

let adapter: any = null;
let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  if (!projectId) return;

  adapter = new WagmiAdapter({
    projectId,
    networks,
  });

  createAppKit({
    adapters: [adapter],
    projectId,
    metadata,
    networks,
    defaultNetwork: baseSepolia,
    features: {
      analytics: true,
    },
  });
}

ensureInitialized();

const queryClient = new QueryClient();

function SessionBinder() {
  const appKit = useAppKit() as any;
  const accountState = useAppKitAccount() as any;
  const providerState = useAppKitProvider("eip155") as any;

  const open = appKit?.open;
  const isConnected = Boolean(accountState?.isConnected);
  const address = String(accountState?.address || "");
  const caipAddress = String(accountState?.caipAddress || "");
  const chainIdFromCaip = parseChainIdFromCaipAddress(caipAddress);
  const chainId = Number(accountState?.chainId || chainIdFromCaip || 0);
  const walletProvider = providerState?.walletProvider ?? providerState?.provider ?? null;

  useEffect(() => {
    setWalletConnectRuntime({
      openModal: async () => {
        if (!open) throw new Error("WalletConnect modal is unavailable.");
        await Promise.resolve(open());
      },
    });
  }, [open]);

  useEffect(() => {
    if (!isConnected || !address) {
      clearWalletConnectConnection();
      return;
    }

    setWalletConnectConnection({
      connected: true,
      address,
      chainId,
      provider: walletProvider,
      providerType: "eip155",
    });
  }, [address, chainId, isConnected, walletProvider]);

  return null;
}

export function WalletConnectProvider({ children }: { children: React.ReactNode }) {
  if (!projectId || !adapter) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={adapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionBinder />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}