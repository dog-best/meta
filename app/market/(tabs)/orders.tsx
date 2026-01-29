// app/market/(tabs)/order.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
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

function formatStatusLabel(status: string) {
  const s = (status || "").toUpperCase();
  return s.replace(/_/g, " ");
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
  const c = map[(status || "").toUpperCase()] ?? "rgba(255,255,255,0.55)";
  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 99,
        backgroundColor: c,
      }}
    />
  );
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        paddingVertical: 12,
        borderRadius: 16,
        alignItems: "center",
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.40)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function getFunctionsBaseUrl() {
  // Prefer the supabase client URL to avoid env mismatch issues.
  const clientUrl = (supabase as any)?.supabaseUrl as string | undefined;

  const envUrl =
    (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);

  const sbUrl = clientUrl || envUrl;
  if (!sbUrl) throw new Error("Missing Supabase URL (set EXPO_PUBLIC_SUPABASE_URL)");

  return `${sbUrl.replace(/\/$/, "")}/functions/v1`;
}

function getAnonKey() {
  const key =
    (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);
  if (!key) {
    throw new Error("Missing Supabase anon key (set EXPO_PUBLIC_SUPABASE_ANON_KEY)");
  }
  return key;
}

function ErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        marginTop: 14,
        borderRadius: 22,
        padding: 16,
        backgroundColor: "rgba(239,68,68,0.10)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.22)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: "rgba(239,68,68,0.18)",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(239,68,68,0.25)",
          }}
        >
          <Ionicons name="alert-circle-outline" size={20} color="#FCA5A5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>{title}</Text>
          <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
            {message}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 14,
          borderRadius: 18,
          paddingVertical: 12,
          alignItems: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ onGoMarket }: { onGoMarket: () => void }) {
  return (
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
        onPress={onGoMarket}
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
  );
}

export default function MarketOrdersTab() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"all" | "buying" | "selling">("all");
  const [items, setItems] = useState<FnItem[]>([]);

  // Prevent state updates after unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const roleParam = useMemo(() => {
    if (mode === "buying") return "buyer";
    if (mode === "selling") return "seller";
    return "all";
  }, [mode]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      if (!silent) {
        setErr(null);
        setLoading(true);
      }

      try {
        // ✅ Patch: ensure token is fresh before calling Edge Function
        await supabase.auth.refreshSession();

        const { data: auth } = await supabase.auth.getSession();
        const token = auth?.session?.access_token;

        if (!token) {
          router.replace("/(auth)/login" as any);
          return;
        }

        const base = getFunctionsBaseUrl();
        const url = new URL(`${base}/${FN_MARKET_ORDERS_LIST}`);
        url.searchParams.set("role", roleParam);
        url.searchParams.set("limit", "50");
        url.searchParams.set("offset", "0");

        const res = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: getAnonKey(),
            Accept: "application/json",
          },
        });

        const rawText = await res.text();
        const json = rawText ? safeJsonParse(rawText) : null;

        if (!res.ok) {
          const msg =
            (json as any)?.message ||
            (json as any)?.error ||
            (typeof json === "string" ? json : null) ||
            (rawText && rawText.length < 400 ? rawText : null) ||
            `Failed to load orders (HTTP ${res.status})`;

          // If auth failed, bounce to login (keeps UX tight)
          if (res.status === 401) {
            // optional: sign out locally to force clean auth
            // await supabase.auth.signOut();
            router.replace("/(auth)/login" as any);
            return;
          }

          throw new Error(msg);
        }

        const payload = json as FnResponse;
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];

        if (!aliveRef.current) return;
        setItems(nextItems);
        setErr(null);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setErr(e?.message || "Failed to load orders");
        setItems([]);
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
      }
    },
    [roleParam],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleParam]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ silent: true });
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [load]);

  function openOrder(id: string) {
    router.push(`/market/order/${id}` as any);
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        flex: 1,
        paddingTop: Math.max(insets.top, 14),
        paddingHorizontal: 16,
      }}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 12,
          }}
        >
          <View>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Orders</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 }}>
              Buying &amp; selling history
            </Text>
          </View>

          <Pressable
            onPress={() => load()}
            accessibilityRole="button"
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

        {!!err ? <ErrorCard title="Couldn’t load orders" message={err} onRetry={() => load()} /> : null}

        {loading ? (
          <View style={{ marginTop: 44, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
          <EmptyState onGoMarket={() => router.push("/market/(tabs)" as any)} />
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
                  accessibilityRole="button"
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

                      <Text
                        style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {meta}
                      </Text>

                      <View
                        style={{
                          marginTop: 10,
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                            {formatStatusLabel(o.status)}
                          </Text>
                        </View>
                        <Text style={{ color: "#fff", fontWeight: "900" }}>
                          {money(o.currency, o.amount)}
                        </Text>
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

// Avoid crashing on non-JSON error bodies
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
