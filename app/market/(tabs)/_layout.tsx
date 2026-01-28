import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import {
  getCategoriesByMain,
  getCategoryTitle,
  MarketMainCategory,
  CategoryItem,
} from "@/services/market/categories";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

function Divider() {
  return <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />;
}

function DropdownShell({
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

export default function MarketHome() {
  const [q, setQ] = useState("");

  // ✅ MAIN dropdown
  const [main, setMain] = useState<MarketMainCategory>("product");
  const [mainOpen, setMainOpen] = useState(false);

  // ✅ CATEGORY dropdown depends on main
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const categories = useMemo<CategoryItem[]>(() => getCategoriesByMain(main), [main]);

  function onSearch() {
    const term = q.trim();
    if (!term) return;

    // include main + category in search (optional, but helpful)
    router.push({
      pathname: "/market/search" as any,
      params: {
        q: term,
        main,
        ...(categorySlug ? { category: categorySlug } : {}),
      },
    });
  }

  function openSelectedCategoryListings() {
    if (!categorySlug) return;
    router.push(`/market/category/${categorySlug}` as any);
  }

  const mainLabel = main === "product" ? "Product" : "Service";
  const categoryLabel = getCategoryTitle(categorySlug) ?? "All listings";

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12 }}>
          <View>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Marketplace</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 6, fontSize: 13 }}>
              Buy products • Hire services • Escrow protected
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
            onSubmitEditing={onSearch}
          />
          <Pressable
            onPress={onSearch}
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

        {/* ✅ MAIN dropdown: Product / Service */}
        <DropdownShell
          label="Select type"
          value={mainLabel}
          open={mainOpen}
          onToggle={() => {
            setMainOpen((v) => !v);
            setCategoryOpen(false);
          }}
        >
          <Pressable
            onPress={() => {
              setMain("product");
              setCategorySlug(null);
              setMainOpen(false);
            }}
            style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Product</Text>
            {main === "product" ? <Ionicons name="checkmark-circle" size={18} color={PURPLE} /> : null}
          </Pressable>
          <Divider />
          <Pressable
            onPress={() => {
              setMain("service");
              setCategorySlug(null);
              setMainOpen(false);
            }}
            style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Service</Text>
            {main === "service" ? <Ionicons name="checkmark-circle" size={18} color={PURPLE} /> : null}
          </Pressable>
        </DropdownShell>

        {/* ✅ CATEGORY dropdown: depends on main */}
        <DropdownShell
          label={`${mainLabel} category`}
          value={categoryLabel}
          open={categoryOpen}
          onToggle={() => {
            setCategoryOpen((v) => !v);
            setMainOpen(false);
          }}
        >
          {/* All */}
          <Pressable
            onPress={() => {
              setCategorySlug(null);
              setCategoryOpen(false);
            }}
            style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="apps-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>All listings</Text>
            </View>
            {!categorySlug ? <Ionicons name="checkmark-circle" size={18} color={PURPLE} /> : null}
          </Pressable>
          <Divider />

          {/* Lines list */}
          {categories.map((c) => (
            <View key={c.slug}>
              <Pressable
                onPress={() => {
                  setCategorySlug(c.slug);
                  setCategoryOpen(false);

                  // ✅ if you want immediate “populate listings” behavior
                  // send them straight to the listing page for that category:
                  router.push(`/market/category/${c.slug}` as any);
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name={c.icon as any} size={18} color="rgba(255,255,255,0.9)" />
                  <View>
                    <Text style={{ color: "#fff", fontWeight: "900" }}>{c.title}</Text>
                    <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
                      {c.subtitle}
                    </Text>
                  </View>
                </View>

                {categorySlug === c.slug ? (
                  <Ionicons name="checkmark-circle" size={18} color={PURPLE} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
                )}
              </Pressable>
              <Divider />
            </View>
          ))}
        </DropdownShell>

        {/* Optional: a button if you DON’T auto-navigate on category click */}
        {categorySlug ? (
          <Pressable
            onPress={openSelectedCategoryListings}
            style={{
              marginTop: 14,
              borderRadius: 20,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>
              View {getCategoryTitle(categorySlug)} listings
            </Text>
          </Pressable>
        ) : null}

        {/* Tip: Your Category tab grid can stay as-is and still use the same arrays. */}
      </ScrollView>
    </LinearGradient>
  );
}
