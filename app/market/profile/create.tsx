import { uploadImageToSupabase } from "@/services/market/storageUpload";
import { supabase } from "@/services/supabase";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function CreateMarketProfile() {
  const [submitting, setSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  const cleanUsername = useMemo(() => username.trim().toLowerCase().replace(/\s+/g, ""), [username]);

  async function pickImage(setter: (v: string) => void) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload images.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (!res.canceled && res.assets?.[0]?.uri) {
      setter(res.assets[0].uri);
    }
  }

  async function checkUsernameAvailable(u: string) {
    const { data, error } = await supabase
      .from("market_seller_profiles")
      .select("username")
      .ilike("username", u)
      .maybeSingle();
    if (error) return true; // fail open for MVP
    return !data;
  }

  async function onSubmit() {
    const u = cleanUsername;

    if (!u || u.length < 3) return Alert.alert("Fix username", "Username must be at least 3 characters.");
    if (!/^[a-z0-9_]+$/.test(u)) return Alert.alert("Fix username", "Only letters, numbers and underscore allowed.");
    if (!displayName.trim()) return Alert.alert("Missing name", "Display name is required.");

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not logged in");

      // Check username availability
      const ok = await checkUsernameAvailable(u);
      if (!ok) throw new Error("Username already taken. Try another.");

      // Upload images (optional)
      let logo_url: string | null = null;
      let banner_url: string | null = null;

      if (logoUri) {
        logo_url = await uploadImageToSupabase({
          bucket: "market-sellers",
          path: `${user.id}/logo-${Date.now()}.jpg`,
          localUri: logoUri,
        });
      }

      if (bannerUri) {
        banner_url = await uploadImageToSupabase({
          bucket: "market-sellers",
          path: `${user.id}/banner-${Date.now()}.jpg`,
          localUri: bannerUri,
        });
      }

      // Create profile row
      const { error } = await supabase.from("market_seller_profiles").insert({
        user_id: user.id,
        username: u,
        display_name: displayName.trim(),
        business_name: businessName.trim() || null,
        bio: bio.trim() || null,
        logo_url,
        banner_url,
      });

      if (error) throw new Error(error.message);

      router.replace("/market/(tabs)/sell");
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not create profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-bold">Create Market Profile</Text>
      <Text className="mt-2 text-gray-600">Set up your public store profile for selling.</Text>

      <View className="mt-6 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Logo</Text>
        <Text className="text-gray-600 mt-1">Square image works best.</Text>

        <View className="mt-3 flex-row items-center gap-12">
          <View className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden items-center justify-center">
            {logoUri ? <Image source={{ uri: logoUri }} className="h-16 w-16" /> : <Text className="text-gray-400">+</Text>}
          </View>
          <Pressable
            onPress={() => pickImage((u) => setLogoUri(u))}
            className="rounded-2xl border border-gray-300 px-4 py-3"
          >
            <Text className="font-semibold">Upload Logo</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Banner</Text>
        <Text className="text-gray-600 mt-1">Wide image recommended.</Text>

        <View className="mt-3">
          <View className="h-28 rounded-2xl bg-gray-100 overflow-hidden items-center justify-center">
            {bannerUri ? <Image source={{ uri: bannerUri }} className="h-28 w-full" /> : <Text className="text-gray-400">+</Text>}
          </View>

          <Pressable
            onPress={() => pickImage((u) => setBannerUri(u))}
            className="mt-3 rounded-2xl border border-gray-300 px-4 py-3 items-center"
          >
            <Text className="font-semibold">Upload Banner</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Username</Text>
        <Text className="text-gray-600 mt-1">Public handle (e.g. bestcity_store)</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="username"
          className="mt-2 rounded-2xl border border-gray-300 px-4 py-3"
        />
        <Text className="mt-2 text-gray-500">Preview: @{cleanUsername || "username"}</Text>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name or store name"
          className="mt-2 rounded-2xl border border-gray-300 px-4 py-3"
        />
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Business name (optional)</Text>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Ade’s Fashion House"
          className="mt-2 rounded-2xl border border-gray-300 px-4 py-3"
        />
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Bio (optional)</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Tell buyers what you sell or offer"
          multiline
          className="mt-2 rounded-2xl border border-gray-300 px-4 py-3"
          style={{ minHeight: 90, textAlignVertical: "top" }}
        />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        className={`mt-6 rounded-2xl py-4 items-center ${submitting ? "bg-gray-300" : "bg-black"}`}
      >
        {submitting ? <ActivityIndicator color="#000" /> : <Text className="text-white font-semibold">Create Profile</Text>}
      </Pressable>

      <Pressable onPress={() => router.back()} className="mt-3 py-3 items-center">
        <Text className="text-gray-600">Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
