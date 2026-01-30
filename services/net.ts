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
  const envUrl =
    (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);

  const clientUrl = (supabase as any)?.supabaseUrl as string | undefined;

  const sbUrl = envUrl || clientUrl;
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

export async function getSupabaseJwtOrThrow() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;

  const session = sessionData.session;
  const now = Date.now();
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;

  if (session?.access_token && expiresAtMs - now > 60_000) {
    return session.access_token;
  }

  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) throw refreshErr;

  const token = refreshed.session?.access_token;
  if (!token) throw new Error("No session. Please sign in again.");
  return token;
}
