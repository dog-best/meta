import { bad, methodNotAllowed, ok } from "../_shared/market/http.ts";
import { supabaseAdminClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") return methodNotAllowed();

  const admin = supabaseAdminClient();
  const url = new URL(req.url);

  const q = (url.searchParams.get("q") ?? "").trim();
  const category = url.searchParams.get("category"); // product|service
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 15), 30);

  // Pull recent active listings (small window) and compute suggestions
  let query = admin
    .from("market_listings")
    .select("sub_category,title")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(500);

  if (category) query = query.eq("category", category);

  if (q) {
    // lightweight filter server-side
    query = query.or(`title.ilike.%${q}%,sub_category.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return bad(error.message);

  const rows = data ?? [];

  // Subcategory frequency
  const subCounts = new Map<string, number>();
  // Keyword frequency (from title words)
  const kwCounts = new Map<string, number>();

  for (const r of rows) {
    const sub = String(r.sub_category ?? "").trim();
    if (sub) subCounts.set(sub, (subCounts.get(sub) ?? 0) + 1);

    const title = String(r.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => w.length >= 3 && w.length <= 20);

    for (const w of title) {
      kwCounts.set(w, (kwCounts.get(w) ?? 0) + 1);
    }
  }

  const subcategories = Array.from(subCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

  const keywords = Array.from(kwCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

  return ok({
    query: q,
    category: category ?? null,
    subcategories,
    keywords,
  });
});
