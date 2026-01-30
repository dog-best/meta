import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

const LISTINGS_TABLE = "market_listings";
const IMAGES_TABLE = "market_listing_images";
const LISTING_IMAGES_BUCKET = "market-listings"; // change if your bucket name differs

type Listing = {
  id: string;
  title: string | null;
  description: string | null;
  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;
  category: string | null;
  sub_category: string | null;
  created_at?: string | null;
  is_active?: boolean | null;

  market_listing_images?: Array<{
    id: string;
    public_url: string | null;
    storage_path: string;
    sort_order: number | null;
  }> | null;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function pickCoverUrl(imgs: Listing["market_listing_images"], supabaseUrl: string) {
  if (!imgs || imgs.length === 0) return null;
  const sorted = [...imgs].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const first = sorted[0];
  if (first.public_url) return first.public_url;
  if (first.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${first.storage_path}`;
  }
  return null;
}

type FilterTab = "all" | "product" | "service";
type SortBy = "newest" | "price_low" | "price_high";

export default function ListingsFeed() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();

  const initialCategory = useMemo(() => String(params?.category ?? "all"), [params?.category]);
  const initialQ = useMemo(() => String(params?.q ?? "").trim(), [params?.q]);

  const [tab, setTab] = useState<FilterTab>(
    initialCategory === "product" || initialCategory === "service" ? (initialCategory as any) : "all",
  );
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [q, setQ] = useState(initialQ);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Listing[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // simple paging
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  function buildSort(query: any) {
    if (sortBy === "price_low") return query.order("price_amount", { ascending: true });
    if (sortBy === "price_high") return query.order("price_amount", { ascending: false });
    return query.order("created_at", { ascending: false });
  }

  async function fetchPage(reset: boolean) {
    if (reset) {
      console.log("[ListingsFeed] load start", { reset: true });
      setLoading(true);
      setErr(null);
      setPage(0);
      setHasMore(true);
    } else {
      if (loadingMore || !hasMore) return;
      console.log("[ListingsFeed] loadMore start");
      setLoadingMore(true);
    }

    try {
      const currentPage = reset ? 0 : page;
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from(LISTINGS_TABLE)
        .select(
          `
          id,title,description,price_amount,currency,delivery_type,category,sub_category,created_at,is_active,
          market_listing_images:${IMAGES_TABLE}(id,public_url,storage_path,sort_order)
        `,
        )
        .eq("is_active", true);

      if (tab !== "all") query = query.eq("category", tab);

      const term = q.trim();
      if (term) {
        query = query.or(
          [
            `title.ilike.%${term}%`,
            `description.ilike.%${term}%`,
            `sub_category.ilike.%${term}%`,
          ].join(","),
        );
      }

      query = buildSort(query).range(from, to);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const batch = (data as any as Listing[]) ?? [];
      if (reset) setRows(batch);
      else setRows((prev) => [...prev, ...batch]);

      const gotFull = batch.length === pageSize;
      setHasMore(gotFull);
      setPage((prev) => (reset ? 1 : prev + 1));
    } catch (e: any) {
      setErr(e?.message || "Failed to load listings");
      if (loading) setRows([]);
    } finally {
      if (reset) {
        setLoading(false);
        console.log("[ListingsFeed] load end");
      } else {
        setLoadingMore(false);
        console.log("[ListingsFeed] loadMore end");
      }
    }
  }

  useEffect(() => {
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sortBy]);

  function onSearchSubmit() {
    router.setParams({ q: q.trim() } as any);
    fetchPage(true);
  }

  function Chip({
    active,
    label,
    onPress,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: active ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? "rgba(124,58,237,0.40)" : "rgba(255,255,255,0.10)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  }

  function SortPill({
    active,
    label,
    onPress,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: active ? PURPLE : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? PURPLE : "rgba(255,255,255,0.10)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <AppHeader title="Listings" subtitle="Browse products and services" />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Listings</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
              Browse products and services
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/market/(tabs)/account" as any)}
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
            <Ionicons name="person-circle-outline" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            borderRadius: 20,
            padding: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
          }}
        >
          <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search e.g. iPhone, barber, shoes…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={{ flex: 1, color: "#fff", fontWeight: "700" }}
            returnKeyType="search"
            onSubmitEditing={onSearchSubmit}
          />
          <Pressable
            onPress={onSearchSubmit}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 16,
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Go</Text>
          </Pressable>
        </View>

        {/* Filters */}
        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Chip active={tab === "all"} label="All" onPress={() => setTab("all")} />
          <Chip active={tab === "product"} label="Products" onPress={() => setTab("product")} />
          <Chip active={tab === "service"} label="Services" onPress={() => setTab("service")} />
        </View>

        {/* Sort */}
        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <SortPill active={sortBy === "newest"} label="Newest" onPress={() => setSortBy("newest")} />
          <SortPill active={sortBy === "price_low"} label="Price ↑" onPress={() => setSortBy("price_low")} />
          <SortPill active={sortBy === "price_high"} label="Price ↓" onPress={() => setSortBy("price_high")} />
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : err ? (
          <View
            style={{
              marginTop: 18,
              borderRadius: 22,
              padding: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Could not load listings</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>
          </View>
        ) : rows.length === 0 ? (
          <View
            style={{
              marginTop: 18,
              borderRadius: 22,
              padding: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>No listings yet</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
              Try another search or be the first to sell.
            </Text>

            <Pressable
              onPress={() => router.push("/market/(tabs)/sell" as any)}
              style={{
                marginTop: 12,
                borderRadius: 18,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: PURPLE,
                borderWidth: 1,
                borderColor: PURPLE,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Create Listing</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {rows.map((r) => {
                const cover = pickCoverUrl(r.market_listing_images ?? null, supabaseUrl);

                return (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push(`/market/listing/${r.id}` as any)}
                    style={{
                      width: "48%",
                      borderRadius: 22,
                      overflow: "hidden",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <View style={{ height: 110, backgroundColor: "rgba(255,255,255,0.06)" }}>
                      {cover ? (
                        <Image source={{ uri: cover }} style={{ width: "100%", height: 110 }} />
                      ) : (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.55)" />
                        </View>
                      )}
                    </View>

                    <View style={{ padding: 12 }}>
                      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900" }}>
                        {r.title ?? "Untitled"}
                      </Text>

                      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                        <Text style={{ color: "#fff", fontWeight: "900" }}>
                          {money(r.currency, r.price_amount)}
                        </Text>
                        {"  "}
                        <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                          • {r.delivery_type ?? "—"}
                        </Text>
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => fetchPage(false)}
              disabled={loadingMore || !hasMore}
              style={{
                marginTop: 16,
                borderRadius: 20,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
                opacity: !hasMore ? 0.55 : 1,
              }}
            >
              {loadingMore ? (
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Loading…</Text>
                </View>
              ) : (
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  {hasMore ? "Load more" : "No more results"}
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
