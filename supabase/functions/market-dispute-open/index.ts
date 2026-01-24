import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body.order_id ?? "");
  const reason = String(body.reason ?? "").trim();
  if (!order_id) return bad("order_id required");
  if (!reason) return bad("reason required");

  const { data: order, error: oe } = await admin
    .from("market_orders")
    .select("id,buyer_id,seller_id,status,version")
    .eq("id", order_id)
    .single();

  if (oe || !order) return bad("Order not found");
  const isParty = order.buyer_id === u.user.id || order.seller_id === u.user.id;
  if (!isParty) return bad("Not allowed");

  if (!["IN_ESCROW", "OUT_FOR_DELIVERY", "DELIVERABLE_UPLOADED", "DELIVERED"].includes(order.status)) {
    return bad("Dispute not allowed in current status");
  }

  // Insert dispute (unique per order)
  const { data: dispute, error: de } = await admin
    .from("market_disputes")
    .insert({ order_id, opened_by: u.user.id, reason, status: "OPEN" })
    .select("*")
    .single();

  if (de) return bad(de.message);

  // Move order to DISPUTED
  const { data: updated, error: te } = await admin.rpc("market_transition_order_status", {
    p_order_id: order_id,
    p_expected_version: order.version,
    p_new_status: "DISPUTED",
    p_note: "Dispute opened",
  });

  if (te) return bad(te.message);

  return ok({ dispute, order: updated });
});
