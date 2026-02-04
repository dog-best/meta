import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body.order_id ?? "");
  if (!order_id) return bad("order_id required");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,seller_id,status,version")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.seller_id !== u.user.id) return bad("Not your order");

  if (order.status !== "IN_ESCROW") return bad("Order must be IN_ESCROW");

  const { data: updated, error } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "OUT_FOR_DELIVERY",
    p_note: "Seller marked OUT_FOR_DELIVERY",
  });

  if (error) return bad(error.message);

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otp_hash = await sha256Hex(otp);
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { error: otpErr } = await admin
    .from("market_order_otps")
    .upsert({ order_id, otp_hash, expires_at, attempts: 0, verified_at: null }, { onConflict: "order_id" });

  if (otpErr) return bad(otpErr.message);

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "OTP_GENERATED",
    entity_type: "market_orders",
    entity_id: order_id,
    payload: { expires_at },
  });

  return ok({ order: updated, otp_generated: true, expires_at });
});
