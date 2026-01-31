import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  balance: number;
  onRefresh: () => void;
  onOpenProfile: () => void;
  refreshing?: boolean;
};

export default function WalletHeader({ balance, onRefresh, onOpenProfile, refreshing }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Wallet</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable style={styles.smallBtn} onPress={onRefresh}>
            {refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh" size={18} color="#fff" />}
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={onOpenProfile}>
            <Ionicons name="menu" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Available Balance</Text>
        <Text style={styles.balance}>NGN {Number(balance || 0).toLocaleString()}</Text>
        <Text style={styles.sub}>Secure ledger-backed balance</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "white", fontSize: 20, fontWeight: "900" },
  smallBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginTop: 12,
    backgroundColor: "#0B0F17",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: { color: "rgba(255,255,255,0.65)", fontWeight: "700" },
  balance: { color: "white", fontSize: 28, fontWeight: "900", marginTop: 8 },
  sub: { color: "rgba(255,255,255,0.45)", marginTop: 6, fontSize: 12 },
});
