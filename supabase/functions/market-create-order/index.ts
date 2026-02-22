import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed(req);

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const listing_id = String(body.listing_id ?? "");
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  const delivery_address = body.delivery_address ?? {};

  if (!listing_id) return bad("listing_id required");
  if (!Number.isInteger(quantity) || quantity < 1) return bad("quantity must be >= 1");

  const { data: listing, error: le } = await admin
    .from("market_listings")
    .select("id,seller_id,price_amount,currency,is_active,stock_qty,payment_options")
    .eq("id", listing_id)
    .maybeSingle();

  if (le || !listing || !listing.is_active) return bad("Listing not found or inactive");
  if (listing.seller_id === u.user.id) return bad("You cannot buy your own listing");

  if (listing.stock_qty !== null && listing.stock_qty < quantity) {
    return bad("Not enough stock");
  }
  if ((listing as any)?.payment_options?.out_of_stock === true) {
    return bad("Listing is out of stock");
  }

  const expiresAt = (listing as any)?.payment_options?.expires_at;
  if (expiresAt) {
    const exp = Date.parse(String(expiresAt));
    if (Number.isFinite(exp) && exp <= Date.now()) {
      return bad("This listing has expired");
    }
  }

  let unit_price = Number(listing.price_amount);
  const d = (listing as any)?.payment_options?.discount;
  if (d?.enabled) {
    const endsAt = d?.endsAt ? Date.parse(String(d.endsAt)) : null;
    const stillValid = !endsAt || (Number.isFinite(endsAt) && endsAt > Date.now());
    const discounted = Number(d?.discountedPrice);
    if (stillValid && Number.isFinite(discounted) && discounted > 0) {
      unit_price = discounted;
    }
  }
  const amount = Number((unit_price * quantity).toFixed(2));

  let reservedStock:
    | {
        stock_before: number | null;
        stock_after: number | null;
        depleted: boolean;
        listing_active: boolean;
      }
    | null = null;

  if (listing.stock_qty !== null) {
    const { data: reserveData, error: reserveErr } = await admin.rpc("market_reserve_listing_stock", {
      p_listing_id: listing.id,
      p_quantity: quantity,
    });
    if (reserveErr) {
      const reserveMsg = String(reserveErr.message || "");
      if (reserveMsg.toLowerCase().includes("not enough stock")) return bad("Not enough stock");
      return bad(reserveMsg || "Unable to reserve stock");
    }

    const row: any = Array.isArray(reserveData) ? reserveData[0] : reserveData;
    reservedStock = {
      stock_before: row?.stock_before === null || row?.stock_before === undefined ? null : Number(row.stock_before),
      stock_after: row?.stock_after === null || row?.stock_after === undefined ? null : Number(row.stock_after),
      depleted: row?.depleted === true,
      listing_active: row?.listing_active === true,
    };
  }

  const { data: order, error } = await admin
    .from("market_orders")
    .insert({
      buyer_id: u.user.id,
      seller_id: listing.seller_id,
      listing_id: listing.id,
      quantity,
      unit_price,
      amount,
      currency: listing.currency,
      status: "CREATED",
      delivery_address,
      note: body.note ? String(body.note) : null,
    })
    .select("*")
    .single();

  if (error) {
    // Best-effort restore if order insert fails after stock reservation.
    if (
      reservedStock &&
      reservedStock.stock_before !== null &&
      reservedStock.stock_after !== null
    ) {
      await admin
        .from("market_listings")
        .update({
          stock_qty: reservedStock.stock_before,
          is_active: true,
          payment_options: (listing as any)?.payment_options ?? {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", listing.id)
        .eq("stock_qty", reservedStock.stock_after);
    }
    return bad(error.message);
  }

  await admin.from("market_audit_logs").insert({
    actor_id: u.user.id,
    actor_type: "user",
    action: "ORDER_CREATED",
    entity_type: "market_orders",
    entity_id: order.id,
    payload: {
      listing_id,
      quantity,
      amount,
      stock_before: reservedStock?.stock_before ?? null,
      stock_after: reservedStock?.stock_after ?? null,
      stock_depleted: reservedStock?.depleted === true,
    },
  });

  if (reservedStock?.depleted) {
    await admin.from("market_audit_logs").insert({
      actor_id: u.user.id,
      actor_type: "system",
      action: "LISTING_AUTO_CLOSED_OUT_OF_STOCK",
      entity_type: "market_listings",
      entity_id: listing.id,
      payload: {
        listing_id: listing.id,
        order_id: order.id,
        stock_before: reservedStock.stock_before,
        stock_after: reservedStock.stock_after,
      },
    });
  }

  return ok({ order });
});
