import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

const BUCKET_SELLERS = "market-sellers"; // ✅ your bucket name

function cleanUsername(input: string) {
  // lowercase, trim, replace spaces with underscore, remove invalid chars
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function isValidUsername(u: string) {
  // must start with letter/number, allow underscore, 3-24 chars
  return /^[a-z0-9][a-z0-9_]{2,23}$/.test(u);
}

async function pickImage() {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (res.canceled) return null;
  return res.assets[0]; // { uri, width, height, ... }
}

async function uploadImageToBucket(params: {
  userId: string;
  kind: "logo" | "banner";
  localUri: string;
}) {
  const { userId, kind, localUri } = params;

  // fetch file data
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();

  // infer extension (best effort)
  const extGuess =
    (blob.type && blob.type.split("/")[1]) ? blob.type.split("/")[1] : "jpg";

  const fileName = `${kind}_${Date.now()}.${extGuess}`;
  const path = `${userId}/${kind}/${fileName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET_SELLERS)
    .upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: true,
    });

  if (upErr) throw new Error(upErr.message);

  return path;
}

export default function CreateMarketProfile() {
  const [loading, setLoading] = useState(false);

  const [marketUsername, setMarketUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [locationText, setLocationText] = useState("");

  const [offersRemote, setOffersRemote] = useState(false);
  const [offersInPerson, setOffersInPerson] = useState(false);

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  const usernameClean = useMemo(() => cleanUsername(marketUsername), [marketUsername]);
  const usernameOk = useMemo(() => isValidUsername(usernameClean), [usernameClean]);

  async function submit() {
    if (loading) return;

    if (!usernameOk) {
      Alert.alert(
        "Invalid username",
        "Use 3–24 chars: lowercase letters, numbers, underscore. No spaces."
      );
      return;
    }

    if (!businessName.trim()) {
      Alert.alert("Business name required", "Add your business/store name.");
      return;
    }

    if (!offersRemote && !offersInPerson) {
      // For product sellers, both can be false (physical product), but for services you usually want one.
      // We'll allow it but warn.
      // You can tighten later.
    }

    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("You are not logged in");

      // Check if already exists
      const { data: existing } = await supabase
        .from("market_seller_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing?.user_id) {
        Alert.alert("Profile exists", "You already have a market profile. Redirecting…");
        router.replace("/market/(tabs)/account" as any);
        return;
      }

      // Check username uniqueness
      const { data: uname } = await supabase
        .from("market_seller_profiles")
        .select("user_id")
        .eq("market_username", usernameClean)
        .maybeSingle();

      if (uname?.user_id) {
        throw new Error("That username is already taken. Try another one.");
      }

      // Upload images (optional)
      let logo_path: string | null = null;
      let banner_path: string | null = null;

      if (logoUri) {
        logo_path = await uploadImageToBucket({
          userId: user.id,
          kind: "logo",
          localUri: logoUri,
        });
      }

      if (bannerUri) {
        banner_path = await uploadImageToBucket({
          userId: user.id,
          kind: "banner",
          localUri: bannerUri,
        });
      }

      // Insert seller profile
      const { error: insErr } = await supabase.from("market_seller_profiles").insert({
        user_id: user.id,
        market_username: usernameClean,
        display_name: displayName.trim() || null,
        business_name: businessName.trim(),
        bio: bio.trim() || null,
        phone: phone.trim() || null,
        location_text: locationText.trim() || null,
        logo_path,
        banner_path,
        offers_remote: offersRemote,
        offers_in_person: offersInPerson,
        is_verified: false,
        payout_tier: "standard",
        active: true,
        // address jsonb default '{}' in DB, so we can omit
      });

      if (insErr) throw new Error(insErr.message);

      Alert.alert("Done", "Your market profile has been created.");
      router.replace("/market/(tabs)/account" as any);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not create profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
    >
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
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>
              Create Market Profile
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: 12 }}>
              This becomes your public store page.
            </Text>
          </View>
        </View>

        {/* Banner */}
        <View
          style={{
            borderRadius: 22,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        >
          <Pressable
            onPress={async () => {
              const a = await pickImage();
              if (a?.uri) setBannerUri(a.uri);
            }}
            style={{ height: 140, alignItems: "center", justifyContent: "center" }}
          >
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.65)" />
                <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                  Add banner (optional)
                </Text>
              </View>
            )}
          </Pressable>

          {/* Logo row */}
          <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={async () => {
                const a = await pickImage();
                if (a?.uri) setLogoUri(a.uri);
              }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.06)",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={{ width: 72, height: 72 }} />
              ) : (
                <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.65)" />
              )}
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Logo (optional)</Text>
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                Helps buyers recognize your store.
              </Text>
            </View>
          </View>
        </View>

        {/* Form */}
        <View style={{ marginTop: 12, gap: 10 }}>
          <Field
            label="Username"
            hint="Example: bestcity_store (no spaces)"
            value={marketUsername}
            onChangeText={setMarketUsername}
            autoCapitalize="none"
          />
          <Text style={{ marginTop: -4, color: usernameOk ? "rgba(255,255,255,0.65)" : "#FCA5A5", fontSize: 12 }}>
            Your handle will be:{" "}
            <Text style={{ fontWeight: "900", color: "#C4B5FD" }}>@{usernameClean || "yourstore"}</Text>
            {!usernameOk && usernameClean.length > 0 ? "  • Invalid username" : ""}
          </Text>

          <Field label="Business name" hint="Your store / service name" value={businessName} onChangeText={setBusinessName} />
          <Field label="Display name (optional)" hint="Your personal name" value={displayName} onChangeText={setDisplayName} />
          <Field label="Phone (optional)" hint="+234..." value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Location (optional)" hint="Lagos, Abuja..." value={locationText} onChangeText={setLocationText} />
          <Field label="Bio (optional)" hint="What you sell / offer" value={bio} onChangeText={setBio} multiline />

          {/* Service toggles (optional) */}
          <View
            style={{
              borderRadius: 22,
              padding: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Service options (optional)</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              If you offer services, choose how you deliver them.
            </Text>

            <ToggleRow label="Remote service" value={offersRemote} onToggle={() => setOffersRemote((v) => !v)} />
            <ToggleRow label="In-person service" value={offersInPerson} onToggle={() => setOffersInPerson((v) => !v)} />
          </View>

          <Pressable
            onPress={submit}
            disabled={loading}
            style={{
              marginTop: 4,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900" }}>Creating…</Text>
              </View>
            ) : (
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Create Profile</Text>
            )}
          </Pressable>

          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18 }}>
            By creating a profile, you agree to follow marketplace rules. Verified badge comes later via application.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.05)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>{props.label}</Text>
      {!!props.hint && (
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          {props.hint}
        </Text>
      )}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder=""
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        style={{
          marginTop: 10,
          color: "#fff",
          fontWeight: "800",
          fontSize: 14,
          paddingVertical: 8,
        }}
      />
    </View>
  );
}

function ToggleRow(props: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={props.onToggle}
      style={{
        marginTop: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>{props.label}</Text>
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 999,
          backgroundColor: props.value ? "rgba(124,58,237,0.65)" : "rgba(255,255,255,0.15)",
          borderWidth: 1,
          borderColor: props.value ? "rgba(124,58,237,0.85)" : "rgba(255,255,255,0.18)",
          padding: 3,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            backgroundColor: "#fff",
            alignSelf: props.value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </Pressable>
  );
}

