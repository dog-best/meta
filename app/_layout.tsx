// app/_layout.tsx
import { supabase } from "@/services/supabase";
import { installFetchTimeout } from "@/services/network/fetchTimeout";
import { Redirect, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
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

import * as Application from "expo-application";
import * as Linking from "expo-linking";

// AdMob
import mobileAds from "react-native-google-mobile-ads";

/* ✅ GLOBAL NETWORK FIX (prevents infinite loading across the app) */
installFetchTimeout(15000); // 15s is a good production default

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
  const { user, loading } = useAuth();
  const segments = useSegments();

  const [systemState, setSystemState] = useState<
    | { type: "maintenance"; message: string; eta?: string }
    | { type: "update"; message: string; url: string }
    | null
  >(null);

  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const supabaseUrl = useMemo(() => (supabase as any)?.supabaseUrl as string | undefined, []);

  /* ---------------- ADMOB INIT ---------------- */
  useEffect(() => {
    if (Platform.OS === "android") {
      mobileAds().initialize().catch(() => {});
    }
  }, []);

  /* ---------------- BOOT WATCHDOG (no infinite loader) ---------------- */
  useEffect(() => {
    const id = setTimeout(() => {
      // If we’re still booting after 20s, show a helpful screen instead of spinner forever
      setBootError(
        "Having trouble connecting. Please check your network and Supabase URL."
      );
      setBooting(false);
    }, 20000);

    return () => clearTimeout(id);
  }, []);

  /* ---------------- SYSTEM CONTROL CHECK ---------------- */
  useEffect(() => {
    let mounted = true;

    if (__DEV__) {
      setBooting(false);
      return;
    }

    (async () => {
      try {
        setBootError(null);

        const appVersion = Application.nativeApplicationVersion ?? "0.0.0";

        const { data, error } = await supabase
          .from("app_system_control")
          .select("*")
          .single();

        if (!mounted) return;

        // If network fails or table missing, we don’t block the whole app
        if (error || !data) {
          setBooting(false);
          return;
        }

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
      } catch (e: any) {
        if (!mounted) return;
        setBootError(e?.message ?? "System check failed");
      } finally {
        if (!mounted) return;
        setBooting(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function retryBoot() {
    // Simple retry: reload system control check by toggling booting
    setBootError(null);
    setBooting(true);

    // Re-run the system check by calling it again (same logic)
    (async () => {
      try {
        const appVersion = Application.nativeApplicationVersion ?? "0.0.0";
        const { data } = await supabase.from("app_system_control").select("*").single();

        if (!data) return;

        if (data.maintenance_enabled) {
          setSystemState({
            type: "maintenance",
            message: data.maintenance_message ?? "We are currently performing maintenance.",
            eta: data.maintenance_eta,
          });
          return;
        }

        if (data.force_update && isOutdated(appVersion, data.min_version)) {
          setSystemState({
            type: "update",
            message: data.update_message ?? "A new version is required to continue.",
            url: data.apk_url,
          });
        }
      } catch (e: any) {
        setBootError(e?.message ?? "Retry failed");
      } finally {
        setBooting(false);
      }
    })();
  }

  /* ---------------- GLOBAL BLOCK ---------------- */

  if (booting || loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loaderText}>
          Loading…
        </Text>
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={styles.blockContainer}>
        <Text style={styles.title}>Connection issue</Text>
        <Text style={styles.message}>{bootError}</Text>

        {/* Helpful in production debugging */}
        {!!supabaseUrl ? (
          <Text style={styles.subText}>Supabase: {supabaseUrl}</Text>
        ) : null}

        <Pressable style={styles.button} onPress={retryBoot}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
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

  /* ---------------- ROUTING ---------------- */

  const group = segments[0];

  if (!user && group !== "(auth)") {
    return <Redirect href="/(auth)/login" />;
  }

  if (user && (group === "(auth)" || group === "(onboarding)")) {
    return <Redirect href="/(tabs)" />;
  }

  if (user && !group) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <>
      <Slot />
      <StatusBar style="light" />
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
  loaderText: {
    marginTop: 12,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "800",
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
    textAlign: "center",
  },
  message: {
    color: "#9FA8C7",
    textAlign: "center",
    marginBottom: 12,
  },
  subText: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  button: {
    marginTop: 10,
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
