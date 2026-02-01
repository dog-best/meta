import {
  fetchJsonWithTimeout,
  getSupabaseAnonKeyOrThrow,
  getSupabaseFunctionsBaseUrl,
  getSupabaseJwtOrThrow,
} from "@/services/net";

function shortText(text: string | null | undefined, limit = 600) {
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function invokeFn<T>(name: string, body: any, timeoutMs: number, token: string) {
  const base = getSupabaseFunctionsBaseUrl();
  return await fetchJsonWithTimeout(
    `${base}/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKeyOrThrow(),
      },
      body: JSON.stringify(body ?? {}),
    },
    timeoutMs,
  );
}

function extractErrorMessage(text: string | null | undefined, json: any, name: string) {
  return (
    json?.message ||
    json?.error ||
    (typeof json === "string" ? json : null) ||
    (text && text.length < 400 ? text : null) ||
    `Function ${name} failed`
  );
}

export async function callFn<T>(name: string, body?: any, timeoutMs = 20000): Promise<T> {
  console.log(`[callFn] ${name} -> start`, body ?? {});

  let token = await getSupabaseJwtOrThrow();
  let { res, text, json } = await invokeFn<T>(name, body, timeoutMs, token);

  if (!res.ok) {
    console.log(`[callFn] ${name} -> HTTP ${res.status}`, shortText(text));
  }

  let msg = extractErrorMessage(text, json, name);

  if (!res.ok || (json as any)?.success === false) {
    const lower = String(msg || "").toLowerCase();
    const shouldRetry =
      res.status === 401 && (lower.includes("invalid jwt") || lower.includes("jwt"));

    if (shouldRetry) {
      try {
        const { data: refreshed, error } = await (await import("@/services/supabase")).supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          token = refreshed.session.access_token;
          const retry = await invokeFn<T>(name, body, timeoutMs, token);
          res = retry.res;
          text = retry.text;
          json = retry.json;
          msg = extractErrorMessage(text, json, name);
        }
      } catch {
        // fall through to error handling
      }
    }
  }

  if (!res.ok || (json as any)?.success === false) {
    console.log(`[callFn] ${name} -> error`, msg);
    throw new Error(msg);
  }

  console.log(`[callFn] ${name} -> ok ${res.status}`);
  return json as T;
}
