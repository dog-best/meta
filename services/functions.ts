import { supabase } from "./supabase";

const base = process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(".supabase.co", ".supabase.co/functions/v1");

export async function callFn<T>(name: string, body?: any): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

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
