import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from "@/services/market/categories";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type Mode = "product" | "service";

function Pill({
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

export default function CategoryPicker() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();

  const initialMode: Mode = params?.mode === "service" ? "service" : "product";
  const [mode, setMode] = useState<Mode>(initialMode);

  const list = useMemo(() => {
    return mode === "product" ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES;
  }, [mode]);

  function open(slug: string) {
    router.push(`/market/category/${slug}` as any);
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        flex: 1,
        paddingTop: Math.max(insets.top, 14),
        paddingHorizontal: 16,
      }}
    >
      <AppHeader title="Categories" subtitle="Choose what you want to browse" />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Pressable
            onPress={() => router.back()}
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
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Categories</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Choose what you want to browse
            </Text>
          </View>
        </View>

        {/* Mode toggle */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <Pill active={mode === "product"} label="Products" onPress={() => setMode("product")} />
          <Pill active={mode === "service"} label="Services" onPress={() => setMode("service")} />
        </View>

        {/* Grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {list.map((c) => (
            <Pressable
              key={c.slug}
              onPress={() => open(c.slug)}
              style={{
                width: "48%",
                minHeight: 116,
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

              <Text style={{ marginTop: 12, color: "#fff", fontWeight: "900", fontSize: 14 }}>
                {c.title}
              </Text>

              <Text style={{ marginTop: 5, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                {c.subtitle}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Hint */}
        <View
          style={{
            marginTop: 16,
            borderRadius: 20,
            padding: 14,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Tip</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", lineHeight: 18 }}>
            Products are items you deliver. Services can be remote or in-person. Tap any category to see listings.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
