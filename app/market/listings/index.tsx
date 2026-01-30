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
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";
const BORDER_HI = "rgba(124,58,237,0.40)";
const PURPLE = "#7C3AED";

const LISTINGS_TABLE = "market_listings";
const IMAGES_TABLE = "market_listing_images";
const SELLERS_TABLE = "market_seller_profiles";
const LISTING_IMAGES_BUCKET = "market-listings"; // change if your bucket differs

// ✅ FK hint names (edit if yours differ)
const FK_IMAGES_BY_LISTING = "market_listing_images_listing_id_fkey";
const FK_COVER_IMAGE = "market_listings_cover_image_fk";

type ListingImage = {
  id: string;
  listing_id: string;
  storage_path: string;
  public_url: string | null;
  sort_order: number | null;
  meta: any | null;
  created_at: string | null;
};

type SellerProfile = {
  user_id: string;
  business_name: string | null;
  market_username: string | null;
  display_name: string | null;
  logo_path: string | null;
  banner_path: string | null;
  is_verified: boolean | null;
  active: boolean | null;
};

type Listing = {
  id: string;

  seller_id: string;
  category: "product" | "service" | string;
  sub_category: string | null;

  title: string | null;
  description: string | null;

  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;

  stock_qty: number | null;

  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;

  cover_image_id: string | null;
  website_url: string | null;

  // embeds:
  cover_image?: ListingImage | null;
  images?: ListingImage[] | null;
  seller?: SellerProfile | null;
};

type FilterTab = "all" | "product" | "service";
type SortBy = "newest" | "price_low" | "price_high";

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function sortImages(imgs: ListingImage[] | null | undefined) {
  if (!imgs?.length) return [];
  return [...imgs].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function pickCover(listing: Listing, supabaseUrl: string) {
  // Prefer explicit cover_image embed; fallback to first gallery image.
  const cover = listing.cover_image ?? null;
  if (cover?.public_url) return cover.public_url;
  if (cover?.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${cover.storage_path}`;
  }

  const first = sortImages(listing.images)[0];
  if (!first) return null;

  if (first.public_url) return first.public_url;
  if (first.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${first.storage_path}`;
  }
  return null;
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

  // paging
  const pageSize = 20;
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  const listRef = useRef<FlatList<Listing>>(null);

  const buildSort = useCallback(
    (query: any) => {
      if (sortBy === "price_low") return query.order("price_amount", { ascending: true, nullsFirst: false });
      if (sortBy === "price_high") return query.order("price_amount", { ascending: false, nullsFirst: false });
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
            id,
            seller_id,
            category,
            sub_category,
            title,
            description,
            price_amount,
            currency,
            delivery_type,
            stock_qty,
            is_active,
            created_at,
            updated_at,
            cover_image_id,
            website_url,

            -- ✅ cover image relationship (listing.cover_image_id -> images.id)
            cover_image:${IMAGES_TABLE}!${FK_COVER_IMAGE}(
              id, listing_id, storage_path, public_url, sort_order, meta, created_at
            ),

            -- ✅ gallery images relationship (images.listing_id -> listing.id)
            images:${IMAGES_TABLE}!${FK_IMAGES_BY_LISTING}(
              id, listing_id, storage_path, public_url, sort_order, meta, created_at
            ),

            -- ✅ seller profile (if relationship exists)
            seller:${SELLERS_TABLE}(
              user_id, business_name, market_username, display_name, logo_path, banner_path, is_verified, active
            )
          `,
          )
          .eq("is_active", true);

        if (tab !== "all") query = query.eq("category", tab);

        // Search across title/description/sub_category
        if (debouncedQ) {
          // NOTE: `or` string is safe here; if you need stronger protection, move to an RPC.
          query = query.or(
            [
              `title.ilike.%${debouncedQ}%`,
              `description.ilike.%${debouncedQ}%`,
              `sub_category.ilike.%${debouncedQ}%`,
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

        const gotFull = batch.length === pageSize;
        setHasMore(gotFull);
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

  // Initial + changes
  useEffect(() => {
    // scroll to top when filters change
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
    // debouncedQ will trigger fetch automatically
  }, [q]);

  const Chip = useCallback(
    ({
      active,
      label,
      onPress,
    }: {
      active: boolean;
      label: string;
      onPress: () => void;
    }) => (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: active ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? BORDER_HI : BORDER,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    ),
    [],
  );

  const SortPill = useCallback(
    ({
      active,
      label,
      onPress,
    }: {
      active: boolean;
      label: string;
      onPress: () => void;
    }) => (
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
    ),
    [],
  );

  const Header = useMemo(() => {
    return (
      <View style={{ paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
        <AppHeader title="Listings" subtitle="Browse products and services" />

        {/* Title row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 8,
            marginBottom: 10,
          }}
        >
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

        {/* Search */}
        <View
          style={{
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

        {/* Status */}
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
  }, [Chip, SortPill, err, fetchPage, insets.top, onSearchSubmit, q, sortBy, tab]);

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const cover = pickCover(item, supabaseUrl);
      const sellerName =
        item.seller?.business_name ??
        item.seller?.display_name ??
        (item.seller?.market_username ? `@${item.seller.market_username}` : null);

      const isOutOfStock = (item.category === "product" || item.category === "Products") && Number(item.stock_qty ?? 0) <= 0;

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

            {/* Price badge */}
            <View
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                right: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 14,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  maxWidth: "72%",
                }}
              >
                <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                  {money(item.currency, item.price_amount)}
                </Text>
              </View>

              {isOutOfStock ? (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 14,
                    backgroundColor: "rgba(0,0,0,0.55)",
                    borderWidth: 1,
                    borderColor: "rgba(255,80,80,0.35)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>Out</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ padding: 12 }}>
            <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
              {item.title ?? "Untitled"}
            </Text>

            <Text numberOfLines={1} style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              {item.sub_category ?? item.category ?? "—"}
              {item.delivery_type ? ` • ${item.delivery_type}` : ""}
            </Text>

            {/* Seller row */}
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="storefront-outline" size={14} color="rgba(255,255,255,0.75)" />
              <Text numberOfLines={1} style={{ flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" }}>
                {sellerName ?? "Seller"}
              </Text>

              {item.seller?.is_verified ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={14} color={PURPLE} />
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "900" }}>Verified</Text>
                </View>
              ) : null}
            </View>

            {/* Images count */}
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

  const keyExtractor = useCallback((item: Listing) => item.id, []);

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
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
      ) : rows.length === 0 && !err ? (
        <View style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
          {Header}
          <View
            style={{
              marginTop: 16,
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
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={keyExtractor}
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
