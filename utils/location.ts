import * as Location from "expo-location";

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

function buildLabel(parts: Array<string | null | undefined>) {
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join(", ");
}

function fallbackLabel(coords: LocationCoords) {
  return `Lat ${coords.lat.toFixed(5)}, Lng ${coords.lng.toFixed(5)}`;
}

export async function getCurrentLocationWithGeocode() {
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

  return { coords, geo, label };
}

export function formatAvailabilitySummary(availability: AvailabilityJson | null | undefined) {
  if (!availability || !availability.scope) return "Worldwide";

  const note = availability.note ? ` • ${availability.note}` : "";

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
