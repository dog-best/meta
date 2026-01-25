import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ethers } from "https://esm.sh/ethers@6.16.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
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

// Minimal ABI for refund()
const escrowAbi = [
  "function refund(bytes32 orderKey) external",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const adminSecret = envAny("MARKET_ADMIN_SECRET");
  const headerSecret = req.headers.get("x-admin-secret") || "";
  if (!adminSecret || headerSecret !== adminSecret) {
    return json(401, { ok: false, message: "Unauthorized admin" });
  }

  const SB_URL = envAny("SB_URL", "SUPABASE_URL");
  const SB_SERVICE = envAny("SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!SB_URL || !SB_SERVICE) return json(500, { ok: false, message: "Missing Supabase env vars" });

  // Chain RPC + arbiter key (server-side only!)
  const BASE_RPC_URL = envAny("BASE_RPC_URL"); // set this in supabase secrets
  const ARBITER_PRIVATE_KEY = envAny("ARBITER_PRIVATE_KEY"); // set this in supabase secrets

  if (!BASE_RPC_URL || !ARBITER_PRIVATE_KEY) {
    return json(500, { ok: false, message: "Missing BASE_RPC_URL or ARBITER_PRIVATE_KEY in secrets" });
  }

  const admin = createClient(SB_URL, SB_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  const reason = String(body?.reason ?? "admin_refund");

  if (!order_id) return json(400, { ok: false, message: "order_id required" });

  const { data: order } = await admin
    .from("market_orders")
    .select("id,currency,status")
    .eq("id", order_id)
    .maybeSingle();

  if (!order) return json(404, { ok: false, message: "Order not found" });
  if (order.currency !== "USDC") return json(400, { ok: false, message: "Not USDC order" });

  const { data: esc } = await admin
    .from("market_crypto_escrows")
    .select("order_id,order_key,escrow_address,buyer_wallet,seller_wallet,amount_units,amount_raw")
    .eq("order_id", order_id)
    .maybeSingle();

  if (!esc?.order_key || !esc?.escrow_address) return json(404, { ok: false, message: "Crypto escrow mapping missing" });

  // record intent (processing)
  await admin.rpc("market_set_crypto_intent", {
    p_order_id: order_id,
    p_intent_type: "REFUND",
    p_status: "PROCESSING",
    p_from_wallet: esc.seller_wallet, // conceptually funds go back from escrow to buyer
    p_to_wallet: esc.buyer_wallet,
    p_amount_units: Number(esc.amount_units ?? 0),
    p_amount_raw: esc.amount_raw ?? null,
    p_tx_hash: null,
    p_failure_reason: null,
  });

  // Send on-chain tx from arbiter
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const wallet = new ethers.Wallet(ARBITER_PRIVATE_KEY, provider);

  const contract = new ethers.Contract(esc.escrow_address, escrowAbi, wallet);

  try {
    const tx = await contract.refund(esc.order_key);
    // store tx hash
    await admin.rpc("market_set_crypto_intent", {
      p_order_id: order_id,
      p_intent_type: "REFUND",
      p_status: "SUBMITTED",
      p_from_wallet: esc.seller_wallet,
      p_to_wallet: esc.buyer_wallet,
      p_amount_units: Number(esc.amount_units ?? 0),
      p_amount_raw: esc.amount_raw ?? null,
      p_tx_hash: tx.hash,
      p_failure_reason: null,
    });

    await admin.from("market_audit_logs").insert({
      actor_id: null,
      actor_type: "admin",
      action: "USDC_REFUND_SUBMITTED",
      entity_type: "market_orders",
      entity_id: order_id,
      payload: { reason, tx_hash: tx.hash, order_key: esc.order_key },
    });

    return json(200, {
      ok: true,
      order_id,
      order_key: esc.order_key,
      tx_hash: tx.hash,
      message: "Refund tx submitted. Indexer will finalize status once confirmed.",
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "refund_failed";
    await admin.rpc("market_set_crypto_intent", {
      p_order_id: order_id,
      p_intent_type: "REFUND",
      p_status: "FAILED",
      p_from_wallet: esc.seller_wallet,
      p_to_wallet: esc.buyer_wallet,
      p_amount_units: Number(esc.amount_units ?? 0),
      p_amount_raw: esc.amount_raw ?? null,
      p_tx_hash: null,
      p_failure_reason: msg,
    });

    return json(500, { ok: false, message: "Refund tx failed", error: msg });
  }
});
