import * as Location from "expo-location";
import { Platform } from "react-native";

export type LocationCoords = { lat: number; lng: number };
export type LocationGeo = {
  country: string;
  region: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

export type AvailabilityJson = {
  scope: "global" | "continent" | "country" | "state" | "city" | "radius";
  continents: string[];
  country: { name: string; code: string };
  state: string;
  city: string;
  radiusKm: number;
  center: { lat: number; lng: number; label: string };
  note: string;
};

export type DeliveryGeo = {
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  label: string;
};

type GeocodeOptions = {
  preferIpOnWeb?: boolean;
  preferIp?: boolean;
  ipOnly?: boolean;
};

type IpLookupResult = {
  coords: LocationCoords;
  geo: LocationGeo;
  label: string;
};

type IpApiCoPayload = {
  country_name?: string;
  country_code?: string;
  region?: string;
  city?: string;
  postal?: string;
  latitude?: number | string;
  longitude?: number | string;
};

type IpWhoPayload = {
  success?: boolean;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  postal?: string;
  latitude?: number | string;
  longitude?: number | string;
};

type IpInfoPayload = {
  country?: string;
  region?: string;
  city?: string;
  postal?: string;
  loc?: string;
};

function buildLabel(parts: Array<string | null | undefined>) {
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(", ");
}

function fallbackLabel(coords: LocationCoords) {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    return "Location unavailable";
  }
  return `Lat ${coords.lat.toFixed(5)}, Lng ${coords.lng.toFixed(5)}`;
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseIpInfoLoc(loc?: string) {
  const raw = String(loc || "").trim();
  if (!raw.includes(",")) return { lat: NaN, lng: NaN };
  const [a, b] = raw.split(",");
  return { lat: toNum(a), lng: toNum(b) };
}

function withNoCache(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

function ipLookupToResult(input: {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}) {
  const coords = {
    lat: Number.isFinite(input.lat) ? Number(input.lat) : NaN,
    lng: Number.isFinite(input.lng) ? Number(input.lng) : NaN,
  };

  const geo: LocationGeo = {
    country: String(input.country || ""),
    countryCode: String(input.countryCode || "").toUpperCase(),
    region: String(input.region || ""),
    city: String(input.city || ""),
    postalCode: String(input.postalCode || ""),
  };

  const label = buildLabel([geo.city, geo.region, geo.country]) || fallbackLabel(coords);
  return { coords, geo, label };
}

async function fetchIpLocation(): Promise<IpLookupResult | null> {
  try {
    const res = await fetch(withNoCache("https://ipapi.co/json/"), {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (res.ok) {
      const payload = (await res.json()) as IpApiCoPayload;
      const out = ipLookupToResult({
        country: payload.country_name,
        countryCode: payload.country_code,
        region: payload.region,
        city: payload.city,
        postalCode: payload.postal,
        lat: toNum(payload.latitude),
        lng: toNum(payload.longitude),
      });
      if (out.geo.countryCode || out.geo.country) return out;
    }
  } catch {
    // ignore and continue
  }

  try {
    const res = await fetch(withNoCache("https://ipwho.is/"), {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (res.ok) {
      const payload = (await res.json()) as IpWhoPayload;
      if (payload?.success !== false) {
        const out = ipLookupToResult({
          country: payload.country,
          countryCode: payload.country_code,
          region: payload.region,
          city: payload.city,
          postalCode: payload.postal,
          lat: toNum(payload.latitude),
          lng: toNum(payload.longitude),
        });
        if (out.geo.countryCode || out.geo.country) return out;
      }
    }
  } catch {
    // ignore and continue
  }

  try {
    const res = await fetch(withNoCache("https://ipinfo.io/json"), {
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (res.ok) {
      const payload = (await res.json()) as IpInfoPayload;
      const loc = parseIpInfoLoc(payload.loc);
      const out = ipLookupToResult({
        countryCode: payload.country,
        region: payload.region,
        city: payload.city,
        postalCode: payload.postal,
        lat: loc.lat,
        lng: loc.lng,
      });
      if (out.geo.countryCode || out.geo.country) return out;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function getCurrentLocationWithGeocode(opts?: GeocodeOptions) {
  const preferIpFirst = Boolean(opts?.preferIp) || (Platform.OS === "web" && Boolean(opts?.preferIpOnWeb));
  const ipOnly = Boolean(opts?.ipOnly);
  if (preferIpFirst) {
    const ipFirst = await fetchIpLocation();
    if (ipFirst) return ipFirst;
    if (ipOnly) {
      throw new Error("IP location lookup failed.");
    }
  }

  if (ipOnly) {
    throw new Error("IP location lookup failed.");
  }

  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      throw new Error("Location permission denied.");
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords: LocationCoords = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };

    let geo: LocationGeo = {
      country: "",
      region: "",
      city: "",
      postalCode: "",
      countryCode: "",
    };

    let label = fallbackLabel(coords);

    try {
      const res = await Location.reverseGeocodeAsync({
        latitude: coords.lat,
        longitude: coords.lng,
      });

      const first = res?.[0];
      if (first) {
        geo = {
          country: first.country ?? "",
          region: first.region ?? "",
          city: first.city ?? first.subregion ?? first.district ?? "",
          postalCode: first.postalCode ?? "",
          countryCode: first.isoCountryCode ?? "",
        };

        const line1 = buildLabel([first.name, first.street]);
        const line2 = buildLabel([geo.city, geo.region]);
        const line3 = buildLabel([geo.country]);
        label = buildLabel([line1, line2, line3]) || fallbackLabel(coords);
      }
    } catch {
      // Keep best-effort coords and label
    }

    if (!geo.countryCode && !geo.country) {
      const ipFallback = await fetchIpLocation();
      if (ipFallback) return ipFallback;
    }

    return { coords, geo, label };
  } catch (error: any) {
    const ipFallback = await fetchIpLocation();
    if (ipFallback) return ipFallback;
    throw error;
  }
}

export function formatAvailabilitySummary(availability: AvailabilityJson | null | undefined) {
  if (!availability || !availability.scope) return "Worldwide";

  const note = availability.note ? ` - ${availability.note}` : "";

  switch (availability.scope) {
    case "global":
      return `Worldwide${note}`;
    case "continent": {
      const list = (availability.continents || []).filter(Boolean).join(", ");
      return list ? `Continents: ${list}${note}` : `Continents only${note}`;
    }
    case "country": {
      const country = availability.country?.name || availability.country?.code || "Selected country";
      return `Country: ${country}${note}`;
    }
    case "state": {
      const parts = [availability.state, availability.country?.name || availability.country?.code].filter(Boolean);
      return `State: ${parts.join(", ") || "Selected state"}${note}`;
    }
    case "city": {
      const parts = [availability.city, availability.state, availability.country?.name || availability.country?.code].filter(Boolean);
      return `City: ${parts.join(", ") || "Selected city"}${note}`;
    }
    case "radius": {
      const km = availability.radiusKm ? `${availability.radiusKm} km` : "radius";
      const center = availability.center?.label || "center point";
      return `Within ${km} of ${center}${note}`;
    }
    default:
      return `Worldwide${note}`;
  }
}

function toNorm(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function kmBetween(a: LocationCoords, b: LocationCoords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function availabilityMayMatch(
  availability: AvailabilityJson | null | undefined,
  buyerGeo: DeliveryGeo | null | undefined
) {
  if (!availability || !availability.scope) return true;
  if (!buyerGeo) return true;

  const scope = availability.scope;
  const buyerCountry = toNorm(buyerGeo.country);
  const buyerCountryCode = toNorm(buyerGeo.countryCode);
  const buyerRegion = toNorm(buyerGeo.region);
  const buyerCity = toNorm(buyerGeo.city);

  if (scope === "global") return true;

  if (scope === "continent") return true;

  if (scope === "country") {
    const cName = toNorm(availability.country?.name);
    const cCode = toNorm(availability.country?.code);
    return !!(buyerCountry && cName && buyerCountry === cName) || !!(buyerCountryCode && cCode && buyerCountryCode === cCode);
  }

  if (scope === "state") {
    const cName = toNorm(availability.country?.name);
    const cCode = toNorm(availability.country?.code);
    const state = toNorm(availability.state);
    const countryOk =
      (!cName && !cCode) ||
      (!!buyerCountry && !!cName && buyerCountry === cName) ||
      (!!buyerCountryCode && !!cCode && buyerCountryCode === cCode);
    return countryOk && !!buyerRegion && !!state && buyerRegion === state;
  }

  if (scope === "city") {
    const cName = toNorm(availability.country?.name);
    const cCode = toNorm(availability.country?.code);
    const state = toNorm(availability.state);
    const city = toNorm(availability.city);
    const countryOk =
      (!cName && !cCode) ||
      (!!buyerCountry && !!cName && buyerCountry === cName) ||
      (!!buyerCountryCode && !!cCode && buyerCountryCode === cCode);
    const stateOk = !state || (!!buyerRegion && buyerRegion === state);
    return countryOk && stateOk && !!buyerCity && !!city && buyerCity === city;
  }

  if (scope === "radius") {
    const center = availability.center;
    const radius = Number(availability.radiusKm || 0);
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || !Number.isFinite(radius) || radius <= 0) {
      return true;
    }
    if (!Number.isFinite(buyerGeo.lat) || !Number.isFinite(buyerGeo.lng)) return true;
    const distance = kmBetween({ lat: center.lat, lng: center.lng }, { lat: buyerGeo.lat, lng: buyerGeo.lng });
    return distance <= radius;
  }

  return true;
}

