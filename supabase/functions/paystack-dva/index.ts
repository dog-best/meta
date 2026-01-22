import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type DvaRow = {
  user_id: string;
  paystack_customer_code: string | null;
  paystack_dedicated_account_id: number | null;
  account_number: string;
  bank_name: string;
  account_name: string;
  currency: string;
  provider_slug: string | null;
  active: boolean;
  raw: any;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function pickAccount(row: any) {
  return {
    account_number: row.account_number,
    bank_name: row.bank_name,
    account_name: row.account_name,
    currency: row.currency ?? "NGN",
    active: !!row.active,
  };
}

function env(name: string) {
  return Deno.env.get(name);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getUserFromJwt(sbUrl: string, anonKey: string, jwt: string) {
  // Direct call to GoTrue user endpoint (avoids supabase-js "Auth session missing!" issue)
  const res = await fetch(`${sbUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
    },
  });

  const data = await safeJson(res);
  if (!res.ok) {
    return { user: null, error: data?.msg || data?.message || `auth user fetch failed (${res.status})` };
  }

  return { user: data, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed" });

    // Use SB_* secrets (SUPABASE_* is forbidden)
    const SB_URL = env("SB_URL");
    const SB_ANON_KEY = env("SB_ANON_KEY");
    const SB_SERVICE_ROLE_KEY = env("SB_SERVICE_ROLE_KEY");
    const PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY");

    if (!SB_URL || !SB_ANON_KEY || !SB_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
      return json(500, {
        success: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_ANON_KEY: !!SB_ANON_KEY,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE_ROLE_KEY,
        hasPAYSTACK_SECRET_KEY: !!PAYSTACK_SECRET_KEY,
      });
    }

    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader) return json(401, { success: false, message: "Missing Authorization header" });

    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    // Validate JWT by calling GoTrue
    const { user, error: userErr } = await getUserFromJwt(SB_URL, SB_ANON_KEY, jwt);
    if (userErr || !user?.id) {
      return json(401, { success: false, message: "Invalid session token", raw: userErr });
    }

    // admin client (db writes)
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) return existing active DVA
    const { data: existing, error: existingErr } = await admin
      .from("user_virtual_accounts")
      .select(
        "user_id,paystack_customer_code,paystack_dedicated_account_id,account_number,bank_name,account_name,currency,provider_slug,active,raw",
      )
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle<DvaRow>();

    if (existingErr) return json(500, { success: false, message: existingErr.message });
    if (existing?.account_number) return json(200, { success: true, account: pickAccount(existing) });

    // 2) get profile
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle<{ email: string | null; full_name: string | null }>();

    if (profileErr) return json(500, { success: false, message: profileErr.message });

    // Prefer profiles.email; fallback to auth user email
    const email = profile?.email ?? user.email ?? null;
    const fullName = profile?.full_name ?? null;

    if (!email) return json(400, { success: false, message: "User missing email (profiles.email or auth.email)" });

    // 3) reuse customer code if exists
    let customerCode: string | null = null;
    const { data: prev, error: prevErr } = await admin
      .from("user_virtual_accounts")
      .select("paystack_customer_code")
      .eq("user_id", user.id)
      .not("paystack_customer_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ paystack_customer_code: string | null }>();

    if (prevErr) return json(500, { success: false, message: prevErr.message });
    if (prev?.paystack_customer_code) customerCode = prev.paystack_customer_code;

    // 4) Create Paystack customer if needed
    if (!customerCode) {
      const first = fullName?.split(" ")?.[0] ?? undefined;
      const last = fullName?.split(" ")?.slice(1).join(" ") || undefined;

      const customerRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, first_name: first, last_name: last }),
      });

      const customerJson = await safeJson(customerRes);

      if (!customerRes.ok || !customerJson?.status) {
        return json(502, {
          success: false,
          message: "Paystack customer create failed",
          status: customerRes.status,
          raw: customerJson,
        });
      }

      customerCode = customerJson.data.customer_code;
    }

    // 5) Create Dedicated Virtual Account
    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer: customerCode }),
    });

    const dvaJson = await safeJson(dvaRes);

    if (!dvaRes.ok || !dvaJson?.status) {
      return json(502, {
        success: false,
        message: "Paystack DVA create failed",
        status: dvaRes.status,
        raw: dvaJson,
      });
    }

    const accountNumber = dvaJson.data.account_number;
    const bankName = dvaJson.data.bank?.name ?? "Bank";
    const accountName = dvaJson.data.account_name ?? fullName ?? email;

    // Ensure only one active row per user
    await admin.from("user_virtual_accounts").update({ active: false }).eq("user_id", user.id);

    // 6) Store
    const { error: insErr } = await admin.from("user_virtual_accounts").insert({
      user_id: user.id,
      paystack_customer_code: customerCode,
      paystack_dedicated_account_id: dvaJson.data.id ?? null,
      account_number: accountNumber,
      bank_name: bankName,
      account_name: accountName,
      currency: "NGN",
      provider_slug: dvaJson.data.bank?.slug ?? null,
      active: true,
      raw: dvaJson.data,
    });

    if (insErr) return json(500, { success: false, message: insErr.message });

    return json(200, {
      success: true,
      account: { account_number: accountNumber, bank_name: bankName, account_name: accountName, currency: "NGN", active: true },
    });
  } catch (e) {
    console.error("paystack-dva error:", e);
    return json(500, { success: false, message: "Server error" });
  }
});
