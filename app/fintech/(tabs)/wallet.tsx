import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { createPublicClient, encodeFunctionData, formatUnits, http } from "viem";

import FundWallet from "@/components/wallet/fundwallet";
import ProfileModal from "@/components/wallet/profile";
import SendMoney from "@/components/wallet/send";
import { WALLET_THEME as T } from "@/components/wallet/theme";
import Withdraw from "@/components/wallet/withdraw";
import { useWalletSimple } from "@/hooks/wallet/useWalletSimple";
import { useWalletTxPaginated } from "@/hooks/wallet/useWalletTxPaginated";
import { fetchMarketChains, getPreferredMarketChain, setPreferredMarketChain } from "@/services/market/chainConfig";
import { ensureSmartAccount, ensureWalletAddressOnChain, getMyWalletForChain, replaceSavedWalletWithDevice } from "@/services/market/usdcCheckout";
import { requireLocalAuth } from "@/utils/secureAuth";
import { deriveSmartAccountAddress, getRpcUrlForChain, getStoredPrivateKey, getWalletBackupSecret, getWalletPrivateKey, hasWalletBackup, importPrivateKey, markWalletBackedUp, normalizePrivateKey, regenerateWalletKey } from "@/utils/aaWallet";
import { friendlyMarketError } from "@/utils/marketUx";
import { supabase } from "@/services/supabase";
import { isNigeriaCountry, resolveUserCountry, type UserCountry } from "@/utils/country";

type NgnSection = "fund" | "send" | "withdraw" | "history";
type WalletMode = "ngn" | "crypto";

type ChainItem = {
  chain: string;
  chain_id: number;
  rpc_url: string | null;
  usdc_address: string;
  usdt_address: string | null;
  escrow_address: string;
  confirmations_required: number;
  active: boolean;
};

type CryptoTxItem = {
  id: string;
  created_at: string;
  intent_type: string;
  status: string;
  chain: string;
  amount_units: string | null;
  tx_hash: string | null;
  order_id: string;
};

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function TxBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    deposit: { label: "Deposit", bg: "rgba(124,58,237,0.18)", fg: T.primary },
    withdrawal: { label: "Withdraw", bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB" },
    transfer_in: { label: "Received", bg: "rgba(16,185,129,0.12)", fg: T.success },
    transfer_out: { label: "Sent", bg: "rgba(239,68,68,0.12)", fg: T.danger },
    fee: { label: "Fee", bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB" },
    bill: { label: "Bill", bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB" },
  };
  const b = map[type] ?? { label: type, bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB" };
  return (
    <View style={[styles.badge, { backgroundColor: b.bg, borderColor: `${b.fg}55` }]}>
      <Text style={[styles.badgeText, { color: b.fg }]}>{b.label}</Text>
    </View>
  );
}

function fmtNum(v: string) {
  const n = Number(v || "0");
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0";
}
function isAddress(v?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(v || ""));
}

export default function WalletRoute() {
  const params = useLocalSearchParams<{ action?: string }>();

  const initialMode: WalletMode = params.action === "crypto" ? "crypto" : "ngn";
  const initialNgn: NgnSection = (params.action as NgnSection) || "fund";

  const [mode, setMode] = useState<WalletMode>(initialMode);
  const [section, setSection] = useState<NgnSection>(initialNgn);
  const [showProfile, setShowProfile] = useState(false);

  const [meId, setMeId] = useState<string | null>(null);
  const [chains, setChains] = useState<ChainItem[]>([]);
  const [chain, setChain] = useState<ChainItem | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [userCountry, setUserCountry] = useState<UserCountry | null>(null);
  const isNigeria = isNigeriaCountry(userCountry?.code || userCountry?.name);

  const [walletAddr, setWalletAddr] = useState<string>("");
  const [deviceAddress, setDeviceAddress] = useState<string>("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  const [usdcBal, setUsdcBal] = useState("0");
  const [usdtBal, setUsdtBal] = useState("0");
  const [tokenDiag, setTokenDiag] = useState<{ usdc?: string; usdt?: string }>({});

  const [backupOpen, setBackupOpen] = useState(false);
  const [backupType, setBackupType] = useState<"mnemonic" | "privateKey">("privateKey");
  const [backupSecret, setBackupSecret] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendToken, setSendToken] = useState<"USDC" | "USDT">("USDC");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false);
  const [totalUsdc, setTotalUsdc] = useState("0");
  const [totalUsdt, setTotalUsdt] = useState("0");
  const [cryptoTx, setCryptoTx] = useState<CryptoTxItem[]>([]);
  const [cryptoTxLoading, setCryptoTxLoading] = useState(false);
  const [usdcPrice, setUsdcPrice] = useState(1);
  const [usdtPrice, setUsdtPrice] = useState(1);
  const [usdcChange, setUsdcChange] = useState(0);
  const [usdtChange, setUsdtChange] = useState(0);

  const hasAlchemyKey = !!process.env.EXPO_PUBLIC_ALCHEMY_API_KEY;

  const { balance, error: walletSimpleErr, loading: walletLoading, reload: reloadWallet } = useWalletSimple();
  const tx = useWalletTxPaginated();

  useEffect(() => {
    if (!isNigeria) {
      setMode("crypto");
      return;
    }
    if (params.action === "fund" || params.action === "send" || params.action === "withdraw" || params.action === "history") {
      setMode("ngn");
      setSection(params.action as NgnSection);
    }
    if (params.action === "crypto") {
      setMode("crypto");
    }
  }, [params.action, isNigeria]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await resolveUserCountry({ prompt: true });
        if (mounted) setUserCountry(c);
      } catch {
        if (mounted) setUserCountry(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isNigeria && mode === "ngn") {
      setMode("crypto");
    }
  }, [isNigeria, mode]);

  const ngnTabs: { key: NgnSection; label: string }[] = useMemo(
    () => [
      { key: "fund", label: "Fund" },
      { key: "send", label: "Send" },
      { key: "withdraw", label: "Withdraw" },
      { key: "history", label: "History" },
    ],
    [],
  );

  async function refreshCrypto(selected?: ChainItem | null) {
    try {
      const c = selected ?? chain;
      if (!c) {
        setWalletAddr("");
        setUsdcBal("0");
        setUsdtBal("0");
        setTokenDiag({});
        setDeviceAddress("");
        return;
      }

      const backed = await hasWalletBackup(meId || undefined);
      setBackedUp(backed);

      const w = await getMyWalletForChain(c.chain);
      let addr = w?.address ?? "";
      if (!addr) {
        const { data: anyAddr } = await supabase
          .from("crypto_wallets")
          .select("address")
          .eq("user_id", meId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        addr = anyAddr?.address ?? "";
      }
      setWalletAddr(addr);
      try {
        const pk = await getStoredPrivateKey(meId || undefined);
        if (pk) {
          const derived = await deriveSmartAccountAddress(c, pk);
          setDeviceAddress(derived);
          if (addr && String(addr).toLowerCase() !== String(derived).toLowerCase()) {
            setWalletErr(
              "Saved wallet mismatch detected. Use 'Use this device wallet' to sync addresses before checkout/trading.",
            );
          }
        } else {
          setDeviceAddress("");
        }
      } catch {
        setDeviceAddress("");
      }
      setTokenDiag({});

      if (!addr) {
        setUsdcBal("0");
        setUsdtBal("0");
        setTokenDiag({ usdc: "No wallet address saved for this network", usdt: "No wallet address saved for this network" });
        return;
      }

      const rpcUrl = getRpcUrlForChain(c);
      if (!rpcUrl) {
        setUsdcBal("0");
        setUsdtBal("0");
        setTokenDiag({ usdc: "Missing RPC URL", usdt: "Missing RPC URL" });
        return;
      }

      const client = createPublicClient({ transport: http(rpcUrl) });

      try {
        if (!isAddress(c.usdc_address)) throw new Error("USDC contract address is not configured.");
        const usdcDecimals = Number(
          await client.readContract({
            address: c.usdc_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
        );
        const usdcRaw = await client.readContract({
          address: c.usdc_address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [addr as `0x${string}`],
        });
        setUsdcBal(formatUnits(usdcRaw as bigint, usdcDecimals));
        setTokenDiag((p) => ({ ...p, usdc: `OK - decimals=${usdcDecimals}` }));
      } catch (e: any) {
        setUsdcBal("0");
        setTokenDiag((p) => ({ ...p, usdc: `Read failed: ${String(e?.message || e)}` }));
      }

      if (!c.usdt_address) {
        setUsdtBal("0");
        setTokenDiag((p) => ({ ...p, usdt: "USDT is not configured on this chain" }));
      } else {
        try {
          if (!isAddress(c.usdt_address)) throw new Error("USDT contract address is not configured.");
          const usdtDecimals = Number(
            await client.readContract({
              address: c.usdt_address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
          );
          const usdtRaw = await client.readContract({
            address: c.usdt_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [addr as `0x${string}`],
          });
          setUsdtBal(formatUnits(usdtRaw as bigint, usdtDecimals));
          setTokenDiag((p) => ({ ...p, usdt: `OK - decimals=${usdtDecimals}` }));
        } catch (e: any) {
          setUsdtBal("0");
          setTokenDiag((p) => ({ ...p, usdt: `Read failed: ${String(e?.message || e)}` }));
        }
      }
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Unable to refresh crypto wallet."));
    }
  }

  async function onImportPrivateKey() {
    if (!meId) return;
    setImportErr(null);
    setWalletErr(null);
    setWalletBusy(true);
    try {
      const auth = await requireLocalAuth("Import wallet private key");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");

      if (!chain) throw new Error("Select a network before importing.");

      const { data: existing, error: fetchErr } = await supabase
        .from("crypto_wallets")
        .select("id,address")
        .eq("user_id", meId);
      if (fetchErr) throw fetchErr;

      const savedAddr = existing?.[0]?.address ? String(existing[0].address).toLowerCase() : "";
      const normalized = normalizePrivateKey(importKey);
      let derivedAddr = "";
      try {
        derivedAddr = await deriveSmartAccountAddress(chain, normalized);
      } catch (e: any) {
        derivedAddr = "";
      }
      const derivedAddrLc = String(derivedAddr || "").toLowerCase();
      if (derivedAddr && savedAddr && savedAddr !== derivedAddrLc) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Saved wallet mismatch",
            `Saved: ${savedAddr}\nDerived: ${derivedAddrLc}\n\nUse this key anyway and replace the saved wallet address?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Replace saved", style: "destructive", onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) return;
      }

      await importPrivateKey(meId || undefined, importKey);
      if (derivedAddr) {
        if (existing && existing.length > 0) {
          const { error: updErr } = await supabase.from("crypto_wallets").update({ address: derivedAddr }).eq("user_id", meId);
          if (updErr) throw updErr;
        } else if (chain) {
          const { error: insErr } = await supabase
            .from("crypto_wallets")
            .insert({ user_id: meId, chain: chain.chain, address: derivedAddr, wallet_type: "aa" });
          if (insErr) throw insErr;
        }
      }
      setImportOpen(false);
      setImportKey("");
      await refreshCrypto(chain ?? undefined);
      Alert.alert(
        "Wallet imported",
        derivedAddr
          ? "Saved address updated."
          : "Private key stored. If the address didn't update, check your RPC/alchemy settings and try sync again.",
      );
    } catch (e: any) {
      setImportErr(String(e?.message || e || "We couldn't import that private key."));
    } finally {
      setWalletBusy(false);
    }
  }

  async function onUseDeviceWalletAddress() {
    if (!chain) return;
    setWalletErr(null);
    setWalletBusy(true);
    try {
      const auth = await requireLocalAuth("Use this device wallet");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      const out = await replaceSavedWalletWithDevice(chain);
      setWalletAddr(out.address);
      await refreshCrypto(chain);
      await refreshCryptoTotals();
      Alert.alert("Wallet updated", "Saved wallet address now matches this device key.");
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Couldn't switch to this device wallet."));
    } finally {
      setWalletBusy(false);
    }
  }
async function loadChains() {
    try {
      setChainErr(null);
      const all = (await fetchMarketChains()) as ChainItem[];
      setChains(all);
      const preferred = (await getPreferredMarketChain()) as ChainItem | null;
      setChain(preferred);
      await refreshCrypto(preferred);
    } catch (e: any) {
      setChainErr(e?.message || "Unable to load networks.");
      setChains([]);
      setChain(null);
      setWalletAddr("");
      setUsdcBal("0");
      setUsdtBal("0");
    }
  }

  useEffect(() => {
    loadChains();
  }, [meId]);

  async function refreshCryptoTotals() {
    try {
      if (!walletAddr || !chains.length) {
        setTotalUsdc("0");
        setTotalUsdt("0");
        return;
      }
      let usdc = 0;
      let usdt = 0;
      for (const c of chains.filter((x) => x.active)) {
        const rpcUrl = getRpcUrlForChain(c);
        if (!rpcUrl) continue;
        const client = createPublicClient({ transport: http(rpcUrl) });
        try {
          if (!isAddress(c.usdc_address)) throw new Error("USDC not configured");
          const d = Number(
            await client.readContract({
              address: c.usdc_address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
          );
          const raw = await client.readContract({
            address: c.usdc_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [walletAddr as `0x${string}`],
          });
          usdc += Number(formatUnits(raw as bigint, d));
        } catch {}
        if (c.usdt_address) {
          try {
            if (!isAddress(c.usdt_address)) throw new Error("USDT not configured");
            const d = Number(
              await client.readContract({
                address: c.usdt_address as `0x${string}`,
                abi: ERC20_ABI,
                functionName: "decimals",
              }),
            );
            const raw = await client.readContract({
              address: c.usdt_address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [walletAddr as `0x${string}`],
            });
            usdt += Number(formatUnits(raw as bigint, d));
          } catch {}
        }
      }
      setTotalUsdc(String(usdc));
      setTotalUsdt(String(usdt));
    } catch {}
  }

  async function loadCryptoTx() {
    try {
      setCryptoTxLoading(true);
      const { data, error } = await supabase
        .from("market_crypto_intents")
        .select("id,created_at,intent_type,status,chain,amount_units,tx_hash,order_id")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setCryptoTx((data as CryptoTxItem[]) || []);
    } catch {
      setCryptoTx([]);
    } finally {
      setCryptoTxLoading(false);
    }
  }

  const refreshAll = async () => {
    if (mode === "ngn" && isNigeria) {
      await Promise.allSettled([reloadWallet(), tx.refresh()]);
      return;
    }
    await refreshCrypto();
    await refreshCryptoTotals();
    await loadCryptoTx();
  };

  useEffect(() => {
    if (mode !== "crypto") return;
    refreshCryptoTotals();
    loadCryptoTx();
  }, [mode, walletAddr, chains.length]);

  useEffect(() => {
    if (mode !== "crypto") return;
    (async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether&vs_currencies=usd&include_24hr_change=true",
        );
        const j = await res.json();
        setUsdcPrice(Number(j?.["usd-coin"]?.usd || 1));
        setUsdtPrice(Number(j?.tether?.usd || 1));
        setUsdcChange(Number(j?.["usd-coin"]?.usd_24h_change || 0));
        setUsdtChange(Number(j?.tether?.usd_24h_change || 0));
      } catch {}
    })();
  }, [mode]);

  async function onGenerateOrRegenerate() {
    if (!chain) return;
    setWalletErr(null);
    setWalletBusy(true);
    if (!hasAlchemyKey) {
      setWalletBusy(false);
      setWalletErr("Alchemy key missing. Set EXPO_PUBLIC_ALCHEMY_API_KEY and restart the app.");
      return;
    }
    try {
      const auth = await requireLocalAuth(walletAddr ? "Regenerate smart wallet" : "Create smart wallet");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");

      if (walletAddr) {
        if (!backedUp) throw new Error("Back up your current wallet before regenerating.");
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "Regenerate wallet?",
            "This creates a new wallet key. Keep your old backup safe - lost keys cannot be recovered.",
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("Cancelled")) },
              { text: "I understand", style: "destructive", onPress: () => resolve() },
            ],
          );
        });
        await regenerateWalletKey(meId || undefined);
      }

      const out = await ensureWalletAddressOnChain(chain);
      setWalletAddr(out.address);
      await refreshCrypto(chain);
    } catch (e: any) {
      if (String(e?.message || "") !== "Cancelled") {
        setWalletErr(friendlyMarketError(e, "Unable to generate wallet."));
      }
    } finally {
      setWalletBusy(false);
    }
  }

  async function onSyncAllActive() {
    if (!chains.length) return;
    setWalletBusy(true);
    setWalletErr(null);
    if (!hasAlchemyKey) {
      setWalletBusy(false);
      setWalletErr("Alchemy key missing. Set EXPO_PUBLIC_ALCHEMY_API_KEY and restart the app.");
      return;
    }
    try {
      const auth = await requireLocalAuth("Sync wallet across active networks");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      const active = chains.filter((c) => c.active);
      if (!active.length) throw new Error("No active network available.");

      for (const c of active) {
        const cur = await getMyWalletForChain(c.chain);
        if (!cur?.address) await ensureWalletAddressOnChain(c);
      }
      await refreshCrypto(chain);
      await refreshCryptoTotals();
      Alert.alert("Synced", `Wallet synced to ${active.length} active network(s).`);
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Unable to sync wallet."));
    } finally {
      setWalletBusy(false);
    }
  }

  async function onOpenBackup() {
    try {
      const auth = await requireLocalAuth("Open wallet backup");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      const secret = await getWalletBackupSecret(meId || undefined);
      setBackupType(secret.type);
      setBackupSecret(secret.value);
      setBackupOpen(true);
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Unable to open backup."));
    }
  }

  async function onSendToken() {
    if (!chain || !walletAddr) return;
    try {
      const auth = await requireLocalAuth(`Send ${sendToken}`);
      if (!auth.ok) throw new Error(auth.message || "Authentication required");

      const to = sendTo.trim();
      const amount = Number(sendAmount);
      if (!/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error("Enter a valid wallet address.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");

      const tokenAddr = sendToken === "USDC" ? chain.usdc_address : chain.usdt_address;
      if (!tokenAddr) throw new Error(`${sendToken} is not configured on this network.`);

      const amountRaw = BigInt(Math.round(amount * 1_000_000));
      const { client } = await ensureSmartAccount(chain);
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to as `0x${string}`, amountRaw],
      });

      await (client as any).sendTransactions({
        account: (client as any).account,
        requests: [{ to: tokenAddr as `0x${string}`, data }],
      });

      setSendOpen(false);
      setSendAmount("");
      setSendTo("");
      await refreshCrypto(chain);
      await refreshCryptoTotals();
      await loadCryptoTx();
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Unable to send token."));
    }
  }

  return (
    <LinearGradient colors={[T.bg1, T.bg0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.title}>Wallet</Text>
            <Text style={styles.subTitle}>{isNigeria ? "NGN and Crypto in one place" : "Crypto wallet"}</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable style={styles.smallBtn} onPress={refreshAll}>
              {walletLoading || walletBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh" size={18} color="#fff" />}
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => setShowProfile(true)}>
              <Ionicons name="menu" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.modeRow}>
          {isNigeria ? (
            <>
              <Pressable onPress={() => setMode("ngn")} style={[styles.modeBtn, mode === "ngn" ? styles.modeBtnActive : styles.modeBtnIdle]}>
                <Text style={[styles.modeText, mode === "ngn" ? styles.modeTextActive : styles.modeTextIdle]}>NGN</Text>
              </Pressable>
              <Pressable onPress={() => setMode("crypto")} style={[styles.modeBtn, mode === "crypto" ? styles.modeBtnActive : styles.modeBtnIdle]}>
                <Text style={[styles.modeText, mode === "crypto" ? styles.modeTextActive : styles.modeTextIdle]}>Crypto</Text>
              </Pressable>
            </>
          ) : (
            <View style={[styles.modeBtn, styles.modeBtnActive, { flex: 1 }]}>
              <Text style={[styles.modeText, styles.modeTextActive]}>Crypto</Text>
            </View>
          )}
        </View>

        {isNigeria && mode === "ngn" ? (
          <View style={styles.card}>
            <View style={styles.pill}><Text style={styles.pillText}>NGN WALLET</Text></View>
            <Text style={styles.label}>Available balance</Text>
            <Text style={styles.balance}>NGN {Number(balance || 0).toLocaleString()}</Text>
            <Text style={styles.foot}>Ledger-backed balance with audit trail</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.pill}><Text style={styles.pillText}>CRYPTO WALLET</Text></View>
            <Text style={styles.label}>Selected network</Text>
            <Text style={styles.balanceSmall}>{chain ? String(chain.chain).toUpperCase().replace("_", " ") : "No network"}</Text>
            <Text style={styles.foot}>USDC / USDT balances from deployed contracts</Text>
          </View>
        )}
      </View>

      {!!walletSimpleErr && isNigeria && mode === "ngn" ? <Text style={styles.err}>{walletSimpleErr}</Text> : null}
      {!!walletErr && mode === "crypto" ? <Text style={styles.err}>{walletErr}</Text> : null}
      {!!chainErr && mode === "crypto" ? <Text style={styles.err}>{chainErr}</Text> : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {isNigeria && mode === "ngn" ? (
          <>
            <View style={styles.tabRow}>
              {ngnTabs.map((t) => (
                <Pressable key={t.key} onPress={() => setSection(t.key)} style={[styles.tab, section === t.key ? styles.tabActive : styles.tabIdle]}>
                  <Text style={[styles.tabText, section === t.key ? styles.tabTextActive : styles.tabTextIdle]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {section === "fund" ? <FundWallet onSuccess={refreshAll} /> : null}
            {section === "send" ? <SendMoney onSuccess={refreshAll} /> : null}
            {section === "withdraw" ? <Withdraw onSuccess={refreshAll} /> : null}

            {section === "history" ? (
              <View style={styles.historyCard}>
                <Text style={styles.hTitle}>Transactions</Text>
                {!!tx.error ? <Text style={styles.err}>{tx.error}</Text> : null}
                {tx.loading ? <Text style={styles.dim}>Loading history...</Text> : null}

                <FlatList
                  data={tx.items}
                  keyExtractor={(i) => i.id}
                  scrollEnabled={false}
                  ListEmptyComponent={<Text style={styles.dim}>No transactions yet.</Text>}
                  renderItem={({ item }) => (
                    <View style={styles.txRow}>
                      <TxBadge type={item.type} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txAmount}>NGN {Number(item.amount).toLocaleString()}</Text>
                        <Text style={styles.txMeta}>
                          {item.counterpartyName ? `${item.counterpartyName} - ` : ""}
                          {new Date(item.created_at).toLocaleString()}
                        </Text>
                        {!!item.reference ? <Text style={styles.txRef}>Ref: {item.reference}</Text> : null}
                      </View>
                    </View>
                  )}
                />

                {tx.hasMore ? (
                  <Pressable style={styles.loadMoreBtn} onPress={tx.loadMore} disabled={tx.loadingMore}>
                    <Text style={styles.loadMoreText}>{tx.loadingMore ? "Loading..." : "Load more"}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.dim, { textAlign: "center", marginTop: 10 }]}>End of history</Text>
                )}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.cryptoCard}>
              <Text style={styles.cryptoTitle}>Network</Text>
              {!hasAlchemyKey ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>Alchemy key missing. Set EXPO_PUBLIC_ALCHEMY_API_KEY and restart.</Text>
                </View>
              ) : null}
              <Pressable style={styles.selectNetworkBtn} onPress={() => setNetworkPickerOpen(true)}>
                <Text style={styles.selectNetworkText}>
                  {chain ? String(chain.chain).toUpperCase().replace("_", " ") : "Select network"}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#fff" />
              </Pressable>

              <Text style={styles.addrLabel}>Wallet address</Text>
              <Text selectable style={styles.addrText}>{walletAddr || "No wallet address generated"}</Text>
              {!!deviceAddress ? <Text selectable style={styles.addrHint}>Device key: {deviceAddress}</Text> : null}
              {!!chain ? <Text selectable style={styles.addrHint}>USDC CA: {chain.usdc_address}</Text> : null}
              {!!chain?.usdt_address ? <Text selectable style={styles.addrHint}>USDT CA: {chain.usdt_address}</Text> : null}

              <View style={styles.totalCard}>
                <Text style={styles.totalTitle}>Total Stable Balance (all active chains)</Text>
                <Text style={styles.totalValue}>${fmtNum(String(Number(totalUsdc || 0) * usdcPrice + Number(totalUsdt || 0) * usdtPrice))}</Text>
                <Text style={styles.totalSub}>USDC {fmtNum(totalUsdc)} ({usdcChange.toFixed(2)}%) • USDT {fmtNum(totalUsdt)} ({usdtChange.toFixed(2)}%)</Text>
              </View>

              <View style={styles.tokenRow}>
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>USDC</Text>
                  <Text style={styles.tokenValue}>{fmtNum(usdcBal)}</Text>
                </View>
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>USDT</Text>
                  <Text style={styles.tokenValue}>{fmtNum(usdtBal)}</Text>
                </View>
              </View>

              <Text style={styles.backupText}>Backup status: {backedUp ? "Backed up" : "Not backed up"}</Text>

              <View style={styles.actionRow3}>
                <Pressable disabled={!walletAddr} onPress={onOpenBackup} style={[styles.smallAction, !walletAddr && styles.dimBtn]}>
                  <Text style={styles.smallActionText}>Backup</Text>
                </Pressable>
                <Pressable
                  disabled={!walletAddr}
                  onPress={async () => {
                    if (!walletAddr) return;
                    await Clipboard.setStringAsync(walletAddr);
                    Alert.alert("Copied", "Wallet address copied.");
                  }}
                  style={[styles.smallAction, !walletAddr && styles.dimBtn]}
                >
                  <Text style={styles.smallActionText}>Receive</Text>
                </Pressable>
                <Pressable disabled={!walletAddr} onPress={() => setSendOpen(true)} style={[styles.smallAction, !walletAddr && styles.dimBtn]}>
                  <Text style={styles.smallActionText}>Send</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => setImportOpen(true)} style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Import private key / Change saved address</Text>
              </Pressable>

              <Pressable
                disabled={!chain?.active || walletBusy || !deviceAddress}
                onPress={onUseDeviceWalletAddress}
                style={[styles.secondaryAction, (!chain?.active || walletBusy || !deviceAddress) && styles.dimBtn]}
              >
                <Text style={styles.secondaryActionText}>Use this device wallet</Text>
              </Pressable>

              <Pressable disabled={!chain?.active || walletBusy || !hasAlchemyKey} onPress={onGenerateOrRegenerate} style={[styles.mainAction, (!chain?.active || walletBusy || !hasAlchemyKey) && styles.dimBtn]}>
                <Text style={styles.mainActionText}>{walletBusy ? "Working..." : walletAddr ? "Regenerate wallet" : "Generate wallet"}</Text>
              </Pressable>

              <Pressable disabled={walletBusy || !chains.some((c) => c.active) || !hasAlchemyKey} onPress={onSyncAllActive} style={[styles.secondaryAction, (walletBusy || !chains.some((c) => c.active) || !hasAlchemyKey) && styles.dimBtn]}>
                <Text style={styles.secondaryActionText}>Sync wallet to all active networks</Text>
              </Pressable>{!!tokenDiag.usdc ? <Text style={styles.diagText}>USDC: {tokenDiag.usdc}</Text> : null}
              {!!tokenDiag.usdt ? <Text style={styles.diagText}>USDT: {tokenDiag.usdt}</Text> : null}

              <View style={styles.historyCard}>
                <Text style={styles.hTitle}>Crypto Activity</Text>
                {cryptoTxLoading ? <Text style={styles.dim}>Loading crypto transactions...</Text> : null}
                <FlatList
                  data={cryptoTx}
                  keyExtractor={(i) => i.id}
                  scrollEnabled={false}
                  ListEmptyComponent={<Text style={styles.dim}>No crypto activity yet.</Text>}
                  renderItem={({ item }) => (
                    <View style={styles.txRow}>
                      <TxBadge type={item.intent_type?.toLowerCase() || "tx"} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txAmount}>{item.intent_type} • {item.status}</Text>
                        <Text style={styles.txMeta}>{new Date(item.created_at).toLocaleString()} • {item.chain}</Text>
                        {!!item.amount_units ? <Text style={styles.txRef}>Amount: {item.amount_units}</Text> : null}
                        {!!item.tx_hash ? <Text numberOfLines={1} style={styles.txRef}>Tx: {item.tx_hash}</Text> : null}
                      </View>
                    </View>
                  )}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />

      <Modal visible={backupOpen} transparent animationType="slide" onRequestClose={() => setBackupOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backup Private Key</Text>
            <Text style={styles.modalSub}>Store this offline. Anyone with this can access your wallet.</Text>
            <Text selectable style={styles.modalSecret}>{backupSecret}</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={async () => { await Clipboard.setStringAsync(backupSecret); Alert.alert("Copied", "Backup copied."); }} style={styles.modalBtnLight}>
                <Text style={styles.modalBtnText}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  await markWalletBackedUp(meId || undefined);
                  setBackedUp(true);
                  setBackupOpen(false);
                }}
                style={styles.modalBtnMain}
              >
                <Text style={styles.modalBtnText}>I backed it up</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sendOpen} transparent animationType="slide" onRequestClose={() => setSendOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Token</Text>
            <View style={styles.tokenPickRow}>
              {(["USDC", "USDT"] as const).map((t) => (
                <Pressable key={t} onPress={() => setSendToken(t)} style={[styles.tokenPick, sendToken === t ? styles.tokenPickActive : styles.tokenPickIdle]}>
                  <Text style={styles.tokenPickText}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={sendTo} onChangeText={setSendTo} placeholder="Recipient address (0x...)" placeholderTextColor="rgba(255,255,255,0.45)" style={styles.input} />
            <TextInput value={sendAmount} onChangeText={setSendAmount} placeholder={`Amount (${sendToken})`} placeholderTextColor="rgba(255,255,255,0.45)" keyboardType="decimal-pad" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSendOpen(false)} style={styles.modalBtnLight}><Text style={styles.modalBtnText}>Cancel</Text></Pressable>
              <Pressable onPress={onSendToken} style={styles.modalBtnMain}><Text style={styles.modalBtnText}>Send</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={networkPickerOpen} transparent animationType="fade" onRequestClose={() => setNetworkPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select network</Text>
            {chains.map((c) => (
              <Pressable
                key={c.chain}
                disabled={!c.active}
                onPress={async () => {
                  setNetworkPickerOpen(false);
                  setChain(c);
                  await setPreferredMarketChain(c.chain);
                  await refreshCrypto(c);
                  await refreshCryptoTotals();
                }}
                style={[styles.networkRow, !c.active && styles.dimBtn]}
              >
                <Text style={styles.networkRowText}>{String(c.chain).toUpperCase().replace("_", " ")}</Text>
                {chain?.chain === c.chain ? <Ionicons name="checkmark-circle" size={18} color="#A78BFA" /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <Modal visible={importOpen} transparent animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Import private key</Text>
            <Text style={styles.modalSub}>This replaces the saved wallet address for your account.</Text>
            <TextInput
              value={importKey}
              onChangeText={setImportKey}
              placeholder="Private key (0x + 64 hex)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />
            {importErr ? <Text style={styles.err}>{importErr}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setImportOpen(false)} style={styles.modalBtnLight}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onImportPrivateKey} style={styles.modalBtnSolid}>
                <Text style={styles.modalBtnText}>Import</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg0 },
  err: { color: "#FCA5A5", paddingHorizontal: 16, marginTop: 8 },
  dim: { color: T.textMuted, paddingHorizontal: 16, marginTop: 8 },

  headerWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { color: T.text, fontSize: 24, fontWeight: "900" },
  subTitle: { color: T.textMuted, fontSize: 12, marginTop: 4 },
  topActions: { flexDirection: "row", gap: 10 },
  smallBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" },

  modeRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  modeBtnIdle: { backgroundColor: T.card, borderColor: T.border },
  modeBtnActive: { backgroundColor: T.primary, borderColor: T.primary },
  modeText: { fontWeight: "900", fontSize: 12 },
  modeTextIdle: { color: "rgba(255,255,255,0.85)" },
  modeTextActive: { color: "#fff" },

  card: { marginTop: 12, borderRadius: 22, padding: 16, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: T.primarySoft, borderWidth: 1, borderColor: "rgba(124,58,237,0.45)" },
  pillText: { color: "#DDD6FE", fontSize: 10, fontWeight: "900" },
  label: { color: T.textMuted, marginTop: 10, fontWeight: "700" },
  balance: { color: T.text, marginTop: 8, fontSize: 30, fontWeight: "900" },
  balanceSmall: { color: T.text, marginTop: 8, fontSize: 20, fontWeight: "900" },
  foot: { color: T.textDim, marginTop: 6, fontSize: 12 },

  tabRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 10 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  tabIdle: { backgroundColor: T.card, borderColor: T.border },
  tabActive: { backgroundColor: T.primary, borderColor: T.primary },
  tabText: { fontWeight: "900", fontSize: 12 },
  tabTextIdle: { color: "rgba(255,255,255,0.85)" },
  tabTextActive: { color: "#fff" },

  historyCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 22, overflow: "hidden", paddingBottom: 10 },
  hTitle: { color: "#fff", fontWeight: "900", fontSize: 16, padding: 14 },
  txRow: { flexDirection: "row", gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  txAmount: { color: "#fff", fontWeight: "900" },
  txMeta: { color: T.textMuted, fontSize: 12, marginTop: 4 },
  txRef: { color: T.textDim, fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontWeight: "900", fontSize: 12 },
  loadMoreBtn: { marginTop: 10, marginHorizontal: 14, height: 48, borderRadius: 18, backgroundColor: T.primarySoft, borderWidth: 1, borderColor: "rgba(124,58,237,0.35)", alignItems: "center", justifyContent: "center" },
  loadMoreText: { color: "#fff", fontWeight: "900" },

  cryptoCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 22, padding: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  cryptoTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  chipWrap: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipIdle: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
  chipActive: { backgroundColor: "rgba(124,58,237,0.20)", borderColor: "rgba(124,58,237,0.45)" },
  chipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  selectNetworkBtn: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)", padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectNetworkText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  addrLabel: { marginTop: 12, color: T.textMuted, fontSize: 12, fontWeight: "700" },
  addrText: { marginTop: 6, color: "#fff", fontWeight: "900" },
  addrHint: { marginTop: 4, color: T.textDim, fontSize: 11 },
  totalCard: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(124,58,237,0.45)", backgroundColor: "rgba(124,58,237,0.12)", padding: 12 },
  totalTitle: { color: "#DDD6FE", fontSize: 11, fontWeight: "800" },
  totalValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 4 },
  totalSub: { color: T.textMuted, fontSize: 12, marginTop: 4 },
  tokenRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  tokenBox: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  tokenLabel: { color: T.textMuted, fontWeight: "800", fontSize: 12 },
  tokenValue: { color: "#fff", fontWeight: "900", marginTop: 4 },
  diagText: { marginTop: 6, color: "#C4B5FD", fontSize: 11 },
  warnBox: { marginTop: 10, borderRadius: 12, padding: 10, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.35)" },
  warnText: { color: "#FDE68A", fontWeight: "800", fontSize: 12 },
  backupText: { marginTop: 10, color: T.textMuted, fontSize: 12, fontWeight: "700" },
  actionRow3: { marginTop: 12, flexDirection: "row", gap: 10 },
  smallAction: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  smallActionText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  mainAction: { marginTop: 12, borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: "rgba(124,58,237,0.24)", borderWidth: 1, borderColor: "rgba(124,58,237,0.45)" },
  mainActionText: { color: "#fff", fontWeight: "900" },
  secondaryAction: { marginTop: 10, borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  secondaryActionText: { color: "#fff", fontWeight: "900" },
  chartWrap: { marginTop: 14, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  chartTitle: { color: "#fff", fontWeight: "900", padding: 10, backgroundColor: "rgba(255,255,255,0.06)" },
  dimBtn: { opacity: 0.6 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalCard: { borderRadius: 20, padding: 16, backgroundColor: "#0F0B1D", borderWidth: 1, borderColor: T.border },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalSub: { marginTop: 8, color: T.textMuted, fontSize: 12 },
  modalSecret: { marginTop: 12, color: "#fff", fontWeight: "800", lineHeight: 22 },
  modalInput: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 },
  modalActions: { marginTop: 14, flexDirection: "row", gap: 10 },
  modalBtnLight: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  modalBtnMain: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(124,58,237,0.30)" },
  modalBtnSolid: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(59,130,246,0.30)" },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  tokenPickRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  tokenPick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  tokenPickIdle: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" },
  tokenPickActive: { backgroundColor: "rgba(124,58,237,0.30)", borderColor: "rgba(124,58,237,0.45)" },
  tokenPickText: { color: "#fff", fontWeight: "900" },
  input: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 },
  networkRow: { marginTop: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  networkRowText: { color: "#fff", fontWeight: "800" },
});


