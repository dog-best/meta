import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { supabase } from "@/services/supabase";

type SellerProfile = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  is_verified: boolean;
  logo_path: string | null;
  banner_path: string | null;
  payout_tier: "standard" | "fast";
  active?: boolean;
};

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";

function publicUrl(bucket: string, path?: string | null) {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function Badge({ text, tone }: { text: string; tone: "purple" | "green" | "gray" }) {
  const map = {
    purple: { bg: "rgba(124,58,237,0.18)", bd: "rgba(124,58,237,0.40)", fg: "rgba(221,214,254,0.95)" },
    green: { bg: "rgba(34,197,94,0.14)", bd: "rgba(34,197,94,0.40)", fg: "rgba(187,247,208,0.95)" },
    gray: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)", fg: "rgba(255,255,255,0.85)" },
  }[tone];

  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: map.bg, borderWidth: 1, borderColor: map.bd }}>
      <Text style={{ color: map.fg, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function CardBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12, borderRadius: 22, padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
      {children}
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  onPress,
  variant = "outline",
}: {
  label: string;
  icon: any;
  onPress: () => void;
  variant?: "solid" | "outline";
}) {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor: solid ? PURPLE : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: solid ? "rgba(124,58,237,0.70)" : "rgba(255,255,255,0.12)",
      }}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

export default function MarketAccountTab() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfile | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = auth?.user;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("user_id,market_username,display_name,business_name,is_verified,logo_path,banner_path,payout_tier,active")
        .eq("user_id", user.id)
        .maybeSingle();

      setProfile(error ? null : (data as any));
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const handle = useMemo(() => (profile?.market_username ? `@${profile.market_username}` : "@yourstore"), [profile?.market_username]);

  const storeName = useMemo(() => {
    const n = profile?.business_name || profile?.display_name || "Your store";
    return n;
  }, [profile?.business_name, profile?.display_name]);

  const logo = publicUrl("market-sellers", profile?.logo_path);
  const banner = publicUrl("market-sellers", profile?.banner_path);

  if (loading) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <AppHeader title="Market Account" subtitle="Manage your store profile, listings, and marketplace wallet." />
        <View style={{ marginTop: 70, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Loading…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <AppHeader title="Market Account" subtitle="Manage your store profile, listings, and marketplace wallet." />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>Market Account</Text>
          <Pressable
            onPress={load}
            style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={{ marginTop: 6, color: MUTED }}>
          Manage your store profile, listings, and marketplace wallet.
        </Text>

        {!profile ? (
          <CardBox>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(124,58,237,0.18)", borderWidth: 1, borderColor: "rgba(124,58,237,0.35)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="storefront-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>No Market Profile</Text>
                <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                  Create one to sell and get a public store page.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.push("/market/profile/create" as any)}
              style={{ marginTop: 12, borderRadius: 18, paddingVertical: 14, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: "rgba(124,58,237,0.8)" }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Create Market Profile</Text>
            </Pressable>
          </CardBox>
        ) : (
          <View style={{ marginTop: 12, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: BORDER, backgroundColor: CARD }}>
            {/* Banner */}
            <View style={{ height: 150 }}>
              {banner ? (
                <Image source={{ uri: banner }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <LinearGradient colors={["rgba(124,58,237,0.35)", "rgba(255,255,255,0.04)"]} style={{ width: "100%", height: "100%" }} />
              )}

              {/* Fade */}
              <LinearGradient
                colors={["rgba(0,0,0,0.0)", "rgba(5,4,11,0.85)"]}
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }}
              />
            </View>

            {/* Identity row */}
            <View style={{ padding: 14, marginTop: -34, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <View style={{ width: 78, height: 78, borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" }}>
                {logo ? <Image source={{ uri: logo }} style={{ width: 78, height: 78 }} /> : <Ionicons name="person-outline" size={26} color="rgba(255,255,255,0.8)" />}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{handle}</Text>
                  {profile.is_verified ? <Badge text="Verified" tone="green" /> : <Badge text="Unverified" tone="gray" />}
                  <Badge text={profile.payout_tier === "fast" ? "Fast payouts" : "Standard payouts"} tone="purple" />
                </View>

                <Text style={{ marginTop: 6, color: MUTED, fontWeight: "800" }}>{storeName}</Text>
              </View>
            </View>

            <View style={{ padding: 14, paddingTop: 2 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <ActionBtn label="Edit" icon="create-outline" onPress={() => router.push("/market/profile/edit" as any)} variant="outline" />
                <ActionBtn
                  label="View"
                  icon="eye-outline"
                  onPress={() => router.push(`/market/profile/${profile.market_username}` as any)}
                  variant="solid"
                />
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <ActionBtn label="My listings" icon="albums-outline" onPress={() => router.push("/market/my-listings" as any)} variant="outline" />
                <ActionBtn label="Wallet" icon="wallet-outline" onPress={() => router.push("/market/wallet" as any)} variant="outline" />
              </View>
            </View>
          </View>
        )}

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Verified Seller</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
            Apply for a badge and higher trust ranking.
          </Text>

          <Pressable
            onPress={() => router.push("/market/verification/apply" as any)}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Apply / Check status</Text>
          </Pressable>
        </CardBox>
      </ScrollView>
    </LinearGradient>
  );
}
