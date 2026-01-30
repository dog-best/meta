import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  deleted_at: string | null;

  cover_image?: ListingImage | null;
  images?: ListingImage[] | null;
};

type FilterTab = "all" | "product" | "service";
type SortBy = "newest" | "price_low" | "price_high";
type ActiveFilter = "all" | "active" | "disabled";

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
  const params = useLocalSearchParams<{
    category?: string;
    q?: string;
    seller_id?: string; // profile uuid
    mine?: string; // "1"
  }>();

  const [viewerUid, setViewerUid] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setViewerUid(data?.user?.id ?? null));
  }, []);

  const sellerIdParam = (params?.seller_id ?? "").trim() || null;
  const mineParam = params?.mine === "1";

  const isSellerView = !!sellerIdParam || mineParam;
  const resolvedSellerId = mineParam ? viewerUid : sellerIdParam; // if mine=1, use auth uid
  const isMineView = mineParam || (!!resolvedSellerId && !!viewerUid && resolvedSellerId === viewerUid);

  const initialCategory = useMemo(() => String(params?.category ?? "all"), [params?.category]);
  const initialQ = useMemo(() => String(params?.q ?? "").trim(), [params?.q]);

  const [tab, setTab] = useState<FilterTab>(
    initialCategory === "product" || initialCategory === "service" ? (initialCategory as any) : "all",
  );
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [q, setQ] = useState(initialQ);
  const debouncedQ = useDebouncedValue(q.trim(), 350);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<Listing[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const pageSize = 20;
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);

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
      // If this is "mine" view but not logged in yet
      if (mineParam && !viewerUid) {
        setErr("Please sign in to view your listings.");
        setLoading(false);
        setRows([]);
        return;
      }

      if (reset) {
        setErr(null);
        setHasMore(true);
        setPage(0);

        // don’t blank the UI if already has data
        if (rows.length === 0) setLoading(true);
        else setRefreshing(true);
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
            id,seller_id,category,sub_category,title,description,price_amount,currency,delivery_type,stock_qty,is_active,created_at,updated_at,cover_image_id,website_url,deleted_at,
            cover_image:${IMAGES_TABLE}!market_listings_cover_image_fk(*),
            images:${IMAGES_TABLE}!market_listing_images_listing_id_fkey(*)
          `,
          )
          .is("deleted_at", null);

        // Seller view: filter by seller_id
        if (isSellerView) {
          if (!resolvedSellerId) throw new Error("Seller not found.");
          query = query.eq("seller_id", resolvedSellerId);

          // Public viewing someone else: active only
          if (!isMineView) query = query.eq("is_active", true);
        } else {
          // Public feed: active only
          query = query.eq("is_active", true);
        }

        // Active filter only affects mine view (optional)
        if (isMineView) {
          if (activeFilter === "active") query = query.eq("is_active", true);
          if (activeFilter === "disabled") query = query.eq("is_active", false);
        }

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
        if (reset) {
          setLoading(false);
          setRefreshing(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [
      mineParam,
      viewerUid,
      rows.length,
      loadingMore,
      hasMore,
      page,
      buildSort,
      isSellerView,
      resolvedSellerId,
      isMineView,
      activeFilter,
      tab,
      debouncedQ,
    ],
  );

  useEffect(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    fetchPage(true);
  }, [fetchPage]);

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

  const rpcToggleActive = useCallback(
    async (listing: Listing, nextActive: boolean) => {
      if (!isMineView) return;

      const title = nextActive ? "Enable listing?" : "Disable listing?";
      const msg = nextActive
        ? "This will make your listing visible to buyers again."
        : "This will hide your listing from buyers. This is blocked if there are pending/active orders.";

      Alert.alert(title, msg, [
        { text: "Cancel", style: "cancel" },
        {
          text: nextActive ? "Enable" : "Disable",
          style: "default",
          onPress: async () => {
            try {
              setBusyId(listing.id);
              const { data, error } = await supabase.rpc("market_set_listing_active", {
                p_listing_id: listing.id,
                p_is_active: nextActive,
              });
              if (error) throw new Error(error.message);

              setRows((prev) =>
                prev.map((r) => (r.id === listing.id ? { ...r, is_active: (data as any).is_active } : r)),
              );
            } catch (e: any) {
              Alert.alert("Action blocked", e?.message ?? "Failed");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [isMineView],
  );

  const rpcDelete = useCallback(
    async (listing: Listing) => {
      if (!isMineView) return;

      Alert.alert(
        "Delete listing?",
        "This removes it from your store. Allowed only if there are NO orders ever on this listing. To change price/details, delete and create a new listing.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setBusyId(listing.id);
                const { error } = await supabase.rpc("market_delete_listing", {
                  p_listing_id: listing.id,
                });
                if (error) throw new Error(error.message);

                setRows((prev) => prev.filter((r) => r.id !== listing.id));
              } catch (e: any) {
                Alert.alert("Action blocked", e?.message ?? "Failed");
              } finally {
                setBusyId(null);
              }
            },
          },
        ],
      );
    },
    [isMineView],
  );

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

    const ActivePill = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
      <Pressable
        onPress={onPress}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 16,
          backgroundColor: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: active ? "rgba(255,255,255,0.20)" : BORDER,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
      </Pressable>
    );

    const title = mineParam ? "My Listings" : sellerIdParam ? "Listings" : "Listings";

    return (
      <View style={{ paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
        <AppHeader title={title} subtitle="Browse products and services" />

        {isMineView ? (
          <View style={{ marginTop: 10, borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>No edits allowed</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.70)" }}>
              To change price/details, delete the listing and create a new one.
            </Text>
          </View>
        ) : null}

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

        {isMineView ? (
          <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <ActivePill active={activeFilter === "all"} label="All" onPress={() => setActiveFilter("all")} />
            <ActivePill active={activeFilter === "active"} label="Active" onPress={() => setActiveFilter("active")} />
            <ActivePill active={activeFilter === "disabled"} label="Disabled" onPress={() => setActiveFilter("disabled")} />
          </View>
        ) : null}

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
  }, [
    insets.top,
    q,
    tab,
    sortBy,
    activeFilter,
    err,
    fetchPage,
    onSearchSubmit,
    isMineView,
    mineParam,
    sellerIdParam,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const cover = pickCoverUrl(item, supabaseUrl);
      const busy = busyId === item.id;

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

            {!item.is_active ? (
              <View style={{ position: "absolute", top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>Disabled</Text>
              </View>
            ) : null}

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

            {isMineView ? (
              <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
                <Pressable
                  disabled={busy}
                  onPress={() => rpcToggleActive(item, !item.is_active)}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: item.is_active ? "rgba(255,255,255,0.08)" : PURPLE,
                    borderWidth: 1,
                    borderColor: item.is_active ? "rgba(255,255,255,0.12)" : PURPLE,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                      {item.is_active ? "Disable" : "Enable"}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  disabled={busy}
                  onPress={() => rpcDelete(item)}
                  style={{
                    width: 44,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,80,80,0.35)",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [supabaseUrl, isMineView, rpcToggleActive, rpcDelete, busyId],
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
