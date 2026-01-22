import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

function env(name: string) {
  return Deno.env.get(name);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

serve(async (_req) => {
  const SB_URL = env("SB_URL");
  const SB_SERVICE_ROLE_KEY = env("SB_SERVICE_ROLE_KEY");
  const PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY");

  if (!SB_URL || !SB_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
    return json(500, { success: false, message: "Missing env vars" });
  }

  const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const res = await fetch("https://api.paystack.co/bank?currency=NGN", {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });

  const payload = await safeJson(res);
  if (!res.ok || !payload?.status) {
    return json(502, { success: false, message: "Paystack bank list failed", status: res.status, raw: payload });
  }

  // DEDUPE by bank code
  const map = new Map<string, any>();
  for (const b of payload.data ?? []) {
    const code = String(b.code);
    if (!code) continue;
    map.set(code, {
      code,
      name: String(b.name),
      slug: b.slug ? String(b.slug) : null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }

  const banks = Array.from(map.values());

  const { error } = await admin.from("banks_ng").upsert(banks, { onConflict: "code" });
  if (error) return json(500, { success: false, message: error.message });

  return json(200, { success: true, count: banks.length });
});
