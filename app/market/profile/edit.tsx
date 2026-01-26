import { uploadToBucket } from "@/services/market/marketService";
import { supabase } from "@/services/supabase";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function EditMarketProfile() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState<string | null>(null);

  const cleanUsername = useMemo(() => username.trim().toLowerCase().replace(/\s+/g, ""), [username]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("market_seller_profiles")
        .select("market_username,display_name,business_name,bio,logo_path,banner_path")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mounted) {
        if (error || !data) {
          setLoading(false);
          Alert.alert("No profile", "Create your market profile first.");
          router.replace("/market/profile/create" as any);

          return;
        }
        setUsername(data.market_username || "");
        setDisplayName(data.display_name || "");
        setBusinessName(data.business_name || "");
        setBio(data.bio || "");
        setLogoPath(data.logo_path || null);
        setBannerPath(data.banner_path || null);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  async function onSave() {
    const u = cleanUsername;
    if (!u || u.length < 3) return Alert.alert("Fix username", "Username must be at least 3 characters.");
    if (!/^[a-z0-9_]+$/.test(u)) return Alert.alert("Fix username", "Only letters, numbers and underscore allowed.");
    if (!displayName.trim()) return Alert.alert("Missing name", "Display name is required.");
    if (!businessName.trim()) return Alert.alert("Missing name", "Business name is required.");

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not logged in");

      let nextLogo = logoPath;
      let nextBanner = bannerPath;

      if (logoUri) {
        const up = await uploadToBucket({
          bucket: "market-sellers",
          path: `${user.id}/logo-${Date.now()}.jpg`,
          uri: logoUri,
          contentType: "image/jpeg",
        });
        nextLogo = up.storagePath;
      }

      if (bannerUri) {
        const up = await uploadToBucket({
          bucket: "market-sellers",
          path: `${user.id}/banner-${Date.now()}.jpg`,
          uri: bannerUri,
          contentType: "image/jpeg",
        });
        nextBanner = up.storagePath;
      }

      const { error } = await supabase
        .from("market_seller_profiles")
        .update({
          market_username: u,
          display_name: displayName.trim(),
          business_name: businessName.trim(),
          bio: bio.trim() || null,
          logo_path: nextLogo,
          banner_path: nextBanner,
        })
        .eq("user_id", user.id);

      if (error) throw new Error(error.message);

      Alert.alert("Saved", "Profile updated.");
      router.back();
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not save profile");
    } finally {
      setSubmitting(false);
    }
  }

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
      <Text className="text-2xl font-bold">Edit Market Profile</Text>

      <View className="mt-6 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Logo</Text>
        <View className="mt-3 flex-row items-center gap-12">
          <View className="h-16 w-16 rounded-2xl bg-gray-100 overflow-hidden items-center justify-center">
            {logoUri ? (
              <Image source={{ uri: logoUri }} className="h-16 w-16" />
            ) : logoPath ? (
              <Image source={{ uri: supabase.storage.from("market-sellers").getPublicUrl(logoPath).data.publicUrl }} className="h-16 w-16" />
            ) : (
              <Text className="text-gray-400">+</Text>
            )}
          </View>
          <Pressable onPress={() => pickImage((u) => setLogoUri(u))} className="rounded-2xl border border-gray-300 px-4 py-3">
            <Text className="font-semibold">Change Logo</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Banner</Text>
        <View className="mt-3">
          <View className="h-28 rounded-2xl bg-gray-100 overflow-hidden items-center justify-center">
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} className="h-28 w-full" />
            ) : bannerPath ? (
              <Image source={{ uri: supabase.storage.from("market-sellers").getPublicUrl(bannerPath).data.publicUrl }} className="h-28 w-full" />
            ) : (
              <Text className="text-gray-400">+</Text>
            )}
          </View>

          <Pressable onPress={() => pickImage((u) => setBannerUri(u))} className="mt-3 rounded-2xl border border-gray-300 px-4 py-3 items-center">
            <Text className="font-semibold">Change Banner</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Username</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" className="mt-2 rounded-2xl border border-gray-300 px-4 py-3" />
        <Text className="mt-2 text-gray-500">Preview: @{cleanUsername}</Text>
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Display name</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} className="mt-2 rounded-2xl border border-gray-300 px-4 py-3" />
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Business name (optional)</Text>
        <TextInput value={businessName} onChangeText={setBusinessName} className="mt-2 rounded-2xl border border-gray-300 px-4 py-3" />
      </View>

      <View className="mt-4 rounded-2xl border border-gray-200 p-4">
        <Text className="font-semibold">Bio (optional)</Text>
        <TextInput value={bio} onChangeText={setBio} multiline className="mt-2 rounded-2xl border border-gray-300 px-4 py-3" style={{ minHeight: 90, textAlignVertical: "top" }} />
      </View>

      <Pressable
        onPress={onSave}
        disabled={submitting}
        className={`mt-6 rounded-2xl py-4 items-center ${submitting ? "bg-gray-300" : "bg-black"}`}
      >
        {submitting ? <ActivityIndicator color="#000" /> : <Text className="text-white font-semibold">Save Changes</Text>}
      </Pressable>

      <Pressable onPress={() => router.back()} className="mt-3 py-3 items-center">
        <Text className="text-gray-600">Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
