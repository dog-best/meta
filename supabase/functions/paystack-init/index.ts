import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function env(name: string) {
  return Deno.env.get(name);
}

async function safeReadJson(req: Request) {
  // Handles PowerShell/curl weirdness + empty body cases
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // Try JSON first
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      // fall through
    }
  }

  // Try reading as text and parsing
  try {
    const txt = await req.text();
    if (!txt) return {};
    try {
      return JSON.parse(txt);
    } catch {
      // maybe it's just a number like "1000"
      return { amount: Number(txt) };
    }
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed" });

  const SB_URL = env("SB_URL");
  const SB_ANON = env("SB_ANON_KEY");
  const PAYSTACK_SECRET = env("PAYSTACK_SECRET_KEY");

  if (!SB_URL || !SB_ANON || !PAYSTACK_SECRET) {
    return json(500, { success: false, message: "Missing env vars" });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return json(401, { success: false, message: "Missing Authorization" });

  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  // Validate user via GoTrue (use real anon key as apikey)
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: SB_ANON },
  });

  const userJson = await userRes.json().catch(() => null);
  const userId = userJson?.id;
  const email = userJson?.email;

  if (!userRes.ok || !userId || !email) return json(401, { success: false, message: "Invalid session" });

  const body = await safeReadJson(req);
  const amountNgn = Number(body?.amount ?? 0);

  if (!Number.isFinite(amountNgn) || amountNgn < 50) {
    return json(400, { success: false, message: "Invalid amount", received: body ?? null });
  }

  const amountKobo = Math.round(amountNgn * 100);

  const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      metadata: { user_id: userId, purpose: "wallet_deposit" },
    }),
  });

  const initJson = await initRes.json().catch(() => ({}));

  if (!initRes.ok || !initJson?.status) {
    return json(502, { success: false, message: "Paystack init failed", raw: initJson });
  }

  return json(200, {
    success: true,
    reference: initJson.data.reference,
    authorization_url: initJson.data.authorization_url,
    access_code: initJson.data.access_code,
  });
});
