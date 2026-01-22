import WalletActivity from "@/components/wallet/activity";
import FundWallet from "@/components/wallet/fundwallet";
import WalletHeader from "@/components/wallet/header";
import ProfileModal from "@/components/wallet/profile";
import SendMoney from "@/components/wallet/send";
import Withdraw from "@/components/wallet/withdraw";
import { useWalletSimple } from "@/hooks/wallet/useWalletSimple";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Section = "fund" | "send" | "withdraw" | "activity";

export default function WalletTab() {
  const { balance, tx, loading, error, reload } = useWalletSimple();
  const [section, setSection] = useState<Section>("fund");
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <WalletHeader balance={balance} onRefresh={reload} onOpenProfile={() => setProfileOpen(true)} />

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {loading ? <Text style={styles.loading}>Loading…</Text> : null}

        <View style={styles.switchRow}>
          {(["fund", "send", "withdraw", "activity"] as Section[]).map((k) => (
            <Pressable
              key={k}
              style={[styles.chip, section === k ? styles.chipActive : styles.chipIdle]}
              onPress={() => setSection(k)}
            >
              <Text style={[styles.chipText, section === k ? styles.chipTextActive : styles.chipTextIdle]}>
                {k === "fund" ? "Fund" : k === "send" ? "Send" : k === "withdraw" ? "Withdraw" : "Activity"}
              </Text>
            </Pressable>
          ))}
        </View>

        {section === "fund" ? <FundWallet onSuccess={reload} /> : null}
        {section === "send" ? <SendMoney onSuccess={reload} /> : null}
        {section === "withdraw" ? <Withdraw onSuccess={reload} /> : null}
        {section === "activity" ? <WalletActivity items={tx} /> : null}

        {/* show Activity below by default too if you want */}
        {section !== "activity" ? <WalletActivity items={tx.slice(0, 10)} /> : null}
      </ScrollView>

      <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#05070D" },
  err: { color: "#FCA5A5", paddingHorizontal: 16, marginTop: 8 },
  loading: { color: "rgba(255,255,255,0.7)", paddingHorizontal: 16, marginTop: 8 },
  switchRow: { paddingHorizontal: 16, flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 6 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center", borderWidth: 1 },
  chipIdle: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" },
  chipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipText: { fontWeight: "900", fontSize: 12 },
  chipTextIdle: { color: "rgba(255,255,255,0.8)" },
  chipTextActive: { color: "white" },
});