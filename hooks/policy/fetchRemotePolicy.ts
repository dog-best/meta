import { supabase } from "@/services/supabase";

export type RemotePolicy = {
  title: string;
  content: string;
};

export async function fetchRemotePolicy(slug: string): Promise<RemotePolicy | null> {
  const { data, error } = await supabase
    .from("policies")
    .select("title, content")
    .eq("slug", slug)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
