import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";
import { addRaw, feeFromRaw, getFeeBps, getFeeRecipient, toUsdcRaw } from "../_shared/market/crypto.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const order_id = String(body?.order_id ?? "");
  const chain = String(body?.chain ?? "");

  if (!order_id) return bad("order_id required");

  const { data: order } = await admin
    .from("market_orders")
    .select("id,buyer_id,currency,status,amount,listing_id")
    .eq("id", order_id)
    .maybeSingle();

  if (!order) return bad("Order not found");
  if (order.buyer_id !== user.id) return bad("Not your order");
  if (order.currency !== "USDC") return bad("Not USDC order");

  const { data: esc, error: escErr } = await admin
    .from("market_crypto_escrows")
    .select("order_id,order_key,buyer_wallet,seller_wallet,token_address,escrow_address,amount_units,chain")
    .eq("order_id", order_id)
    .maybeSingle();

  if (escErr || !esc) return bad("Crypto escrow mapping not found");

  const chainToUse = chain || esc.chain;
  if (chain && esc.chain && chain !== esc.chain) return bad("Chain mismatch");

  const { data: cfg } = await admin
    .from("market_chain_config")
    .select("chain,chain_id,usdc_address,escrow_address,confirmations_required,rpc_url,active")
    .eq("chain", chainToUse)
    .eq("active", true)
    .maybeSingle();

  if (!cfg) return bad("Chain config missing");

  const amountUnits = Number(esc.amount_units);
  const amountRaw = toUsdcRaw(amountUnits);

  const feeBps = getFeeBps();
  const buyerFeeRaw = feeFromRaw(amountRaw, feeBps);
  const buyerTotalRaw = addRaw(amountRaw, buyerFeeRaw);

  await admin.from("market_crypto_escrows").update({ amount_raw: amountRaw }).eq("order_id", order_id);

  await admin.rpc("market_set_crypto_intent", {
    p_order_id: order_id,
    p_intent_type: "DEPOSIT",
    p_status: "CREATED",
    p_from_wallet: esc.buyer_wallet,
    p_to_wallet: esc.seller_wallet,
    p_amount_units: amountUnits,
    p_amount_raw: amountRaw,
    p_tx_hash: null,
    p_failure_reason: null,
  });

  return ok({
    ok: true,
    order_id,
    order_key: esc.order_key,
    chain: cfg.chain,
    chain_id: cfg.chain_id,
    confirmations_required: cfg.confirmations_required,
    rpc_url: cfg.rpc_url,
    escrow_address: cfg.escrow_address,
    usdc_address: cfg.usdc_address,
    buyer_wallet: esc.buyer_wallet,
    seller_wallet: esc.seller_wallet,
    amount_units: amountUnits,
    amount_raw: amountRaw,
    fee_bps: feeBps,
    fee_recipient: getFeeRecipient(),
    buyer_fee_raw: buyerFeeRaw,
    buyer_total_raw: buyerTotalRaw,
    contract_method: "deposit(bytes32 orderKey, address seller, uint256 amount)",
  });
});
