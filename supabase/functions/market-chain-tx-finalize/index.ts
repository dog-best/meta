import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

type EventType = "DEPOSIT" | "RELEASE" | "REFUND";

async function rpcCall(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `RPC ${method} failed`);
  return json?.result;
}

function toNum(hexOrNum: string | number | null | undefined): number {
  if (typeof hexOrNum === "number") return hexOrNum;
  if (!hexOrNum) return 0;
  const raw = String(hexOrNum);
  return raw.startsWith("0x") ? parseInt(raw, 16) : Number(raw);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(req);

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  const tx_hash = String(body?.tx_hash ?? "").toLowerCase();
  const event_type = String(body?.event_type ?? "").toUpperCase() as EventType;
  const chain = String(body?.chain ?? "");

  if (!order_id) return bad("order_id required");
  if (!tx_hash.startsWith("0x")) return bad("tx_hash required");
  if (!(["DEPOSIT", "RELEASE", "REFUND"] as string[]).includes(event_type)) return bad("event_type must be DEPOSIT, RELEASE or REFUND");

  const { data: order, error: orderErr } = await admin
    .from("market_orders")
    .select("id,buyer_id,seller_id,status,version")
    .eq("id", order_id)
    .maybeSingle();

  if (orderErr) return bad(orderErr.message);
  if (!order) return bad("Order not found");
  if (user.id !== order.buyer_id && user.id !== order.seller_id) return bad("Not allowed");

  const { data: cfg, error: cfgErr } = await admin
    .from("market_chain_config")
    .select("chain,rpc_url,confirmations_required,active")
    .eq("chain", chain)
    .eq("active", true)
    .maybeSingle();

  if (cfgErr) return bad(cfgErr.message);
  if (!cfg) return bad("Active chain config not found");
  if (!cfg.rpc_url) return bad("rpc_url missing for selected chain");

  const receipt = await rpcCall(cfg.rpc_url, "eth_getTransactionReceipt", [tx_hash]);
  if (!receipt) return ok({ ok: true, finalized: false, reason: "pending_mempool" });

  const statusHex = String(receipt?.status ?? "0x0");
  if (statusHex !== "0x1") {
    await admin.rpc("market_set_crypto_intent", {
      p_order_id: order_id,
      p_intent_type: event_type,
      p_status: "FAILED",
      p_from_wallet: null,
      p_to_wallet: null,
      p_amount_units: null,
      p_amount_raw: null,
      p_tx_hash: tx_hash,
      p_failure_reason: `Transaction reverted (${statusHex})`,
    });
    return bad("Transaction reverted on-chain");
  }

  const blockNumber = toNum(receipt?.blockNumber);
  const latestBlock = toNum(await rpcCall(cfg.rpc_url, "eth_blockNumber", []));
  const confirmations = Math.max(0, latestBlock - blockNumber + 1);
  const required = Number(cfg.confirmations_required ?? 1);

  if (confirmations < required) {
    return ok({ ok: true, finalized: false, confirmations, required });
  }

  const { data: esc } = await admin
    .from("market_crypto_escrows")
    .select("order_id,buyer_wallet,seller_wallet,amount_units,amount_raw")
    .eq("order_id", order_id)
    .maybeSingle();

  if (!esc) return bad("Crypto escrow mapping missing");

  await admin.rpc("market_set_crypto_intent", {
    p_order_id: order_id,
    p_intent_type: event_type,
    p_status: "CONFIRMED",
    p_from_wallet: esc.buyer_wallet,
    p_to_wallet: esc.seller_wallet,
    p_amount_units: Number(esc.amount_units ?? 0),
    p_amount_raw: esc.amount_raw ?? null,
    p_tx_hash: tx_hash,
    p_failure_reason: null,
  });

  if (event_type === "DEPOSIT") {
    await admin.from("market_crypto_escrows").update({ deposited_tx_hash: tx_hash, deposited_at: new Date().toISOString() }).eq("order_id", order_id);
    if (order.status === "CREATED") {
      const tr = await admin.rpc("market_transition_order_status", {
        p_order_id: order_id,
        p_expected_version: order.version,
        p_new_status: "IN_ESCROW",
        p_note: "Stablecoin deposit confirmed",
      });
      if (tr.error) return bad(tr.error.message);
    }
  }

  if (event_type === "RELEASE") {
    await admin.from("market_crypto_escrows").update({ released_tx_hash: tx_hash, released_at: new Date().toISOString() }).eq("order_id", order_id);
    if (order.status !== "RELEASED") {
      const tr = await admin.rpc("market_transition_order_status", {
        p_order_id: order_id,
        p_expected_version: order.version,
        p_new_status: "RELEASED",
        p_note: "Stablecoin release confirmed",
      });
      if (tr.error) return bad(tr.error.message);
    }
  }

  if (event_type === "REFUND") {
    await admin.from("market_crypto_escrows").update({ refunded_tx_hash: tx_hash, refunded_at: new Date().toISOString() }).eq("order_id", order_id);
    if (order.status !== "REFUNDED") {
      const tr = await admin.rpc("market_transition_order_status", {
        p_order_id: order_id,
        p_expected_version: order.version,
        p_new_status: "REFUNDED",
        p_note: "Stablecoin refund confirmed",
      });
      if (tr.error) return bad(tr.error.message);
    }
  }

  await admin.from("market_audit_logs").insert({
    actor_id: user.id,
    actor_type: "user",
    action: `STABLE_${event_type}_CONFIRMED`,
    entity_type: "market_orders",
    entity_id: order_id,
    payload: { tx_hash, chain, confirmations, required },
  });

  return ok({ ok: true, finalized: true, confirmations, required, event_type, order_id });
});
