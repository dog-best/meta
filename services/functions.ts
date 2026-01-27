import { supabase } from "./supabase";

function getFunctionsBaseUrl() {
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

export async function callFn<T>(name: string, body?: any): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const base = getFunctionsBaseUrl();
  const res = await fetch(`${base}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body ?? {}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || `Function ${name} failed`);
  }
  return json as T;
}
