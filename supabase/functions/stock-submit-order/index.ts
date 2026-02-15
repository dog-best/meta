import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";
import {
  bucketStartIso,
  buildQuote,
  isLaunchGuardActive,
  isTradingPaused,
  parseSide,
  resolveLiquidityUsdc,
  resolveSpotPriceUsdc,
  resolveStockIdentity,
  toNum,
} from "../_shared/market/stock.ts";

function round8(n: number) {
  return Math.round(n * 100000000) / 100000000;
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
  if (json?.error) throw new Error(String(json.error?.message || `RPC ${method} error`));
  return json?.result;
}

function isHexTxHash(v: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(v);
}

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
  const amountUsdcInput = toNum(body?.amount_usdc, 0);
  const quantityInput = toNum(body?.quantity, 0);
  const maxSlippageBps = toNum(body?.max_slippage_bps, 1200);
  const feeBps = toNum(body?.fee_bps, 50);
  const executionMode = String(body?.execution_mode ?? "backend_fill").trim().toLowerCase();
  const txHash = String(body?.tx_hash ?? "").trim();
  const userOpHash = String(body?.user_op_hash ?? "").trim();
  const quoteSnapshot = body?.quote_snapshot ?? null;

  if (!side) return bad("side must be buy or sell");
  const identity = await resolveStockIdentity(admin as any, { stockId, slug });
  if (!identity) return bad("Stock identity not found");
  if (isTradingPaused(identity)) return bad("Trading is paused for this stock");
  const onchainMode = executionMode === "onchain";
  if (onchainMode && !isHexTxHash(txHash)) return bad("tx_hash is required for onchain execution");

  const { data: wallet, error: walletErr } = await admin
    .from("crypto_wallets")
    .select("address,chain")
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
  if ((recentCount ?? 0) > 0) return bad("Cooldown active. Wait a few seconds before placing another order");

  if (onchainMode) {
    const { data: existingTrade, error: existingErr } = await admin
      .from("market_stock_trades")
      .select("id,stock_id,user_id,side,price_usdc,quantity,notional_usdc,fee_usdc,chain_tx_hash,traded_at,created_at")
      .eq("stock_id", identity.id)
      .eq("chain_tx_hash", txHash)
      .maybeSingle();
    if (existingErr) return bad(existingErr.message);
    if (existingTrade) {
      return ok({
        ok: true,
        order_id: null,
        trade: existingTrade,
        quote: quoteSnapshot ?? null,
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
        execution: {
          mode: "onchain",
          tx_hash: txHash,
          user_op_hash: userOpHash || null,
          indexed_existing: true,
        },
      });
    }
  }

  const [spotPrice, liquidityUsdc] = await Promise.all([
    resolveSpotPriceUsdc(admin as any, identity.id, 0.01),
    resolveLiquidityUsdc(admin as any, identity),
  ]);

  let quote: ReturnType<typeof buildQuote>;
  try {
    if (quoteSnapshot && typeof quoteSnapshot === "object") {
      quote = {
        side,
        price_spot_usdc: toNum((quoteSnapshot as any)?.price_spot_usdc, spotPrice),
        price_execution_usdc: toNum((quoteSnapshot as any)?.price_execution_usdc, spotPrice),
        quantity: toNum((quoteSnapshot as any)?.quantity, side === "buy" ? 0 : quantityInput),
        notional_usdc: toNum((quoteSnapshot as any)?.notional_usdc, side === "buy" ? amountUsdcInput : quantityInput * spotPrice),
        fee_usdc: toNum((quoteSnapshot as any)?.fee_usdc, 0),
        price_impact_bps: toNum((quoteSnapshot as any)?.price_impact_bps, 0),
        slippage_bps: toNum((quoteSnapshot as any)?.slippage_bps, 0),
        max_trade_usdc: toNum((quoteSnapshot as any)?.max_trade_usdc, liquidityUsdc * 0.2),
        cooldown_seconds: toNum((quoteSnapshot as any)?.cooldown_seconds, 10),
        liquidity_usdc: toNum((quoteSnapshot as any)?.liquidity_usdc, liquidityUsdc),
        launch_guard_active: Boolean((quoteSnapshot as any)?.launch_guard_active),
      };
    } else {
      quote = buildQuote({
        side,
        spotPriceUsdc: spotPrice,
        liquidityUsdc,
        amountUsdc: amountUsdcInput,
        quantity: quantityInput,
        feeBps,
        maxSlippageBps,
        launchGuardActive: isLaunchGuardActive(identity),
      });
    }
  } catch (e: any) {
    return bad(String(e?.message ?? e));
  }

  if (side === "sell") {
    const { data: pos, error: posErr } = await admin
      .from("market_stock_positions")
      .select("balance_qty")
      .eq("stock_id", identity.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (posErr) return bad(posErr.message);
    const balance = toNum(pos?.balance_qty, 0);
    if (balance < quote.quantity) return bad(`Insufficient balance (${balance.toFixed(6)} ${identity.symbol})`);
  }

  if (onchainMode) {
    const { data: cfg, error: cfgErr } = await admin
      .from("market_chain_config")
      .select("rpc_url,confirmations_required,active")
      .eq("chain", identity.chain)
      .eq("active", true)
      .maybeSingle();
    if (cfgErr) return bad(cfgErr.message);
    if (!cfg?.rpc_url) return bad(`rpc_url missing for ${identity.chain}`);

    const receipt: any = await rpcCall(String(cfg.rpc_url), "eth_getTransactionReceipt", [txHash]);
    if (!receipt) return bad("Transaction receipt not found on chain yet");
    if (String(receipt.status || "").toLowerCase() !== "0x1") return bad("On-chain trade transaction failed");

    const latestBlockHex = await rpcCall(String(cfg.rpc_url), "eth_blockNumber", []);
    const latestBlock = Number.parseInt(String(latestBlockHex || "0x0"), 16);
    const txBlock = Number.parseInt(String(receipt.blockNumber || "0x0"), 16);
    const confirmations = Number.isFinite(latestBlock) && Number.isFinite(txBlock) ? (latestBlock - txBlock + 1) : 1;
    const required = Math.max(1, Number(cfg.confirmations_required ?? 1));
    if (confirmations < required) {
      return bad(`Awaiting confirmations (${confirmations}/${required})`);
    }
  }

  const { data: order, error: orderErr } = await admin
    .from("market_stock_orders")
    .insert({
      stock_id: identity.id,
      user_id: user.id,
      side,
      quote_price_usdc: round8(quote.price_execution_usdc),
      amount_usdc: side === "buy" ? round8(quote.notional_usdc) : null,
      quantity: side === "sell" ? round8(quote.quantity) : null,
      slippage_bps: Math.round(maxSlippageBps),
      max_price_impact_bps: Math.round(quote.price_impact_bps),
      status: "submitted",
      submitted_tx_hash: onchainMode ? txHash : null,
    })
    .select("*")
    .single();
  if (orderErr || !order) return bad(orderErr?.message ?? "Failed to create order");

  try {
    const nowIso = new Date().toISOString();
    const { data: trade, error: tradeErr } = await admin
      .from("market_stock_trades")
      .insert({
        stock_id: identity.id,
        user_id: user.id,
        side,
        price_usdc: round8(quote.price_execution_usdc),
        quantity: round8(quote.quantity),
        notional_usdc: round8(quote.notional_usdc),
        fee_usdc: round8(quote.fee_usdc),
        chain_tx_hash: onchainMode ? txHash : null,
        traded_at: nowIso,
      })
      .select("*")
      .single();
    if (tradeErr || !trade) throw new Error(tradeErr?.message ?? "Failed to write trade");

    const bucketStart = bucketStartIso(nowIso, "1m");
    const { data: candle, error: candleErr } = await admin
      .from("market_stock_candles_1m")
      .select("stock_id,bucket_start,open_price_usdc,high_price_usdc,low_price_usdc,close_price_usdc,volume_qty,volume_usdc,trades_count")
      .eq("stock_id", identity.id)
      .eq("bucket_start", bucketStart)
      .maybeSingle();
    if (candleErr) throw new Error(candleErr.message);

    if (!candle) {
      const { error: insCandleErr } = await admin
        .from("market_stock_candles_1m")
        .insert({
          stock_id: identity.id,
          bucket_start: bucketStart,
          open_price_usdc: round8(quote.price_execution_usdc),
          high_price_usdc: round8(quote.price_execution_usdc),
          low_price_usdc: round8(quote.price_execution_usdc),
          close_price_usdc: round8(quote.price_execution_usdc),
          volume_qty: round8(quote.quantity),
          volume_usdc: round8(quote.notional_usdc),
          trades_count: 1,
        });
      if (insCandleErr) throw new Error(insCandleErr.message);
    } else {
      const { error: updCandleErr } = await admin
        .from("market_stock_candles_1m")
        .update({
          high_price_usdc: Math.max(toNum(candle.high_price_usdc, 0), quote.price_execution_usdc),
          low_price_usdc: Math.min(toNum(candle.low_price_usdc, quote.price_execution_usdc), quote.price_execution_usdc),
          close_price_usdc: round8(quote.price_execution_usdc),
          volume_qty: round8(toNum(candle.volume_qty, 0) + quote.quantity),
          volume_usdc: round8(toNum(candle.volume_usdc, 0) + quote.notional_usdc),
          trades_count: Number(candle.trades_count ?? 0) + 1,
          updated_at: nowIso,
        })
        .eq("stock_id", identity.id)
        .eq("bucket_start", bucketStart);
      if (updCandleErr) throw new Error(updCandleErr.message);
    }

    const marketCap = quote.price_execution_usdc * toNum(identity.total_supply, 10_000_000);
    const { error: pointErr } = await admin
      .from("market_stock_price_points")
      .upsert({
        stock_id: identity.id,
        last_price_usdc: round8(quote.price_execution_usdc),
        market_cap_usdc: round8(marketCap),
        updated_at: nowIso,
      });
    if (pointErr) throw new Error(pointErr.message);

    const { data: currentPos, error: posErr } = await admin
      .from("market_stock_positions")
      .select("stock_id,user_id,balance_qty,avg_cost_usdc,realized_pnl_usdc")
      .eq("stock_id", identity.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (posErr) throw new Error(posErr.message);

    const oldBalance = toNum(currentPos?.balance_qty, 0);
    const oldAvg = toNum(currentPos?.avg_cost_usdc, 0);
    const oldRealized = toNum(currentPos?.realized_pnl_usdc, 0);

    let nextBalance = oldBalance;
    let nextAvg = oldAvg;
    let nextRealized = oldRealized;
    if (side === "buy") {
      nextBalance = oldBalance + quote.quantity;
      nextAvg = nextBalance <= 0
        ? 0
        : oldBalance <= 0
        ? quote.price_execution_usdc
        : ((oldBalance * oldAvg) + (quote.quantity * quote.price_execution_usdc)) / nextBalance;
    } else {
      if (oldBalance < quote.quantity) throw new Error("Insufficient position balance during execution");
      nextBalance = oldBalance - quote.quantity;
      nextAvg = nextBalance <= 0 ? 0 : oldAvg;
      nextRealized = oldRealized + ((quote.price_execution_usdc - oldAvg) * quote.quantity);
    }

    const { error: upsertPosErr } = await admin
      .from("market_stock_positions")
      .upsert({
        stock_id: identity.id,
        user_id: user.id,
        balance_qty: round8(nextBalance),
        avg_cost_usdc: round8(nextAvg),
        realized_pnl_usdc: round8(nextRealized),
        updated_at: nowIso,
      });
    if (upsertPosErr) throw new Error(upsertPosErr.message);

    const { error: finalOrderErr } = await admin
      .from("market_stock_orders")
      .update({
        status: "filled",
        filled_trade_id: trade.id,
        updated_at: nowIso,
      })
      .eq("id", order.id);
    if (finalOrderErr) throw new Error(finalOrderErr.message);

    return ok({
      ok: true,
      order_id: order.id,
      trade,
      quote,
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
      execution: {
        mode: onchainMode ? "onchain" : "backend_fill",
        tx_hash: onchainMode ? txHash : null,
        user_op_hash: onchainMode ? (userOpHash || null) : null,
        note: onchainMode
          ? "On-chain execution recorded and indexed."
          : "Execution is currently backend-filled. Switch to on-chain settlement in next phase.",
      },
    });
  } catch (e: any) {
    await admin
      .from("market_stock_orders")
      .update({
        status: "failed",
        fail_reason: String(e?.message ?? e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return bad(String(e?.message ?? e), { order_id: order.id });
  }
});
