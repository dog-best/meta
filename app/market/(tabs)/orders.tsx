import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

const FN_MARKET_ORDERS_LIST = "market-orders-list"; // GET ONLY

type FnItem = {
  id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  listing: {
    id: string;
    title: string | null;
    category: string | null;
    sub_category: string | null;
    delivery_type: string | null;
  } | null;
  cover_image: { public_url: string | null } | null;
};

type FnResponse = {
  items: FnItem[];
  count: number | null;
  limit: number;
  offset: number;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency?.toUpperCase() === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    CREATED: "rgba(255,255,255,0.55)",
    IN_ESCROW: "rgba(124,58,237,0.9)",
    OUT_FOR_DELIVERY: "rgba(59,130,246,0.9)",
    DELIVERED: "rgba(16,185,129,0.9)",
    RELEASED: "rgba(16,185,129,0.9)",
    REFUNDED: "rgba(239,68,68,0.9)",
    CANCELLED: "rgba(239,68,68,0.9)",
  };
  const c = map[status] ?? "rgba(255,255,255,0.55)";
  return <View style={{ width: 10, height: 10, borderRadius: 99, backgroundColor: c }} />;
}

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 16,
        alignItems: "center",
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function getFunctionsBaseUrl() {
  const envUrl =
    (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);

  const clientUrl = (supabase as any)?.supabaseUrl as string | undefined;

  const sbUrl = envUrl || clientUrl;
  if (!sbUrl) throw new Error("Missing Supabase URL (set EXPO_PUBLIC_SUPABASE_URL)");

  return `${sbUrl.replace(/\/$/, "")}/functions/v1`;
}

export default function MarketOrdersTab() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"all" | "buying" | "selling">("all");
  const [items, setItems] = useState<FnItem[]>([]);

  const roleParam = useMemo(() => {
    if (mode === "buying") return "buyer";
    if (mode === "selling") return "seller";
    return "all";
  }, [mode]);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data: auth } = await supabase.auth.getSession();
    const token = auth?.session?.access_token;
    if (!token) {
      router.replace("/(auth)/login" as any);
      return;
    }

    try {
      const base = getFunctionsBaseUrl();
      const url = new URL(`${base}/${FN_MARKET_ORDERS_LIST}`);
      url.searchParams.set("role", roleParam);
      url.searchParams.set("limit", "50");
      url.searchParams.set("offset", "0");

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to load orders");
      }

      // your ok() wrapper returns: { items, count, limit, offset }
      const payload = json as FnResponse;
      setItems(Array.isArray(payload?.items) ? payload.items : []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to load orders");
      setItems([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleParam]);

  function openOrder(id: string) {
    router.push(`/market/order/${id}` as any);
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 }}>
          <View>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Orders</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 }}>
              Buying & selling history
            </Text>
          </View>

          <Pressable
            onPress={load}
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
            <Ionicons name="refresh" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Segmented */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SegButton label="All" active={mode === "all"} onPress={() => setMode("all")} />
          <SegButton label="Buying" active={mode === "buying"} onPress={() => setMode("buying")} />
          <SegButton label="Selling" active={mode === "selling"} onPress={() => setMode("selling")} />
        </View>

        {!!err ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
          <View
            style={{
              marginTop: 14,
              borderRadius: 22,
              padding: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>No orders yet</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
              When you buy or sell, it will show here.
            </Text>

            <Pressable
              onPress={() => router.push("/market/(tabs)" as any)}
              style={{
                marginTop: 14,
                borderRadius: 18,
                paddingVertical: 14,
                alignItems: "center",
                backgroundColor: PURPLE,
                borderWidth: 1,
                borderColor: PURPLE,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Go to marketplace</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 10 }}>
            {items.map((o) => {
              const title = o.listing?.title ?? "Order";
              const meta = `${o.listing?.category ?? "—"} • ${o.listing?.delivery_type ?? "—"}`;
              const img = o.cover_image?.public_url ?? null;

              return (
                <Pressable
                  key={o.id}
                  onPress={() => openOrder(o.id)}
                  style={{
                    borderRadius: 22,
                    padding: 14,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 18,
                        overflow: "hidden",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {img ? (
                        <Image source={{ uri: img }} style={{ width: 54, height: 54 }} />
                      ) : (
                        <Ionicons name="cube-outline" size={22} color="rgba(255,255,255,0.75)" />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <StatusDot status={o.status} />
                        <Text style={{ color: "#fff", fontWeight: "900", flex: 1 }} numberOfLines={1}>
                          {title}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.75)" />
                      </View>

                      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }} numberOfLines={1}>
                        {meta}
                      </Text>

                      <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{o.status}</Text>
                        <Text style={{ color: "#fff", fontWeight: "900" }}>{money(o.currency, o.amount)}</Text>
                      </View>

                      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                        {new Date(o.created_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
