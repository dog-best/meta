import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/authentication/useAuth";
import { useWalletSimple } from "@/hooks/wallet/useWalletSimple";

const ROUTES = {
  crypto: "/crypto",
  market: "/market",
  airtime: "./airtime",
  data: "./data",
  electricity: "./electricity",
  betting: "./betting",
  wallet: "./wallet",
  profile: "./profile",
} as const;

type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

const PURPLE = "#7C3AED";
const BG0 = "#05040B";
const BG1 = "#0A0620";

function go(to: RoutePath) {
  router.push(to);
}

function goWallet(action: "fund" | "send" | "withdraw") {
  router.push({ pathname: "./wallet", params: { action } });
}

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

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const { balance, tx, loading: walletLoading, error, reload } = useWalletSimple();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/(auth)/login");
    }
  }, [authLoading, user]);

  const refreshing = useMemo(() => authLoading || walletLoading, [authLoading, walletLoading]);
  const txPreview = useMemo(() => (tx ?? []).slice(0, 6), [tx]);

  const utilities = [
    { key: "airtime", title: "Airtime", icon: <Ionicons name="call" size={20} color="#fff" />, to: ROUTES.airtime },
    { key: "data", title: "Data", icon: <MaterialCommunityIcons name="access-point-network" size={20} color="#fff" />, to: ROUTES.data },
    { key: "electricity", title: "Electricity", icon: <Ionicons name="flash" size={20} color="#fff" />, to: ROUTES.electricity },
    { key: "betting", title: "Betting", icon: <MaterialCommunityIcons name="soccer" size={20} color="#fff" />, to: ROUTES.betting },
  ];

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0.0 }}
      end={{ x: 0.9, y: 1.0 }}
      style={[styles.screen, { paddingTop: Math.max(insets.top, 14) }]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor="#fff" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>
              {user?.email ? `Welcome back • ${user.email}` : "Welcome back"}
            </Text>
          </View>

          <Pressable style={styles.iconBtn} onPress={() => go(ROUTES.profile)}>
            <Ionicons name="person-circle-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.walletCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            {walletLoading ? (
              <View style={{ marginTop: 10 }}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <Text style={styles.walletBalance}>₦{Number(balance ?? 0).toLocaleString()}</Text>
            )}
            {!!error && <Text style={styles.err}>{error}</Text>}
          </View>

          <Pressable style={styles.pillBtn} onPress={() => go(ROUTES.wallet)}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.pillText}>Wallet</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, styles.primaryBtn]} onPress={() => goWallet("fund")}>
            <MaterialCommunityIcons name="cash-plus" size={18} color="#fff" />
            <Text style={styles.primaryText}>Fund</Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={() => goWallet("send")}>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Send</Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={() => goWallet("withdraw")}>
            <MaterialCommunityIcons name="bank-transfer-out" size={18} color="#fff" />
            <Text style={styles.actionText}>Withdraw</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <Text style={styles.sectionHint}>Crypto & marketplace</Text>
        </View>

        <View style={styles.bigRow}>
          <Pressable style={styles.bigCard} onPress={() => go(ROUTES.crypto)}>
            <View style={styles.bigIconPurple}>
              <MaterialCommunityIcons name="bitcoin" size={34} color="#fff" />
            </View>
            <Text style={styles.bigTitle}>Crypto</Text>
            <Text style={styles.bigSub}>Receive • Convert</Text>
          </Pressable>

          <Pressable style={styles.bigCard} onPress={() => go(ROUTES.market)}>
            <View style={styles.bigIconPurple}>
              <MaterialCommunityIcons name="storefront-outline" size={34} color="#fff" />
            </View>
            <Text style={styles.bigTitle}>Marketplace</Text>
            <Text style={styles.bigSub}>Buy • Sell • Escrow</Text>
          </Pressable>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Utilities</Text>
          <Text style={styles.sectionHint}>Bills & payments</Text>
        </View>

        <View style={styles.utilWrap}>
          {utilities.map((u) => (
            <Pressable key={u.key} style={styles.utilCard} onPress={() => go(u.to)}>
              <View style={styles.utilIcon}>{u.icon}</View>
              <Text style={styles.utilTitle}>{u.title}</Text>
              <Text style={styles.utilSub}>Fast checkout</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionRowBetween}>
          <Text style={styles.sectionTitle}>History</Text>
          <Pressable onPress={() => go(ROUTES.wallet)}>
            <Text style={styles.link}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.txCard}>
          <FlatList
            data={txPreview}
            keyExtractor={(i: any) => i.id}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
            renderItem={({ item }: any) => (
              <View style={styles.txRow}>
                <TxBadge type={item.type} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.txAmount}>₦{Number(item.amount).toLocaleString()}</Text>
                  <Text style={styles.txMeta}>
                    {new Date(item.created_at).toLocaleString()} {item.reference ? `• ${item.reference}` : ""}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },

  header: { paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.40)",
    backgroundColor: "rgba(124,58,237,0.12)",
  },
  walletLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 },
  walletBalance: { color: "#fff", fontWeight: "900", fontSize: 30, marginTop: 8 },
  err: { color: "#FCA5A5", marginTop: 8, fontSize: 12 },

  pillBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: PURPLE,
    borderWidth: 1,
    borderColor: PURPLE,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { color: "#fff", fontWeight: "900" },

  actions: { marginTop: 12, flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: { backgroundColor: PURPLE, borderColor: PURPLE },
  actionText: { color: "#fff", fontWeight: "900" },
  primaryText: { color: "#fff", fontWeight: "900" },

  sectionRow: { marginTop: 18, marginBottom: 10 },
  sectionRowBetween: { marginTop: 18, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  sectionHint: { color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 },
  link: { color: "#C4B5FD", fontWeight: "900" },

  bigRow: { flexDirection: "row", gap: 12 },
  bigCard: {
    flex: 1,
    minHeight: 170,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  bigIconPurple: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(124,58,237,0.25)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bigTitle: { marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 15 },
  bigSub: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 },

  utilWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  utilCard: {
    width: "48%",
    minHeight: 128,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  utilIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  utilTitle: { marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 14 },
  utilSub: { marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 },

  txCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  txRow: { flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  txAmount: { color: "#fff", fontWeight: "900" },
  txMeta: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },
  empty: { color: "rgba(255,255,255,0.65)", padding: 14 },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontWeight: "900", fontSize: 12 },
});
