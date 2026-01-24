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
  if (!order_id) return bad("order_id required");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,buyer_id,status")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  if (order.buyer_id !== u.user.id) return bad("Only buyer can generate OTP");
  if (order.status !== "OUT_FOR_DELIVERY") return bad("Order must be OUT_FOR_DELIVERY");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otp_hash = await sha256Hex(otp);
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

  const { error } = await admin
    .from("market_order_otps")
    .upsert(
      { order_id, otp_hash, expires_at, attempts: 0, verified_at: null },
      { onConflict: "order_id" },
    );

  if (error) return bad(error.message);

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "OTP_GENERATED",
    entity_type: "market_orders",
    entity_id: order_id,
    payload: { expires_at },
  });

  // IMPORTANT: for production, do NOT return OTP. Send it via SMS/Email/Push.
  // For now (v1 dev), return OTP so you can test.
  return ok({ otp, expires_at });
});
