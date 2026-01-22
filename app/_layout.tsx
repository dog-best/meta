import { Redirect, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import "../global.css";
import { useAuth } from "../hooks/authentication/useAuth";
import { supabase } from "../supabase/client";

import * as Application from "expo-application";
import * as Linking from "expo-linking";

// AdMob
import mobileAds from "react-native-google-mobile-ads";

/* ---------------- VERSION COMPARE ---------------- */

const isOutdated = (current: string, min: string) => {
  const c = current.split(".").map(Number);
  const m = min.split(".").map(Number);

  for (let i = 0; i < Math.max(c.length, m.length); i++) {
    if ((c[i] || 0) < (m[i] || 0)) return true;
    if ((c[i] || 0) > (m[i] || 0)) return false;
  }
  return false;
};

export default function RootLayout() {
  const { user, loading } = useAuth(); // ✅ ignore onboarded completely
  const segments = useSegments();

  const [systemState, setSystemState] = useState<
    | { type: "maintenance"; message: string; eta?: string }
    | { type: "update"; message: string; url: string }
    | null
  >(null);

  const [booting, setBooting] = useState(true);

  /* ---------------- ADMOB INIT ---------------- */
  useEffect(() => {
    if (Platform.OS === "android") {
      mobileAds().initialize().catch(() => {});
    }
  }, []);

  /* ---------------- SYSTEM CONTROL CHECK ---------------- */
  useEffect(() => {
    if (__DEV__) {
      setBooting(false);
      return;
    }

    (async () => {
      try {
        const appVersion = Application.nativeApplicationVersion ?? "0.0.0";

        const { data } = await supabase
          .from("app_system_control")
          .select("*")
          .single();

        if (!data) return;

        /* 🔧 MAINTENANCE HAS TOP PRIORITY */
        if (data.maintenance_enabled) {
          setSystemState({
            type: "maintenance",
            message:
              data.maintenance_message ??
              "We are currently performing maintenance.",
            eta: data.maintenance_eta,
          });
          return;
        }

        /* 🔁 FORCE UPDATE */
        if (data.force_update && isOutdated(appVersion, data.min_version)) {
          setSystemState({
            type: "update",
            message:
              data.update_message ?? "A new version is required to continue.",
            url: data.apk_url,
          });
        }
      } catch (e) {
        console.log("System control error:", e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  /* ---------------- GLOBAL BLOCK ---------------- */

  if (booting || loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (systemState?.type === "maintenance") {
    return (
      <View style={styles.blockContainer}>
        <Text style={styles.title}>Maintenance</Text>
        <Text style={styles.message}>{systemState.message}</Text>
        {systemState.eta && (
          <Text style={styles.subText}>
            Estimated return: {systemState.eta}
          </Text>
        )}
      </View>
    );
  }

  if (systemState?.type === "update") {
    return (
      <View style={styles.blockContainer}>
        <Text style={styles.title}>Update Required</Text>
        <Text style={styles.message}>{systemState.message}</Text>

        <Pressable
          style={styles.button}
          onPress={() => Linking.openURL(systemState.url)}
        >
          <Text style={styles.buttonText}>Update Now</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- ROUTING (NO ONBOARDING) ---------------- */

  const group = segments[0];

  // Not logged in → force auth screens
  if (!user && group !== "(auth)") {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in → never show auth/onboarding screens
  if (user && (group === "(auth)" || group === "(onboarding)")) {
    return <Redirect href="/(tabs)" />;
  }

  // Logged in but at root/unknown → go home
  if (user && !group) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <>
      <Slot />
      <StatusBar style="auto" />
    </>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: "#060B1A",
    justifyContent: "center",
    alignItems: "center",
  },
  blockContainer: {
    flex: 1,
    backgroundColor: "#050814",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 12,
  },
  message: {
    color: "#9FA8C7",
    textAlign: "center",
    marginBottom: 16,
  },
  subText: {
    color: "#6B7280",
    fontSize: 13,
  },
  button: {
    marginTop: 24,
    backgroundColor: "#8B5CF6",
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 18,
  },
  buttonText: {
    color: "#050814",
    fontWeight: "900",
    fontSize: 16,
  },
});
