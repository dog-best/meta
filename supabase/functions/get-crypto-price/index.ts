import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* Symbols we care about */
const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "USDTUSDT", "SUIUSDT", "APTUSDT", "USDCUSDT"];

const MARGIN = 0.02; // 2%

serve(async () => {
  try {
    /* 1️⃣ Fetch ALL Binance prices at once */
    const binanceRes = await fetch(
      "https://api.binance.com/api/v3/ticker/price"
    );
    const binanceData = await binanceRes.json();

    /* 2️⃣ Convert array → map for fast lookup */
    const priceMap: Record<string, number> = {};
    for (const item of binanceData) {
      if (SUPPORTED_SYMBOLS.includes(item.symbol)) {
        priceMap[item.symbol] = Number(item.price);
      }
    }

    /* 3️⃣ Fetch USD → NGN */
    const fxRes = await fetch(
      "https://api.exchangerate.host/latest?base=USD&symbols=NGN"
    );
    const fxData = await fxRes.json();
    const usdToNgn = fxData.rates.NGN;

    /* 4️⃣ Build final response */
    const prices: Record<string, any> = {};

    for (const symbol of SUPPORTED_SYMBOLS) {
      const usdtPrice = priceMap[symbol];
      if (!usdtPrice) continue;

      const marketRate = usdtPrice * usdToNgn;
      const userRate = marketRate * (1 - MARGIN);

      prices[symbol.replace("USDT", "")] = {
        marketRate: Number(marketRate.toFixed(2)),
        userRate: Number(userRate.toFixed(2)),
      };
    }

    return new Response(
      JSON.stringify({
        currency: "NGN",
        margin: MARGIN,
        prices,
        sources: {
          crypto: "Binance",
          forex: "exchangerate.host",
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch prices",
        details,
      }),
      { status: 500 }
    );
  }
});
