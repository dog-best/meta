import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getAnonKey, getServiceKey, getSupabaseUrl } from "./env.ts";

export function supabaseUserClient(req: Request) {
  const supabaseUrl = getSupabaseUrl();
  const anon = getAnonKey();
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function supabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const service = getServiceKey();
  return createClient(supabaseUrl, service);
}
