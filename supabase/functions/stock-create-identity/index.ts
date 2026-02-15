import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

function normalizeSymbol(input: string) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9$]/g, "")
    .slice(0, 10);
}

function normalizeName(input: string) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function resolveUniqueSlug(admin: ReturnType<typeof supabaseAdminClient>, input: string) {
  const base = slugify(input) || `stock-${Date.now()}`;
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await admin
      .from("market_stock_identities")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const userClient = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: auth, error: authErr } = await userClient.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) return unauth();

  const body = await req.json().catch(() => ({}));
  const preferredChain = String(body?.chain ?? "")
    .trim()
    .toLowerCase();
  const name = normalizeName(String(body?.name ?? body?.token_name ?? ""));
  const symbol = normalizeSymbol(String(body?.symbol ?? body?.token_symbol ?? ""));
  const slugInput = String(body?.slug ?? `${name}-${symbol}`);
  const initialPrice = Number(body?.initial_price_usdc ?? body?.initial_price ?? 0.01);
  const txHash = String(body?.tx_hash ?? "").trim();
  const userOpHash = String(body?.user_op_hash ?? "").trim();
  const tokenAddress = String(body?.token_address ?? "").trim();
  const poolAddress = String(body?.pool_address ?? "").trim();
  const vaultAddress = String(body?.vault_address ?? "").trim();
  const stakingAddress = String(body?.staking_address ?? "").trim();
  const storeKey = String(body?.store_key ?? "").trim();

  if (!name || name.length < 3) return bad("name must be at least 3 characters");
  if (!symbol || symbol.length < 2) return bad("symbol must be at least 2 characters");
  if (!Number.isFinite(initialPrice) || initialPrice <= 0) return bad("initial_price_usdc must be > 0");

  const { data: seller, error: sellerErr } = await admin
    .from("market_seller_profiles")
    .select("user_id,business_name,market_username,is_verified,active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (sellerErr) return bad(sellerErr.message);
  if (!seller || seller.active === false) return bad("Seller profile not active");
  if (!seller.is_verified) return bad("Only verified stores can create stock identity");

  let perms: any = null;
  const permsByStore = await admin
    .from("store_identity_permissions")
    .select("*")
    .eq("store_id", user.id)
    .maybeSingle();
  if (!permsByStore.error) {
    perms = permsByStore.data;
  } else {
    const permsBySeller = await admin
      .from("store_identity_permissions")
      .select("*")
      .eq("seller_id", user.id)
      .maybeSingle();
    if (!permsBySeller.error) perms = permsBySeller.data;
  }

  const allowCreate = perms?.can_create ?? perms?.allow_create ?? true;
  const allowReserved = perms?.allow_reserved ?? false;
  if (allowCreate === false) return bad("Store cannot create stock identity right now");

  const { data: existingByStore, error: existingErr } = await admin
    .from("market_stock_identities")
    .select("id,slug,name,symbol,chain")
    .eq("store_id", user.id)
    .maybeSingle();
  if (existingErr) return bad(existingErr.message);
  if (existingByStore) return ok({ ok: true, created: false, identity: existingByStore });

  const reservedFn = await admin.rpc("market_stock_has_reserved_text", {
    p_name: name,
    p_symbol: symbol,
  });
  let isReserved = false;
  if (!reservedFn.error) {
    isReserved = reservedFn.data === true;
  } else {
    const normName = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const termsV2 = await admin
      .from("market_stock_reserved_terms")
      .select("term_norm")
      .eq("active", true)
      .in("term_norm", [normName, normSymbol]);
    if (!termsV2.error && (termsV2.data?.length ?? 0) > 0) {
      isReserved = true;
    } else {
      const termsLegacy = await admin
        .from("reserved_name_rules")
        .select("normalized_pattern")
        .eq("active", true)
        .in("normalized_pattern", [normName, normSymbol]);
      if (!termsLegacy.error && (termsLegacy.data?.length ?? 0) > 0) {
        isReserved = true;
      }
    }
  }
  if (isReserved && !allowReserved) {
    return bad("Reserved identity name/symbol. Contact BestCity support");
  }

  let chainConfig: any = null;
  if (preferredChain) {
    const { data, error } = await admin
      .from("market_chain_config")
      .select("chain,chain_id,active,identity_factory,identity_router,identity_name_registry,identity_stable_address")
      .eq("chain", preferredChain)
      .eq("active", true)
      .maybeSingle();
    if (error) return bad(error.message);
    chainConfig = data;
  } else {
    const { data, error } = await admin
      .from("market_chain_config")
      .select("chain,chain_id,active,identity_factory,identity_router,identity_name_registry,identity_stable_address,created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) return bad(error.message);
    const rows = data ?? [];
    chainConfig = rows.find((row: any) => row.identity_factory && row.identity_router) ?? rows[0] ?? null;
  }

  if (!chainConfig?.chain) return bad("No active chain config available");

  const slug = await resolveUniqueSlug(
    admin,
    slugInput || seller.market_username || seller.business_name || `${name}-${symbol}`,
  );

  const now = new Date();
  const launchGuardUntil = new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString();

  const { data: identity, error: createErr } = await admin
    .from("market_stock_identities")
    .insert({
      store_id: user.id,
      chain: chainConfig.chain,
      chain_id: Number(chainConfig.chain_id ?? 0),
      slug,
      name,
      symbol,
      token_address: tokenAddress || null,
      pool_address: poolAddress || null,
      launch_guard_until: launchGuardUntil,
      launched_at: now.toISOString(),
    })
    .select("*")
    .single();
  if (createErr || !identity) return bad(createErr?.message ?? "Failed to create stock identity");

  const { error: lockPermErr } = await admin
    .from("store_identity_permissions")
    .upsert(
      {
        store_id: user.id,
        can_create: false,
      },
      { onConflict: "store_id" },
    );
  if (lockPermErr) return bad(lockPermErr.message);

  const reserveUsdc = 0;
  const platformUsdc = Number(identity.creation_reserve_usdc ?? 5);
  const creationLp = Number(identity.creation_lp_usdc ?? 45);

  const { error: reserveErr2 } = await admin
    .from("market_stock_reserve_balance")
    .upsert(
      {
        stock_id: identity.id,
        store_id: user.id,
        reserve_usdc: reserveUsdc,
      },
      { onConflict: "stock_id" },
    );
  if (reserveErr2) return bad(reserveErr2.message);

  const { error: reinvestErr } = await admin
    .from("market_stock_reinvestments")
    .insert({
      stock_id: identity.id,
      store_id: user.id,
      source_type: "creation_fee",
      gross_usdc: creationLp + platformUsdc,
      platform_usdc: platformUsdc,
      liquidity_usdc: creationLp,
      staking_usdc: 0,
      chain: identity.chain,
      tx_hash: txHash || null,
      status: "confirmed",
      idempotency_key: `stock:create:${identity.id}`,
    });
  if (reinvestErr) return bad(reinvestErr.message);

  const marketCap = Number(identity.total_supply ?? 10_000_000) * initialPrice;
  const { error: pointErr } = await admin
    .from("market_stock_price_points")
    .upsert({
      stock_id: identity.id,
      last_price_usdc: initialPrice,
      market_cap_usdc: marketCap,
      updated_at: now.toISOString(),
    });
  if (pointErr) return bad(pointErr.message);

  return ok({
    ok: true,
    created: true,
    identity,
    chain_config: chainConfig,
    economics: {
      creation_fee_usdc: 50,
      liquidity_usdc: creationLp,
      reserve_usdc: reserveUsdc,
    },
    onchain: {
      tx_hash: txHash || null,
      user_op_hash: userOpHash || null,
      token_address: tokenAddress || null,
      pool_address: poolAddress || null,
      vault_address: vaultAddress || null,
      staking_address: stakingAddress || null,
      store_key: storeKey || null,
    },
  });
});
