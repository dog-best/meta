import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";
import { resolveStockIdentity } from "../_shared/market/stock.ts";

function toInt(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const admin = supabaseAdminClient();
  const userClient = supabaseUserClient(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "list").trim().toLowerCase();
  const stockId = String(body?.stock_id ?? body?.identity_id ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase();

  const stock = await resolveStockIdentity(admin as any, { stockId, slug });
  if (!stock) return bad("Stock identity not found");

  if (action === "list") {
    const limit = toInt(body?.limit, 50, 1, 120);
    const before = String(body?.before ?? "").trim();
    let q = admin
      .from("market_stock_chat_messages")
      .select("id,stock_id,user_id,body,is_flagged,created_at")
      .eq("stock_id", stock.id)
      .eq("is_flagged", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) q = q.lt("created_at", before);

    const { data: rows, error } = await q;
    if (error) return bad(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((m: any) => m.user_id).filter(Boolean)));
    const { data: profiles, error: profileErr } = userIds.length
      ? await admin
        .from("profiles")
        .select("id,username,full_name")
        .in("id", userIds)
      : { data: [] as any[], error: null };
    if (profileErr) return bad(profileErr.message);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const messages = (rows ?? []).map((m: any) => ({
      ...m,
      profile: profileMap.get(m.user_id) ?? null,
    }));

    return ok({
      ok: true,
      action: "list",
      stock: { id: stock.id, slug: stock.slug, symbol: stock.symbol },
      messages,
    });
  }

  if (action === "post") {
    const { data: auth, error: authErr } = await userClient.auth.getUser();
    const user = auth?.user;
    if (authErr || !user) return unauth();

    const text = String(body?.body ?? "").trim();
    if (!text || text.length > 280) return bad("body must be 1..280 characters");

    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await admin
      .from("market_stock_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("stock_id", stock.id)
      .eq("user_id", user.id)
      .gte("created_at", cutoff);
    if (rateErr) return bad(rateErr.message);
    if ((recentCount ?? 0) >= 8) return bad("Rate limit reached, wait a bit before posting again");

    const { data: inserted, error: insErr } = await admin
      .from("market_stock_chat_messages")
      .insert({
        stock_id: stock.id,
        user_id: user.id,
        body: text,
      })
      .select("id,stock_id,user_id,body,is_flagged,created_at")
      .single();
    if (insErr || !inserted) return bad(insErr?.message ?? "Failed to post message");

    const { data: profile } = await admin
      .from("profiles")
      .select("id,username,full_name")
      .eq("id", user.id)
      .maybeSingle();

    return ok({
      ok: true,
      action: "post",
      stock: { id: stock.id, slug: stock.slug, symbol: stock.symbol },
      message: {
        ...inserted,
        profile: profile ?? null,
      },
    });
  }

  return bad("Unsupported action. Use list or post");
});
