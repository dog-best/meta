/// <reference path="../_shared/deno.d.ts" />

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Body = {
  order_id: string;
  topup_shortfall_only?: boolean; // default true
  amount_override?: number; // optional override
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function safeReadJson(req: Request) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      // fallthrough
    }
  }
  try {
    const txt = await req.text();
    if (!txt) return {};
    try {
      return JSON.parse(txt);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const PAYSTACK_SECRET_KEY = mustEnv("PAYSTACK_SECRET_KEY");
    const PAYSTACK_CALLBACK_URL = Deno.env.get("PAYSTACK_CALLBACK_URL") ?? null;

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) return json(401, { error: "Missing bearer token" });

    // Validate user via GoTrue like your paystack-init does
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });

    const userJson = await userRes.json().catch(() => null);
    const userId = userJson?.id;
    const email = userJson?.email;

    if (!userRes.ok || !userId || !email) return json(401, { error: "Invalid session" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await safeReadJson(req)) as Body;
    if (!body?.order_id) return json(400, { error: "order_id is required" });

    // 1) Load order (must belong to buyer)
    const { data: order, error: orderErr } = await admin
      .from("market_orders")
      .select("id,buyer_id,amount,fee_amount,currency,status,version")
      .eq("id", body.order_id)
      .maybeSingle();

    if (orderErr) return json(400, { error: orderErr.message });
    if (!order) return json(404, { error: "Order not found" });
    if (order.buyer_id !== userId) return json(403, { error: "Not your order" });
    if (order.currency !== "NGN") return json(400, { error: "Order is not NGN" });
    if (order.status !== "CREATED") return json(400, { error: `Order status must be CREATED (got ${order.status})` });

    const orderTotal =
      typeof body.amount_override === "number"
        ? body.amount_override
        : Number(order.amount ?? 0) + Number(order.fee_amount ?? 0);

    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
      return json(400, { error: "Invalid order total" });
    }

    // 2) Read wallet balance (your existing wallet table)
    const { data: wallet, error: wErr } = await admin
      .from("app_wallets_simple")
      .select("user_id,balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (wErr) return json(400, { error: wErr.message });

    const balance = Number(wallet?.balance ?? 0);

    // Wallet can cover → tell app to proceed to lock
    if (balance >= orderTotal) {
      return json(200, {
        ok: true,
        mode: "wallet",
        order_id: order.id,
        amount_total: orderTotal,
        wallet_balance: balance,
        next: { action: "lock_escrow", expected_version: order.version },
      });
    }

    // 3) Insufficient → Paystack init topup
    const shortfall = Math.max(0, orderTotal - balance);
    const topupShortfallOnly = body.topup_shortfall_only !== false; // default true
    const topupAmount = topupShortfallOnly ? shortfall : orderTotal;
    const kobo = Math.round(topupAmount * 100);

    const reference = `mkt_topup_${order.id.replaceAll("-", "")}_${crypto.randomUUID().slice(0, 8)}`;

    const initPayload: Record<string, unknown> = {
      email,
      amount: kobo,
      reference,
      metadata: {
        // ✅ THIS is the important compatibility key for your webhook:
        user_id: userId,

        purpose: "market_wallet_topup",
        kind: "market_wallet_topup",
        order_id: order.id,
        expected_version: order.version,
        next_action: "lock_escrow",
        topup_amount: topupAmount,
        order_total: orderTotal,
      },
    };

    if (PAYSTACK_CALLBACK_URL) initPayload["callback_url"] = PAYSTACK_CALLBACK_URL;

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initPayload),
    });

    const initJson = await initRes.json().catch(() => ({}));

    if (!initRes.ok || !initJson?.status) {
      return json(502, { ok: false, error: "Paystack init failed", raw: initJson });
    }

    return json(200, {
      ok: true,
      mode: "topup",
      order_id: order.id,
      amount_total: orderTotal,
      wallet_balance: balance,
      shortfall,
      topup_amount: topupAmount,
      paystack: {
        reference: initJson.data.reference,
        authorization_url: initJson.data.authorization_url,
        access_code: initJson.data.access_code,
      },
      next: { action: "lock_escrow", expected_version: order.version },
    });
  } catch (e) {
    return json(500, { ok: false, error: (e as Error).message });
  }
});
