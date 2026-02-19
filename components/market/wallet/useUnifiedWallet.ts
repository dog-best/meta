import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, formatUnits, http } from "viem";

import { useWalletSimple } from "@/hooks/wallet/useWalletSimple";
import { fetchMarketChains, getPreferredMarketChain, setPreferredMarketChain, type MarketChainConfig } from "@/services/market/chainConfig";
import { fetchMyStockPortfolio } from "@/services/market/stocks";
import { ensureWalletAddressOnChain, getMyWalletForChain, replaceSavedWalletWithDevice } from "@/services/market/usdcCheckout";
import { connectActiveWalletEvm, getActiveWalletSession, subscribeActiveWalletSession } from "@/services/wallet/activeWalletSession";
import { getWalletModeSync, isBaseSmartSupported, setWalletMode, subscribeWalletMode, type WalletMode } from "@/services/wallet/walletMode";
import { getRpcUrlForChain } from "@/utils/aaWallet";
import { isNigeriaCountry, resolveUserCountry, type UserCountry } from "@/utils/country";
import { friendlyMarketError } from "@/utils/marketUx";

const ERC20_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function isAddress(value?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

export type UnifiedWalletStockPosition = {
  stock_id: string;
  slug: string;
  symbol: string;
  name: string;
  qty: number;
  value_usdc: number;
};

export function useUnifiedWallet() {
  const { balance: ngnBalance, loading: ngnLoading, error: ngnError, reload: reloadNgn } = useWalletSimple();

  const [country, setCountry] = useState<UserCountry | undefined>(undefined);
  const [countryErr, setCountryErr] = useState<string | null>(null);
  const [chains, setChains] = useState<MarketChainConfig[]>([]);
  const [chain, setChain] = useState<MarketChainConfig | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [savedAddress, setSavedAddress] = useState("");
  const [connectedAddress, setConnectedAddress] = useState("");
  const [walletMode, setWalletModeState] = useState<WalletMode>(getWalletModeSync());
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [portfolioTotalUsdc, setPortfolioTotalUsdc] = useState(0);
  const [portfolioPositions, setPortfolioPositions] = useState<UnifiedWalletStockPosition[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNigeria = isNigeriaCountry(country?.code || country?.name);
  const stableTotalUsd = useMemo(() => Number(usdcBalance || 0) + Number(usdtBalance || 0), [usdcBalance, usdtBalance]);
  const overallUsdApprox = useMemo(() => stableTotalUsd + Number(portfolioTotalUsdc || 0), [stableTotalUsd, portfolioTotalUsdc]);
  const loading = ngnLoading || portfolioLoading || busy || country === undefined;

  const refreshCountry = useCallback(async () => {
    try {
      setCountryErr(null);
      const c = await resolveUserCountry({ prompt: true, refresh: true });
      setCountry(c);
      if (!c) setCountryErr("Location not detected.");
      return c;
    } catch (e: any) {
      setCountry(null);
      setCountryErr(String(e?.message || "Could not read location."));
      return null;
    }
  }, []);

  const refreshPortfolio = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const res = await fetchMyStockPortfolio();
      const positions = Array.isArray(res.positions) ? res.positions : [];
      const mapped: UnifiedWalletStockPosition[] = positions.map((row: any) => ({
        stock_id: String(row?.stock_id || ""),
        slug: String(row?.identity?.slug || ""),
        symbol: String(row?.identity?.symbol || ""),
        name: String(row?.identity?.name || "Stock"),
        qty: Number(row?.balance_qty ?? 0),
        value_usdc: Number(row?.value_usdc ?? 0),
      }));
      setPortfolioPositions(mapped.sort((a, b) => b.value_usdc - a.value_usdc));
      setPortfolioTotalUsdc(Number(res.total_value_usdc ?? 0));
    } catch {
      setPortfolioPositions([]);
      setPortfolioTotalUsdc(0);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  const refreshChainBalances = useCallback(
    async (selected?: MarketChainConfig | null, forcedAddress?: string) => {
      const current = selected ?? chain;
      if (!current) {
        setSavedAddress("");
        setUsdcBalance("0");
        setUsdtBalance("0");
        return { address: "" };
      }

      let nextAddress = String(forcedAddress || "").trim();
      if (!nextAddress) {
        const row = await getMyWalletForChain(current.chain);
        nextAddress = String(row?.address || "").trim();
      }

      setSavedAddress(nextAddress);
      if (!isAddress(nextAddress)) {
        setUsdcBalance("0");
        setUsdtBalance("0");
        return { address: "" };
      }

      const rpcUrl = getRpcUrlForChain(current);
      if (!rpcUrl) return { address: nextAddress };

      const client = createPublicClient({ transport: http(rpcUrl) });

      try {
        if (isAddress(current.usdc_address)) {
          const d = Number(await client.readContract({ address: current.usdc_address as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }));
          const raw = await client.readContract({
            address: current.usdc_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [nextAddress as `0x${string}`],
          });
          setUsdcBalance(formatUnits(raw as bigint, d));
        } else {
          setUsdcBalance("0");
        }
      } catch {
        setUsdcBalance("0");
      }

      try {
        if (isAddress(current.usdt_address)) {
          const d = Number(await client.readContract({ address: current.usdt_address as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }));
          const raw = await client.readContract({
            address: current.usdt_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [nextAddress as `0x${string}`],
          });
          setUsdtBalance(formatUnits(raw as bigint, d));
        } else {
          setUsdtBalance("0");
        }
      } catch {
        setUsdtBalance("0");
      }

      return { address: nextAddress };
    },
    [chain],
  );

  const loadChains = useCallback(async () => {
    try {
      setChainErr(null);
      const all = await fetchMarketChains();
      setChains(all);
      const preferred = (await getPreferredMarketChain()) ?? all.find((c) => c.active) ?? all[0] ?? null;
      setChain(preferred);
      await refreshChainBalances(preferred);
    } catch (e: any) {
      setChainErr(String(e?.message || "Unable to load networks."));
      setChains([]);
      setChain(null);
      setSavedAddress("");
      setUsdcBalance("0");
      setUsdtBalance("0");
    }
  }, [refreshChainBalances]);

  const selectChain = useCallback(
    async (next: MarketChainConfig) => {
      setError(null);
      try {
        setChain(next);
        await setPreferredMarketChain(next.chain);
        await refreshChainBalances(next);
      } catch (e: any) {
        setError(friendlyMarketError(e, "Unable to switch network."));
      }
    },
    [refreshChainBalances],
  );

  const connectWallet = useCallback(async () => {
    if (!chain) return;
    setBusy(true);
    setError(null);
    try {
      await connectActiveWalletEvm(60_000, { forceModal: true });
      const out = await ensureWalletAddressOnChain(chain);
      await refreshChainBalances(chain, out.address);
    } catch (e: any) {
      setError(friendlyMarketError(e, "Unable to connect wallet."));
    } finally {
      setBusy(false);
    }
  }, [chain, refreshChainBalances]);

  const useConnectedWallet = useCallback(async () => {
    if (!chain) return;
    setBusy(true);
    setError(null);
    try {
      await connectActiveWalletEvm(60_000, { forceModal: true });
      const out = await replaceSavedWalletWithDevice(chain);
      await refreshChainBalances(chain, out.address);
    } catch (e: any) {
      setError(friendlyMarketError(e, "Could not sync wallet."));
    } finally {
      setBusy(false);
    }
  }, [chain, refreshChainBalances]);

  const refreshAll = useCallback(async () => {
    try {
      setError(null);
      await Promise.allSettled([reloadNgn(), refreshPortfolio(), refreshCountry()]);
      await refreshChainBalances();
    } catch (e: any) {
      setError(friendlyMarketError(e, "Unable to refresh wallet data."));
    }
  }, [refreshChainBalances, refreshCountry, refreshPortfolio, reloadNgn]);

  useEffect(() => {
    const sync = () => {
      const s = getActiveWalletSession();
      setConnectedAddress(s.connected ? String(s.address || "") : "");
    };
    sync();
    const unsub = subscribeActiveWalletSession(sync);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeWalletMode((next) => setWalletModeState(next));
    return () => unsub();
  }, []);

  const changeWalletMode = useCallback(async (next: WalletMode) => {
    setError(null);
    try {
      await setWalletMode(next);
      setWalletModeState(next);
      await refreshChainBalances();
    } catch (e: any) {
      setError(friendlyMarketError(e, "Unable to change wallet mode."));
    }
  }, [refreshChainBalances]);

  useEffect(() => {
    loadChains();
    refreshPortfolio();
    refreshCountry();
  }, [loadChains, refreshCountry, refreshPortfolio]);

  return {
    loading,
    busy,
    error: error || chainErr || countryErr || ngnError || null,
    ngnBalance: Number(ngnBalance || 0),
    country,
    isNigeria,
    walletMode,
    baseSmartSupported: isBaseSmartSupported(),
    chains,
    chain,
    savedAddress,
    connectedAddress,
    usdcBalance: Number(usdcBalance || 0),
    usdtBalance: Number(usdtBalance || 0),
    stableTotalUsd,
    portfolioTotalUsdc: Number(portfolioTotalUsdc || 0),
    portfolioPositions,
    overallUsdApprox,
    connectWallet,
    useConnectedWallet,
    setWalletMode: changeWalletMode,
    refreshAll,
    refreshCountry,
    selectChain,
    loadChains,
    refreshChainBalances,
  };
}
