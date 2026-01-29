// supabase/functions/_shared/market/supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getAnonKey, getServiceKey, getSupabaseUrl } from "./env.ts";

export function supabaseUserClient(req: Request) {
  const supabaseUrl = getSupabaseUrl();
  const anon = getAnonKey();

  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(supabaseUrl, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export function supabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const service = getServiceKey();

  return createClient(supabaseUrl, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
