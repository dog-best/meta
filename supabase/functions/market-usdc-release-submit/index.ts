import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(req);

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  const tx_hash = String(body?.tx_hash ?? "");

  if (!order_id) return bad("order_id required");

  const { data: order, error: orderErr } = await admin
    .from("market_orders")
    .select("id,buyer_id,status,version")
    .eq("id", order_id)
    .maybeSingle();

  if (orderErr) return bad(orderErr.message);
  if (!order) return bad("Order not found");
  if (order.buyer_id !== user.id) return bad("Not your order");

  if (!["IN_ESCROW", "DELIVERED", "DELIVERABLE_UPLOADED", "RELEASED"].includes(String(order.status))) {
    return bad(`Cannot release from status: ${order.status}`);
  }

  const { data: esc, error: escErr } = await admin
    .from("market_crypto_escrows")
    .select("order_id,buyer_wallet,seller_wallet,amount_units,amount_raw")
    .eq("order_id", order_id)
    .maybeSingle();

  if (escErr) return bad(escErr.message);
  if (!esc) return bad("Crypto escrow mapping missing");

  const { error: updEscErr } = await admin
    .from("market_crypto_escrows")
    .update({
      released_tx_hash: tx_hash || null,
      released_at: null,
    })
    .eq("order_id", order_id);

  if (updEscErr) return bad(updEscErr.message);

  await admin.rpc("market_set_crypto_intent", {
    p_order_id: order_id,
    p_intent_type: "RELEASE",
    p_status: "SUBMITTED",
    p_from_wallet: esc.buyer_wallet,
    p_to_wallet: esc.seller_wallet,
    p_amount_units: Number(esc.amount_units ?? 0),
    p_amount_raw: esc.amount_raw ?? null,
    p_tx_hash: tx_hash || null,
    p_failure_reason: null,
  });

  // Strict finality: status transition happens only after chain confirmation.

  await admin.from("market_audit_logs").insert({
    actor_id: user.id,
    actor_type: "user",
    action: "STABLE_RELEASE_TX_SUBMITTED",
    entity_type: "market_orders",
    entity_id: order_id,
    payload: { tx_hash: tx_hash || null },
  });

  return ok({ ok: true, order_id, tx_hash: tx_hash || null });
});
