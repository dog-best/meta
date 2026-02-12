import type { UserCountry } from "@/utils/country";

type RestCountryResponse = Array<{
  currencies?: Record<string, { name?: string; symbol?: string }>;
}>;

type FxApiResponse = {
  result?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
};

type FxSnapshot = {
  rates: Record<string, number>;
  fetchedAt: string;
};

const FX_URL = "https://open.er-api.com/v6/latest/USD";
const DEFAULT_CURRENCY = "USD";
const CACHE_TTL_MS = 2 * 60 * 1000;

let fxCache: FxSnapshot | null = null;
let fxCacheAt = 0;
const countryCurrencyCache = new Map<string, string>();

function normCode(v?: string | null) {
  return String(v || "").trim().toUpperCase();
}

export async function fetchUsdFxSnapshot(): Promise<FxSnapshot> {
  const now = Date.now();
  if (fxCache && now - fxCacheAt < CACHE_TTL_MS) {
    return fxCache;
  }

  const res = await fetch(FX_URL);
  if (!res.ok) {
    throw new Error("Unable to load FX rates.");
  }

  const json = (await res.json()) as FxApiResponse;
  const rates = json?.rates ?? {};
  if (!Number.isFinite(Number(rates.USD)) || Number(rates.USD) <= 0) {
    throw new Error("FX rates are unavailable.");
  }

  fxCache = {
    rates,
    fetchedAt: json?.time_last_update_utc || new Date().toISOString(),
  };
  fxCacheAt = now;
  return fxCache;
}

export async function resolveCountryCurrencyCode(country: UserCountry | null): Promise<string> {
  const cc = normCode(country?.code);
  if (!cc) return DEFAULT_CURRENCY;
  if (cc === "NG") return "NGN";
  if (countryCurrencyCache.has(cc)) return countryCurrencyCache.get(cc)!;

  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${cc}?fields=currencies`);
    if (!res.ok) throw new Error("country lookup failed");
    const json = (await res.json()) as RestCountryResponse;
    const first = json?.[0];
    const code = Object.keys(first?.currencies ?? {})[0];
    const finalCode = normCode(code) || DEFAULT_CURRENCY;
    countryCurrencyCache.set(cc, finalCode);
    return finalCode;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export async function getCountryFx(country: UserCountry | null) {
  const localCurrency = await resolveCountryCurrencyCode(country);
  const fx = await fetchUsdFxSnapshot();
  const usdToLocal = Number(fx.rates[localCurrency] ?? NaN);
  const usdToNgn = Number(fx.rates.NGN ?? NaN);

  if (!Number.isFinite(usdToLocal) || usdToLocal <= 0) {
    throw new Error(`FX unavailable for ${localCurrency}.`);
  }

  return {
    localCurrency,
    usdToLocal,
    localToUsd: 1 / usdToLocal,
    usdToNgn: Number.isFinite(usdToNgn) && usdToNgn > 0 ? usdToNgn : null,
    fetchedAt: fx.fetchedAt,
    source: "open.er-api.com",
  };
}
