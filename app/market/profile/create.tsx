import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { uploadToSupabaseStorage } from "@/services/market/storageUpload";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";
const BUCKET_SELLERS = "market-sellers";

function cleanUsername(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function isValidUsername(u: string) {
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
  return res.assets[0];
}

async function uploadImageToBucket(params: {
  userId: string;
  kind: "logo" | "banner";
  localUri: string;
}) {
  const { userId, kind, localUri } = params;

  // Infer extension (best effort)
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const extGuess = blob.type?.split("/")?.[1] || "jpg";

  const fileName = `${kind}_${Date.now()}.${extGuess}`;
  const path = `${userId}/${kind}/${fileName}`;

  await uploadToSupabaseStorage({
    bucket: BUCKET_SELLERS,
    path,
    localUri,
    contentType: "image/jpeg",
  });

  return path;
}

type NameStatus = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

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

  // Live availability check (debounced)
  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");
  const [nameHint, setNameHint] = useState<string>("Type a username to check availability");
  const lastReq = useRef(0);

  useEffect(() => {
    // No input
    if (!marketUsername.trim()) {
      setNameStatus("idle");
      setNameHint("Type a username to check availability");
      return;
    }

    // Invalid format
    if (!usernameOk) {
      setNameStatus("invalid");
      setNameHint("Use 3–24 chars: a–z, 0–9, underscore. Start with letter/number.");
      return;
    }

    setNameStatus("checking");
    setNameHint("Checking availability…");

    const reqId = ++lastReq.current;
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("market_seller_profiles")
          .select("user_id")
          .eq("market_username", usernameClean)
          .maybeSingle();

        // Ignore old responses
        if (reqId !== lastReq.current) return;

        if (error) {
          setNameStatus("error");
          setNameHint("Could not check username. Try again.");
          return;
        }

        if (data?.user_id) {
          setNameStatus("taken");
          setNameHint("Taken — choose another username.");
        } else {
          setNameStatus("available");
          setNameHint("Available ✅");
        }
      } catch {
        if (reqId !== lastReq.current) return;
        setNameStatus("error");
        setNameHint("Could not check username. Try again.");
      }
    }, 450);

    return () => clearTimeout(t);
  }, [marketUsername, usernameClean, usernameOk]);

  const canSubmit =
    !loading &&
    usernameOk &&
    nameStatus === "available" &&
    businessName.trim().length > 0;

  async function submit() {
    if (loading) return;

    if (!usernameOk) {
      Alert.alert("Invalid username", "Use 3–24 chars: lowercase letters, numbers, underscore.");
      return;
    }

    if (nameStatus !== "available") {
      Alert.alert("Username not available", "Choose an available username before creating.");
      return;
    }

    if (!businessName.trim()) {
      Alert.alert("Business name required", "Add your business/store name.");
      return;
    }

    setLoading(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw new Error(authErr.message);
      const user = auth?.user;
      if (!user) throw new Error("You are not logged in");

      // Already exists?
      const { data: existing, error: exErr } = await supabase
        .from("market_seller_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (exErr) throw new Error(exErr.message);

      if (existing?.user_id) {
        Alert.alert("Profile exists", "You already have a market profile. Redirecting…");
        router.replace("/market/(tabs)/account" as any);
        return;
      }

      // Upload images (optional)
      let logo_path: string | null = null;
      let banner_path: string | null = null;

      if (logoUri) {
        logo_path = await uploadImageToBucket({ userId: user.id, kind: "logo", localUri: logoUri });
      }
      if (bannerUri) {
        banner_path = await uploadImageToBucket({ userId: user.id, kind: "banner", localUri: bannerUri });
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
      });

      if (insErr) {
        // Nice error for duplicates (race condition)
        if ((insErr as any).code === "23505") {
          throw new Error("Username already taken. Please choose another one.");
        }
        throw new Error(insErr.message);
      }

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
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: BORDER,
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
            <Text style={{ color: MUTED, marginTop: 4, fontSize: 12 }}>
              Set up your store page. Username is public.
            </Text>
          </View>
        </View>

        {/* Banner + Logo card */}
        <View
          style={{
            borderRadius: 22,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: BORDER,
            backgroundColor: CARD,
          }}
        >
          <Pressable
            onPress={async () => {
              const a = await pickImage();
              if (a?.uri) setBannerUri(a.uri);
            }}
            style={{ height: 150, alignItems: "center", justifyContent: "center" }}
          >
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <View style={{ alignItems: "center" }}>
                <Ionicons name="images-outline" size={26} color="rgba(255,255,255,0.70)" />
                <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.75)", fontWeight: "900" }}>
                  Tap to add banner (optional)
                </Text>
                <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                  This appears at the top of your store page
                </Text>
              </View>
            )}
          </Pressable>

          <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={async () => {
                const a = await pickImage();
                if (a?.uri) setLogoUri(a.uri);
              }}
              style={{
                width: 76,
                height: 76,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={{ width: 76, height: 76 }} />
              ) : (
                <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.70)" />
              )}
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Logo (optional)</Text>
              <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                Buyers recognize you faster with a logo.
              </Text>
            </View>
          </View>
        </View>

        {/* Form */}
        <View style={{ marginTop: 12, gap: 10 }}>
          <Field
            label="Username"
            hint="Lowercase, no spaces. We'll check availability automatically."
            value={marketUsername}
            onChangeText={setMarketUsername}
            autoCapitalize="none"
            icon="at-outline"
            placeholder="e.g. bestcity_store"
            right={
              <UsernameBadge status={nameStatus} />
            }
          />

          <View style={{ marginTop: -6, paddingHorizontal: 2 }}>
            <Text style={{ color: MUTED, fontSize: 12 }}>
              Your handle:{" "}
              <Text style={{ color: "#C4B5FD", fontWeight: "900" }}>
                @{usernameClean || "yourstore"}
              </Text>
              {"  "}•{" "}
              <Text style={{ color: nameStatus === "taken" || nameStatus === "invalid" ? "#FCA5A5" : MUTED, fontWeight: "800" }}>
                {nameHint}
              </Text>
            </Text>
          </View>

          <Field
            label="Business name"
            hint="What customers will see as your store name"
            value={businessName}
            onChangeText={setBusinessName}
            icon="storefront-outline"
            placeholder="e.g. Best City Electronics"
          />

          <Field
            label="Display name (optional)"
            hint="Your personal name (optional)"
            value={displayName}
            onChangeText={setDisplayName}
            icon="person-outline"
            placeholder="e.g. Ayo"
          />

          <Field
            label="Phone (optional)"
            hint="For customer contact (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            icon="call-outline"
            placeholder="+234..."
          />

          <Field
            label="Location (optional)"
            hint="Helps buyers understand where you operate"
            value={locationText}
            onChangeText={setLocationText}
            icon="location-outline"
            placeholder="Lagos, Abuja..."
          />

          <Field
            label="Bio (optional)"
            hint="Briefly describe what you sell / offer"
            value={bio}
            onChangeText={setBio}
            multiline
            icon="document-text-outline"
            placeholder="We sell phones, accessories, and repairs…"
          />

          {/* Service toggles */}
          <View
            style={{
              borderRadius: 22,
              padding: 14,
              borderWidth: 1,
              borderColor: BORDER,
              backgroundColor: CARD,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Service options (optional)</Text>
            <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
              If you offer services, choose how you deliver them.
            </Text>

            <ToggleRow label="Remote service" value={offersRemote} onToggle={() => setOffersRemote((v) => !v)} />
            <ToggleRow label="In-person service" value={offersInPerson} onToggle={() => setOffersInPerson((v) => !v)} />
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={{
              marginTop: 4,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
              opacity: canSubmit ? 1 : 0.55,
            }}
          >
            {loading ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "900" }}>Creating…</Text>
              </View>
            ) : (
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                Create Profile
              </Text>
            )}
          </Pressable>

          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18 }}>
            Tip: pick a simple username — buyers will search it. Verification comes later.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function UsernameBadge({ status }: { status: NameStatus }) {
  const base = {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  } as const;

  if (status === "checking") {
    return (
      <View style={{ ...base, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.06)", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Checking</Text>
      </View>
    );
  }

  const map: Record<string, { text: string; icon: any; border: string; bg: string; color: string }> = {
    available: { text: "Available", icon: "checkmark-circle-outline", border: "rgba(34,197,94,0.55)", bg: "rgba(34,197,94,0.12)", color: "rgba(187,247,208,0.95)" },
    taken: { text: "Taken", icon: "close-circle-outline", border: "rgba(239,68,68,0.55)", bg: "rgba(239,68,68,0.10)", color: "rgba(254,202,202,0.95)" },
    invalid: { text: "Invalid", icon: "alert-circle-outline", border: "rgba(251,191,36,0.55)", bg: "rgba(251,191,36,0.10)", color: "rgba(254,243,199,0.95)" },
    error: { text: "Error", icon: "warning-outline", border: "rgba(255,255,255,0.22)", bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)" },
    idle: { text: "Type", icon: "pencil-outline", border: "rgba(255,255,255,0.18)", bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" },
  };

  const v = map[status] ?? map.idle;

  return (
    <View style={{ ...base, borderColor: v.border, backgroundColor: v.bg, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name={v.icon} size={16} color={v.color} />
      <Text style={{ color: v.color, fontWeight: "900", fontSize: 12 }}>{v.text}</Text>
    </View>
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
  icon?: any;
  placeholder?: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          {props.icon ? (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={props.icon} size={18} color="rgba(255,255,255,0.85)" />
            </View>
          ) : null}

          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>{props.label}</Text>
            {!!props.hint && (
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                {props.hint}
              </Text>
            )}
          </View>
        </View>

        {props.right ? props.right : null}
      </View>

      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? ""}
        placeholderTextColor="rgba(255,255,255,0.35)"
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? "sentences"}
        style={{
          marginTop: 10,
          color: "#fff",
          fontWeight: "800",
          fontSize: 14,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          minHeight: props.multiline ? 92 : undefined,
          textAlignVertical: props.multiline ? "top" : "auto",
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
