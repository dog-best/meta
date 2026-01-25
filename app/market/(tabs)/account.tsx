import { supabase } from "@/services/supabase";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

type SellerProfile = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  is_verified: boolean;
  logo_path: string | null;
  banner_path: string | null;
  payout_tier: "standard" | "fast";
};

export default function MarketAccountTab() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        if (mounted) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("user_id,market_username,display_name,business_name,is_verified,logo_path,banner_path,payout_tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mounted) {
        setProfile(error ? null : (data as any));
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "rgba(0,0,0,0.6)" }}>Loading…</Text>
      </View>
    );
  }

  const handle = profile?.market_username ? `@${profile.market_username}` : "@yourstore";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Market Account</Text>
      <Text style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
        Manage your store profile and marketplace wallet.
      </Text>

      {!profile ? (
        <View style={{ marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", padding: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: "900" }}>No Market Profile</Text>
          <Text style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
            Create one to sell and get a public store page.
          </Text>

          <Pressable
            onPress={() => router.push("/market/profile/create" as any)}
            style={{
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: "#111",
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Create Market Profile</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", padding: 14 }}>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>{handle}</Text>
          <Text style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
            {(profile.business_name || profile.display_name || "Your store") +
              (profile.is_verified ? " • Verified" : "")}
          </Text>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/market/profile/edit" as any)}
              style={{
                flex: 1,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.15)",
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "900" }}>Edit</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push(`/market/profile/${profile.market_username}` as any)}
              style={{
                flex: 1,
                borderRadius: 16,
                backgroundColor: "#111",
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>View</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", padding: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: "900" }}>Wallet</Text>
        <Text style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
          Marketplace escrow activity (NGN + Crypto).
        </Text>
        <Pressable
          onPress={() => router.push("/market/wallet" as any)}
          style={{
            marginTop: 12,
            borderRadius: 16,
            backgroundColor: "#111",
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Open Wallet</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 16, borderRadius: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", padding: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: "900" }}>Verified Seller</Text>
        <Text style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
          Apply for a badge and higher trust ranking.
        </Text>
        <Pressable
          onPress={() => router.push("/market/verification/apply" as any)}
          style={{
            marginTop: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.15)",
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "900" }}>Apply / Check Status</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
