import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.3/sha3";
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

// keccak256(utf8(order_uuid)) -> 0x...
function orderKeyKeccak(orderId: string): string {
  const bytes = new TextEncoder().encode(orderId);
  const hash = keccak_256(bytes);
  return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const SB_URL = envAny("SB_URL", "SUPABASE_URL");
  const SB_ANON = envAny("SB_ANON_KEY", "SUPABASE_ANON_KEY");
  const SB_SERVICE = envAny("SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  if (!SB_URL || !SB_ANON || !SB_SERVICE) {
    return json(500, { ok: false, message: "Missing Supabase env vars (SB_URL/SB_ANON_KEY/SB_SERVICE_ROLE_KEY)" });
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return json(401, { ok: false, message: "Missing Authorization" });

  const supabase = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: authHeader } },
  });

  const admin = createClient(SB_URL, SB_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return json(401, { ok: false, message: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const listing_id = String(body?.listing_id ?? "");
  const buyer_wallet = String(body?.buyer_wallet ?? "");
  const seller_wallet = String(body?.seller_wallet ?? "");

  if (!listing_id) return json(400, { ok: false, message: "listing_id required" });
  if (!buyer_wallet || !buyer_wallet.startsWith("0x")) return json(400, { ok: false, message: "buyer_wallet required" });
  if (!seller_wallet || !seller_wallet.startsWith("0x")) return json(400, { ok: false, message: "seller_wallet required" });

  // Fetch listing
  const { data: listing, error: listErr } = await admin
    .from("market_listings")
    .select("id,seller_id,price_amount,currency,is_active")
    .eq("id", listing_id)
    .maybeSingle();

  if (listErr || !listing || !listing.is_active) {
    return json(404, { ok: false, message: "Listing not found" });
  }

  if (listing.currency !== "USDC") {
    return json(400, { ok: false, message: "Listing is not USDC" });
  }

  // Fetch chain config (Base)
  const { data: cfg, error: cfgErr } = await admin
    .from("market_chain_config")
    .select("usdc_address, escrow_address, chain_id, confirmations_required")
    .eq("chain", "base")
    .eq("active", true)
    .maybeSingle();

  if (cfgErr || !cfg) return json(500, { ok: false, message: "Chain config missing" });

  // Create order
  const { data: order, error: ordErr } = await admin
    .from("market_orders")
    .insert({
      buyer_id: user.id,
      seller_id: listing.seller_id,
      listing_id: listing.id,
      amount: listing.price_amount,
      currency: "USDC",
      status: "CREATED",
    })
    .select("*")
    .single();

  if (ordErr || !order) return json(400, { ok: false, message: ordErr?.message ?? "Order create failed" });

  // Compute keccak order_key
  const orderKey = orderKeyKeccak(order.id);

  // Upsert crypto escrow mapping row (indexer relies on this!)
  const { error: escErr } = await admin.from("market_crypto_escrows").upsert(
    {
      order_id: order.id,
      order_key: orderKey,
      chain: "base",
      buyer_wallet,
      seller_wallet,
      token_address: cfg.usdc_address,
      escrow_address: cfg.escrow_address,
      amount_units: Number(order.amount),
      amount_raw: null, // will be set by intent below
    },
    { onConflict: "order_id" },
  );

  if (escErr) return json(500, { ok: false, message: escErr.message });

  // Audit log
  await admin.from("market_audit_logs").insert({
    actor_id: user.id,
    actor_type: "user",
    action: "USDC_ORDER_CREATED",
    entity_type: "market_orders",
    entity_id: order.id,
    payload: {
      order_key: orderKey,
      buyer_wallet,
      seller_wallet,
      escrow: cfg.escrow_address,
      usdc: cfg.usdc_address,
    },
  });

  return json(200, {
    ok: true,
    order,
    crypto: {
      order_key: orderKey,
      chain: "base",
      chain_id: cfg.chain_id,
      confirmations_required: cfg.confirmations_required,
      usdc_address: cfg.usdc_address,
      escrow_address: cfg.escrow_address,
    },
  });
});
