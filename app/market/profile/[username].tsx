import { supabase } from "@/services/supabase";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

export default function PublicSellerProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const u = String(username || "").toLowerCase();

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("user_id,username,display_name,business_name,bio,logo_url,banner_url,verified_badge")
        .eq("username", u)
        .maybeSingle();

      if (mounted) {
        setProfile(error ? null : data);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [username]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
        <Text className="mt-2 text-gray-600">Loading…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-xl font-bold">Seller not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-2xl bg-black px-6 py-3">
          <Text className="text-white font-semibold">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="h-44 bg-gray-100">
        {profile.banner_url ? <Image source={{ uri: profile.banner_url }} className="h-44 w-full" /> : null}
      </View>

      <View className="px-4 -mt-8">
        <View className="flex-row items-end gap-3">
          <View className="h-20 w-20 rounded-3xl bg-gray-200 overflow-hidden border-2 border-white">
            {profile.logo_url ? <Image source={{ uri: profile.logo_url }} className="h-20 w-20" /> : null}
          </View>
          <View className="pb-2">
            <Text className="text-xl font-bold">
              {profile.business_name || profile.display_name || "Seller"}
              {profile.verified_badge ? " ✅" : ""}
            </Text>
            <Text className="text-gray-600">@{profile.username}</Text>
          </View>
        </View>

        <View className="mt-4 rounded-2xl border border-gray-200 p-4">
          <Text className="font-semibold">About</Text>
          <Text className="mt-2 text-gray-600">{profile.bio || "No bio yet."}</Text>
        </View>

        <Pressable
          onPress={() => router.push("/market/(tabs)")}
          className="mt-4 rounded-2xl bg-black py-3 items-center"
        >
          <Text className="text-white font-semibold">Back to Market</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
