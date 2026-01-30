import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
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
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";

const LISTINGS_TABLE = "market_listings";
const IMAGES_TABLE = "market_listing_images";
const LISTING_IMAGES_BUCKET = "market-listings";

type ListingImage = {
  id: string;
  listing_id: string;
  storage_path: string;
  public_url: string | null;
  sort_order: number | null;
  meta: any;
  created_at: string;
};

type Listing = {
  id: string;
  seller_id: string;
  category: string;
  sub_category: string;
  title: string;
  description: string | null;
  price_amount: number | string;
  currency: string;
  delivery_type: string;
  stock_qty: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  cover_image_id: string | null;
  website_url: string | null;

  cover_image?: ListingImage | null;
  images?: ListingImage[] | null;
};

type FilterTab = "all" | "product" | "service";
type SortBy = "newest" | "price_low" | "price_high";

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function sortImages(imgs: ListingImage[] | null | undefined) {
  if (!imgs?.length) return [];
  return [...imgs].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function sanitizeForOr(term: string) {
  return term.replace(/,/g, " ").trim();
}

function pickUrl(img: ListingImage | null | undefined, supabaseUrl: string) {
  if (!img) return null;
  if (img.public_url) return img.public_url;
  if (img.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${img.storage_path}`;
  }
  return null;
}

function pickCoverUrl(listing: Listing, supabaseUrl: string) {
  const cover = pickUrl(listing.cover_image ?? null, supabaseUrl);
  if (cover) return cover;
  const first = sortImages(listing.images)[0];
  return pickUrl(first ?? null, supabaseUrl);
}

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

  const debouncedQ = useDebouncedValue(q.trim(), 350);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Listing[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const pageSize = 20;
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  const listRef = useRef<FlatList<Listing>>(null);

  const buildSort = useCallback(
    (query: any) => {
      if (sortBy === "price_low") return query.order("price_amount", { ascending: true });
      if (sortBy === "price_high") return query.order("price_amount", { ascending: false });
      return query.order("created_at", { ascending: false });
    },
    [sortBy],
  );

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setErr(null);
        setHasMore(true);
        setPage(0);
        setLoading(true);
      } else {
        if (loadingMore || !hasMore) return;
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
            id,seller_id,category,sub_category,title,description,price_amount,currency,delivery_type,stock_qty,is_active,created_at,updated_at,cover_image_id,website_url,
            cover_image:${IMAGES_TABLE}!market_listings_cover_image_fk(*),
            images:${IMAGES_TABLE}!market_listing_images_listing_id_fkey(*)
          `,
          )
          .eq("is_active", true);

        if (tab !== "all") query = query.eq("category", tab);

        const term = sanitizeForOr(debouncedQ);
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

        const batch = ((data ?? []) as unknown as Listing[]).map((l) => ({
          ...l,
          images: sortImages(l.images ?? []),
        }));

        if (reset) setRows(batch);
        else setRows((prev) => [...prev, ...batch]);

        setHasMore(batch.length === pageSize);
        setPage((prev) => (reset ? 1 : prev + 1));
      } catch (e: any) {
        setErr(e?.message || "Failed to load listings");
        if (reset) setRows([]);
      } finally {
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [buildSort, debouncedQ, hasMore, loadingMore, page, tab],
  );

  useEffect(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    fetchPage(true);
  }, [tab, sortBy, debouncedQ, fetchPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (!loading && !err) fetchPage(false);
  }, [fetchPage, loading, err]);

  const onSearchSubmit = useCallback(() => {
    router.setParams({ q: q.trim() } as any);
  }, [q]);

  const Header = useMemo(() => {
    const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: active ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? "rgba(124,58,237,0.40)" : BORDER,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );

    const SortPill = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: active ? PURPLE : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? PURPLE : BORDER,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );

    return (
      <View style={{ paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
        <AppHeader title="Listings" subtitle="Browse products and services" />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <View>
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Listings</Text>
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

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            gap: 10,
            borderRadius: 20,
            padding: 12,
            borderWidth: 1,
            borderColor: BORDER,
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
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!q && (
            <Pressable
              onPress={() => setQ("")}
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          )}
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Chip active={tab === "all"} label="All" onPress={() => setTab("all")} />
          <Chip active={tab === "product"} label="Products" onPress={() => setTab("product")} />
          <Chip active={tab === "service"} label="Services" onPress={() => setTab("service")} />
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <SortPill active={sortBy === "newest"} label="Newest" onPress={() => setSortBy("newest")} />
          <SortPill active={sortBy === "price_low"} label="Price ↑" onPress={() => setSortBy("price_low")} />
          <SortPill active={sortBy === "price_high"} label="Price ↓" onPress={() => setSortBy("price_high")} />
        </View>

        {err ? (
          <View
            style={{
              marginTop: 14,
              borderRadius: 18,
              padding: 14,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Could not load listings</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>

            <Pressable
              onPress={() => fetchPage(true)}
              style={{
                marginTop: 12,
                borderRadius: 14,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: PURPLE,
                borderWidth: 1,
                borderColor: PURPLE,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }, [err, fetchPage, insets.top, onSearchSubmit, q, sortBy, tab]);

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const cover = pickCoverUrl(item, supabaseUrl);
      return (
        <Pressable
          onPress={() => router.push(`/market/listing/${item.id}` as any)}
          style={{
            width: "48%",
            borderRadius: 22,
            overflow: "hidden",
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View style={{ height: 130, backgroundColor: "rgba(255,255,255,0.08)" }}>
            {cover ? (
              <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.55)" />
              </View>
            )}

            <View style={{ position: "absolute", bottom: 10, left: 10 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 14,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                  {money(item.currency, item.price_amount)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ padding: 12 }}>
            <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
              {item.title ?? "Untitled"}
            </Text>

            <Text numberOfLines={1} style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              {item.sub_category ?? "—"}
              {item.delivery_type ? ` • ${item.delivery_type}` : ""}
            </Text>

            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="images-outline" size={14} color="rgba(255,255,255,0.65)" />
              <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "800" }}>
                {(item.images?.length ?? 0) + (item.cover_image ? 1 : 0)} media
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [supabaseUrl],
  );

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      {loading ? (
        <View style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
          <AppHeader title="Listings" subtitle="Browse products and services" />
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>
              Loading…
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 16, justifyContent: "space-between", marginTop: 12 }}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListHeaderComponent={Header}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.45}
          onEndReached={onEndReached}
          ListFooterComponent={
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}>
              {loadingMore ? (
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Loading more…</Text>
                </View>
              ) : !hasMore ? (
                <Text style={{ color: "rgba(255,255,255,0.60)", fontWeight: "900", textAlign: "center" }}>
                  No more results
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

