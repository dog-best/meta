import { supabase } from "@/services/supabase";

export type HistoryKind =
  | "deposit"
  | "withdrawal"
  | "transfer_in"
  | "transfer_out"
  | "market_buy"
  | "market_sell"
  | "market_crypto"
  | "stock_buy"
  | "stock_sell"
  | "stock_profit"
  | "fee"
  | "refund"
  | "release";

export type MarketHistoryEntry = {
  id: string;
  source_table: string;
  source_id: string;
  kind: HistoryKind | string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  tx_hash: string | null;
  order_id: string | null;
  stock_id: string | null;
  details: any;
  occurred_at: string;
  created_at: string;
};

function toNum(input: unknown, fallback = 0) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function toIso(input: unknown, fallback?: string) {
  const d = new Date(String(input || ""));
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return fallback || new Date().toISOString();
}

function normalizeRow(row: any): MarketHistoryEntry {
  return {
    id: String(row.id || ""),
    source_table: String(row.source_table || ""),
    source_id: String(row.source_id || ""),
    kind: String(row.kind || ""),
    title: String(row.title || "Transaction"),
    amount: toNum(row.amount, 0),
    currency: String(row.currency || "USD").toUpperCase(),
    status: String(row.status || "PENDING").toUpperCase(),
    tx_hash: row.tx_hash ? String(row.tx_hash) : null,
    order_id: row.order_id ? String(row.order_id) : null,
    stock_id: row.stock_id ? String(row.stock_id) : null,
    details: row.details ?? {},
    occurred_at: toIso(row.occurred_at, toIso(row.created_at)),
    created_at: toIso(row.created_at),
  };
}

function isMissingHistoryTableError(error: unknown) {
  const msg = String((error as any)?.message || error || "").toLowerCase();
  return (
    msg.includes("market_transaction_history") &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("schema cache") ||
      msg.includes("pgrst"))
  );
}

function orderStatusToHistory(status: unknown) {
  const s = String(status || "").toUpperCase();
  if (["RELEASED"].includes(s)) return "SUCCESS";
  if (["REFUNDED"].includes(s)) return "REFUNDED";
  if (["CANCELLED"].includes(s)) return "CANCELLED";
  if (["FAILED"].includes(s)) return "FAILED";
  return "PENDING";
}

function walletTypeToKind(input: unknown): HistoryKind {
  const t = String(input || "").toLowerCase();
  if (t === "deposit") return "deposit";
  if (t === "withdrawal") return "withdrawal";
  if (t === "transfer_in") return "transfer_in";
  if (t === "transfer_out") return "transfer_out";
  if (t === "fee" || t === "bill") return "fee";
  return "fee";
}

function walletTypeTitle(input: unknown) {
  const t = String(input || "").toLowerCase();
  if (t === "deposit") return "NGN wallet deposit";
  if (t === "withdrawal") return "NGN wallet withdrawal";
  if (t === "transfer_in") return "Wallet transfer received";
  if (t === "transfer_out") return "Wallet transfer sent";
  if (t === "bill") return "Wallet bill payment";
  if (t === "fee") return "Wallet fee";
  return "Wallet transaction";
}

async function fetchLegacyHistory(userId: string, limit: number) {
  const [walletRes, ordersRes, stockTradesRes, stockPositionsRes] = await Promise.all([
    supabase
      .from("app_wallet_tx_simple")
      .select("id,type,amount,reference,meta,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200)),
    supabase
      .from("market_orders")
      .select("id,buyer_id,seller_id,listing_id,quantity,unit_price,amount,fee_amount,currency,status,created_at,in_escrow_at,delivered_at,released_at,refunded_at,cancelled_at")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200)),
    supabase
      .from("market_stock_trades")
      .select("id,stock_id,side,price_usdc,quantity,notional_usdc,fee_usdc,chain_tx_hash,traded_at,created_at")
      .eq("user_id", userId)
      .order("traded_at", { ascending: false })
      .limit(Math.min(limit, 200)),
    supabase
      .from("market_stock_positions")
      .select("stock_id,realized_pnl_usdc,updated_at")
      .eq("user_id", userId)
      .neq("realized_pnl_usdc", 0)
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);

  if (walletRes.error) throw new Error(walletRes.error.message);
  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (stockTradesRes.error) throw new Error(stockTradesRes.error.message);
  if (stockPositionsRes.error) throw new Error(stockPositionsRes.error.message);

  const orders = (ordersRes.data ?? []) as any[];
  const orderMap = new Map<string, any>(orders.map((o: any) => [String(o.id), o]));
  const orderIds = orders.map((o: any) => String(o.id));

  let intents: any[] = [];
  if (orderIds.length) {
    const intentRes = await supabase
      .from("market_crypto_intents")
      .select("id,order_id,intent_type,status,chain,from_wallet,to_wallet,amount_units,amount_raw,tx_hash,client_reference,created_at,updated_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit * 2, 500));
    if (intentRes.error) throw new Error(intentRes.error.message);
    intents = (intentRes.data ?? []) as any[];
  }

  const stockIds = Array.from(
    new Set([
      ...((stockTradesRes.data ?? []) as any[]).map((r: any) => String(r.stock_id)),
      ...((stockPositionsRes.data ?? []) as any[]).map((r: any) => String(r.stock_id)),
    ]),
  );
  let stockMap = new Map<string, any>();
  if (stockIds.length) {
    const stockRes = await supabase
      .from("market_stock_identities")
      .select("id,slug,name,symbol")
      .in("id", stockIds);
    if (stockRes.error) throw new Error(stockRes.error.message);
    stockMap = new Map<string, any>((stockRes.data ?? []).map((s: any) => [String(s.id), s]));
  }

  const out: MarketHistoryEntry[] = [];

  for (const tx of walletRes.data ?? []) {
    const kind = walletTypeToKind((tx as any).type);
    out.push({
      id: `wallet:${String((tx as any).id)}`,
      source_table: "app_wallet_tx_simple",
      source_id: String((tx as any).id),
      kind,
      title: walletTypeTitle((tx as any).type),
      amount: toNum((tx as any).amount, 0),
      currency: String((tx as any)?.meta?.currency || "NGN").toUpperCase(),
      status: "SUCCESS",
      tx_hash: null,
      order_id: null,
      stock_id: null,
      details: {
        reference: (tx as any).reference ?? null,
        meta: (tx as any).meta ?? {},
      },
      occurred_at: toIso((tx as any).created_at),
      created_at: toIso((tx as any).created_at),
    });
  }

  for (const order of orders) {
    const isBuyer = String(order.buyer_id) === userId;
    const role = isBuyer ? "buyer" : "seller";
    const amount = isBuyer
      ? toNum(order.amount, 0) + toNum(order.fee_amount, 0)
      : toNum(order.amount, 0);
    out.push({
      id: `order:${String(order.id)}:${role}`,
      source_table: "market_orders",
      source_id: String(order.id),
      kind: isBuyer ? "market_buy" : "market_sell",
      title: isBuyer ? "Marketplace purchase" : "Marketplace sale",
      amount,
      currency: String(order.currency || "USD").toUpperCase(),
      status: orderStatusToHistory(order.status),
      tx_hash: null,
      order_id: String(order.id),
      stock_id: null,
      details: {
        role,
        listing_id: order.listing_id ?? null,
        quantity: order.quantity ?? 1,
        unit_price: order.unit_price ?? 0,
        base_amount: order.amount ?? 0,
        fee_amount: order.fee_amount ?? 0,
        order_status: String(order.status || "").toUpperCase(),
      },
      occurred_at: toIso(
        order.released_at ||
          order.refunded_at ||
          order.cancelled_at ||
          order.delivered_at ||
          order.in_escrow_at ||
          order.created_at,
      ),
      created_at: toIso(order.created_at),
    });
  }

  for (const intent of intents) {
    const order = orderMap.get(String(intent.order_id));
    if (!order) continue;
    const type = String(intent.intent_type || "").toUpperCase();
    const isBuyer = String(order.buyer_id) === userId;
    const isSeller = String(order.seller_id) === userId;
    if (type === "DEPOSIT" && !isBuyer) continue;
    if (type === "REFUND" && !isBuyer) continue;
    if (type === "RELEASE" && !isSeller) continue;

    const title =
      type === "DEPOSIT"
        ? "Crypto escrow deposit"
        : type === "RELEASE"
        ? "Crypto escrow release"
        : "Crypto escrow refund";
    out.push({
      id: `crypto:${String(intent.id)}`,
      source_table: "market_crypto_intents",
      source_id: String(intent.id),
      kind: "market_crypto",
      title,
      amount: toNum(intent.amount_units, toNum(order.amount, 0)),
      currency: String(order.currency || "USDC").toUpperCase(),
      status: String(intent.status || "PENDING").toUpperCase(),
      tx_hash: intent.tx_hash ? String(intent.tx_hash) : null,
      order_id: String(order.id),
      stock_id: null,
      details: {
        intent_type: type,
        chain: intent.chain ?? null,
        from_wallet: intent.from_wallet ?? null,
        to_wallet: intent.to_wallet ?? null,
        amount_raw: intent.amount_raw ?? null,
        client_reference: intent.client_reference ?? null,
      },
      occurred_at: toIso(intent.updated_at || intent.created_at),
      created_at: toIso(intent.created_at),
    });
  }

  for (const trade of stockTradesRes.data ?? []) {
    const stock = stockMap.get(String((trade as any).stock_id));
    const side = String((trade as any).side || "").toLowerCase();
    const symbol = String(stock?.symbol || "STK").toUpperCase();
    out.push({
      id: `stock:${String((trade as any).id)}`,
      source_table: "market_stock_trades",
      source_id: String((trade as any).id),
      kind: side === "sell" ? "stock_sell" : "stock_buy",
      title: side === "sell" ? `Stock sell: ${symbol}` : `Stock buy: ${symbol}`,
      amount: toNum((trade as any).notional_usdc, 0),
      currency: "USDC",
      status: "SUCCESS",
      tx_hash: (trade as any).chain_tx_hash ? String((trade as any).chain_tx_hash) : null,
      order_id: null,
      stock_id: String((trade as any).stock_id),
      details: {
        stock_name: stock?.name ?? null,
        stock_symbol: symbol,
        side,
        price_usdc: toNum((trade as any).price_usdc, 0),
        quantity: toNum((trade as any).quantity, 0),
        fee_usdc: toNum((trade as any).fee_usdc, 0),
      },
      occurred_at: toIso((trade as any).traded_at || (trade as any).created_at),
      created_at: toIso((trade as any).created_at),
    });
  }

  for (const row of stockPositionsRes.data ?? []) {
    const stock = stockMap.get(String((row as any).stock_id));
    const symbol = String(stock?.symbol || "STK").toUpperCase();
    const pnl = toNum((row as any).realized_pnl_usdc, 0);
    out.push({
      id: `stock-profit:${String((row as any).stock_id)}`,
      source_table: "market_stock_positions",
      source_id: String((row as any).stock_id),
      kind: "stock_profit",
      title: pnl >= 0 ? `Realized stock profit: ${symbol}` : `Realized stock loss: ${symbol}`,
      amount: pnl,
      currency: "USDC",
      status: "SUCCESS",
      tx_hash: null,
      order_id: null,
      stock_id: String((row as any).stock_id),
      details: {
        stock_name: stock?.name ?? null,
        stock_symbol: symbol,
        realized_pnl_usdc_total: pnl,
      },
      occurred_at: toIso((row as any).updated_at),
      created_at: toIso((row as any).updated_at),
    });
  }

  return out
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, limit);
}

export async function fetchMarketHistory(limit = 300) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const tableRes = await supabase
    .from("market_transaction_history")
    .select("id,source_table,source_id,kind,title,amount,currency,status,tx_hash,order_id,stock_id,details,occurred_at,created_at")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (!tableRes.error) {
    return ((tableRes.data ?? []) as any[]).map(normalizeRow);
  }

  if (!isMissingHistoryTableError(tableRes.error)) {
    throw new Error(tableRes.error.message);
  }

  return await fetchLegacyHistory(user.id, limit);
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export async function fetchMarketHistoryDetail(entryId: string) {
  const id = String(entryId || "").trim();
  if (!id) return null;

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  if (looksLikeUuid(id)) {
    const tableRes = await supabase
      .from("market_transaction_history")
      .select("id,source_table,source_id,kind,title,amount,currency,status,tx_hash,order_id,stock_id,details,occurred_at,created_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tableRes.error && tableRes.data) return normalizeRow(tableRes.data);
    if (tableRes.error && !isMissingHistoryTableError(tableRes.error)) {
      throw new Error(tableRes.error.message);
    }
  }

  const items = await fetchMarketHistory(500);
  return items.find((x) => x.id === id) ?? null;
}
