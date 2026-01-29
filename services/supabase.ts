// services/supabase.ts

// Keep env reads here if you want (optional)
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Re-export the client AND helpers from the real client module
export { supabase, fetchWithTimeout } from "@/supabase/client";
