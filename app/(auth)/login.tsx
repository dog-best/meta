import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const ACCENT = "#7C3AED";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.12)";

const KEY_EMAIL = "auth_email";
const KEY_PASS = "auth_password";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);

  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricHardware, setBiometricHardware] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Use Face ID / Passcode");

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFace = supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        const hasFinger = supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

        if (hasFace) setBiometricLabel("Use Face ID / Passcode");
        else if (hasFinger) setBiometricLabel("Use Fingerprint / Passcode");
        else setBiometricLabel("Use Device Passcode");

        setBiometricHardware(hasHardware);
        setBiometricEnrolled(enrolled);
        setBiometricReady(hasHardware && enrolled);
      } catch {
        setBiometricReady(false);
      }
    })();
  }, []);

  const canSubmit = useMemo(() => !!email.trim() && !!password, [email, password]);

  async function handleLogin() {
    if (loading) return;
    if (!canSubmit) return setErrorMsg("Email and password are required");

    setLoading(true);
    setErrorMsg("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      if (rememberDevice) {
        await SecureStore.setItemAsync(KEY_EMAIL, email.trim());
        await SecureStore.setItemAsync(KEY_PASS, password);
      } else {
        await SecureStore.deleteItemAsync(KEY_EMAIL);
        await SecureStore.deleteItemAsync(KEY_PASS);
      }

      router.replace("/market/(tabs)");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setErrorMsg("");
    if (!biometricReady) return;

    try {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock to sign in",
        fallbackLabel: "Use Passcode",
        cancelLabel: "Cancel",
      });

      if (!auth.success) return;

      const savedEmail = await SecureStore.getItemAsync(KEY_EMAIL);
      const savedPass = await SecureStore.getItemAsync(KEY_PASS);

      if (!savedEmail || !savedPass) {
        setErrorMsg("No saved login. Sign in once to enable quick unlock.");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: savedEmail,
        password: savedPass,
      });
      if (error) throw error;

      router.replace("/market/(tabs)");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Quick unlock failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[BG1, BG0]} style={styles.root}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />

      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
          <View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Secure sign-in to your marketplace & wallet</Text>
          </View>
        </View>

        {!!errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@domain.com"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Your password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={styles.eye}
            onPress={() => setPasswordVisible((v) => !v)}
          >
            <Ionicons name={passwordVisible ? "eye-off" : "eye"} size={18} color="#cbd5f5" />
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable onPress={() => setRememberDevice((v) => !v)} style={styles.remember}>
            <View style={[styles.checkbox, rememberDevice && styles.checkboxOn]}>
              {rememberDevice ? <Ionicons name="checkmark" size={14} color="#0b0916" /> : null}
            </View>
            <Text style={styles.rememberText}>Remember this device</Text>
          </Pressable>
          <Link href="/(auth)/forgot" style={styles.linkText}>
            Forgot password?
          </Link>
        </View>

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={[styles.primaryBtn, { opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Login</Text>}
        </Pressable>

        {biometricReady ? (
          <Pressable onPress={handleBiometricLogin} style={styles.secondaryBtn}>
            <Ionicons name="finger-print" size={18} color="#fff" />
            <Text style={styles.secondaryText}>{biometricLabel}</Text>
          </Pressable>
        ) : biometricHardware ? (
          <Pressable onPress={() => Linking.openSettings()} style={styles.secondaryBtn}>
            <Ionicons name="lock-closed-outline" size={18} color="#fff" />
            <Text style={styles.secondaryText}>
              {biometricEnrolled ? "Enable biometric login" : "Set up Face ID / Fingerprint"}
            </Text>
          </Pressable>
        ) : null}

        {!biometricReady && biometricHardware ? (
          <Text style={styles.helperText}>
            Biometrics are not enrolled on this device. Set up Face ID / Fingerprint in your phone settings, then try again.
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>New here?</Text>
          <Link href="/(auth)/register" style={styles.footerLink}>
            Create account
          </Link>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  glowA: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 140,
    backgroundColor: "rgba(124,58,237,0.25)",
    top: -30,
    right: -40,
  },
  glowB: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 160,
    backgroundColor: "rgba(59,130,246,0.18)",
    bottom: -40,
    left: -60,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
  },
  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  logo: { width: 48, height: 48, borderRadius: 14 },
  title: { color: "#fff", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: 12 },
  label: { color: "rgba(255,255,255,0.7)", fontWeight: "800", marginTop: 10, marginBottom: 6, fontSize: 12 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  passwordWrap: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxOn: { backgroundColor: "#E9D5FF", borderColor: "#E9D5FF" },
  rememberText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700" },
  linkText: { color: "#C4B5FD", fontWeight: "800", fontSize: 12 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  secondaryText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    marginBottom: 10,
  },
  errorText: { color: "#FCA5A5", fontWeight: "800", fontSize: 12, flex: 1 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 16, gap: 6 },
  footerText: { color: "rgba(255,255,255,0.6)" },
  footerLink: { color: "#C4B5FD", fontWeight: "800" },
  helperText: { marginTop: 8, color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "center" },
});
