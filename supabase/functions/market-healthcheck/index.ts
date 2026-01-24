import { getAnonKey, getServiceKey, getSupabaseUrl } from "../_shared/market/env.ts";
import { methodNotAllowed, ok } from "../_shared/market/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  // We do NOT reveal secrets; only whether they exist.
  const checks = {
    runtime: "deno",
    supabase_url_present: (() => {
      try { getSupabaseUrl(); return true; } catch { return false; }
    })(),
    anon_key_present: (() => {
      try { getAnonKey(); return true; } catch { return false; }
    })(),
    service_key_present: (() => {
      try { getServiceKey(); return true; } catch { return false; }
    })(),
    market_admin_token_present: !!Deno.env.get("MARKET_ADMIN_TOKEN"),
    now: new Date().toISOString(),
  };

  return ok({ ok: true, checks });
});
