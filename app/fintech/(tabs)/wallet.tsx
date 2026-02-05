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
import { ensureSmartAccount, ensureWalletAddressOnChain, getMyWalletForChain } from "@/services/market/usdcCheckout";
import { requireLocalAuth } from "@/utils/secureAuth";
import { getRpcUrlForChain, getWalletBackupSecret, hasWalletBackup, markWalletBackedUp, regenerateWalletKey } from "@/utils/aaWallet";
import { friendlyMarketError } from "@/utils/marketUx";
import { supabase } from "@/services/supabase";

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

const ERC20_ABI = [
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

  const [walletAddr, setWalletAddr] = useState<string>("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  const [usdcBal, setUsdcBal] = useState("0");
  const [usdtBal, setUsdtBal] = useState("0");

  const [backupOpen, setBackupOpen] = useState(false);
  const [backupType, setBackupType] = useState<"mnemonic" | "privateKey">("privateKey");
  const [backupSecret, setBackupSecret] = useState("");

  const [sendOpen, setSendOpen] = useState(false);
  const [sendToken, setSendToken] = useState<"USDC" | "USDT">("USDC");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  const { balance, error: walletSimpleErr, loading: walletLoading, reload: reloadWallet } = useWalletSimple();
  const tx = useWalletTxPaginated();

  useEffect(() => {
    if (params.action === "fund" || params.action === "send" || params.action === "withdraw" || params.action === "history") {
      setMode("ngn");
      setSection(params.action as NgnSection);
    }
    if (params.action === "crypto") {
      setMode("crypto");
    }
  }, [params.action]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

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
        return;
      }

      const backed = await hasWalletBackup(meId || undefined);
      setBackedUp(backed);

      const w = await getMyWalletForChain(c.chain);
      const addr = w?.address ?? "";
      setWalletAddr(addr);

      if (!addr) {
        setUsdcBal("0");
        setUsdtBal("0");
        return;
      }

      const rpcUrl = getRpcUrlForChain(c);
      if (!rpcUrl) {
        setUsdcBal("0");
        setUsdtBal("0");
        return;
      }

      const client = createPublicClient({ transport: http(rpcUrl) });

      try {
        const usdcRaw = await client.readContract({
          address: c.usdc_address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [addr as `0x${string}`],
        });
        setUsdcBal(formatUnits(usdcRaw as bigint, 6));
      } catch {
        setUsdcBal("0");
      }

      if (!c.usdt_address) {
        setUsdtBal("0");
      } else {
        try {
          const usdtRaw = await client.readContract({
            address: c.usdt_address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [addr as `0x${string}`],
          });
          setUsdtBal(formatUnits(usdtRaw as bigint, 6));
        } catch {
          setUsdtBal("0");
        }
      }
    } catch (e: any) {
      setWalletErr(friendlyMarketError(e, "Unable to refresh crypto wallet."));
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

  const refreshAll = async () => {
    if (mode === "ngn") {
      await Promise.allSettled([reloadWallet(), tx.refresh()]);
      return;
    }
    await refreshCrypto();
  };

  async function onGenerateOrRegenerate() {
    if (!chain) return;
    setWalletErr(null);
    setWalletBusy(true);
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
    try {
      const auth = await requireLocalAuth("Sync wallet across active networks");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      const active = chains.filter((c) => c.active);
      if (!active.length) throw new Error("No active network available.");

      for (const c of active) {
        await ensureWalletAddressOnChain(c);
      }
      await refreshCrypto(chain);
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
            <Text style={styles.subTitle}>NGN and Crypto in one place</Text>
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
          <Pressable onPress={() => setMode("ngn")} style={[styles.modeBtn, mode === "ngn" ? styles.modeBtnActive : styles.modeBtnIdle]}>
            <Text style={[styles.modeText, mode === "ngn" ? styles.modeTextActive : styles.modeTextIdle]}>NGN</Text>
          </Pressable>
          <Pressable onPress={() => setMode("crypto")} style={[styles.modeBtn, mode === "crypto" ? styles.modeBtnActive : styles.modeBtnIdle]}>
            <Text style={[styles.modeText, mode === "crypto" ? styles.modeTextActive : styles.modeTextIdle]}>Crypto</Text>
          </Pressable>
        </View>

        {mode === "ngn" ? (
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

      {!!walletSimpleErr && mode === "ngn" ? <Text style={styles.err}>{walletSimpleErr}</Text> : null}
      {!!walletErr && mode === "crypto" ? <Text style={styles.err}>{walletErr}</Text> : null}
      {!!chainErr && mode === "crypto" ? <Text style={styles.err}>{chainErr}</Text> : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {mode === "ngn" ? (
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
              <View style={styles.chipWrap}>
                {chains.map((c) => {
                  const selected = chain?.chain === c.chain;
                  return (
                    <Pressable
                      key={c.chain}
                      disabled={!c.active}
                      onPress={async () => {
                        setChain(c);
                        await setPreferredMarketChain(c.chain);
                        await refreshCrypto(c);
                      }}
                      style={[styles.chip, selected ? styles.chipActive : styles.chipIdle, { opacity: c.active ? 1 : 0.45 }]}
                    >
                      <Text style={styles.chipText}>{String(c.chain).toUpperCase().replace("_", " ")}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.addrLabel}>Wallet address</Text>
              <Text selectable style={styles.addrText}>{walletAddr || "No wallet address generated"}</Text>

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

              <Pressable disabled={!chain?.active || walletBusy} onPress={onGenerateOrRegenerate} style={[styles.mainAction, (!chain?.active || walletBusy) && styles.dimBtn]}>
                <Text style={styles.mainActionText}>{walletBusy ? "Working..." : walletAddr ? "Regenerate wallet" : "Generate wallet"}</Text>
              </Pressable>

              <Pressable disabled={walletBusy || !chains.some((c) => c.active)} onPress={onSyncAllActive} style={[styles.secondaryAction, (walletBusy || !chains.some((c) => c.active)) && styles.dimBtn]}>
                <Text style={styles.secondaryActionText}>Sync wallet to all active networks</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />

      <Modal visible={backupOpen} transparent animationType="slide" onRequestClose={() => setBackupOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backup {backupType === "mnemonic" ? "Seed Phrase" : "Private Key"}</Text>
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
  addrLabel: { marginTop: 12, color: T.textMuted, fontSize: 12, fontWeight: "700" },
  addrText: { marginTop: 6, color: "#fff", fontWeight: "900" },
  tokenRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  tokenBox: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  tokenLabel: { color: T.textMuted, fontWeight: "800", fontSize: 12 },
  tokenValue: { color: "#fff", fontWeight: "900", marginTop: 4 },
  backupText: { marginTop: 10, color: T.textMuted, fontSize: 12, fontWeight: "700" },
  actionRow3: { marginTop: 12, flexDirection: "row", gap: 10 },
  smallAction: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  smallActionText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  mainAction: { marginTop: 12, borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: "rgba(124,58,237,0.24)", borderWidth: 1, borderColor: "rgba(124,58,237,0.45)" },
  mainActionText: { color: "#fff", fontWeight: "900" },
  secondaryAction: { marginTop: 10, borderRadius: 16, paddingVertical: 13, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  secondaryActionText: { color: "#fff", fontWeight: "900" },
  dimBtn: { opacity: 0.6 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalCard: { borderRadius: 20, padding: 16, backgroundColor: "#0F0B1D", borderWidth: 1, borderColor: T.border },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalSub: { marginTop: 8, color: T.textMuted, fontSize: 12 },
  modalSecret: { marginTop: 12, color: "#fff", fontWeight: "800", lineHeight: 22 },
  modalActions: { marginTop: 14, flexDirection: "row", gap: 10 },
  modalBtnLight: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  modalBtnMain: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(124,58,237,0.30)" },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  tokenPickRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  tokenPick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  tokenPickIdle: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" },
  tokenPickActive: { backgroundColor: "rgba(124,58,237,0.30)", borderColor: "rgba(124,58,237,0.45)" },
  tokenPickText: { color: "#fff", fontWeight: "900" },
  input: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 },
});
