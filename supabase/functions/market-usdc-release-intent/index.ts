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

function envAny(...names: string[]) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim().length > 0) return v.trim();
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const SB_URL = envAny("SB_URL", "SUPABASE_URL");
  const SB_ANON = envAny("SB_ANON_KEY", "SUPABASE_ANON_KEY");
  const SB_SERVICE = envAny("SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  if (!SB_URL || !SB_ANON || !SB_SERVICE) return json(500, { ok: false, message: "Missing env vars" });

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return json(401, { ok: false, message: "Missing Authorization" });

  const supabase = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return json(401, { ok: false, message: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  if (!order_id) return json(400, { ok: false, message: "order_id required" });

  // Order + buyer check
  const { data: order } = await admin
    .from("market_orders")
    .select("id,buyer_id,currency,status")
    .eq("id", order_id)
    .maybeSingle();

  if (!order) return json(404, { ok: false, message: "Order not found" });
  if (order.buyer_id !== user.id) return json(403, { ok: false, message: "Not your order" });
  if (order.currency !== "USDC") return json(400, { ok: false, message: "Not USDC order" });

  // Only allow release when delivered/service ready etc.
  // Minimal v1: require IN_ESCROW or DELIVERED or DELIVERABLE_UPLOADED
  const allowed = ["IN_ESCROW", "DELIVERED", "DELIVERABLE_UPLOADED"];
  if (!allowed.includes(order.status)) {
    return json(400, { ok: false, message: `Cannot release from status: ${order.status}` });
  }

  const { data: esc } = await admin
    .from("market_crypto_escrows")
    .select("order_id,order_key,escrow_address,buyer_wallet,seller_wallet,token_address,amount_units,amount_raw")
    .eq("order_id", order_id)
    .maybeSingle();

  if (!esc?.order_key) return json(404, { ok: false, message: "Crypto escrow mapping missing" });

  // record intent
  await admin.rpc("market_set_crypto_intent", {
    p_order_id: order_id,
    p_intent_type: "RELEASE",
    p_status: "CREATED",
    p_from_wallet: esc.buyer_wallet,
    p_to_wallet: esc.seller_wallet,
    p_amount_units: Number(esc.amount_units ?? 0),
    p_amount_raw: esc.amount_raw ?? null,
    p_tx_hash: null,
    p_failure_reason: null,
  });

  await admin.from("market_audit_logs").insert({
    actor_id: user.id,
    actor_type: "user",
    action: "USDC_RELEASE_INTENT",
    entity_type: "market_orders",
    entity_id: order_id,
    payload: { order_key: esc.order_key },
  });

  return json(200, {
    ok: true,
    order_id,
    order_key: esc.order_key,
    escrow_address: esc.escrow_address,
    contract_method: "release(bytes32 orderKey)",
    args: [esc.order_key],
    note: "Client should send on-chain release tx, then indexer updates DB to RELEASED",
  });
});
