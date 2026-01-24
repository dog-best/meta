import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

type Role = "buyer" | "seller" | "none";

type AllowedAction =
  | "BUYER_CANCEL_ORDER"
  | "BUYER_CONFIRM_RECEIVED"
  | "BUYER_GENERATE_OTP"
  | "BUYER_APPROVE_DIGITAL"
  | "BUYER_OPEN_DISPUTE"
  | "SELLER_OUT_FOR_DELIVERY"
  | "SELLER_VERIFY_OTP"
  | "SELLER_UPLOAD_DELIVERABLE"
  | "SELLER_MARK_DELIVERED"
  | "SELLER_OPEN_DISPUTE";

function getRole(order: any, uid: string): Role {
  if (order.buyer_id === uid) return "buyer";
  if (order.seller_id === uid) return "seller";
  return "none";
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const url = new URL(req.url);
  const order_id = url.searchParams.get("order_id");
  if (!order_id) return bad("order_id is required");

  const { data: order, error } = await admin
    .from("market_orders")
    .select(
      `
      id, buyer_id, seller_id, status, currency,
      market_listings ( id, category, delivery_type )
    `,
    )
    .eq("id", order_id)
    .single();

  if (error) return bad(error.message);
  const role = getRole(order, u.user.id);
  if (role === "none") return bad("Not allowed");

  const listing = order.market_listings;
  if (!listing) return bad("Listing missing");

  const status = String(order.status);
  const category = String(listing.category); // product|service
  const deliveryType = String(listing.delivery_type); // physical|digital|in_person

  // We also look up whether OTP exists / deliverable exists (so buttons can change)
  const [otpRes, deliverableRes, disputeRes] = await Promise.all([
    admin.from("market_order_otps").select("order_id,verified_at,expires_at").eq("order_id", order_id).maybeSingle(),
    admin.from("market_deliverables").select("order_id").eq("order_id", order_id).maybeSingle(),
    admin.from("market_disputes").select("order_id,status").eq("order_id", order_id).maybeSingle(),
  ]);

  const otp = otpRes.data ?? null;
  const hasDeliverable = !!deliverableRes.data;
  const hasOpenDispute = !!(disputeRes.data && ["OPEN", "UNDER_REVIEW"].includes(String(disputeRes.data.status)));

  const actions: AllowedAction[] = [];

  // -------- Buyer actions --------
  if (role === "buyer") {
    if (status === "CREATED") actions.push("BUYER_CANCEL_ORDER");

    // Physical product OTP flow:
    // seller marks OUT_FOR_DELIVERY -> buyer generates OTP -> seller verifies -> DELIVERED -> buyer confirms received
    if (category === "product" && deliveryType === "physical") {
      if (status === "OUT_FOR_DELIVERY") actions.push("BUYER_GENERATE_OTP");
      if (status === "DELIVERED") actions.push("BUYER_CONFIRM_RECEIVED");
    }

    // Digital service flow:
    // deliverable uploaded -> buyer approves -> delivered+released
    if (category === "service" && deliveryType === "digital") {
      if (status === "DELIVERABLE_UPLOADED" && hasDeliverable) actions.push("BUYER_APPROVE_DIGITAL");
      if (status === "DELIVERED") actions.push("BUYER_CONFIRM_RECEIVED"); // optional, used for non-file service
    }

    // In-person service flow:
    if (category === "service" && deliveryType === "in_person") {
      if (status === "DELIVERED") actions.push("BUYER_CONFIRM_RECEIVED");
    }

    // Dispute can be opened in these states if not already open
    if (!hasOpenDispute && ["IN_ESCROW", "OUT_FOR_DELIVERY", "DELIVERABLE_UPLOADED", "DELIVERED"].includes(status)) {
      actions.push("BUYER_OPEN_DISPUTE");
    }
  }

  // -------- Seller actions --------
  if (role === "seller") {
    // seller can send physical orders out for delivery
    if (category === "product" && deliveryType === "physical") {
      if (status === "IN_ESCROW") actions.push("SELLER_OUT_FOR_DELIVERY");
      // seller verifies OTP when buyer generated it (otp exists and not verified)
      if (status === "OUT_FOR_DELIVERY" && otp && !otp.verified_at) actions.push("SELLER_VERIFY_OTP");
      // After OTP verification the order becomes DELIVERED (handled by otp_verify)
    }

    // seller uploads deliverable for digital services
    if (category === "service" && deliveryType === "digital") {
      if (status === "IN_ESCROW") actions.push("SELLER_UPLOAD_DELIVERABLE");
      // optional: if deliverable already uploaded, no upload action
      // if you want re-upload support later, you can allow upload again.
    }

    // seller can mark service delivered (in person, or digital without files)
    if (category === "service" && ["digital", "in_person"].includes(deliveryType)) {
      if (["IN_ESCROW", "DELIVERABLE_UPLOADED"].includes(status)) actions.push("SELLER_MARK_DELIVERED");
    }

    // seller dispute open
    if (!hasOpenDispute && ["IN_ESCROW", "OUT_FOR_DELIVERY", "DELIVERABLE_UPLOADED", "DELIVERED"].includes(status)) {
      actions.push("SELLER_OPEN_DISPUTE");
    }
  }

  return ok({
    order_id,
    role,
    status,
    listing: { category, delivery_type: deliveryType },
    flags: {
      otp_exists: !!otp,
      otp_verified: !!otp?.verified_at,
      deliverable_exists: hasDeliverable,
      open_dispute: hasOpenDispute,
    },
    actions,
  });
});
