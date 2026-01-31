import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import FundWallet from "@/components/wallet/fundwallet";
import ProfileModal from "@/components/wallet/profile";
import SendMoney from "@/components/wallet/send";
import WalletHeader from "@/components/wallet/header";
import Withdraw from "@/components/wallet/withdraw";

import { useWalletSimple } from "@/hooks/wallet/useWalletSimple";
import { useWalletTxPaginated } from "@/hooks/wallet/useWalletTxPaginated";

const PURPLE = "#7C3AED";
const BG0 = "#05040B";
const BG1 = "#0A0620";

type Section = "fund" | "send" | "withdraw" | "history";

function TxBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    deposit: { label: "Deposit", bg: "rgba(124,58,237,0.18)", fg: PURPLE },
    withdrawal: { label: "Withdraw", bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB" },
    transfer_in: { label: "Received", bg: "rgba(16,185,129,0.12)", fg: "#10B981" },
    transfer_out: { label: "Sent", bg: "rgba(239,68,68,0.12)", fg: "#EF4444" },
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

export default function WalletRoute() {
  const params = useLocalSearchParams<{ action?: string }>();
  const initial: Section = (params.action as Section) || "fund";

  const [section, setSection] = useState<Section>(initial);
  const [showProfile, setShowProfile] = useState(false);

  const { balance, error: walletErr, loading: walletLoading, reload: reloadWallet } = useWalletSimple();
  const tx = useWalletTxPaginated();

  useEffect(() => {
    if (params.action === "fund" || params.action === "send" || params.action === "withdraw") {
      setSection(params.action as Section);
    }
  }, [params.action]);

  const refreshAll = async () => {
    await Promise.allSettled([reloadWallet(), tx.refresh()]);
  };

  const tabs: { key: Section; label: string }[] = useMemo(
    () => [
      { key: "fund", label: "Fund" },
      { key: "send", label: "Send" },
      { key: "withdraw", label: "Withdraw" },
      { key: "history", label: "History" },
    ],
    []
  );

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.screen}>
      <WalletHeader balance={balance} onRefresh={refreshAll} onOpenProfile={() => setShowProfile(true)} refreshing={walletLoading || tx.loading} />

      {!!walletErr ? <Text style={styles.err}>{walletErr}</Text> : null}
      {walletLoading ? <Text style={styles.dim}>Loading wallet...</Text> : null}

      <View style={styles.tabRow}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setSection(t.key)}
            style={[styles.tab, section === t.key ? styles.tabActive : styles.tabIdle]}
          >
            <Text style={[styles.tabText, section === t.key ? styles.tabTextActive : styles.tabTextIdle]}>
              {t.label}
            </Text>
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
            ListEmptyComponent={<Text style={styles.dim}>No transactions yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.txRow}>
                <TxBadge type={item.type} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.txAmount}>NGN {Number(item.amount).toLocaleString()}</Text>
                  <Text style={styles.txMeta}>
                    {new Date(item.created_at).toLocaleString()}
                    {item.reference ? ` - ${item.reference}` : ""}
                  </Text>
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

      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#05040B" },
  err: { color: "#FCA5A5", paddingHorizontal: 16, marginTop: 8 },
  dim: { color: "rgba(255,255,255,0.65)", paddingHorizontal: 16, marginTop: 8 },

  tabRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 10 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  tabIdle: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.08)" },
  tabActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  tabText: { fontWeight: "900", fontSize: 12 },
  tabTextIdle: { color: "rgba(255,255,255,0.85)" },
  tabTextActive: { color: "#fff" },

  historyCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    overflow: "hidden",
    paddingBottom: 10,
  },
  hTitle: { color: "#fff", fontWeight: "900", fontSize: 16, padding: 14 },

  txRow: { flexDirection: "row", gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  txAmount: { color: "#fff", fontWeight: "900" },
  txMeta: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontWeight: "900", fontSize: 12 },

  loadMoreBtn: {
    marginTop: 10,
    marginHorizontal: 14,
    height: 48,
    borderRadius: 18,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: { color: "#fff", fontWeight: "900" },
});
