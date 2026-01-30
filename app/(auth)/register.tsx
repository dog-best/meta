import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

export default function Register() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = useMemo(() => !!email.trim() && !!password && !!confirm, [email, password, confirm]);

  const handleRegister = async () => {
    if (loading) return;
    if (!canSubmit) return setErrorMsg("All fields are required");
    if (password !== confirm) return setErrorMsg("Passwords do not match");
    if (password.length < 6) return setErrorMsg("Password must be at least 6 characters");

    setLoading(true);
    setErrorMsg("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("User not created");

      router.replace("/(auth)/login");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[BG1, BG0]} style={styles.root}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />

      <View style={styles.card}>
        <View style={styles.logoRow}>
          <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
          <View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Sell, buy, and unlock escrow protection</Text>
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
            placeholder="Create a password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.eye} onPress={() => setPasswordVisible((v) => !v)}>
            <Ionicons name={passwordVisible ? "eye-off" : "eye"} size={18} color="#cbd5f5" />
          </Pressable>
        </View>

        <Text style={styles.label}>Confirm password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Repeat your password"
            placeholderTextColor="rgba(255,255,255,0.35)"
            secureTextEntry={!confirmVisible}
            value={confirm}
            onChangeText={setConfirm}
          />
          <Pressable style={styles.eye} onPress={() => setConfirmVisible((v) => !v)}>
            <Ionicons name={confirmVisible ? "eye-off" : "eye"} size={18} color="#cbd5f5" />
          </Pressable>
        </View>

        <View style={styles.hintRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.65)" />
          <Text style={styles.hintText}>Use at least 6 characters for better security</Text>
        </View>

        <Pressable
          onPress={handleRegister}
          disabled={loading}
          style={[styles.primaryBtn, { opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create account</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already registered?</Text>
          <Link href="/(auth)/login" style={styles.footerLink}>
            Login
          </Link>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, justifyContent: "center" },
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
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  logo: { width: 46, height: 46, borderRadius: 14 },
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
  passwordWrap: { position: "relative", marginBottom: 8 },
  eye: { position: "absolute", right: 12, top: 14 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  hintText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700" },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
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
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 14, gap: 6 },
  footerText: { color: "rgba(255,255,255,0.6)" },
  footerLink: { color: "#C4B5FD", fontWeight: "800" },
});

