// app/auth/forgot.tsx

// app/(auth)/forgot.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Image,
} from "react-native";

import { Link } from "expo-router";
import { supabase } from "@/services/supabase";

export default function ForgotPassword() {
  return <ForgotPasswordScreen />;
}

function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Animations
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  /* --------- Reset Flow (Supabase Native) --------- */
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
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.root}
    >
      <Animated.View
        style={[
          styles.card,
          { opacity: fade, transform: [{ scale }] },
        ]}
      >
        {/* LOGO */}
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
        />

        {/* TITLE */}
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email to receive a reset link
        </Text>

        {/* STATUS */}
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        {successMsg ? <Text style={styles.success}>{successMsg}</Text> : null}

        {/* EMAIL */}
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {/* CTA */}
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.8 }]}
          disabled={loading}
          onPress={sendReset}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        {/* BACK */}
        <View style={styles.backRow}>
          <Text style={styles.backText}>Back to</Text>
          <Link href="/(auth)/login" style={styles.backLink}>
            Login
          </Link>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/* ---------------- STYLES ---------------- */

const PURPLE = "#5b3deb";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0c0c0c",
    borderRadius: 22,
    padding: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  logo: {
    width: 60,
    height: 60,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 18,
  },

  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: "#9a9a9a",
    textAlign: "center",
    marginBottom: 20,
    marginTop: 4,
  },

  input: {
    backgroundColor: "#141414",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 14,
  },

  button: {
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },

  backRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
  },

  backText: {
    color: "#888",
    marginRight: 6,
  },

  backLink: {
    color: PURPLE,
    fontWeight: "800",
  },

  error: {
    color: "#ff5c5c",
    textAlign: "center",
    marginBottom: 12,
  },

  success: {
    color: "#4ade80",
    textAlign: "center",
    marginBottom: 12,
  },
});
