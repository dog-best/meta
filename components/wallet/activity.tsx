import type { WalletTx } from "@/hooks/wallet/useWalletSimple";
import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

function badge(type: WalletTx["type"]) {
  switch (type) {
    case "deposit":
      return { t: "Deposit", c: "#16A34A" };
    case "withdrawal":
      return { t: "Withdraw", c: "#F97316" };
    case "transfer_in":
      return { t: "Received", c: "#22C55E" };
    case "transfer_out":
      return { t: "Sent", c: "#EF4444" };
    case "fee":
      return { t: "Fee", c: "#A855F7" };
    default:
      return { t: type, c: "#60A5FA" };
  }
}

export default function WalletActivity({ items, loading }: { items: WalletTx[]; loading?: boolean }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h}>Activity</Text>

      <View style={styles.card}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading activity...</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={<Text style={styles.empty}>No activity yet.</Text>}
            renderItem={({ item }) => {
              const b = badge(item.type);
              return (
                <View style={styles.row}>
                  <View style={[styles.pill, { backgroundColor: `${b.c}22`, borderColor: `${b.c}55` }]}>
                    <Text style={[styles.pillText, { color: b.c }]}>{b.t}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amount}>NGN {Number(item.amount).toLocaleString()}</Text>
                    <Text style={styles.meta}>
                      {new Date(item.created_at).toLocaleString()}
                      {item.reference ? ` - ${item.reference}` : ""}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  h: { color: "white", fontWeight: "900", fontSize: 16, marginBottom: 10 },
  card: {
    backgroundColor: "#0B0F17",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  row: { flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  pillText: { fontWeight: "900", fontSize: 12 },
  amount: { color: "white", fontWeight: "900" },
  meta: { color: "rgba(255,255,255,0.5)", marginTop: 3, fontSize: 12 },
  empty: { color: "rgba(255,255,255,0.6)", padding: 14 },
  loading: { padding: 16, alignItems: "center", gap: 8 },
  loadingText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
