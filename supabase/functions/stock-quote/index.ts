import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";
import {
  buildQuote,
  isLaunchGuardActive,
  isTradingPaused,
  parseSide,
  resolveLiquidityUsdc,
  resolveSpotPriceUsdc,
  resolveStockIdentity,
  toNum,
} from "../_shared/market/stock.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const userClient = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await userClient.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const stockId = String(body?.stock_id ?? body?.identity_id ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase();
  const side = parseSide(body?.side);
  const amountUsdc = toNum(body?.amount_usdc, 0);
  const quantity = toNum(body?.quantity, 0);
  const maxSlippageBps = toNum(body?.max_slippage_bps, 1200);
  const feeBps = toNum(body?.fee_bps, 50);

  if (!side) return bad("side must be buy or sell");
  const identity = await resolveStockIdentity(admin as any, { stockId, slug });
  if (!identity) return bad("Stock identity not found");
  if (isTradingPaused(identity)) return bad("Trading is paused for this stock");

  const { data: wallet, error: walletErr } = await admin
    .from("crypto_wallets")
    .select("id,address,chain")
    .eq("user_id", user.id)
    .eq("chain", identity.chain)
    .maybeSingle();
  if (walletErr) return bad(walletErr.message);
  if (!wallet?.address) return bad(`No wallet found for ${identity.chain}`);

  const cutoff = new Date(Date.now() - 10 * 1000).toISOString();
  const { count: recentCount, error: recentErr } = await admin
    .from("market_stock_orders")
    .select("id", { count: "exact", head: true })
    .eq("stock_id", identity.id)
    .eq("user_id", user.id)
    .gte("created_at", cutoff);
  if (recentErr) return bad(recentErr.message);
  if ((recentCount ?? 0) > 0) return bad("Cooldown active. Please wait before placing another order");

  if (side === "sell") {
    const { data: pos, error: posErr } = await admin
      .from("market_stock_positions")
      .select("balance_qty")
      .eq("stock_id", identity.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (posErr) return bad(posErr.message);
    const balance = toNum(pos?.balance_qty, 0);
    if (quantity <= 0) return bad("quantity must be > 0 for sell");
    if (balance < quantity) return bad(`Insufficient balance. You have ${balance.toFixed(6)} ${identity.symbol}`);
  }

  const [spotPrice, liquidityUsdc] = await Promise.all([
    resolveSpotPriceUsdc(admin as any, identity.id, 0.01),
    resolveLiquidityUsdc(admin as any, identity),
  ]);

  try {
    const quote = buildQuote({
      side,
      spotPriceUsdc: spotPrice,
      liquidityUsdc,
      amountUsdc,
      quantity,
      feeBps,
      maxSlippageBps,
      launchGuardActive: isLaunchGuardActive(identity),
    });

    return ok({
      ok: true,
      identity: {
        id: identity.id,
        slug: identity.slug,
        name: identity.name,
        symbol: identity.symbol,
        chain: identity.chain,
      },
      wallet: {
        address: wallet.address,
        chain: wallet.chain,
      },
      quote,
      guardrails: {
        max_slippage_bps: maxSlippageBps,
        cooldown_seconds: quote.cooldown_seconds,
        max_trade_usdc: quote.max_trade_usdc,
        launch_guard_active: quote.launch_guard_active,
      },
    });
  } catch (e: any) {
    return bad(String(e?.message ?? e));
  }
});
