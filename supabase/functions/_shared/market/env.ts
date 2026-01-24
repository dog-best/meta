export function envAny(keys: string[], fallback?: string) {
  for (const k of keys) {
    const v = Deno.env.get(k);
    if (v && v.trim().length) return v;
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var. Tried: ${keys.join(", ")}`);
}

export function getSupabaseUrl() {
  return envAny(["SUPABASE_URL", "supabase_url", "sb_url"]);
}

export function getAnonKey() {
  return envAny(["SUPABASE_ANON_KEY", "SUPABASE_ANON", "sb_anon"]);
}

export function getServiceKey() {
  return envAny(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "sb_secret_key", "sb_scret_key"]);
}
