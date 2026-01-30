import { supabase } from "@/services/supabase";

/**
 * IMPORTANT:
 * Do NOT sign deliverable URLs on the client (buyers could bypass rules).
 * Use an Edge Function to check:
 * - auth user
 * - order status (RELEASED etc)
 * - user is buyer/seller
 * then return a short-lived signed URL.
 */
const FN_GET_DELIVERABLE_URL = "market-order-deliverable-url";

export async function getDeliverableUrl(orderId: string) {
  const { data, error } = await supabase.functions.invoke(FN_GET_DELIVERABLE_URL, {
    body: { order_id: orderId },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("Deliverable URL not available");
  return String(data.url);
}
