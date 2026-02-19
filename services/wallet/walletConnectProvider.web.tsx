import React, { useEffect, useMemo, useState } from "react";

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

type RuntimeModules = {
  createAppKit: any;
  useAppKit: any;
  useAppKitAccount: any;
  useAppKitProvider: any;
  WagmiAdapter: any;
  networks: any;
  injected: any;
  coinbaseWallet: any;
  walletConnect: any;
  QueryClient: any;
  QueryClientProvider: any;
  WagmiProvider: any;
};

let runtime: RuntimeModules | null = null;
let runtimeLoadFailed = false;
let adapter: any = null;
let queryClient: any = null;
let initialized = false;

function canUseBrowserRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function loadRuntime(): RuntimeModules | null {
  if (runtimeLoadFailed || !canUseBrowserRuntime()) return null;
  if (runtime) return runtime;

  try {
    const reownReactCore = require("@reown/appkit/react-core");
    const reownControllersReact = require("@reown/appkit-controllers/react");
    const adapterPkg = require("@reown/appkit-adapter-wagmi");
    const networksPkg = require("@reown/appkit/networks");
    const queryPkg = require("@tanstack/react-query");
    const wagmiPkg = require("wagmi");
    const wagmiConnectorsPkg = require("wagmi/connectors");

    runtime = {
      createAppKit: reownReactCore.createAppKit,
      useAppKit: reownReactCore.useAppKit,
      useAppKitAccount: reownReactCore.useAppKitAccount,
      useAppKitProvider: reownControllersReact.useAppKitProvider,
      WagmiAdapter: adapterPkg.WagmiAdapter,
      networks: networksPkg,
      injected: wagmiConnectorsPkg.injected,
      coinbaseWallet: wagmiConnectorsPkg.coinbaseWallet,
      walletConnect: wagmiConnectorsPkg.walletConnect,
      QueryClient: queryPkg.QueryClient,
      QueryClientProvider: queryPkg.QueryClientProvider,
      WagmiProvider: wagmiPkg.WagmiProvider,
    };

    return runtime;
  } catch (e: any) {
    runtimeLoadFailed = true;
    console.warn("[WalletConnect] Web runtime failed to load:", String(e?.message || e));
    return null;
  }
}

function getNetworks(rt: RuntimeModules) {
  const n = rt.networks;
  return [n.mainnet, n.sepolia, n.base, n.baseSepolia, n.polygon, n.arbitrum, n.optimism] as any;
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  if (!projectId || !canUseBrowserRuntime()) return;

  const rt = loadRuntime();
  if (!rt) return;

  const networks = getNetworks(rt);
  const runtimeMetadata = {
    ...metadata,
    url: canUseBrowserRuntime() ? window.location.origin : metadata.url,
  };

  const connectors = [
    typeof rt.injected === "function" ? rt.injected({ shimDisconnect: true }) : null,
    typeof rt.coinbaseWallet === "function"
      ? rt.coinbaseWallet({ appName: runtimeMetadata.name })
      : null,
    typeof rt.walletConnect === "function"
      ? rt.walletConnect({ projectId, metadata: runtimeMetadata, showQrModal: false })
      : null,
  ].filter(Boolean);

  adapter = new rt.WagmiAdapter({
    projectId,
    networks,
    connectors: connectors.length ? connectors : undefined,
    ssr: false,
  });

  rt.createAppKit({
    adapters: [adapter],
    projectId,
    metadata: runtimeMetadata,
    networks,
    defaultNetwork: rt.networks.baseSepolia,
    enableCoinbase: false,
    allWallets: true,
    enableWallets: true,
    features: {
      analytics: false,
      send: false,
      receive: false,
      legalCheckbox: false,
      collapseWallets: false,
      connectMethodsOrder: ["wallet"],
    },
  });

  queryClient = new rt.QueryClient();
}

function SessionBinder({ rt }: { rt: RuntimeModules }) {
  const appKit = rt.useAppKit() as any;
  const accountState = rt.useAppKitAccount() as any;
  const providerState = rt.useAppKitProvider("eip155") as any;

  const open = appKit?.open;
  const isConnected = Boolean(accountState?.isConnected);
  const address = String(accountState?.address || "");
  const caipAddress = String(accountState?.caipAddress || "");
  const chainIdFromCaip = parseChainIdFromCaipAddress(caipAddress);
  const chainId = Number(accountState?.chainId || chainIdFromCaip || 0);
  const walletProvider = providerState?.walletProvider ?? providerState?.provider ?? null;

  useEffect(() => {
    if (!open) return;
    setWalletConnectRuntime({
      openModal: async () => {
        try {
          await Promise.resolve(open({ view: "Connect" }));
        } catch {
          await Promise.resolve(open());
        }
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    if (!canUseBrowserRuntime()) return;

    loadRuntime();
    ensureInitialized();

    if (adapter && queryClient) {
      setReady(true);
    }
  }, []);

  const rt = useMemo(() => loadRuntime(), [ready]);
  if (!projectId || !rt || !adapter || !queryClient) {
    return <>{children}</>;
  }

  const WagmiProvider = rt.WagmiProvider as any;
  const QueryClientProvider = rt.QueryClientProvider as any;

  return (
    <WagmiProvider config={adapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionBinder rt={rt} />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
