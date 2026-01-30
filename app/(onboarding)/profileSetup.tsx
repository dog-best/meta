// app/(onboarding)/profileSetup.tsx
// app/(onboarding)/profileSetup.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { uploadToSupabaseStorage } from "@/services/market/storageUpload";
import { supabase } from "@/services/supabase";

/* ---------- Expo Router Wrapper ---------- */
export default function ProfileSetup() {
  return <ProfileSetupScreen />;
}

/* ---------- Screen Implementation ---------- */
function ProfileSetupScreen() {
  const router = useRouter();

  /* ------------------------------------------------------------------
     STATE (UNCHANGED LOGIC)
  ------------------------------------------------------------------ */
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  /* ------------------------------------------------------------------
     REFERRAL CODE (DISPLAY ONLY)
  ------------------------------------------------------------------ */
  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  useEffect(() => {
    setReferralCode(generateReferralCode());
  }, []);

  /* ------------------------------------------------------------------
     PICK AVATAR
  ------------------------------------------------------------------ */
  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow photo access to upload images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        setAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn("Pick avatar error:", err?.message ?? err);
    }
  };

  /* ------------------------------------------------------------------
     UPLOAD AVATAR (UNCHANGED)
  ------------------------------------------------------------------ */
  const uploadAvatar = async (userId: string) => {
    if (!avatar) return null;

    try {
      const ext = avatar.split(".").pop() || "jpg";
      const filePath = `avatars/${userId}.${ext}`;

      const upload = await uploadToSupabaseStorage({
        bucket: "avatars",
        path: filePath,
        localUri: avatar,
        contentType: "image/jpeg",
      });

      return upload.publicUrl;
    } catch (e) {
      console.warn("Avatar upload failed:", e);
      return null;
    }
  };

  /* ------------------------------------------------------------------
     SAVE PROFILE + COMPLETE ONBOARDING (UNCHANGED)
  ------------------------------------------------------------------ */
  const saveProfile = async () => {
    if (loading) return;

    if (!username.trim()) {
      Alert.alert("Error", "Username is required");
      return;
    }

    setLoading(true);
    console.log("[ProfileSetup] submit start");

    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        throw new Error("User not authenticated");
      }

      const user = data.user;

      let avatarUrl: string | null = null;
      if (avatar) {
        avatarUrl = await uploadAvatar(user.id);
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim(),
          avatar_url: avatarUrl,
          referred_by: referredBy.trim() || null,
          has_completed_onboarding: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      router.replace("/(tabs)");

      setTimeout(() => {
        Alert.alert("Success", "Profile completed!");
      }, 300);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Profile setup failed");
    } finally {
      setLoading(false);
      console.log("[ProfileSetup] submit end");
    }
  };

  /* ------------------------------------------------------------------
     ANIMATIONS (REFINED)
  ------------------------------------------------------------------ */
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const pressIn = () =>
    Animated.spring(pressAnim, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();

  const pressOut = () =>
    Animated.spring(pressAnim, {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();

  /* ------------------------------------------------------------------
     UI
  ------------------------------------------------------------------ */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          {
            opacity: titleAnim,
            transform: [
              {
                translateY: titleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>
          This helps others recognize you on the platform
        </Text>
      </Animated.View>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardAnim,
            transform: [
              {
                translateY: cardAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Avatar */}
        <TouchableOpacity
          onPress={pickAvatar}
          activeOpacity={0.85}
          style={styles.avatarWrap}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Username */}
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Choose a unique username"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          autoCapitalize="none"
        />

        {/* Referral */}
        <Text style={styles.label}>Referral Code (Optional)</Text>
        <TextInput
          value={referredBy}
          onChangeText={setReferredBy}
          placeholder="If someone invited you"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          autoCapitalize="none"
        />

        <View style={styles.referralBox}>
          <Text style={styles.referralHint}>Your referral code</Text>
          <Text style={styles.referralCode}>{referralCode}</Text>
        </View>
      </Animated.View>

      {/* Footer */}
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: buttonAnim,
            transform: [
              {
                translateY: buttonAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
          <TouchableOpacity
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={saveProfile}
            activeOpacity={0.9}
            style={styles.primaryButton}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------
   STYLES
------------------------------------------------------------------ */

const BLUE = "#377dff";
const DARK = "#000";
const CARD = "#0b0b0b";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    justifyContent: "space-between",
  },

  header: { marginBottom: 10 },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 6 },
  subtitle: { color: "rgba(255,255,255,0.6)", fontSize: 13 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
  },

  avatarWrap: {
    alignSelf: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "600",
  },

  label: {
    color: "rgba(255,255,255,0.75)",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    color: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 14,
  },

  referralBox: {
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
  },
  referralHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  referralCode: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 1,
  },

  footer: { marginTop: 20 },

  primaryButton: {
    backgroundColor: BLUE,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
