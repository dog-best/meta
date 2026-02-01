import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";
import { orderKeyKeccak } from "../_shared/market/crypto.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const listing_id = String(body?.listing_id ?? "");
  const buyer_wallet = String(body?.buyer_wallet ?? "");
  const chain = String(body?.chain ?? "");

  if (!listing_id) return bad("listing_id required");
  if (!buyer_wallet || !buyer_wallet.startsWith("0x")) return bad("buyer_wallet required");

  const { data: listing, error: listErr } = await admin
    .from("market_listings")
    .select("id,seller_id,price_amount,currency,is_active")
    .eq("id", listing_id)
    .maybeSingle();

  if (listErr || !listing || !listing.is_active) return bad("Listing not found");
  if (listing.currency !== "USDC") return bad("Listing is not USDC");

  const cfgQuery = admin
    .from("market_chain_config")
    .select("chain,usdc_address,escrow_address,chain_id,confirmations_required,active")
    .eq("active", true);

  const { data: cfg, error: cfgErr } = chain
    ? await cfgQuery.eq("chain", chain).maybeSingle()
    : await cfgQuery.maybeSingle();

  if (cfgErr || !cfg) return bad("Chain config missing");

  const { data: sellerWallet } = await admin
    .from("crypto_wallets")
    .select("address")
    .eq("user_id", listing.seller_id)
    .eq("chain", cfg.chain)
    .maybeSingle();

  if (!sellerWallet?.address) return bad("Seller wallet not found for this chain");

  const { data: order, error: ordErr } = await admin
    .from("market_orders")
    .insert({
      buyer_id: user.id,
      seller_id: listing.seller_id,
      listing_id: listing.id,
      amount: listing.price_amount,
      currency: "USDC",
      status: "CREATED",
    })
    .select("*")
    .single();

  if (ordErr || !order) return bad(ordErr?.message ?? "Order create failed");

  const orderKey = orderKeyKeccak(order.id);

  const { error: escErr } = await admin.from("market_crypto_escrows").upsert(
    {
      order_id: order.id,
      order_key: orderKey,
      chain: cfg.chain,
      buyer_wallet,
      seller_wallet: sellerWallet.address,
      token_address: cfg.usdc_address,
      escrow_address: cfg.escrow_address,
      amount_units: Number(order.amount),
      amount_raw: null,
    },
    { onConflict: "order_id" },
  );

  if (escErr) return bad(escErr.message);

  await admin.from("market_audit_logs").insert({
    actor_id: user.id,
    actor_type: "user",
    action: "USDC_ORDER_CREATED",
    entity_type: "market_orders",
    entity_id: order.id,
    payload: {
      order_key: orderKey,
      buyer_wallet,
      seller_wallet: sellerWallet.address,
      escrow: cfg.escrow_address,
      usdc: cfg.usdc_address,
      chain: cfg.chain,
    },
  });

  return ok({
    ok: true,
    order,
    crypto: {
      order_key: orderKey,
      chain: cfg.chain,
      chain_id: cfg.chain_id,
      confirmations_required: cfg.confirmations_required,
      usdc_address: cfg.usdc_address,
      escrow_address: cfg.escrow_address,
    },
  });
});
