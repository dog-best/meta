import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import AppHeader from "@/components/common/AppHeader";
import {
  fetchStockDetail,
  getStockQuote,
  listStockChat,
  postStockChat,
  submitStockOrder,
} from "@/services/market/stocks";
import { supabase } from "@/services/supabase";
import { friendlyMarketError } from "@/utils/marketUx";

const BG_TOP = "#0D1B2A";
const BG_BOTTOM = "#071018";
const CARD = "rgba(255,255,255,0.06)";
const BORDER = "rgba(255,255,255,0.12)";
const MINT = "#2DD4BF";
const RED = "#F87171";
const MUTED = "rgba(255,255,255,0.68)";

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

type Candle = {
  bucket_start: string;
  open_price_usdc: number;
  high_price_usdc: number;
  low_price_usdc: number;
  close_price_usdc: number;
  volume_qty: number;
  volume_usdc: number;
  trades_count: number;
};

function CandleChart({ candles }: { candles: Candle[] }) {
  const [width, setWidth] = useState(0);
  const height = 210;
  const pad = 14;
  const plotW = Math.max(10, width - pad * 2);
  const plotH = height - pad * 2;
  const rows = candles.slice(-90);

  const [high, low] = useMemo(() => {
    if (!rows.length) return [1, 0];
    let hi = Number.MIN_VALUE;
    let lo = Number.MAX_VALUE;
    for (const c of rows) {
      hi = Math.max(hi, Number(c.high_price_usdc || 0));
      lo = Math.min(lo, Number(c.low_price_usdc || 0));
    }
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) {
      hi = Math.max(1, Number(rows[0]?.high_price_usdc || 1));
      lo = Math.max(0, Number(rows[0]?.low_price_usdc || 0));
    }
    return [hi, lo];
  }, [rows]);

  function y(price: number) {
    const range = Math.max(0.0000001, high - low);
    const t = (price - low) / range;
    return pad + (1 - t) * plotH;
  }

  function onLayout(e: LayoutChangeEvent) {
    setWidth(Math.floor(e.nativeEvent.layout.width));
  }

  return (
    <View
      onLayout={onLayout}
      style={{
        marginTop: 10,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: "rgba(255,255,255,0.03)",
      }}
    >
      {width > 0 && rows.length > 0 ? (
        <Svg width={width} height={height}>
          {[0, 1, 2, 3, 4].map((i) => {
            const yy = pad + (plotH * i) / 4;
            return (
              <Line
                key={`grid-${i}`}
                x1={pad}
                y1={yy}
                x2={pad + plotW}
                y2={yy}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
              />
            );
          })}

          {rows.map((c, idx) => {
            const xStep = plotW / rows.length;
            const candleW = Math.max(2, xStep * 0.64);
            const x = pad + idx * xStep + (xStep - candleW) / 2;
            const o = Number(c.open_price_usdc || 0);
            const h = Number(c.high_price_usdc || 0);
            const l = Number(c.low_price_usdc || 0);
            const cl = Number(c.close_price_usdc || 0);
            const up = cl >= o;
            const color = up ? MINT : RED;
            const yOpen = y(o);
            const yClose = y(cl);
            const top = Math.min(yOpen, yClose);
            const bodyH = Math.max(1, Math.abs(yOpen - yClose));
            return (
              <React.Fragment key={`${c.bucket_start}-${idx}`}>
                <Line
                  x1={x + candleW / 2}
                  y1={y(h)}
                  x2={x + candleW / 2}
                  y2={y(l)}
                  stroke={color}
                  strokeWidth={1}
                />
                <Rect x={x} y={top} width={candleW} height={bodyH} fill={color} />
              </React.Fragment>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: MUTED }}>No candle data yet</Text>
        </View>
      )}
    </View>
  );
}

export default function StockDetailScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = String(params.slug ?? "").trim().toLowerCase();

  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [panel, setPanel] = useState<"trade" | "trades" | "chat">("trade");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amountUsdc, setAmountUsdc] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quote, setQuote] = useState<any | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [chatRows, setChatRows] = useState<any[]>([]);
  const [chatText, setChatText] = useState("");
  const [posting, setPosting] = useState(false);

  async function loadDetail(silent = false) {
    if (!slug) return;
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const res = await fetchStockDetail({
        slug,
        timeframe,
        candle_limit: 200,
        trade_limit: 80,
      });
      setDetail(res);
    } catch (e: any) {
      setErr(friendlyMarketError(e, "Unable to load stock details."));
      setDetail(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadChat(silent = false) {
    if (!slug) return;
    if (!silent) setChatLoading(true);
    setChatErr(null);
    try {
      const res = await listStockChat({ slug, limit: 60 });
      setChatRows(res.messages ?? []);
    } catch (e: any) {
      setChatErr(friendlyMarketError(e, "Unable to load chat."));
      setChatRows([]);
    } finally {
      if (!silent) setChatLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [slug, timeframe]);

  useEffect(() => {
    loadChat();
  }, [slug]);

  useEffect(() => {
    const stockId = detail?.identity?.id;
    if (!stockId) return;
    const ch = supabase
      .channel(`stock-live-${stockId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_stock_trades", filter: `stock_id=eq.${stockId}` },
        () => {
          loadDetail(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_stock_chat_messages", filter: `stock_id=eq.${stockId}` },
        () => {
          loadChat(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [detail?.identity?.id]);

  useEffect(() => {
    const stock = detail?.identity;
    if (!stock) return;

    setQuote(null);
    setQuoteErr(null);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const amt = Number(amountUsdc || 0);
        const qty = Number(quantity || 0);
        if (side === "buy" && (!Number.isFinite(amt) || amt <= 0)) return;
        if (side === "sell" && (!Number.isFinite(qty) || qty <= 0)) return;
        setQuoting(true);
        const res = await getStockQuote({
          slug,
          side,
          amount_usdc: side === "buy" ? amt : undefined,
          quantity: side === "sell" ? qty : undefined,
          max_slippage_bps: 1200,
        });
        if (!cancelled) setQuote(res.quote ?? null);
      } catch (e: any) {
        if (!cancelled) {
          setQuote(null);
          setQuoteErr(friendlyMarketError(e, "Quote unavailable"));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [slug, side, amountUsdc, quantity, detail?.identity?.id]);

  async function onSubmitTrade() {
    if (!slug) return;
    setQuoteErr(null);
    try {
      const amt = Number(amountUsdc || 0);
      const qty = Number(quantity || 0);
      if (side === "buy" && (!Number.isFinite(amt) || amt <= 0)) throw new Error("Enter valid USDC amount");
      if (side === "sell" && (!Number.isFinite(qty) || qty <= 0)) throw new Error("Enter valid token quantity");

      setSubmitting(true);
      await submitStockOrder({
        slug,
        side,
        amount_usdc: side === "buy" ? amt : undefined,
        quantity: side === "sell" ? qty : undefined,
        max_slippage_bps: 1200,
      });

      setAmountUsdc("");
      setQuantity("");
      setQuote(null);
      await loadDetail(true);
    } catch (e: any) {
      setQuoteErr(friendlyMarketError(e, "Trade failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onPostChat() {
    if (!chatText.trim()) return;
    if (!slug) return;
    setChatErr(null);
    try {
      setPosting(true);
      const res = await postStockChat({ slug, body: chatText.trim() });
      setChatText("");
      if (res?.message) {
        setChatRows((prev) => [res.message, ...prev].slice(0, 80));
      } else {
        await loadChat(true);
      }
    } catch (e: any) {
      setChatErr(friendlyMarketError(e, "Unable to post chat message"));
    } finally {
      setPosting(false);
    }
  }

  const title = detail?.identity?.name || "Stock";
  const symbol = detail?.identity?.symbol || "";
  const chainText = String(detail?.identity?.chain || "")
    .toUpperCase()
    .replace("_", " ");
  const price = Number(detail?.stats?.price ?? 0);
  const mcap = Number(detail?.stats?.market_cap ?? 0);
  const vol24 = Number(detail?.stats?.volume_24h_quote ?? 0);
  const trades24 = Number(detail?.stats?.trades_24h ?? 0);
  const myPos = detail?.my_position ?? null;
  const tradingPaused = !!detail?.stats?.trading_paused;
  const launchGuard = !!detail?.stats?.launch_guard_active;
  const candles = (detail?.candles ?? []) as Candle[];
  const trades = detail?.trades ?? [];

  return (
    <LinearGradient colors={[BG_TOP, BG_BOTTOM]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <AppHeader title="Stock Detail" subtitle="Realtime market + chat + buy/sell execution." />
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
        {loading ? (
          <View style={{ marginTop: 28, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8, color: MUTED }}>Loading stock details...</Text>
          </View>
        ) : null}

        {!!err ? (
          <View style={{ marginTop: 12, borderRadius: 12, padding: 10, backgroundColor: "rgba(127,29,29,0.26)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)" }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
          </View>
        ) : null}

        {!loading && !err && detail ? (
          <>
            <View style={{ marginTop: 10, borderRadius: 15, padding: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>
                {title} <Text style={{ color: "#99F6E4" }}>({symbol})</Text>
              </Text>
              <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                @{detail?.seller?.market_username || "store"} - {detail?.seller?.business_name || "Store"}
              </Text>
              <View style={{ marginTop: 9, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>{chainText}</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tradingPaused ? "rgba(248,113,113,0.18)" : "rgba(45,212,191,0.18)", borderWidth: 1, borderColor: tradingPaused ? "rgba(248,113,113,0.42)" : "rgba(45,212,191,0.45)" }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>
                    {tradingPaused ? "Trading Paused" : launchGuard ? "Bootstrap Guard" : "Trading Active"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                <Text style={{ color: MUTED, fontSize: 11 }}>Price</Text>
                <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>${price.toFixed(6)}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                <Text style={{ color: MUTED, fontSize: 11 }}>Market Cap</Text>
                <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>${mcap.toFixed(2)}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                <Text style={{ color: MUTED, fontSize: 11 }}>24h Vol</Text>
                <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>${vol24.toFixed(2)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: MUTED, fontSize: 11 }}>24h Trades</Text>
              <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>{trades24}</Text>
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["1m", "5m", "15m", "1h", "4h", "1d"] as Timeframe[]).map((tf) => (
                <Pressable
                  key={tf}
                  onPress={() => setTimeframe(tf)}
                  style={{
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: timeframe === tf ? "rgba(45,212,191,0.20)" : "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: timeframe === tf ? "rgba(45,212,191,0.55)" : BORDER,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{tf}</Text>
                </Pressable>
              ))}
            </View>

            <CandleChart candles={candles} />

            {!!myPos ? (
              <View style={{ marginTop: 10, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>My Position</Text>
                <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
                  Qty {Number(myPos.balance_qty || 0).toFixed(6)} - Avg ${Number(myPos.avg_cost_usdc || 0).toFixed(6)} - Realized ${Number(myPos.realized_pnl_usdc || 0).toFixed(2)}
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setPanel("trade")}
                style={{
                  flex: 1,
                  borderRadius: 11,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: panel === "trade" ? "rgba(45,212,191,0.20)" : "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: panel === "trade" ? "rgba(45,212,191,0.55)" : BORDER,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Trade</Text>
              </Pressable>
              <Pressable
                onPress={() => setPanel("trades")}
                style={{
                  flex: 1,
                  borderRadius: 11,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: panel === "trades" ? "rgba(45,212,191,0.20)" : "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: panel === "trades" ? "rgba(45,212,191,0.55)" : BORDER,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Trades</Text>
              </Pressable>
              <Pressable
                onPress={() => setPanel("chat")}
                style={{
                  flex: 1,
                  borderRadius: 11,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: panel === "chat" ? "rgba(45,212,191,0.20)" : "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: panel === "chat" ? "rgba(45,212,191,0.55)" : BORDER,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Chat</Text>
              </Pressable>
            </View>

            {panel === "trade" ? (
              <View style={{ marginTop: 10, borderRadius: 14, padding: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setSide("buy")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor: side === "buy" ? "rgba(45,212,191,0.20)" : "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: side === "buy" ? "rgba(45,212,191,0.55)" : BORDER,
                    }}
                    disabled={tradingPaused}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>Buy</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSide("sell")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor: side === "sell" ? "rgba(248,113,113,0.20)" : "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: side === "sell" ? "rgba(248,113,113,0.55)" : BORDER,
                    }}
                    disabled={tradingPaused}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>Sell</Text>
                  </Pressable>
                </View>

                {side === "buy" ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: MUTED, fontSize: 12 }}>Amount (USDC)</Text>
                    <TextInput
                      value={amountUsdc}
                      onChangeText={setAmountUsdc}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      style={{ marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: "#fff", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: BORDER }}
                      editable={!submitting && !tradingPaused}
                    />
                  </View>
                ) : (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: MUTED, fontSize: 12 }}>Quantity ({symbol})</Text>
                    <TextInput
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      style={{ marginTop: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, color: "#fff", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: BORDER }}
                      editable={!submitting && !tradingPaused}
                    />
                  </View>
                )}

                {quoting ? (
                  <Text style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>Getting quote...</Text>
                ) : null}

                {!!quote ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: MUTED, fontSize: 12 }}>
                      Exec ${Number(quote.price_execution_usdc || 0).toFixed(6)} - Impact {Number(quote.price_impact_bps || 0).toFixed(2)} bps
                    </Text>
                    <Text style={{ marginTop: 3, color: MUTED, fontSize: 12 }}>
                      Qty {Number(quote.quantity || 0).toFixed(6)} - Notional ${Number(quote.notional_usdc || 0).toFixed(6)} - Fee ${Number(quote.fee_usdc || 0).toFixed(6)}
                    </Text>
                  </View>
                ) : null}

                {!!quoteErr ? (
                  <Text style={{ marginTop: 8, color: "#FCA5A5", fontWeight: "700", fontSize: 12 }}>{quoteErr}</Text>
                ) : null}

                <Pressable
                  onPress={onSubmitTrade}
                  disabled={submitting || tradingPaused}
                  style={{
                    marginTop: 10,
                    borderRadius: 11,
                    paddingVertical: 11,
                    alignItems: "center",
                    backgroundColor: tradingPaused
                      ? "rgba(255,255,255,0.15)"
                      : side === "buy"
                      ? "rgba(45,212,191,0.32)"
                      : "rgba(248,113,113,0.30)",
                    borderWidth: 1,
                    borderColor: tradingPaused
                      ? "rgba(255,255,255,0.22)"
                      : side === "buy"
                      ? "rgba(45,212,191,0.58)"
                      : "rgba(248,113,113,0.58)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    {submitting ? "Submitting..." : tradingPaused ? "Trading Paused" : side === "buy" ? "Submit Buy" : "Submit Sell"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {panel === "trades" ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                {trades.length === 0 ? (
                  <View style={{ borderRadius: 12, padding: 12, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ color: MUTED }}>No trades yet.</Text>
                  </View>
                ) : (
                  trades.map((t: any) => (
                    <View key={String(t.id)} style={{ borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: t.side === "buy" ? MINT : RED, fontWeight: "900" }}>
                          {String(t.side || "").toUpperCase()}
                        </Text>
                        <Text style={{ color: MUTED, fontSize: 11 }}>
                          {new Date(String(t.traded_at || t.created_at || Date.now())).toLocaleString()}
                        </Text>
                      </View>
                      <Text style={{ marginTop: 4, color: "#fff", fontWeight: "800" }}>
                        ${Number(t.price_usdc || 0).toFixed(6)} x {Number(t.quantity || 0).toFixed(6)}
                      </Text>
                      <Text style={{ marginTop: 2, color: MUTED, fontSize: 11 }}>
                        Notional ${Number(t.notional_usdc || 0).toFixed(6)} - Fee ${Number(t.fee_usdc || 0).toFixed(6)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {panel === "chat" ? (
              <View style={{ marginTop: 10 }}>
                <View style={{ borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Live Chat</Text>
                  <Text style={{ marginTop: 3, color: MUTED, fontSize: 11 }}>Rate limited to reduce spam and noise.</Text>
                </View>

                <View style={{ marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                  <TextInput
                    value={chatText}
                    onChangeText={setChatText}
                    placeholder="Share insight or ask question..."
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    style={{ color: "#fff", minHeight: 44 }}
                    editable={!posting}
                  />
                  <Pressable
                    onPress={onPostChat}
                    disabled={posting || !chatText.trim()}
                    style={{
                      marginTop: 8,
                      borderRadius: 10,
                      paddingVertical: 9,
                      alignItems: "center",
                      backgroundColor: posting || !chatText.trim() ? "rgba(45,212,191,0.20)" : "rgba(45,212,191,0.36)",
                      borderWidth: 1,
                      borderColor: "rgba(45,212,191,0.55)",
                    }}
                  >
                    <Text style={{ color: "#ECFEFF", fontWeight: "900" }}>{posting ? "Posting..." : "Post Chat"}</Text>
                  </Pressable>
                </View>

                {chatLoading ? (
                  <View style={{ marginTop: 10, alignItems: "center" }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 7, color: MUTED }}>Loading chat...</Text>
                  </View>
                ) : null}

                {!!chatErr ? (
                  <View style={{ marginTop: 8, borderRadius: 12, padding: 10, backgroundColor: "rgba(127,29,29,0.26)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)" }}>
                    <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{chatErr}</Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 8, gap: 8 }}>
                  {chatRows.map((m: any) => (
                    <View key={String(m.id)} style={{ borderRadius: 12, padding: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
                          @{m?.profile?.username || m?.profile?.full_name || "user"}
                        </Text>
                        <Text style={{ color: MUTED, fontSize: 11 }}>
                          {new Date(String(m.created_at || Date.now())).toLocaleTimeString()}
                        </Text>
                      </View>
                      <Text style={{ marginTop: 5, color: "#E2E8F0" }}>{String(m.body || "")}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}
