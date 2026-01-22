import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo } from "react";
import {
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

type Tile = {
  key: string;
  title: string;
  subtitle?: string;
  iconLib: "ion" | "mci";
  iconName: any;
  to: RoutePath;
  variant?: "big" | "normal";
};

const PURPLE = "#7C3AED";

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

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/(auth)/login");
    }
  }, [authLoading, user]);

  const go = (to: RoutePath) => router.push(to);

  const refreshing = useMemo(() => authLoading || walletLoading, [authLoading, walletLoading]);

  const exploreTiles: Tile[] = [
    { key: "crypto", title: "Crypto", subtitle: "Receive • Convert", iconLib: "mci", iconName: "bitcoin", to: ROUTES.crypto, variant: "big" },
    { key: "market", title: "Marketplace", subtitle: "Buy • Sell • Escrow", iconLib: "mci", iconName: "storefront-outline", to: ROUTES.market, variant: "big" },
  ];

  const utilityTiles: Tile[] = [
    { key: "airtime", title: "Airtime", iconLib: "ion", iconName: "call", to: ROUTES.airtime },
    { key: "data", title: "Data", iconLib: "mci", iconName: "access-point-network", to: ROUTES.data },
    { key: "electricity", title: "Electricity", iconLib: "ion", iconName: "flash", to: ROUTES.electricity },
    { key: "betting", title: "Betting", iconLib: "mci", iconName: "soccer", to: ROUTES.betting },
  ];

  const txPreview = useMemo(() => (tx ?? []).slice(0, 6), [tx]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor="#fff" />}
      >
        {/* Top header */}
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

        {/* Wallet summary */}
        <View style={styles.walletCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <Text style={styles.walletBalance}>₦{Number(balance ?? 0).toLocaleString()}</Text>
            {!!error && <Text style={styles.err}>{error}</Text>}
          </View>

          <Pressable style={styles.openWalletBtn} onPress={() => go(ROUTES.wallet)}>
            <Ionicons name="wallet-outline" size={16} color="#fff" />
            <Text style={styles.openWalletText}>Wallet</Text>
          </Pressable>
        </View>

        {/* Fund / Send / Withdraw */}
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={() => go(ROUTES.wallet)}>
            <MaterialCommunityIcons name="cash-plus" size={18} color="#fff" />
            <Text style={styles.actionTextPrimary}>Fund</Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={() => go(ROUTES.wallet)}>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Send</Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={() => go(ROUTES.wallet)}>
            <MaterialCommunityIcons name="bank-transfer-out" size={18} color="#fff" />
            <Text style={styles.actionText}>Withdraw</Text>
          </Pressable>
        </View>

        {/* Explore */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <Text style={styles.sectionHint}>Crypto & marketplace</Text>
        </View>

        <View style={styles.gridBig}>
          {exploreTiles.map((t) => (
            <Pressable key={t.key} onPress={() => go(t.to)} style={({ pressed }) => [styles.bigCard, pressed && styles.pressed]}>
              <View style={styles.bigIconWrap}>
                {t.iconLib === "ion" ? (
                  <Ionicons name={t.iconName} size={22} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name={t.iconName} size={22} color="#fff" />
                )}
              </View>
              <Text style={styles.cardTitle}>{t.title}</Text>
              {!!t.subtitle && <Text style={styles.cardSub}>{t.subtitle}</Text>}
            </Pressable>
          ))}
        </View>

        {/* Utilities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Utilities</Text>
          <Text style={styles.sectionHint}>Airtime, data, electricity, betting</Text>
        </View>

        <View style={styles.gridUtilities}>
          {utilityTiles.map((t) => (
            <Pressable key={t.key} onPress={() => go(t.to)} style={({ pressed }) => [styles.utilityCard, pressed && styles.pressed]}>
              <View style={styles.utilIconWrap}>
                {t.iconLib === "ion" ? (
                  <Ionicons name={t.iconName} size={22} color="#fff" />
                ) : (
                  <MaterialCommunityIcons name={t.iconName} size={22} color="#fff" />
                )}
              </View>
              <Text style={styles.utilTitle}>{t.title}</Text>
            </Pressable>
          ))}
        </View>

        {/* Quick routes */}
        <View style={styles.quickRow}>
          <Pressable style={styles.quickBtn} onPress={() => go(ROUTES.wallet)}>
            <Ionicons name="wallet-outline" size={18} color="#fff" />
            <Text style={styles.quickText}>Wallet</Text>
          </Pressable>

          <Pressable style={styles.quickBtn} onPress={() => go(ROUTES.profile)}>
            <Ionicons name="person-circle-outline" size={18} color="#fff" />
            <Text style={styles.quickText}>Profile</Text>
          </Pressable>
        </View>

        {/* Recent transactions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05050B", paddingHorizontal: 16 },

  header: { paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
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
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    backgroundColor: "rgba(124,58,237,0.10)",
  },
  walletLabel: { color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 12 },
  walletBalance: { color: "#FFFFFF", fontWeight: "900", fontSize: 28, marginTop: 8 },
  err: { color: "#FCA5A5", marginTop: 8, fontSize: 12 },

  openWalletBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: PURPLE,
    borderWidth: 1,
    borderColor: PURPLE,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  openWalletText: { color: "#FFFFFF", fontWeight: "900" },

  actionRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionPrimary: { backgroundColor: PURPLE, borderColor: PURPLE },
  actionText: { color: "#FFFFFF", fontWeight: "900" },
  actionTextPrimary: { color: "#FFFFFF", fontWeight: "900" },

  sectionHeader: { marginTop: 18, marginBottom: 10 },
  sectionHeaderRow: { marginTop: 18, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  sectionHint: { color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 },

  gridBig: { flexDirection: "row", gap: 12 },
  bigCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bigIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.28)",
  },
  cardTitle: { marginTop: 12, color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  cardSub: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 },

  gridUtilities: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  utilityCard: {
    width: "48%",
    minHeight: 120,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  utilIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  utilTitle: { marginTop: 12, color: "#FFFFFF", fontWeight: "900", fontSize: 14 },

  quickRow: { marginTop: 14, flexDirection: "row", gap: 12 },
  quickBtn: {
    flex: 1,
    height: 50,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  quickText: { color: "#FFFFFF", fontWeight: "900" },

  link: { color: "#C4B5FD", fontWeight: "900" },

  txCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  txAmount: { color: "#FFFFFF", fontWeight: "900" },
  txMeta: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: { fontWeight: "900", fontSize: 12 },

  empty: { color: "rgba(255,255,255,0.65)", padding: 14 },

  pressed: { transform: [{ scale: 0.985 }], opacity: 0.95 },
});
