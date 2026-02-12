type ListingLike = {
  currency?: string | null;
  payment_options?: any;
};

export function listingAllowsCrypto(listing: ListingLike) {
  const currency = String(listing?.currency ?? "").toUpperCase();
  if (currency === "USDC" || currency === "USDT") return true;
  const po = listing?.payment_options ?? {};
  if (po?.allow_crypto === true) return true;
  if (po?.allow_usdc === true || po?.allow_usdt === true) return true;
  return false;
}
