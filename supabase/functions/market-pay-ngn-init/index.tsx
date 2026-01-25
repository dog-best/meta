import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

function env(name: string, fallback?: string) {
  return Deno.env.get(name) ?? (fallback ? Deno.env.get(fallback) : undefined);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getUserFromJwt(sbUrl: string, anonKey: string, jwt: string) {
  const res = await fetch(`${sbUrl}/auth/v1/user`, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  const data = await safeJson(res);
  if (!res.ok) return { user: null, error: data?.msg || data?.message || `auth failed (${res.status})` };
  return { user: data, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const SB_URL = env("SB_URL", "SUPABASE_URL");
  const SB_ANON_KEY = env("SB_ANON_KEY", "SUPABASE_ANON_KEY");
  const SB_SERVICE_ROLE_KEY = env("SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY");

  if (!SB_URL || !SB_ANON_KEY || !SB_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
    return json(500, { ok: false, message: "Missing env vars" });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return json(401, { ok: false, message: "Missing Authorization" });

  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const { user, error: userErr } = await getUserFromJwt(SB_URL, SB_ANON_KEY, jwt);
  if (userErr || !user?.id) return json(401, { ok: false, message: "Invalid session", raw: userErr });

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  const clientReference = body?.reference ? String(body.reference) : null;

  if (!order_id) return json(400, { ok: false, message: "order_id required" });

  const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Load order
  const { data: order, error: ordErr } = await admin
    .from("market_orders")
    .select("id,buyer_id,amount,currency,status")
    .eq("id", order_id)
    .maybeSingle();

  if (ordErr || !order) return json(404, { ok: false, message: "Order not found" });
  if (order.buyer_id !== user.id) return json(403, { ok: false, message: "Not your order" });

  // We only initialize Paystack for NGN
  if (String(order.currency).toUpperCase() !== "NGN") {
    return json(400, { ok: false, message: "Order is not NGN. Use USDC flow." });
  }

  // Only allow init in CREATED state (keeps flow clean)
  if (order.status !== "CREATED") {
    return json(400, { ok: false, message: `Invalid order status: ${order.status}` });
  }

  // 2) Idempotency / reference
  const reference = clientReference || `MK_${order.id}_${crypto.randomUUID()}`;

  // If we already initialized this order, return existing
  const { data: existingLedger } = await admin
    .from("market_escrow_ledger")
    .select("reference,provider")
    .eq("order_id", order.id)
    .eq("provider", "paystack")
    .maybeSingle();

  if (existingLedger?.reference) {
    // still return a fresh auth url? Paystack doesn't let us re-use easily.
    // We'll just return the stored reference and let frontend call verify if needed.
    return json(200, {
      ok: true,
      idempotent: true,
      order_id: order.id,
      reference: existingLedger.reference,
      message: "Paystack already initialized for this order",
    });
  }

  // 3) Paystack init
  const paystackPayload = {
    email: user.email,
    amount: Math.round(Number(order.amount) * 100), // kobo
    reference,
    metadata: {
      purpose: "market_order",
      order_id: order.id,
      buyer_id: user.id,
    },
    // Use your deep link if you have it
    // callback_url: "bestcity://paystack-callback",
  };

  const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(paystackPayload),
  });

  const psJson = await safeJson(psRes);
  if (!psRes.ok || !psJson?.status) {
    return json(502, {
      ok: false,
      message: "Paystack initialize failed",
      status: psRes.status,
      raw: psJson,
    });
  }

  // 4) Save reference in market escrow ledger
  const { error: ledErr } = await admin.from("market_escrow_ledger").insert({
    order_id: order.id,
    provider: "paystack",
    reference,
    amount_locked: Number(order.amount),
    fee_amount: 0,
    total_debit: Number(order.amount),
    locked_at: null, // will be filled at webhook charge.success
  });

  if (ledErr) {
    // Don’t block user from paying if ledger insert fails, but log it.
    await admin.from("market_audit_logs").insert({
      actor_id: user.id,
      actor_type: "user",
      action: "MARKET_PAYSTACK_INIT_LEDGER_INSERT_FAILED",
      entity_type: "market_orders",
      entity_id: order.id,
      payload: { reference, error: ledErr.message },
    });
  } else {
    await admin.from("market_audit_logs").insert({
      actor_id: user.id,
      actor_type: "user",
      action: "MARKET_PAYSTACK_INIT",
      entity_type: "market_orders",
      entity_id: order.id,
      payload: { reference },
    });
  }

  return json(200, {
    ok: true,
    order_id: order.id,
    reference,
    authorization_url: psJson?.data?.authorization_url,
  });
});
