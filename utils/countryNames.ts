const MANUAL_COUNTRY_NAMES: Record<string, string> = {
  XK: "Kosovo",
  UK: "United Kingdom",
};

const countryNameCache = new Map<string, string>();
let displayNamesRef: any | null | undefined;

function safeTrim(value?: string | null) {
  return String(value || "").trim();
}

export function normalizeCountryCode(value?: string | null) {
  return safeTrim(value).toUpperCase();
}

function getDisplayNames() {
  if (displayNamesRef !== undefined) return displayNamesRef;
  try {
    if (typeof Intl !== "undefined" && typeof (Intl as any).DisplayNames === "function") {
      displayNamesRef = new Intl.DisplayNames(["en"], { type: "region" });
      return displayNamesRef;
    }
  } catch {
    // ignore
  }
  displayNamesRef = null;
  return displayNamesRef;
}

function isLikelyCountryCode(value: string) {
  if (!value) return false;
  return /^[A-Z]{2,3}$/.test(value);
}

function shouldTreatAsCodeName(name: string, code: string) {
  if (!name) return true;
  const normName = name.toUpperCase();
  if (normName === code) return true;
  return isLikelyCountryCode(normName) && normName.length <= code.length;
}

export function countryNameFromCode(code?: string | null, fallbackName?: string | null) {
  const cc = normalizeCountryCode(code);
  const fallback = safeTrim(fallbackName);
  if (!cc) return fallback;

  if (countryNameCache.has(cc)) {
    const cached = countryNameCache.get(cc) || "";
    return cached || fallback;
  }

  const displayNames = getDisplayNames();
  let resolved = "";

  if (displayNames) {
    try {
      resolved = safeTrim(displayNames.of(cc));
    } catch {
      resolved = "";
    }
  }

  if (!resolved) {
    resolved = safeTrim(MANUAL_COUNTRY_NAMES[cc]);
  }

  if (!resolved && fallback && !shouldTreatAsCodeName(fallback, cc)) {
    resolved = fallback;
  }

  countryNameCache.set(cc, resolved);
  return resolved || fallback;
}

export function normalizeCountryName(name?: string | null, code?: string | null) {
  const rawName = safeTrim(name);
  const cc = normalizeCountryCode(code);
  if (!cc) return rawName;
  if (!rawName || shouldTreatAsCodeName(rawName, cc)) {
    return countryNameFromCode(cc, rawName);
  }
  return rawName;
}

export function formatCountryLabel(name?: string | null, code?: string | null) {
  const cc = normalizeCountryCode(code);
  const resolvedName = normalizeCountryName(name, cc);
  if (resolvedName && cc && resolvedName.toUpperCase() !== cc) {
    return `${resolvedName} (${cc})`;
  }
  return resolvedName || cc;
}
