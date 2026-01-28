import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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

import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from "@/services/market/categories";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type Mode = "product" | "service";

type MarketCategory = {
  slug: string;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: MarketCategory[]; // optional for nested dropdown (accordion)
};

type Listing = {
  id: string;
  title: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  location?: string;
  mode: Mode;
  categorySlug?: string;
  subcategorySlug?: string;
};

function Divider() {
  return <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />;
}

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

function Dropdown({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginBottom: 8 }}>
        {label}
      </Text>

      <Pressable
        onPress={onToggle}
        style={{
          borderRadius: 18,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>{value}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color="rgba(255,255,255,0.8)"
        />
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function ListingCard({ item }: { item: Listing }) {
  const priceText =
    item.price != null
      ? `${item.currency ?? "₦"}${Number(item.price).toLocaleString()}`
      : undefined;

  return (
    <Pressable
      onPress={() => router.push(`/market/listing/${item.id}` as any)}
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <View style={{ height: 160, backgroundColor: "rgba(255,255,255,0.06)" }}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="image-outline" size={34} color="rgba(255,255,255,0.45)" />
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              No photo
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: 14 }}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }} numberOfLines={1}>
          {item.title}
        </Text>

        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
            {item.location ?? (item.mode === "service" ? "Service" : "Product")}
          </Text>
          {priceText ? (
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>{priceText}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * ✅ Replace this with your real API call.
 * It should return listings filtered by mode/category/subcategory/q.
 */
async function fetchListings(params: {
  mode: Mode;
  q?: string;
  categorySlug?: string | null;
  subcategorySlug?: string | null;
}): Promise<Listing[]> {
  // --- MOCK (safe compile) ---
  // TODO: replace with your backend/service call
  // Example:
  // return await MarketApi.listings.search(params);
  const { mode, q, categorySlug, subcategorySlug } = params;

  const base: Listing[] = [
    {
      id: "1",
      title: "Men’s Jacket (New)",
      price: 18000,
      currency: "₦",
      imageUrl: "",
      location: "Lagos",
      mode: "product",
      categorySlug: "mens-wear",
    },
    {
      id: "2",
      title: "Women’s Handbag",
      price: 24000,
      currency: "₦",
      imageUrl: "",
      location: "Abuja",
      mode: "product",
      categorySlug: "womens-wear",
    },
    {
      id: "3",
      title: "Plumber (Home visit)",
      price: 12000,
      currency: "₦",
      imageUrl: "",
      location: "Port Harcourt",
      mode: "service",
      categorySlug: "home-repair",
    },
  ];

  // Filter mock data so UI behaves like real
  return base.filter((x) => {
    if (x.mode !== mode) return false;
    if (categorySlug && x.categorySlug !== categorySlug) return false;
    if (subcategorySlug && x.subcategorySlug !== subcategorySlug) return false;
    if (q && !x.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
}

export default function MarketHome() {
  const [mode, setMode] = useState<Mode>("product");

  const categories = useMemo<MarketCategory[]>(() => {
    return (mode === "product" ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES) as any;
  }, [mode]);

  // dropdown state
  const [catOpen, setCatOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // selection
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<MarketCategory | null>(null);

  // search
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // listings
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Listing[]>([]);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // reset selection when mode changes
  useEffect(() => {
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setExpanded({});
    setCatOpen(false);
  }, [mode]);

  // load listings whenever filters change
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await fetchListings({
          mode,
          q: debouncedQ || undefined,
          categorySlug: selectedSubcategory?.slug ?? selectedCategory?.slug ?? null,
          subcategorySlug: selectedSubcategory?.slug ?? null,
        });
        if (mounted) setItems(res);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mode, debouncedQ, selectedCategory?.slug, selectedSubcategory?.slug]);

  function toggleExpanded(slug: string) {
    setExpanded((p) => ({ ...p, [slug]: !p[slug] }));
  }

  function pickCategory(c: MarketCategory) {
    setSelectedCategory(c);
    setSelectedSubcategory(null);
    setCatOpen(false);
  }

  function pickSubcategory(parent: MarketCategory, child: MarketCategory) {
    setSelectedCategory(parent);
    setSelectedSubcategory(child);
    setCatOpen(false);
  }

  function modeLabel() {
    return mode === "product" ? "Product" : "Service";
  }

  function categoryLabel() {
    if (selectedSubcategory) return selectedSubcategory.title;
    if (selectedCategory) return selectedCategory.title;
    return "Select a category";
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
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

        {/* Mode selector (cleaner than dropdown, but same idea) */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Pill label="Product" active={mode === "product"} onPress={() => setMode("product")} />
          <Pill label="Service" active={mode === "service"} onPress={() => setMode("service")} />
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
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
          }}
        >
          <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.75)" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={`Search ${modeLabel().toLowerCase()} listings`}
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={{ flex: 1, color: "#fff", fontWeight: "700" }}
            returnKeyType="search"
            onSubmitEditing={() =>
              router.push({ pathname: "/market/search" as any, params: { q: q.trim() } })
            }
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: "/market/search" as any, params: { q: q.trim() } })
            }
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

        {/* Category dropdown (vertical lines + optional nested) */}
        <Dropdown
          label={`${modeLabel()} category`}
          value={categoryLabel()}
          open={catOpen}
          onToggle={() => setCatOpen((v) => !v)}
        >
          {/* Clear */}
          <Pressable
            onPress={() => {
              setSelectedCategory(null);
              setSelectedSubcategory(null);
              setCatOpen(false);
            }}
            style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", gap: 10 }}
          >
            <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={{ color: "#fff", fontWeight: "900" }}>All listings</Text>
          </Pressable>
          <Divider />

          {categories.map((c) => {
            const hasKids = Array.isArray(c.children) && c.children.length > 0;
            const isOpen = !!expanded[c.slug];
            const isPicked =
              selectedCategory?.slug === c.slug && !selectedSubcategory?.slug;

            return (
              <View key={c.slug}>
                <Pressable
                  onPress={() => {
                    if (hasKids) toggleExpanded(c.slug);
                    else pickCategory(c);
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <Ionicons
                      name={(c.icon as any) ?? (mode === "product" ? "pricetag-outline" : "briefcase-outline")}
                      size={18}
                      color="rgba(255,255,255,0.9)"
                    />
                    <View>
                      <Text style={{ color: "#fff", fontWeight: "900" }}>{c.title}</Text>
                      {c.subtitle ? (
                        <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
                          {c.subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    {isPicked ? (
                      <Ionicons name="checkmark-circle" size={18} color={PURPLE} />
                    ) : null}
                    {hasKids ? (
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color="rgba(255,255,255,0.8)"
                      />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                </Pressable>

                <Divider />

                {/* children (accordion) */}
                {hasKids && isOpen ? (
                  <View style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    {/* Option: pick parent itself */}
                    <Pressable
                      onPress={() => pickCategory(c)}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        paddingLeft: 44,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "900" }}>
                        All {c.title}
                      </Text>
                      {selectedCategory?.slug === c.slug && !selectedSubcategory ? (
                        <Ionicons name="checkmark-circle" size={18} color={PURPLE} />
                      ) : null}
                    </Pressable>
                    <Divider />

                    {c.children!.map((child) => {
                      const picked = selectedSubcategory?.slug === child.slug;
                      return (
                        <View key={child.slug}>
                          <Pressable
                            onPress={() => pickSubcategory(c, child)}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              paddingLeft: 44,
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "900" }}>{child.title}</Text>
                            {picked ? (
                              <Ionicons name="checkmark-circle" size={18} color={PURPLE} />
                            ) : (
                              <Ionicons
                                name="chevron-forward"
                                size={18}
                                color="rgba(255,255,255,0.45)"
                              />
                            )}
                          </Pressable>
                          <Divider />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Dropdown>

        {/* Listings */}
        <View style={{ marginTop: 18, marginBottom: 10 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
            {modeLabel()} listings
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 }}>
            {selectedSubcategory?.title ??
              selectedCategory?.title ??
              "Showing latest available listings"}
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.6)" }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
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
              Try selecting a different category or change your search.
            </Text>

            <Pressable
              onPress={() => {
                setSelectedCategory(null);
                setSelectedSubcategory(null);
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
              <Text style={{ color: "#fff", fontWeight: "900" }}>Reset filters</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            {items.map((it) => (
              <ListingCard key={it.id} item={it} />
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
