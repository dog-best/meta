import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import React, { useState } from "react";
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

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const sendReset = async () => {
    if (!email.trim()) return setErrorMsg("Email is required");
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "https://your-app-domain.com/auth/reset",
      });
      if (error) throw error;
      setSuccessMsg("Reset link sent to your email");
    } catch (err: any) {
      setErrorMsg(err.message);
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
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.subtitle}>We’ll send a secure reset link to your email</Text>
          </View>
        </View>

        {!!errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        {!!successMsg && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#86EFAC" />
            <Text style={styles.successText}>{successMsg}</Text>
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

        <Pressable
          onPress={sendReset}
          disabled={loading}
          style={[styles.primaryBtn, { opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send reset link</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Remembered your password?</Text>
          <Link href="/(auth)/login" style={styles.footerLink}>
            Back to login
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
  primaryBtn: {
    marginTop: 8,
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
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    marginBottom: 10,
  },
  successText: { color: "#86EFAC", fontWeight: "800", fontSize: 12, flex: 1 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 14, gap: 6 },
  footerText: { color: "rgba(255,255,255,0.6)" },
  footerLink: { color: "#C4B5FD", fontWeight: "800" },
});
