import * as SecureStore from "expo-secure-store";
import { supabase } from "@/services/supabase";
import { getCurrentLocationWithGeocode } from "@/utils/location";

const KEY_COUNTRY_CODE = "bc_user_country_code_v1";
const KEY_COUNTRY_NAME = "bc_user_country_name_v1";

export type UserCountry = { code: string; name: string } | null;

function norm(val?: string | null) {
  return String(val || "").trim();
}

export function isNigeriaCountry(codeOrName?: string | null) {
  const v = norm(codeOrName).toLowerCase();
  return v === "ng" || v === "nigeria";
}

export async function getCachedCountry(): Promise<UserCountry> {
  const code = norm(await SecureStore.getItemAsync(KEY_COUNTRY_CODE));
  const name = norm(await SecureStore.getItemAsync(KEY_COUNTRY_NAME));
  if (code || name) {
    return { code, name };
  }
  return null;
}

export async function setCachedCountry(code?: string | null, name?: string | null) {
  const c = norm(code).toUpperCase();
  const n = norm(name);
  if (c) await SecureStore.setItemAsync(KEY_COUNTRY_CODE, c);
  if (n) await SecureStore.setItemAsync(KEY_COUNTRY_NAME, n);
  if (!c && !n) {
    await SecureStore.deleteItemAsync(KEY_COUNTRY_CODE);
    await SecureStore.deleteItemAsync(KEY_COUNTRY_NAME);
  }
}

export async function resolveUserCountry(opts?: { prompt?: boolean }) {
  const cached = await getCachedCountry();
  if (cached) return cached;

  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (user) {
      const { data: profile } = await supabase
        .from("market_seller_profiles")
        .select("address")
        .eq("user_id", user.id)
        .maybeSingle();
      const addr = (profile as any)?.address ?? {};
      const code = norm(addr?.countryCode);
      const name = norm(addr?.country);
      if (code || name) {
        await setCachedCountry(code, name);
        return { code, name };
      }
    }
  } catch {
    // ignore
  }

  if (opts?.prompt) {
    const loc = await getCurrentLocationWithGeocode();
    const code = norm(loc?.geo?.countryCode);
    const name = norm(loc?.geo?.country);
    if (code || name) {
      await setCachedCountry(code, name);
      return { code, name };
    }
  }

  return null;
}

export function listingMatchesCountry(availability: any, country: UserCountry | null, includeGlobal = true) {
  if (!country) return false;
  const code = norm(country.code).toLowerCase();
  const name = norm(country.name).toLowerCase();
  if (!availability || !availability.scope) {
    return includeGlobal;
  }
  const scope = String(availability.scope || "").toLowerCase();
  if (scope === "global") return includeGlobal;
  if (scope === "continent") return includeGlobal;
  const cCode = norm(availability?.country?.code).toLowerCase();
  const cName = norm(availability?.country?.name).toLowerCase();
  const countryMatch =
    (!!code && !!cCode && code === cCode) || (!!name && !!cName && name === cName);
  if (scope === "country") return countryMatch;
  if (scope === "state" || scope === "city" || scope === "radius") return countryMatch;
  return includeGlobal;
}

