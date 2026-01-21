import { serve } from "https://deno.land/std/http/server.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readInput(req: Request) {
  const url = new URL(req.url);
  let category = url.searchParams.get("category") ?? undefined;
  let provider = url.searchParams.get("provider") ?? undefined;

  // If not present in query params, try JSON body
  if (!category || !provider) {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        category = category ?? body?.category;
        provider = provider ?? body?.provider;
      }
    } catch {
      // ignore body parse errors
    }
  }

  return { category, provider };
}

serve(async (req) => {
  try {
    const { category, provider } = await readInput(req);

    if (!category) {
      return json(400, { success: false, message: "Missing category" });
    }

    // Bills categories: return providers if provider not specified
    const isBillsCategory = category === "electricity" || category === "tv";

    if (isBillsCategory) {
      // If provider is missing, return provider list for that category
      if (!provider) {
        const { data, error } = await supabaseAdmin
          .from("bill_providers")
          .select("id, name, category, status")
          .eq("category", category)
          .eq("status", "active")
          .order("name", { ascending: true });

        if (error) {
          console.error("fetch-utility-category bill_providers error", error);
          return json(500, { success: false, message: "Failed to load providers" });
        }

        return json(200, { success: true, providers: data ?? [] });
      }

      // If provider is specified, return the provider record (placeholder for bill products)
      const { data: prov, error: provErr } = await supabaseAdmin
        .from("bill_providers")
        .select("id, name, category, status")
        .eq("id", provider)
        .maybeSingle();

      if (provErr) {
        console.error("fetch-utility-category provider lookup error", provErr);
        return json(500, { success: false, message: "Failed to load provider" });
      }

      if (!prov) {
        return json(404, { success: false, message: "Provider not found" });
      }

      // Later: you can fetch bill_products/bill_plans here, if you add those tables.
      return json(200, { success: true, provider: prov, products: [] });
    }

    // Fintech categories (data/airtime): require provider
    if (!provider) {
      return json(400, { success: false, message: "Missing provider" });
    }

    const now = new Date();

    const { data: products, error: productsErr } = await supabaseAdmin
      .from("service_products")
      .select("product_code, name, data_size_mb, validity_label, base_price, provider, category, active")
      .eq("category", category)
      .eq("provider", provider)
      .eq("active", true)
      .order("base_price", { ascending: true });

    if (productsErr) {
      console.error("fetch-utility-category productsErr", productsErr);
      return json(500, { success: false, message: "Failed to load products" });
    }

    const { data: offers, error: offersErr } = await supabaseAdmin
      .from("service_offers")
      .select("provider, category, product_code, cashback, bonus_data_mb, starts_at, ends_at, active")
      .eq("category", category)
      .eq("provider", provider)
      .eq("active", true);

    if (offersErr) {
      console.error("fetch-utility-category offersErr", offersErr);
      // Not fatal; proceed without offers
    }

    const offerList = offers ?? [];

    const enriched = (products ?? []).map((p: any) => {
      const base_price = Number(p.base_price ?? 0);
      const bestOffer = offerList
        .filter((o: any) => o.product_code === p.product_code)
        .filter((o: any) => {
          const startOk = !o.starts_at || new Date(o.starts_at) <= now;
          const endOk = !o.ends_at || new Date(o.ends_at) >= now;
          return startOk && endOk;
        })
        .sort((a: any, b: any) => Number(b.cashback ?? 0) - Number(a.cashback ?? 0))[0];

      const cashback = Number(bestOffer?.cashback ?? 0);
      const final_price = Math.max(0, base_price - cashback);

      return {
        product_code: p.product_code,
        name: p.name,
        data_size_mb: p.data_size_mb,
        validity_label: p.validity_label,
        has_offer: !!bestOffer,
        base_price,
        final_price,
        cashback,
        bonus_data_mb: Number(bestOffer?.bonus_data_mb ?? 0),
      };
    });

    return json(200, { success: true, products: enriched });
  } catch (e) {
    console.error("fetch-utility-category error", e);
    return json(500, { success: false, message: "Unexpected error" });
  }
});
