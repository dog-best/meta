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

import {
  CategoryItem,
  MarketMainCategory,
  getCategoriesByMain,
} from "@/services/market/categories";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type Listing = {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  location?: string;
  main: MarketMainCategory;
  category?: string; // slug
};

function Pill({
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
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? PURPLE : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function CategoryChip({
  item,
  active,
  onPress,
}: {
  item: { slug: string; title: string; icon?: string };
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
      <Ionicons
        name={(item.icon as any) ?? "pricetag-outline"}
        size={16}
        color={active ? "#fff" : "rgba(255,255,255,0.85)"}
      />
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>{item.title}</Text>
    </Pressable>
  );
}

function ListingCard({ item }: { item: Listing }) {
  const priceText =
    item.price != null ? `${item.currency ?? "₦"}${Number(item.price).toLocaleString()}` : undefined;

  return (
    <Pressable
      onPress={() => {
        // ✅ only listings navigate
        // Change this to your actual "make order" route:
        router.push(`/market/listing/${item.id}` as any);
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
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.45)" />
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.45)", fontSize: 11 }}>No photo</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 12 }}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
          {item.title}
        </Text>

        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }} numberOfLines={1}>
            {item.location ?? (item.main === "service" ? "Service" : "Product")}
          </Text>
          {priceText ? (
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{priceText}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * ✅ Replace this with your real API call.
 * It should return listings filtered by main/category/q.
 */
async function fetchListings(params: {
  main: MarketMainCategory;
  categorySlug?: string | null;
  q?: string;
}): Promise<Listing[]> {
  // TODO: Replace with your backend:
  // return await MarketApi.listings.search(params);

  // --- mock so UI works immediately ---
  const base: Listing[] = [
    { id: "1", title: "Men’s Jacket (New)", price: 18000, currency: "₦", main: "product", category: "mens-fashion", location: "Lagos" },
    { id: "2", title: "Women’s Handbag", price: 24000, currency: "₦", main: "product", category: "womens-fashion", location: "Abuja" },
    { id: "3", title: "Gaming Pad", price: 9000, currency: "₦", main: "product", category: "gaming", location: "Ibadan" },
    { id: "4", title: "Plumber (Home visit)", price: 12000, currency: "₦", main: "service", category: "repairs-maintenance", location: "PH" },
    { id: "5", title: "Logo Design", price: 15000, currency: "₦", main: "service", category: "graphics-branding", location: "Remote" },
  ];

  const term = params.q?.trim().toLowerCase();
  return base.filter((x) => {
    if (x.main !== params.main) return false;
    if (params.categorySlug && x.category !== params.categorySlug) return false;
    if (term && !x.title.toLowerCase().includes(term)) return false;
    return true;
  });
}

export default function MarketHome() {
  const [main, setMain] = useState<MarketMainCategory>("product");
  const [q, setQ] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Listing[]>([]);

  const categories = useMemo<CategoryItem[]>(() => getCategoriesByMain(main), [main]);

  // when switching product/service, reset category selection
  useEffect(() => {
    setSelectedCategorySlug(null);
  }, [main]);

  // fetch listings (debounced-ish)
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await fetchListings({
            main,
            categorySlug: selectedCategorySlug,
            q,
          });
          if (alive) setItems(res);
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [main, selectedCategorySlug, q]);

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => <ListingCard item={item} />}
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

            {/* ✅ Product / Service side-by-side */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pill label="Product" active={main === "product"} onPress={() => setMain("product")} />
              <Pill label="Service" active={main === "service"} onPress={() => setMain("service")} />
            </View>

            {/* ✅ Categories side-by-side (horizontal row). Click -> show listings below (no routing). */}
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
                    item={{ slug: "__all__", title: "All", icon: "apps-outline" }}
                    active={!selectedCategorySlug}
                    onPress={() => setSelectedCategorySlug(null)}
                  />
                  {categories.map((c) => (
                    <CategoryChip
                      key={c.slug}
                      item={{ slug: c.slug, title: c.title, icon: c.icon }}
                      active={selectedCategorySlug === c.slug}
                      onPress={() => setSelectedCategorySlug(c.slug)}
                    />
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Listings header */}
            <View style={{ marginTop: 16, marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                Listings
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 }}>
                {selectedCategorySlug
                  ? `Showing ${categories.find((c) => c.slug === selectedCategorySlug)?.title ?? "selected"}`
                  : "Showing all"}
              </Text>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.6)" }}>Loading listings…</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View
              style={{
                borderRadius: 22,
                padding: 16,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>No listings found</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 6, fontSize: 12 }}>
                Try another category or change your search.
              </Text>

              <Pressable
                onPress={() => {
                  setSelectedCategorySlug(null);
                  setQ("");
                }}
                style={{
                  marginTop: 12,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: PURPLE,
                  alignItems: "center",
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
