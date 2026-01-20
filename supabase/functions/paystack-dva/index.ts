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

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json(405, { success: false, message: "Method not allowed" });
    }

    const SB_URL = Deno.env.get("SB_URL");
    const SB_ANON = Deno.env.get("SB_ANON_KEY");
    const SB_SERVICE = Deno.env.get("SB_SERVICE_ROLE_KEY");
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!SB_URL || !SB_ANON || !SB_SERVICE || !PAYSTACK_SECRET) {
      return json(500, {
        success: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_ANON_KEY: !!SB_ANON,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE,
        hasPAYSTACK_SECRET_KEY: !!PAYSTACK_SECRET,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { success: false, message: "Missing Authorization header" });
    }

    // user-scoped client (auth only)
    const userClient = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: auth, error: authError } = await userClient.auth.getUser();
    const user = auth?.user;

    if (authError || !user) {
      return json(401, {
        success: false,
        message: "Invalid session token",
        raw: authError?.message ?? null,
      });
    }

    // admin client (db writes)
    const admin = createClient(SB_URL, SB_SERVICE);

    // 1) return existing DVA (active)
    const { data: existing, error: existingErr } = await admin
      .from("user_virtual_accounts")
      .select(
        "user_id,paystack_customer_code,paystack_dedicated_account_id,account_number,bank_name,account_name,currency,provider_slug,active",
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
      .maybeSingle();

    if (profileErr) return json(500, { success: false, message: profileErr.message });
    if (!profile?.email) return json(400, { success: false, message: "User profile missing email" });

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
      const customerRes = await fetch("https://api.paystack.co/customer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: profile.email,
          first_name: profile.full_name?.split(" ")?.[0] ?? undefined,
          last_name: profile.full_name?.split(" ")?.slice(1).join(" ") ?? undefined,
        }),
      });

      const customerJson = await customerRes.json().catch(() => ({}));

      if (!customerRes.ok || !customerJson?.status) {
        return json(502, { success: false, message: "Paystack customer create failed", raw: customerJson });
      }

      customerCode = customerJson.data.customer_code;
    }

    // 5) Create Dedicated Virtual Account
    const dvaRes = await fetch("https://api.paystack.co/dedicated_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer: customerCode }),
    });

    const dvaJson = await dvaRes.json().catch(() => ({}));

    if (!dvaRes.ok || !dvaJson?.status) {
      return json(502, { success: false, message: "Paystack DVA create failed", raw: dvaJson });
    }

    const accountNumber = dvaJson.data.account_number;
    const bankName = dvaJson.data.bank?.name ?? "Bank";
    const accountName = dvaJson.data.account_name ?? profile.full_name ?? profile.email;

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
      account: {
        account_number: accountNumber,
        bank_name: bankName,
        account_name: accountName,
        currency: "NGN",
        active: true,
      },
    });
  } catch (e) {
    console.error("paystack-dva error:", e);
    return json(500, { success: false, message: "Server error" });
  }
});
