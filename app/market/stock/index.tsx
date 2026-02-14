import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { fetchStocksOverview, type StockOverviewItem } from "@/services/market/stocks";
import { friendlyMarketError } from "@/utils/marketUx";

const BG_TOP = "#0D1B2A";
const BG_BOTTOM = "#071018";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.12)";
const MINT = "#2DD4BF";
const AMBER = "#F59E0B";
const MUTED = "rgba(255,255,255,0.68)";

export default function StockHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<StockOverviewItem[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    setErr(null);
    try {
      const res = await fetchStocksOverview(80, 0);
      setItems(res.items ?? []);
    } catch (e: any) {
      setErr(friendlyMarketError(e, "Unable to load digital stock market right now."));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const text = `${i.token_name} ${i.token_symbol} ${i.business_name || ""} ${i.market_username || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [items, query]);

  return (
    <LinearGradient colors={[BG_TOP, BG_BOTTOM]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <AppHeader title="Digital Stock" subtitle="Internet stock identities tied to real store commerce." />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={{ marginTop: 8, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/market/stock/create" as any)}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "rgba(45,212,191,0.16)",
              borderWidth: 1,
              borderColor: "rgba(45,212,191,0.42)",
            }}
          >
            <Text style={{ color: "#ECFEFF", fontWeight: "900" }}>Create Stock Identity</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/market/stock/portfolio" as any)}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "rgba(245,158,11,0.12)",
              borderWidth: 1,
              borderColor: "rgba(245,158,11,0.35)",
            }}
          >
            <Text style={{ color: "#FFF7ED", fontWeight: "900" }}>My Portfolio</Text>
          </Pressable>
        </View>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ticker, store, or name"
            placeholderTextColor="rgba(255,255,255,0.46)"
            style={{ flex: 1, color: "#fff", fontWeight: "700" }}
          />
        </View>

        {loading ? (
          <View style={{ marginTop: 26, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: MUTED }}>Loading stock market...</Text>
          </View>
        ) : null}

        {!!err ? (
          <View style={{ marginTop: 12, borderRadius: 14, padding: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
          </View>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <View style={{ marginTop: 14, borderRadius: 14, padding: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>No stock identities yet</Text>
            <Text style={{ marginTop: 6, color: MUTED }}>Verified stores can create one and start trading.</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 10, gap: 10 }}>
          {filtered.map((item) => (
            <Pressable
              key={item.identity_id}
              onPress={() => router.push(`/market/stock/${item.slug}` as any)}
              style={{
                borderRadius: 16,
                padding: 12,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: BORDER,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                    {item.token_name} <Text style={{ color: "#99F6E4" }}>({item.token_symbol})</Text>
                  </Text>
                  <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                    @{item.market_username || "store"} - {item.business_name || "Store"}
                  </Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    {String(item.chain).toUpperCase().replace("_", " ")} - {item.status}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>${Number(item.price || 0).toFixed(4)}</Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 11 }}>
                    Vol24h ${Number(item.volume_24h_quote || 0).toFixed(2)}
                  </Text>
                  <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    MCap ${Number(item.market_cap || 0).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: BORDER,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{item.trades_24h} trades (24h)</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MINT} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
