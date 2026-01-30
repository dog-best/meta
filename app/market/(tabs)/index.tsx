import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import { CategoryItem, getCategoriesByMain, MarketMainCategory } from "@/services/market/categories";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.10)";
const MUTED = "rgba(255,255,255,0.65)";

const LISTINGS_TABLE = "market_listings";
const LISTING_IMAGES_BUCKET = "market-listings";

type CoverImage = {
  id: string;
  public_url: string | null;
  storage_path: string;
};

type ListingRow = {
  id: string;
  title: string | null;
  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;
  category: string | null; // "product" | "service"
  sub_category: string | null;
  created_at: string | null;
  is_active?: boolean | null;
  cover?: CoverImage | null;
};

type SortBy = "newest" | "price_low" | "price_high";

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if ((currency ?? "").toUpperCase() === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function buildPublicFromStorage(supabaseUrl: string, storagePath?: string | null) {
  if (!storagePath) return null;
  return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${storagePath}`;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function Pill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: any;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor: active ? "rgba(124,58,237,0.22)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.55)" : BORDER,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color="#fff" /> : null}
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Chip({
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
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: active ? PURPLE : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? PURPLE : BORDER,
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function CategoryChip({
  c,
  active,
  onPress,
}: {
  c: { slug: string | null; title: string; icon?: string };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.60)" : BORDER,
        backgroundColor: active ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.06)",
        marginRight: 10,
      }}
    >
      <Ionicons name={(c.icon as any) ?? "pricetag-outline"} size={16} color="#fff" />
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>{c.title}</Text>
    </Pressable>
  );
}

function ListingCard({ item, supabaseUrl }: { item: ListingRow; supabaseUrl: string }) {
  const coverUrl =
    item.cover?.public_url ?? buildPublicFromStorage(supabaseUrl, item.cover?.storage_path ?? null);

  const isNew = useMemo(() => {
    if (!item.created_at) return false;
    const t = new Date(item.created_at).getTime();
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < 1000 * 60 * 60 * 48; // 48h
  }, [item.created_at]);

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/market/listing/[id]" as any, params: { id: item.id } })
      }
      style={{
        width: "48%",
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: CARD,
      }}
    >
      <View style={{ height: 140, backgroundColor: "rgba(255,255,255,0.06)" }}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.55)" />
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 11 }}>
              No photo
            </Text>
          </View>
        )}

        {/* Badges */}
        <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "rgba(16,185,129,0.18)",
              borderWidth: 1,
              borderColor: "rgba(16,185,129,0.35)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>Active</Text>
          </View>

          {isNew ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: "rgba(124,58,237,0.22)",
                borderWidth: 1,
                borderColor: "rgba(124,58,237,0.45)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>New</Text>
            </View>
          ) : null}
        </View>

        {/* Price */}
        <View style={{ position: "absolute", bottom: 10, left: 10 }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.55)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
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

        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: BORDER,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="cube-outline" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11 }} numberOfLines={1}>
              {item.delivery_type ?? "—"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function MarketHome() {
  const insets = useSafeAreaInsets();

  const [main, setMain] = useState<MarketMainCategory>("product");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q.trim(), 350);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const pageSize = 20;
  const pageRef = useRef(0);
  const hasMoreRef = useRef(true);
  const fetchingRef = useRef(false);
  const reqIdRef = useRef(0);

  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreUi, setHasMoreUi] = useState(true);

  const listRef = useRef<FlatList<ListingRow>>(null);

  const categories = useMemo<CategoryItem[]>(() => getCategoriesByMain(main), [main]);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  const filterKey = useMemo(
    () => `${main}|${selectedSlug ?? ""}|${sortBy}|${debouncedQ}`,
    [main, selectedSlug, sortBy, debouncedQ],
  );

  const buildSort = useCallback(
    (query: any) => {
      if (sortBy === "price_low") return query.order("price_amount", { ascending: true });
      if (sortBy === "price_high") return query.order("price_amount", { ascending: false });
      return query.order("created_at", { ascending: false });
    },
    [sortBy],
  );

  const fetchListings = useCallback(
    async (mode: "reset" | "more") => {
      if (fetchingRef.current) return;

      if (mode === "more" && !hasMoreRef.current) return;

      fetchingRef.current = true;
      const reqId = ++reqIdRef.current;

      if (mode === "reset") {
        setErr(null);
        hasMoreRef.current = true;
        setHasMoreUi(true);
        pageRef.current = 0;

        if (rows.length === 0) setLoading(true);
        else setRefreshing(true);

        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      } else {
        setLoadingMore(true);
      }

      try {
        const from = pageRef.current * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
          .from(LISTINGS_TABLE)
          .select(
            `
            id,title,price_amount,currency,delivery_type,category,sub_category,created_at,is_active,
            cover:market_listing_images!market_listings_cover_image_fk(id,public_url,storage_path)
          `,
          )
          .eq("is_active", true)
          .eq("category", main);

        if (selectedSlug) query = query.eq("sub_category", selectedSlug);
        if (debouncedQ) {
          query = query.or([`title.ilike.%${debouncedQ}%`, `description.ilike.%${debouncedQ}%`].join(","));
        }

        query = buildSort(query).range(from, to);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        // stale response guard
        if (reqId !== reqIdRef.current) return;

        const batch = ((data as any) ?? []) as ListingRow[];

        if (mode === "reset") setRows(batch);
        else setRows((prev) => [...prev, ...batch]);

        const more = batch.length === pageSize;
        hasMoreRef.current = more;
        setHasMoreUi(more);

        if (more) pageRef.current += 1;
      } catch (e: any) {
        if (reqId === reqIdRef.current) {
          setErr(e?.message || "Failed to load listings");
          if (mode === "reset") setRows([]);
        }
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
        fetchingRef.current = false;
      }
    },
    [buildSort, debouncedQ, main, rows.length, selectedSlug],
  );

  // reset fetch on filters change (stable: no page dependency loop)
  useEffect(() => {
    fetchListings("reset");
  }, [filterKey, fetchListings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchListings("reset");
    } finally {
      setRefreshing(false);
    }
  }, [fetchListings]);

  const onEndReached = useCallback(() => {
    if (!loading && !err) fetchListings("more");
  }, [fetchListings, loading, err]);

  const subtitle = "Discover products and services from businesses around the world.";

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(it) => it.id}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: 16, justifyContent: "space-between", marginTop: 12 }}
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => <ListingCard item={item} supabaseUrl={supabaseUrl} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.45}
        onEndReached={onEndReached}
        ListHeaderComponent={
          <View style={{ paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
            <AppHeader title="Marketplace" subtitle={subtitle} />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <View>
                <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Marketplace</Text>
                <Text style={{ marginTop: 6, color: MUTED, fontSize: 13 }}>
                  {main === "product" ? "Shop curated products" : "Book trusted services"}
                  {rows.length ? ` • ${rows.length}${hasMoreUi ? "+" : ""} available` : ""}
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
                placeholder="Search products, services, brands…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{ flex: 1, color: "#fff", fontWeight: "700" }}
                returnKeyType="search"
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

            {/* Product / Service */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pill
                label="Products"
                icon="cart-outline"
                active={main === "product"}
                onPress={() => {
                  setSelectedSlug(null);
                  setMain("product");
                }}
              />
              <Pill
                label="Services"
                icon="briefcase-outline"
                active={main === "service"}
                onPress={() => {
                  setSelectedSlug(null);
                  setMain("service");
                }}
              />
            </View>

            {/* Categories */}
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                {main === "product" ? "Categories" : "Service types"}
              </Text>
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                Filter results by category
              </Text>

              <View style={{ marginTop: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <CategoryChip
                    c={{ slug: null, title: "All", icon: "apps-outline" }}
                    active={!selectedSlug}
                    onPress={() => setSelectedSlug(null)}
                  />
                  {categories.map((c) => (
                    <CategoryChip
                      key={c.slug}
                      c={{ slug: c.slug, title: c.title, icon: c.icon }}
                      active={selectedSlug === c.slug}
                      onPress={() => setSelectedSlug(c.slug)}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Sort */}
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <Chip label="Newest" active={sortBy === "newest"} onPress={() => setSortBy("newest")} />
              <Chip label="Price ↑" active={sortBy === "price_low"} onPress={() => setSortBy("price_low")} />
              <Chip label="Price ↓" active={sortBy === "price_high"} onPress={() => setSortBy("price_high")} />
            </View>

            {/* States */}
            {loading ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>
                  Loading listings…
                </Text>
              </View>
            ) : err ? (
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
                <Text style={{ color: "#fff", fontWeight: "900" }}>Could not load listings</Text>
                <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>

                <Pressable
                  onPress={() => fetchListings("reset")}
                  style={{
                    marginTop: 12,
                    borderRadius: 16,
                    paddingVertical: 12,
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
        }
        ListEmptyComponent={
          loading || err ? null : (
            <View
              style={{
                marginTop: 14,
                marginHorizontal: 16,
                borderRadius: 22,
                padding: 16,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>No results</Text>
              <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                Try adjusting your search, category, or sort.
              </Text>
              <Pressable
                onPress={() => {
                  setSelectedSlug(null);
                  setQ("");
                  setSortBy("newest");
                }}
                style={{
                  marginTop: 12,
                  borderRadius: 16,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: PURPLE,
                  borderWidth: 1,
                  borderColor: PURPLE,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Reset</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}>
            {loadingMore ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: "#fff", fontWeight: "900" }}>Loading more…</Text>
              </View>
            ) : !hasMoreUi && rows.length > 0 ? (
              <Text style={{ color: "rgba(255,255,255,0.60)", fontWeight: "900", textAlign: "center" }}>
                You’ve reached the end
              </Text>
            ) : null}
          </View>
        }
      />
    </LinearGradient>
  );
}
