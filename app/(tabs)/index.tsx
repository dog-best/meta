import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ✅ IMPORTANT: paths are literals, NOT string
const ROUTES = {
  crypto: "/crypto",
  market: "/market",
  airtime: "/airtime",
  data: "/data",
  electricity: "/electricity",
  betting: "/betting",
  wallet: "/wallet",
  profile: "/profile",
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const tiles: Tile[] = [
    {
      key: "crypto",
      title: "Crypto",
      subtitle: "Receive & Convert",
      iconLib: "mci",
      iconName: "bitcoin",
      to: ROUTES.crypto,
      variant: "big",
    },
    {
      key: "market",
      title: "Marketplace",
      subtitle: "Buy • Sell • Escrow",
      iconLib: "mci",
      iconName: "storefront-outline",
      to: ROUTES.market,
      variant: "big",
    },

    { key: "airtime", title: "Airtime", iconLib: "ion", iconName: "call", to: ROUTES.airtime },
    { key: "data", title: "Data", iconLib: "mci", iconName: "access-point-network", to: ROUTES.data },
    { key: "electricity", title: "Electricity", iconLib: "ion", iconName: "flash", to: ROUTES.electricity },
    { key: "betting", title: "Betting", iconLib: "mci", iconName: "soccer", to: ROUTES.betting },
  ];

  const go = (to: RoutePath) => router.push(to);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>What would you like to do today?</Text>
      </View>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => go(t.to)}
            style={({ pressed }) => [
              styles.card,
              t.variant === "big" ? styles.cardBig : styles.cardNormal,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.iconWrap}>
              {t.iconLib === "ion" ? (
                <Ionicons name={t.iconName} size={22} color="#E5E7EB" />
              ) : (
                <MaterialCommunityIcons name={t.iconName} size={22} color="#E5E7EB" />
              )}
            </View>

            <Text style={styles.cardTitle}>{t.title}</Text>
            {!!t.subtitle && <Text style={styles.cardSubtitle}>{t.subtitle}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={styles.quickRow}>
        <Pressable style={styles.quickBtn} onPress={() => go(ROUTES.wallet)}>
          <Ionicons name="wallet-outline" size={18} color="#E5E7EB" />
          <Text style={styles.quickText}>Wallet</Text>
        </Pressable>

        <Pressable style={styles.quickBtn} onPress={() => go(ROUTES.profile)}>
          <Ionicons name="person-circle-outline" size={18} color="#E5E7EB" />
          <Text style={styles.quickText}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050814", paddingHorizontal: 16 },
  header: { paddingBottom: 14 },
  title: { color: "#F9FAFB", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#9CA3AF", marginTop: 6, fontSize: 13 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },

  cardBig: { width: "48%", minHeight: 140 },
  cardNormal: { width: "31.5%", minHeight: 110 },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: { marginTop: 12, color: "#F9FAFB", fontWeight: "800", fontSize: 14 },
  cardSubtitle: { marginTop: 4, color: "#9CA3AF", fontSize: 12 },

  quickRow: { marginTop: 14, flexDirection: "row", gap: 12 },
  quickBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  quickText: { color: "#E5E7EB", fontWeight: "800" },
});
