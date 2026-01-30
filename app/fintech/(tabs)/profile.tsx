import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/hooks/authentication/useAuth";
import { supabase } from "@/services/supabase";

const PURPLE = "#7C3AED";
const BG0 = "#05040B";
const BG1 = "#0A0620";

type VA = { account_number: string; bank_name: string; account_name: string } | null;

export default function ProfileRoute() {
  const { user, profile, loading } = useAuth();
  const [va, setVa] = useState<VA>(null);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const res = await supabase
        .from("user_virtual_accounts")
        .select("account_number, bank_name, account_name, active")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle();

      if (!res.error && res.data) setVa(res.data as any);
      else setVa(null);
    })();
  }, [user?.id]);

  const name = profile?.full_name || profile?.username || "Account";
  const email = profile?.email || user?.email || "—";
  const uid = profile?.public_uid || "—";

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("./wallet")}>
          <Ionicons name="wallet-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {loading ? <Text style={styles.dim}>Loading…</Text> : null}

      <View style={styles.card}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.line}>{email}</Text>
        <Text style={styles.line}>UID: {uid}</Text>

        <View style={styles.divider} />

        <Text style={styles.section}>Virtual Account</Text>
        <Text style={styles.line}>
          {va?.account_number ? `${va.account_number} • ${va.bank_name}` : "Not available yet (Paystack DVA disabled)"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Account</Text>

        <Pressable style={styles.row} onPress={() => router.push({ pathname: "./wallet", params: { action: "history" } })}>
          <Text style={styles.rowText}>Wallet history</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable style={styles.row} onPress={async () => {
          // send reset email to current email (simple + safe)
          if (!email || email === "—") return;
          await supabase.auth.resetPasswordForEmail(email);
        }}>
          <Text style={styles.rowText}>Change password</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable style={styles.row} onPress={() => { /* future: KYC screen */ }}>
          <Text style={styles.rowText}>KYC verification (coming soon)</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <Pressable style={styles.row} onPress={() => { /* future: support */ }}>
          <Text style={styles.rowText}>Support (coming soon)</Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      <Pressable
        style={styles.dangerBtn}
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        }}
      >
        <Text style={styles.dangerText}>Sign out</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
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
  dim: { color: "rgba(255,255,255,0.65)", marginTop: 6 },

  card: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 16,
  },
  name: { color: "#fff", fontWeight: "900", fontSize: 18 },
  line: { color: "rgba(255,255,255,0.7)", marginTop: 6 },
  section: { color: "#fff", fontWeight: "900", marginTop: 4 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 12 },

  row: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: { color: "#fff", fontWeight: "900" },

  dangerBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerText: { color: "#fff", fontWeight: "900" },
});

