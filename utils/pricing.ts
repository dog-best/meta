type ListingLike = {
  price_amount?: number | string | null;
  currency?: string | null;
  payment_options?: any;
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function isDiscountActive(discount: any) {
  if (!discount?.enabled) return false;
  if (!discount?.endsAt) return true;
  const end = new Date(String(discount.endsAt)).getTime();
  return Number.isFinite(end) ? end > Date.now() : true;
}

export function formatCurrency(code: string | null | undefined, amount: unknown, maxFractionDigits = 2) {
  const c = String(code || "").toUpperCase() || "USD";
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;

  if (c === "USDC" || c === "USDT") {
    return `$${safe.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })}`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: maxFractionDigits,
    }).format(safe);
  } catch {
    return `${c} ${safe.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })}`;
  }
}

export function getListingPriceDisplay(listing: ListingLike) {
  const po = listing?.payment_options ?? {};
  const pb = po?.price_book ?? {};
  const discount = po?.discount ?? {};
  const discountOn = isDiscountActive(discount);

  const localCurrency = String(pb?.local_currency || (po?.base_currency === "NGN" ? "NGN" : "USD")).toUpperCase();
  const itemCurrency = String(listing?.currency || "").toUpperCase();
  const canonical = num(listing?.price_amount);

  const usdToLocal = num(po?.fx?.usd_to_local);
  const ngnPerUsd = num(po?.fx?.usd_to_ngn ?? po?.fx_rate_ngn_per_usd);

  let localNow = num(discountOn ? discount?.discountedPriceLocal : pb?.local);
  let localWas = num(discount?.originalPriceLocal);

  let usdNow = num(discountOn ? discount?.discountedPriceUsd : pb?.usd);
  let usdWas = num(discount?.originalPriceUsd);

  // Legacy fallback
  if (!Number.isFinite(localNow) && localCurrency === "NGN") {
    localNow = num(discountOn ? discount?.discountedPriceNgn : pb?.ngn);
  }
  if (!Number.isFinite(localWas) && localCurrency === "NGN") {
    localWas = num(discount?.originalPriceNgn);
  }

  // Canonical fallback
  if (!Number.isFinite(usdNow) && itemCurrency === "USDC") usdNow = canonical;
  if (!Number.isFinite(localNow) && itemCurrency === "NGN" && localCurrency === "NGN") localNow = canonical;

  // Convert fallback
  if (!Number.isFinite(localNow) && Number.isFinite(usdNow) && Number.isFinite(usdToLocal) && usdToLocal > 0) {
    localNow = usdNow * usdToLocal;
  }
  if (!Number.isFinite(usdNow) && Number.isFinite(localNow) && Number.isFinite(usdToLocal) && usdToLocal > 0) {
    usdNow = localNow / usdToLocal;
  }

  if (!Number.isFinite(localNow) && Number.isFinite(usdNow) && localCurrency === "NGN" && Number.isFinite(ngnPerUsd) && ngnPerUsd > 0) {
    localNow = usdNow * ngnPerUsd;
  }
  if (!Number.isFinite(usdNow) && Number.isFinite(localNow) && localCurrency === "NGN" && Number.isFinite(ngnPerUsd) && ngnPerUsd > 0) {
    usdNow = localNow / ngnPerUsd;
  }

  // Was price conversions
  if (!Number.isFinite(localWas) && Number.isFinite(usdWas) && Number.isFinite(usdToLocal) && usdToLocal > 0) {
    localWas = usdWas * usdToLocal;
  }
  if (!Number.isFinite(usdWas) && Number.isFinite(localWas) && Number.isFinite(usdToLocal) && usdToLocal > 0) {
    usdWas = localWas / usdToLocal;
  }

  const hasDiscount =
    discountOn &&
    Number.isFinite(localWas) &&
    Number.isFinite(localNow) &&
    localWas > localNow;

  return {
    localCurrency,
    localNow: Number.isFinite(localNow) ? localNow : 0,
    localWas: Number.isFinite(localWas) ? localWas : NaN,
    usdNow: Number.isFinite(usdNow) ? usdNow : 0,
    usdWas: Number.isFinite(usdWas) ? usdWas : NaN,
    hasDiscount,
  };
}
