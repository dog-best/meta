// supabase/client.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function requireString(name: string, value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(
    `[supabase] Missing ${name}. Expo only exposes EXPO_PUBLIC_* vars at bundle time.\n` +
      `• Ensure .env is in the project root and named exactly ".env"\n` +
      `• Ensure the variable is prefixed with EXPO_PUBLIC_\n` +
      `• Restart bundler: npx expo start --clear\n` +
      `• Ensure EXPO_NO_CLIENT_ENV_VARS is NOT set to 1`
  );
}

const url = requireString("EXPO_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const key = requireString("EXPO_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});