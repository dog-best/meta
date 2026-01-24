import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
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
  const otp = String(body.otp ?? "").trim();

  if (!order_id) return bad("order_id required");
  if (!/^\d{6}$/.test(otp)) return bad("otp must be 6 digits");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,seller_id,status,version")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.seller_id !== u.user.id) return bad("Only seller can verify OTP");
  if (order.status !== "OUT_FOR_DELIVERY") return bad("Order must be OUT_FOR_DELIVERY");

  const { data: row, error: re } = await admin
    .from("market_order_otps")
    .select("*")
    .eq("order_id", order_id)
    .single();

  if (re || !row) return bad("OTP not found");
  if (row.verified_at) return bad("OTP already verified");
  if (new Date(row.expires_at).getTime() < Date.now()) return bad("OTP expired");
  if (row.attempts >= 5) return bad("Too many attempts");

  const hash = await sha256Hex(otp);
  const match = hash === row.otp_hash;

  await admin
    .from("market_order_otps")
    .update({
      attempts: row.attempts + 1,
      verified_at: match ? new Date().toISOString() : null,
    })
    .eq("order_id", order_id);

  if (!match) return bad("Invalid OTP");

  // Transition to DELIVERED
  const { data: updated, error } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "DELIVERED",
    p_note: "OTP verified by seller",
  });

  if (error) return bad(error.message);
  return ok({ ok: true, order: updated });
});
