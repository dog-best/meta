import { supabase } from "@/services/supabase";

export function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000,
) {
  const res = await fetchWithTimeout(input, init, timeoutMs);
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }
  const json = text ? safeJsonParse(text) : null;
  return { res, text, json };
}

export function getSupabaseFunctionsBaseUrl() {
  const clientUrl = (supabase as any)?.supabaseUrl as string | undefined;
  const envUrl =
    (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);

  const sbUrl = clientUrl || envUrl;
  if (!sbUrl) {
    throw new Error("Missing Supabase URL (set EXPO_PUBLIC_SUPABASE_URL)");
  }

  return `${sbUrl.replace(/\/$/, "")}/functions/v1`;
}

export function getSupabaseAnonKeyOrThrow() {
  const key =
    (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);
  if (!key) {
    throw new Error("Missing Supabase anon key (set EXPO_PUBLIC_SUPABASE_ANON_KEY)");
  }
  return key;
}

function isLikelyNetworkError(error: any) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("request failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("abort")
  );
}

export async function getSupabaseJwtOrThrow() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;

  const session = sessionData.session;
  const now = Date.now();
  let expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  let token = session?.access_token || "";

  if (!token || expiresAtMs - now <= 60_000) {
    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;
      token = refreshed.session?.access_token || "";
      expiresAtMs = refreshed.session?.expires_at ? refreshed.session.expires_at * 1000 : expiresAtMs;
    } catch (e: any) {
      if (token && expiresAtMs - now > 15_000 && isLikelyNetworkError(e)) {
        return token;
      }
      throw e;
    }
  }

  if (!token) throw new Error("No session. Please sign in again.");

  try {
    const probe = await supabase.auth.getUser(token);
    if (probe.error || !probe.data.user) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) throw refreshErr;
      token = refreshed.session?.access_token || "";
      expiresAtMs = refreshed.session?.expires_at ? refreshed.session.expires_at * 1000 : expiresAtMs;
    }
  } catch (e: any) {
    if (!(token && expiresAtMs - now > 15_000 && isLikelyNetworkError(e))) {
      throw e;
    }
  }

  if (!token) throw new Error("No session. Please sign in again.");
  if (token.split(".").length !== 3) {
    throw new Error("Invalid auth token format. Please sign in again.");
  }

  // Final validation: keep token on transient network errors, reject on real auth failures.
  try {
    const finalProbe = await supabase.auth.getUser(token);
    if (finalProbe.error || !finalProbe.data.user) {
      throw new Error("Session expired. Please sign in again.");
    }
  } catch (e: any) {
    if (!(token && expiresAtMs - now > 15_000 && isLikelyNetworkError(e))) {
      throw e;
    }
  }

  return token;
}
