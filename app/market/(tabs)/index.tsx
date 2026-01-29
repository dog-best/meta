import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
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

const LISTINGS_TABLE = "market_listings";
const LISTING_IMAGES_BUCKET = "market-listings"; // adjust if your bucket differs

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
  sub_category: string | null; // slug e.g "groceries"
  created_at: string | null;
  cover?: CoverImage | null;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if ((currency ?? "").toUpperCase() === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function buildPublicFromStorage(supabaseUrl: string, storagePath?: string | null) {
  if (!storagePath) return null;
  return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${storagePath}`;
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? PURPLE : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? PURPLE : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
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
        borderColor: active ? "rgba(124,58,237,0.65)" : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(124,58,237,0.22)" : "rgba(255,255,255,0.06)",
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
    item.cover?.public_url ??
    buildPublicFromStorage(supabaseUrl, item.cover?.storage_path ?? null);

  return (
    <Pressable
      onPress={() => {
        // ✅ safest: param routing (prevents mistakes)
        router.push({ pathname: "/market/listing/[id]" as any, params: { id: item.id } });
      }}
      style={{
        flex: 1,
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        marginBottom: 12,
      }}
    >
      <View style={{ height: 140, backgroundColor: "rgba(255,255,255,0.06)" }}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.45)" />
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>No photo</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 12 }}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
          {item.title ?? "Untitled"}
        </Text>

        <Text style={{ marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 12 }}>
          {money(item.currency, item.price_amount)}
        </Text>

        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 11 }} numberOfLines={1}>
          {item.delivery_type ?? "—"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function MarketHome() {
  const insets = useSafeAreaInsets();

  const [main, setMain] = useState<MarketMainCategory>("product");
  const [q, setQ] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const categories = useMemo<CategoryItem[]>(() => getCategoriesByMain(main), [main]);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  // reset category when switching main
  useEffect(() => {
    setSelectedSlug(null);
  }, [main]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        let query = supabase
          .from(LISTINGS_TABLE)
          .select(
            `
            id,title,price_amount,currency,delivery_type,category,sub_category,created_at,
            cover:market_listing_images!market_listings_cover_image_fk(id,public_url,storage_path)
          `
          )
          .eq("is_active", true)
          .eq("category", main)
          .order("created_at", { ascending: false })
          .limit(60);

        if (selectedSlug) query = query.eq("sub_category", selectedSlug);

        const term = q.trim();
        if (term) {
          query = query.or([`title.ilike.%${term}%`, `description.ilike.%${term}%`].join(","));
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        if (alive) {
          setRows((data as any) ?? []);
          setLoading(false);
        }
      } catch (e: any) {
        if (alive) {
          setErr(e?.message || "Failed to load listings");
          setRows([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [main, selectedSlug, q]);

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <AppHeader title="Marketplace" subtitle="Browse listings • Buy or hire • Escrow protected" />
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => <ListingCard item={item} supabaseUrl={supabaseUrl} />}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 }}>
              <View>
                <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Marketplace</Text>
                <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 }}>
                  Browse listings • Buy or hire • Escrow protected
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
                placeholder="Search listings"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{ flex: 1, color: "#fff", fontWeight: "700" }}
                returnKeyType="search"
              />
              <Pressable
                onPress={() => setQ(q.trim())}
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

            {/* Product / Service side-by-side */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pill label="Products" active={main === "product"} onPress={() => setMain("product")} />
              <Pill label="Services" active={main === "service"} onPress={() => setMain("service")} />
            </View>

            {/* Categories side-by-side (chips) */}
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                {main === "product" ? "Product Categories" : "Service Categories"}
              </Text>
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                Tap a category to filter listings below
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

            {/* State */}
            {loading ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading listings…</Text>
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
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading || err ? null : (
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
              <Text style={{ color: "#fff", fontWeight: "900" }}>No listings found</Text>
              <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                Try another category or clear your search.
              </Text>
              <Pressable
                onPress={() => {
                  setSelectedSlug(null);
                  setQ("");
                }}
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
                <Text style={{ color: "#fff", fontWeight: "900" }}>Reset</Text>
              </Pressable>
            </View>
          )
        }
      />
    </LinearGradient>
  );
}
