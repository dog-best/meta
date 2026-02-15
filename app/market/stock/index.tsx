import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { fetchStocksOverview, type StockOverviewItem } from "@/services/market/stocks";
import { supabase } from "@/services/supabase";
import { friendlyMarketError } from "@/utils/marketUx";

const BG_TOP = "#0D1B2A";
const BG_BOTTOM = "#071018";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.12)";
const MINT = "#2DD4BF";
const MUTED = "rgba(255,255,255,0.68)";

function sellerLogoUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("market-sellers").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

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
          {filtered.map((item) => {
            const logo = sellerLogoUrl(item.logo_path);
            return (
              <View
                key={item.identity_id}
                style={{
                  borderRadius: 16,
                  padding: 12,
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: BORDER,
                }}
              >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Pressable
                    disabled={!item.market_username}
                    onPress={() =>
                      item.market_username
                        ? router.push(`/market/profile/${item.market_username}` as any)
                        : undefined
                    }
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {logo ? (
                      <Image source={{ uri: logo }} style={{ width: 52, height: 52 }} />
                    ) : (
                      <Ionicons name="storefront-outline" size={20} color="rgba(255,255,255,0.75)" />
                    )}
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }} numberOfLines={1}>
                      {item.token_name} <Text style={{ color: "#99F6E4" }}>({item.token_symbol})</Text>
                    </Text>
                    <Pressable
                      disabled={!item.market_username}
                      onPress={() =>
                        item.market_username
                          ? router.push(`/market/profile/${item.market_username}` as any)
                          : undefined
                      }
                    >
                      <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={{ color: MUTED, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                          @{item.market_username || "store"} - {item.business_name || item.display_name || "Store"}
                        </Text>
                        {item.is_verified ? <Ionicons name="checkmark-circle" size={13} color="#60A5FA" /> : null}
                      </View>
                    </Pressable>
                    <View style={{ marginTop: 5, flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: "rgba(255,255,255,0.05)",
                          borderWidth: 1,
                          borderColor: BORDER,
                        }}
                      >
                        <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "800" }}>
                          {String(item.chain).toUpperCase().replace("_", " ")}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: item.status === "ACTIVE" ? "rgba(45,212,191,0.14)" : "rgba(245,158,11,0.14)",
                          borderWidth: 1,
                          borderColor: item.status === "ACTIVE" ? "rgba(45,212,191,0.45)" : "rgba(245,158,11,0.45)",
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{item.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>${Number(item.price || 0).toFixed(4)}</Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 11 }}>
                    Vol24h ${Number(item.volume_24h_quote || 0).toFixed(2)}
                  </Text>
                  <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    MCap ${Number(item.market_cap || 0).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => router.push(`/market/stock/${item.slug}` as any)}
                  style={{
                    flex: 1.2,
                    borderRadius: 11,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: "rgba(45,212,191,0.18)",
                    borderWidth: 1,
                    borderColor: "rgba(45,212,191,0.45)",
                  }}
                >
                  <Text style={{ color: "#ECFEFF", fontWeight: "900" }}>Open Market</Text>
                </Pressable>
                <Pressable
                  disabled={!item.market_username}
                  onPress={() =>
                    item.market_username
                      ? router.push(`/market/profile/${item.market_username}` as any)
                      : undefined
                  }
                  style={{
                    flex: 1,
                    borderRadius: 11,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: BORDER,
                    opacity: item.market_username ? 1 : 0.55,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Store</Text>
                </Pressable>
              </View>
            </View>
            );
          })}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
