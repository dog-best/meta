// app/auth/login.tsx

import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { supabase } from "@/services/supabase";


/* ---------- Router Wrapper ---------- */
export default function Login() {
  return <LoginScreen />;
}

/* ---------- Screen ---------- */
function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [shake, setShake] = useState(false);

  /* ---------- Error Shake Animation ---------- */
  const errorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(shake ? 10 : 0, { duration: 80 }),
      },
    ],
  }));

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 150);
  };

  /* ---------- Login Logic (UNCHANGED) ---------- */
  const handleLogin = async () => {
    if (loading) return;

    if (!email.trim() || !password) {
      return triggerError("Email and password are required");
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      router.replace("/(tabs)");
    } catch (err: any) {
      triggerError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Animated.View entering={FadeInUp.duration(400)} style={styles.card}>
        {/* LOGO */}
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
        />

        {/* TITLE */}
        <Animated.Text entering={FadeInDown.delay(100)} style={styles.title}>
          Welcome Back
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(200)} style={styles.subtitle}>
          Login to BestCity Pay
        </Animated.Text>

        {/* ERROR */}
        {errorMsg ? (
          <Animated.Text style={[styles.error, errorStyle]}>
            {errorMsg}
          </Animated.Text>
        ) : null}

        {/* EMAIL */}
        <Animated.View entering={FadeInUp.delay(300)}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#888"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </Animated.View>

        {/* PASSWORD */}
        <Animated.View entering={FadeInUp.delay(400)} style={styles.passwordWrap}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#888"
            secureTextEntry={!passwordVisible}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={styles.eye}
            onPress={() => setPasswordVisible((v) => !v)}
          >
            <Ionicons
              name={passwordVisible ? "eye-off" : "eye"}
              size={20}
              color="#aaa"
            />
          </TouchableOpacity>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInUp.delay(500)}>
          <Pressable
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.button,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </Pressable>
        </Animated.View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don’t have an account?</Text>
          <Link href="/(auth)/register" style={styles.footerLink}>
            Create one
          </Link>
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- STYLES ---------- */

const PURPLE = "#5b3deb";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
  },

  subtitle: {
    color: "#9a9a9a",
    textAlign: "center",
    marginBottom: 20,
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

  passwordWrap: {
    position: "relative",
  },

  eye: {
    position: "absolute",
    right: 14,
    top: "35%",
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

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 18,
  },

  footerText: {
    color: "#888",
    marginRight: 6,
  },

  footerLink: {
    color: PURPLE,
    fontWeight: "800",
  },

  error: {
    color: "#ff5c5c",
    textAlign: "center",
    marginBottom: 12,
  },
});
