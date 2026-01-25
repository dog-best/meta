import { supabase } from "@/services/supabase";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

type SellerProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  business_name: string | null;
  verified_badge?: boolean | null;
  logo_url?: string | null;
};

export default function SellTab() {
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
          setLoading(false);
          setProfile(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("user_id,username,display_name,business_name,verified_badge,logo_url")
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

  const title = useMemo(() => {
    if (!profile) return "Start Selling";
    return "Seller Dashboard";
  }, [profile]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
        <Text className="mt-2 text-gray-600">Loading…</Text>
      </View>
    );
  }

  // No profile → force create
  if (!profile) {
    return (
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
        <Text className="text-2xl font-bold">Create your market profile</Text>
        <Text className="mt-2 text-gray-600">
          To sell products or services, you need a market profile (logo, banner, username).
        </Text>

        <View className="mt-6 rounded-2xl border border-gray-200 p-4">
          <Text className="text-base font-semibold">What you’ll set up</Text>
          <Text className="mt-2 text-gray-600">• Username (public)</Text>
          <Text className="text-gray-600">• Display name / business name</Text>
          <Text className="text-gray-600">• Logo + banner</Text>
          <Text className="text-gray-600">• Short bio</Text>
        </View>

        <Pressable
          onPress={() => router.push("/market/profile/create" as any)}
          className="mt-6 rounded-2xl bg-black py-4 items-center"
        >
          <Text className="text-white font-semibold">Create Market Profile</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/market/verification/apply" as any)}
          className="mt-3 rounded-2xl border border-gray-300 py-4 items-center"
        >
          <Text className="text-black font-semibold">Apply for Verified Badge (optional)</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Has profile → show seller dashboard entry (we’ll build listings creation next step)
  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-bold">{title}</Text>
      <Text className="mt-2 text-gray-600">Manage your listings and sales.</Text>

      <View className="mt-6 rounded-2xl border border-gray-200 p-4">
        <Text className="text-lg font-semibold">@{profile.username}</Text>
        <Text className="mt-1 text-gray-600">
          {profile.business_name || profile.display_name || "Your store"}
          {profile.verified_badge ? " • Verified" : ""}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/market/create" as any)}
        className="mt-6 rounded-2xl bg-black py-4 items-center"
      >
        <Text className="text-white font-semibold">Create Listing</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/market/listings" as any)}
        className="mt-3 rounded-2xl border border-gray-300 py-4 items-center"
      >
        <Text className="text-black font-semibold">My Listings</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/market/profile/edit" as any)}
        className="mt-3 rounded-2xl border border-gray-300 py-4 items-center"
      >
        <Text className="text-black font-semibold">Edit Profile</Text>
      </Pressable>
    </ScrollView>
  );
}
