import { supabase } from "@/services/supabase";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

type SellerProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  business_name: string | null;
  verified_badge?: boolean | null;
  logo_url?: string | null;
  banner_url?: string | null;
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
        .select("user_id,username,display_name,business_name,verified_badge,logo_url,banner_url")
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
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
        <Text className="mt-2 text-gray-600">Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-bold">Market Account</Text>
      <Text className="mt-2 text-gray-600">Manage your market profile and wallet.</Text>

      {!profile ? (
        <View className="mt-6 rounded-2xl border border-gray-200 p-4">
          <Text className="text-base font-semibold">No Market Profile</Text>
          <Text className="mt-1 text-gray-600">Create one to sell and to show a store page.</Text>
          <Pressable
            onPress={() => router.push("/market/profile/create" as any)}
            className="mt-4 rounded-2xl bg-black py-3 items-center"
          >
            <Text className="text-white font-semibold">Create Market Profile</Text>
          </Pressable>
        </View>
      ) : (
        <View className="mt-6 rounded-2xl border border-gray-200 p-4">
          <Text className="text-lg font-semibold">@{profile.username}</Text>
          <Text className="mt-1 text-gray-600">
            {profile.business_name || profile.display_name || "Your store"}
            {profile.verified_badge ? " • Verified" : ""}
          </Text>

          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={() => router.push("/market/profile/edit" as any)}
              className="flex-1 rounded-2xl border border-gray-300 py-3 items-center"
            >
              <Text className="font-semibold">Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/market/profile/${profile.username}` as any)}
              className="flex-1 rounded-2xl bg-black py-3 items-center"
            >
              <Text className="text-white font-semibold">View</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View className="mt-6 rounded-2xl border border-gray-200 p-4">
        <Text className="text-base font-semibold">Wallet</Text>
        <Text className="mt-1 text-gray-600">NGN + Crypto activity (escrow).</Text>
        <Pressable
          onPress={() => router.push("/market/wallet" as any )}
          className="mt-4 rounded-2xl bg-black py-3 items-center"
        >
          <Text className="text-white font-semibold">Open Wallet</Text>
        </Pressable>
      </View>

      <View className="mt-6 rounded-2xl border border-gray-200 p-4">
        <Text className="text-base font-semibold">Verified Seller</Text>
        <Text className="mt-1 text-gray-600">Get a badge and higher trust ranking.</Text>
        <Pressable
          onPress={() => router.push("/market/verification/apply" as any)}
          className="mt-4 rounded-2xl border border-gray-300 py-3 items-center"
        >
          <Text className="font-semibold">Apply / Check Status</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
