import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

const STATUSES = [
  "CREATED",
  "IN_ESCROW",
  "OUT_FOR_DELIVERY",
  "DELIVERABLE_UPLOADED",
  "DELIVERED",
  "RELEASED",
  "DISPUTED",
  "REFUNDED",
  "CANCELLED",
] as const;

async function countByStatus(admin: any, column: "buyer_id" | "seller_id", userId: string) {
  const out: Record<string, number> = {};
  for (const s of STATUSES) {
    const { count, error } = await admin
      .from("market_orders")
      .select("id", { count: "exact", head: true })
      .eq(column, userId)
      .eq("status", s);
    if (error) throw new Error(error.message);
    out[s] = count ?? 0;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  try {
    const [buyer_counts, seller_counts] = await Promise.all([
      countByStatus(admin, "buyer_id", u.user.id),
      countByStatus(admin, "seller_id", u.user.id),
    ]);

    return ok({
      buyer_counts,
      seller_counts,
      totals: {
        buyer: Object.values(buyer_counts).reduce((a, b) => a + b, 0),
        seller: Object.values(seller_counts).reduce((a, b) => a + b, 0),
      },
    });
  } catch (e) {
    return bad(String(e.message ?? e));
  }
});
