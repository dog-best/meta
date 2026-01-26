import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";

type WalletRow = { user_id: string; balance: number };
type TxRow = { id: string; type: string; amount: number; reference: string; created_at: string; meta: any };

export default function MarketWallet() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<TxRow[]>([]);

  async function load() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) {
      router.replace("/(auth)/login" as any);
      return;
    }

    // 1) balance
    const { data: w } = await supabase
      .from("app_wallets_simple")
      .select("user_id,balance")
      .eq("user_id", me)
      .maybeSingle();

    setBalance(Number((w as WalletRow | null)?.balance ?? 0));

    // 2) market-related tx
    // (filters by reference/meta pattern; adjust if your wallet tx schema differs)
    const { data: rows } = await supabase
      .from("app_wallet_tx_simple")
      .select("id,type,amount,reference,created_at,meta")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(30);

    const filtered = (rows ?? []).filter((r: any) => {
      const ref = String(r.reference || "");
      const kind = String(r?.meta?.kind || "");
      return ref.startsWith("mkt_") || ref.startsWith("market_") || kind.startsWith("market_") || kind.includes("escrow");
    });

    setTxs(filtered as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Market wallet</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Uses your existing wallet balance (no new funding)
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : (
          <>
            <View style={{ borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Available NGN balance</Text>
              <Text style={{ marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 26 }}>
                ₦{balance.toLocaleString()}
              </Text>

              <Pressable
                onPress={() => router.push("/(tabs)/wallet" as any)}
                style={{
                  marginTop: 12,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Open main wallet</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Market activity</Text>

              {txs.length === 0 ? (
                <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)" }}>No market wallet activity yet.</Text>
              ) : (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {txs.slice(0, 15).map((t) => (
                    <View
                      key={t.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        backgroundColor: "rgba(255,255,255,0.06)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>
                        {t.type} • ₦{Number(t.amount ?? 0).toLocaleString()}
                      </Text>
                      <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                        {t.reference}
                      </Text>
                      <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                        {new Date(t.created_at).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                onPress={load}
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Refresh</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
