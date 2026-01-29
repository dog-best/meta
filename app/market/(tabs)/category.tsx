import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from "@/services/market/categories";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

function Card({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 22,
        padding: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 18,
          backgroundColor: "rgba(124,58,237,0.25)",
          borderWidth: 1,
          borderColor: "rgba(124,58,237,0.35)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color="#fff" />
      </View>

      <Text style={{ marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 15 }}>{title}</Text>
      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function MarketHome() {
  const [q, setQ] = useState("");

  const quickProducts = useMemo(() => PRODUCT_CATEGORIES.slice(0, 6), []);
  const quickServices = useMemo(() => SERVICE_CATEGORIES.slice(0, 6), []);

  function openCategory(slug: string) {
    router.push(`/market/category/${slug}` as any);
  }

  function openCategoryPicker(mode?: "product" | "service") {
    router.push({ pathname: "/market/category" as any, params: mode ? { mode } : {} });
  }

  function onSearch() {
    const term = q.trim();
    if (!term) return;
    router.push({ pathname: "/market/search" as any, params: { q: term } });
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
      <AppHeader title="Categories" subtitle="Buy products • Hire services • Escrow protected" />
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
            placeholder="Search products or services"
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

        {/* Big entry cards */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
          <Card
            title="Browse Products"
            subtitle="Phones, fashion, groceries…"
            icon="storefront-outline"
            onPress={() => openCategoryPicker("product")}
          />
          <Card
            title="Hire Services"
            subtitle="Remote or in-person"
            icon="briefcase-outline"
            onPress={() => openCategoryPicker("service")}
          />
        </View>

        {/* Quick categories */}
        <View style={{ marginTop: 18, marginBottom: 10 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Top Product Categories</Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 }}>Tap to explore listings</Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {quickProducts.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => openCategory(c.slug)}
              style={{
                width: "48%",
                minHeight: 106,
                borderRadius: 22,
                padding: 14,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={c.icon as any} size={20} color="#fff" />
              </View>
              <Text style={{ marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 14 }}>{c.title}</Text>
              <Text style={{ marginTop: 5, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{c.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 18, marginBottom: 10 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Top Service Categories</Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 4, fontSize: 12 }}>Remote or in-person</Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {quickServices.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => openCategory(c.slug)}
              style={{
                width: "48%",
                minHeight: 106,
                borderRadius: 22,
                padding: 14,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={c.icon as any} size={20} color="#fff" />
              </View>
              <Text style={{ marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 14 }}>{c.title}</Text>
              <Text style={{ marginTop: 5, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{c.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => openCategoryPicker()}
          style={{
            marginTop: 16,
            borderRadius: 20,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>View All Categories</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
