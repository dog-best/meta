import { supabaseUserClient, supabaseAdminClient } from "../_shared/market/supabase.ts";
import { ok, bad, unauth, methodNotAllowed } from "../_shared/market/http.ts";

type ListingCategory = "product" | "service";
type DeliveryType = "physical" | "digital" | "in_person";
type Currency = "NGN" | "USDC";

function assertCategoryRules(category: ListingCategory, delivery_type: DeliveryType) {
  if (category === "product" && delivery_type !== "physical") {
    throw new Error("product listings must have delivery_type=physical");
  }
  if (category === "service" && !["digital", "in_person"].includes(delivery_type)) {
    throw new Error("service listings must have delivery_type=digital or in_person");
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));

  const category = String(body.category) as ListingCategory;
  const delivery_type = String(body.delivery_type) as DeliveryType;
  const currency = (body.currency ? String(body.currency) : "NGN") as Currency;

  if (!["product", "service"].includes(category)) return bad("Invalid category");
  if (!["physical", "digital", "in_person"].includes(delivery_type)) return bad("Invalid delivery_type");
  if (!["NGN", "USDC"].includes(currency)) return bad("Invalid currency");

  try {
    assertCategoryRules(category, delivery_type);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return bad(errorMessage);
  }

  const price_amount = Number(body.price_amount);
  if (!Number.isFinite(price_amount) || price_amount <= 0) return bad("price_amount must be > 0");

  const row = {
    seller_id: u.user.id,
    category,
    sub_category: String(body.sub_category ?? "").trim(),
    title: String(body.title ?? "").trim(),
    description: body.description ? String(body.description) : null,
    price_amount,
    currency,
    delivery_type,
    stock_qty: body.stock_qty === null || body.stock_qty === undefined ? null : Number(body.stock_qty),
    is_active: body.is_active === undefined ? true : !!body.is_active,
  };

  if (!row.sub_category) return bad("sub_category is required");
  if (!row.title) return bad("title is required");
  if (row.stock_qty !== null && (!Number.isInteger(row.stock_qty) || row.stock_qty < 0)) return bad("stock_qty must be null or >= 0");

  const { data: listing, error } = await admin
    .from("market_listings")
    .insert(row)
    .select("*")
    .single();

  if (error) return bad(error.message);

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "LISTING_CREATED",
    entity_type: "market_listings",
    entity_id: listing.id,
    payload: { category, delivery_type, currency },
  });

  return ok({ listing });
});
