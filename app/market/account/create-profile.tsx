import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { uploadToBucket, upsertSellerProfile } from "@/services/market/marketService";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

export default function CreateMarketProfile() {
  const [businessName, setBusinessName] = useState("");
  const [marketUsername, setMarketUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [locationText, setLocationText] = useState("");

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  async function pickImage(setter: (u: string) => void) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to upload images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) setter(result.assets[0].uri);
  }

  async function onSave() {
    if (!businessName.trim()) {
      Alert.alert("Missing info", "Business name is required.");
      return;
    }

    setLoading(true);
    try {
      let logo_path: string | null = null;
      let banner_path: string | null = null;

      // Upload logo/banner if chosen
      if (logoUri) {
        const path = `logos/${crypto.randomUUID()}.jpg`;
        const up = await uploadToBucket({
          bucket: "market-sellers",
          path,
          uri: logoUri,
          contentType: "image/jpeg",
        });
        logo_path = up.storagePath;
      }

      if (bannerUri) {
        const path = `banners/${crypto.randomUUID()}.jpg`;
        const up = await uploadToBucket({
          bucket: "market-sellers",
          path,
          uri: bannerUri,
          contentType: "image/jpeg",
        });
        banner_path = up.storagePath;
      }

      await upsertSellerProfile({
        business_name: businessName.trim(),
        market_username: marketUsername.trim() || null,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        phone: phone.trim() || null,
        location_text: locationText.trim() || null,
        logo_path,
        banner_path,
        offers_remote: false,
        offers_in_person: false,
      });

      Alert.alert("Done", "Market profile created.");
      router.replace("/market/(tabs)/sell");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not save profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
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
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Create Market Profile</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 4, fontSize: 12 }}>
              Needed before you can sell.
            </Text>
          </View>
        </View>

        <Card>
          <Label>Business name *</Label>
          <Input value={businessName} onChangeText={setBusinessName} placeholder="e.g. Zee Phones Lagos" />

          <Label>Market username (optional)</Label>
          <Input value={marketUsername} onChangeText={setMarketUsername} placeholder="e.g. zeephones" autoCapitalize="none" />

          <Label>Display name (optional)</Label>
          <Input value={displayName} onChangeText={setDisplayName} placeholder="e.g. Zeekay" />

          <Label>Phone (optional)</Label>
          <Input value={phone} onChangeText={setPhone} placeholder="080..." keyboardType="phone-pad" />

          <Label>Location (optional)</Label>
          <Input value={locationText} onChangeText={setLocationText} placeholder="e.g. Ikeja, Lagos" />

          <Label>Bio (optional)</Label>
          <Input value={bio} onChangeText={setBio} placeholder="What do you sell / offer?" multiline />
        </Card>

        <Card>
          <Text style={{ color: "#fff", fontWeight: "900", marginBottom: 10 }}>Brand Images</Text>

          <Pressable onPress={() => pickImage((u) => setLogoUri(u))} style={Btn}>
            <Ionicons name="image-outline" size={18} color="#fff" />
            <Text style={BtnText}>{logoUri ? "Change logo" : "Upload logo"}</Text>
          </Pressable>

          <Pressable onPress={() => pickImage((u) => setBannerUri(u))} style={Btn}>
            <Ionicons name="image-outline" size={18} color="#fff" />
            <Text style={BtnText}>{bannerUri ? "Change banner" : "Upload banner"}</Text>
          </Pressable>

          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            Logo and banner are optional for MVP. You can add later in Account.
          </Text>
        </Card>

        <Pressable
          disabled={loading}
          onPress={onSave}
          style={{
            marginTop: 14,
            borderRadius: 18,
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: PURPLE,
            borderWidth: 1,
            borderColor: PURPLE,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? <ActivityIndicator /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Save & Continue</Text>}
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

function Card({ children }: any) {
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 22,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </View>
  );
}

function Label({ children }: any) {
  return <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800", marginTop: 10, fontSize: 12 }}>{children}</Text>;
}

function Input(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="rgba(255,255,255,0.35)"
      style={{
        marginTop: 8,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: "#fff",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    />
  );
}

const Btn = {
  height: 50,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  flexDirection: "row" as const,
  gap: 10,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  marginTop: 10,
};

const BtnText = { color: "#fff", fontWeight: "900" as const };
