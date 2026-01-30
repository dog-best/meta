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

export async function callFn<T>(name: string, body?: any, timeoutMs = 20000): Promise<T> {
  console.log(`[callFn] ${name} -> start`, body ?? {});

  const token = await getSupabaseJwtOrThrow();
  const base = getSupabaseFunctionsBaseUrl();

  const { res, text, json } = await fetchJsonWithTimeout(
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

  if (!res.ok) {
    console.log(`[callFn] ${name} -> HTTP ${res.status}`, shortText(text));
  }

  if (!res.ok || (json as any)?.success === false) {
    const msg =
      (json as any)?.message ||
      (json as any)?.error ||
      (typeof json === "string" ? json : null) ||
      (text && text.length < 400 ? text : null) ||
      `Function ${name} failed`;
    console.log(`[callFn] ${name} -> error`, msg);
    throw new Error(msg);
  }

  console.log(`[callFn] ${name} -> ok ${res.status}`);
  return json as T;
}
