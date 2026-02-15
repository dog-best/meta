import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";

function isMissingFunctionError(err: unknown) {
  const msg = String((err as any)?.message ?? err ?? "");
  return /requested function was not found|function was not found|edge function not found/i.test(msg);
}

async function callStockFn<T>(primary: string, body: any, fallback?: string) {
  try {
    return await callFn<T>(primary, body);
  } catch (e) {
    if (fallback && isMissingFunctionError(e)) {
      return await callFn<T>(fallback, body);
    }
    throw e;
  }
}

export type StockOverviewItem = {
  identity_id: string;
  store_id: string;
  slug: string;
  token_name: string;
  token_symbol: string;
  chain: string;
  status: string;
  market_username: string | null;
  display_name?: string | null;
  business_name: string | null;
  is_verified: boolean;
  logo_path?: string | null;
  price: number;
  market_cap: number;
  volume_24h_quote: number;
  trades_24h: number;
  last_trade_at: string | null;
  change_24h_pct?: number;
  sparkline_prices?: number[];
  created_at?: string;
};

export async function fetchStocksOverview(limit = 30, offset = 0) {
  return await callStockFn<{
    ok: boolean;
    mode: "list";
    items: StockOverviewItem[];
    chains: any[];
    pagination: { limit: number; offset: number };
  }>("stock-feed", { mode: "list", limit, offset }, "stocks-market-data");
}

export async function fetchStockDetail(params: {
  stock_id?: string;
  slug?: string;
  timeframe?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candle_limit?: number;
  trade_limit?: number;
}) {
  return await callStockFn<{
    ok: boolean;
    mode: "detail";
    timeframe: string;
    identity: any;
    seller: any;
    stats: {
      price: number;
      market_cap: number;
      volume_24h_quote: number;
      trades_24h: number;
      price_point_at: string | null;
      launch_guard_active: boolean;
      trading_paused: boolean;
    };
    reserve: any;
    reinvestments: any[];
    candles: any[];
    trades: any[];
    my_position: any;
  }>("stock-feed", {
    mode: "detail",
    stock_id: params.stock_id,
    slug: params.slug,
    timeframe: params.timeframe ?? "1m",
    candle_limit: params.candle_limit ?? 180,
    trade_limit: params.trade_limit ?? 80,
  }, "stocks-market-data");
}

export async function createStockIdentity(input: {
  name: string;
  symbol: string;
  chain?: string | null;
  slug?: string | null;
  initial_price_usdc?: number;
  tx_hash?: string;
  user_op_hash?: string;
  token_address?: string;
  pool_address?: string;
  vault_address?: string;
  staking_address?: string;
  store_key?: string;
}) {
  return await callStockFn<{
    ok: boolean;
    created: boolean;
    identity: any;
    chain_config: any;
    economics: {
      creation_fee_usdc: number;
      liquidity_usdc: number;
      reserve_usdc: number;
    };
  }>("stock-create-identity", input, "stocks-create-identity");
}

export async function getStockQuote(input: {
  stock_id?: string;
  slug?: string;
  side: "buy" | "sell";
  amount_usdc?: number;
  quantity?: number;
  max_slippage_bps?: number;
}) {
  return await callStockFn<{
    ok: boolean;
    identity: any;
    wallet: any;
    quote: any;
    guardrails: any;
  }>("stock-quote", input);
}

export async function submitStockOrder(input: {
  stock_id?: string;
  slug?: string;
  side: "buy" | "sell";
  amount_usdc?: number;
  quantity?: number;
  max_slippage_bps?: number;
  tx_hash?: string;
  user_op_hash?: string;
  execution_mode?: "backend_fill" | "onchain";
  quote_snapshot?: any;
}) {
  return await callStockFn<{
    ok: boolean;
    order_id: string | null;
    trade: any;
    quote: any;
    identity: any;
    wallet: any;
    execution: any;
  }>("stock-submit-order", input, "stocks-place-trade");
}

export async function listStockChat(input: {
  stock_id?: string;
  slug?: string;
  limit?: number;
  before?: string;
}) {
  return await callStockFn<{
    ok: boolean;
    action: "list";
    stock: any;
    messages: any[];
  }>("stock-chat", {
    action: "list",
    stock_id: input.stock_id,
    slug: input.slug,
    limit: input.limit ?? 50,
    before: input.before ?? null,
  }, "stocks-chat");
}

export async function postStockChat(input: { stock_id?: string; slug?: string; body: string }) {
  return await callStockFn<{
    ok: boolean;
    action: "post";
    stock: any;
    message: any;
  }>("stock-chat", {
    action: "post",
    stock_id: input.stock_id,
    slug: input.slug,
    body: input.body,
  }, "stocks-chat");
}

export async function fetchMyStockPortfolio() {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { data: positions, error: posErr } = await supabase
    .from("market_stock_positions")
    .select("stock_id,user_id,balance_qty,avg_cost_usdc,realized_pnl_usdc,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (posErr) throw new Error(posErr.message);

  const rows = positions ?? [];
  const stockIds = Array.from(new Set(rows.map((p: any) => String(p.stock_id))));
  if (!stockIds.length) return { positions: [], total_value_usdc: 0 };

  const [{ data: identities, error: idErr }, { data: points, error: pointErr }] = await Promise.all([
    supabase
      .from("market_stock_identities")
      .select("id,slug,name,symbol,chain,active")
      .in("id", stockIds),
    supabase
      .from("market_stock_price_points")
      .select("stock_id,last_price_usdc,market_cap_usdc,updated_at")
      .in("stock_id", stockIds),
  ]);
  if (idErr) throw new Error(idErr.message);
  if (pointErr) throw new Error(pointErr.message);

  const identityMap = new Map((identities ?? []).map((r: any) => [String(r.id), r]));
  const pointMap = new Map((points ?? []).map((r: any) => [String(r.stock_id), r]));

  const computed = rows.map((p: any) => {
    const identity = identityMap.get(String(p.stock_id)) ?? null;
    const point = pointMap.get(String(p.stock_id));
    const priceNow = Number(point?.last_price_usdc ?? 0);
    const qty = Number(p.balance_qty ?? 0);
    const avg = Number(p.avg_cost_usdc ?? 0);
    const value = qty * priceNow;
    const unrealized = (priceNow - avg) * qty;
    return {
      ...p,
      identity,
      price_now_usdc: priceNow,
      value_usdc: value,
      unrealized_pnl_usdc: unrealized,
    };
  });

  const total = computed.reduce((acc, p) => acc + Number(p.value_usdc ?? 0), 0);
  return {
    positions: computed,
    total_value_usdc: total,
  };
}
