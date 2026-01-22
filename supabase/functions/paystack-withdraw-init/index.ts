import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

function env(name: string) {
  return Deno.env.get(name);
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

async function getUserFromJwt(sbUrl: string, anonKey: string, jwt: string) {
  const res = await fetch(`${sbUrl}/auth/v1/user`, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  const data = await safeJson(res);
  if (!res.ok) return { user: null, error: data?.msg || data?.message || `auth failed (${res.status})` };
  return { user: data, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed" });

  const SB_URL = env("SB_URL");
  const SB_ANON_KEY = env("SB_ANON_KEY");
  const SB_SERVICE_ROLE_KEY = env("SB_SERVICE_ROLE_KEY");
  const PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY");

  if (!SB_URL || !SB_ANON_KEY || !SB_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
    return json(500, { success: false, message: "Missing env vars" });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return json(401, { success: false, message: "Missing Authorization" });

  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  const { user, error: userErr } = await getUserFromJwt(SB_URL, SB_ANON_KEY, jwt);
  if (userErr || !user?.id) return json(401, { success: false, message: "Invalid session", raw: userErr });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount ?? 0);
  const account_number = String(body?.account_number ?? "");
  const bank_code = String(body?.bank_code ?? ""); // Paystack uses bank code
  const account_name = String(body?.account_name ?? "");

  if (!amount || amount <= 0) return json(400, { success: false, message: "Invalid amount" });
  if (!account_number || account_number.length < 8) return json(400, { success: false, message: "Invalid account_number" });
  if (!bank_code) return json(400, { success: false, message: "Missing bank_code" });

  const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Create a unique reference for idempotency (Paystack requires unique references)
  const reference = `WD-${user.id}-${crypto.randomUUID()}`;

  // 1) Create transfer recipient
  const recipRes = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "nuban",
      name: account_name || user.email || "User",
      account_number,
      bank_code,
      currency: "NGN",
    }),
  });

  const recipJson = await safeJson(recipRes);
  if (!recipRes.ok || !recipJson?.status) {
    return json(502, { success: false, message: "Paystack recipient create failed", status: recipRes.status, raw: recipJson });
  }

  const recipientCode = recipJson.data.recipient_code as string;

  // 2) Initiate transfer
  const transferRes = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amount * 100), // NGN -> kobo
      recipient: recipientCode,
      reason: "Withdrawal",
      reference,
      metadata: { user_id: user.id, purpose: "withdrawal" },
    }),
  });

  const transferJson = await safeJson(transferRes);
  if (!transferRes.ok || !transferJson?.status) {
    return json(502, { success: false, message: "Paystack transfer init failed", status: transferRes.status, raw: transferJson });
  }

  // 3) Debit wallet + create withdrawal record (fee is computed in SQL)
  const { data: withdrawalId, error: wdErr } = await admin.rpc("simple_create_withdrawal", {
    p_user_id: user.id,
    p_amount: amount,
    p_bank_name: transferJson?.data?.recipient?.details?.bank_name ?? null,
    p_account_number: account_number,
    p_account_name: account_name || null,
    p_reference: reference,
    p_meta: { paystack_transfer: transferJson?.data ?? {} },
  });

  if (wdErr) {
    // If wallet debit fails, we should tell client; Paystack transfer may still be pending,
    // but webhook refund will handle if needed once we add safeguards.
    return json(400, { success: false, message: wdErr.message });
  }

  return json(200, {
    success: true,
    reference,
    withdrawal_id: withdrawalId,
    paystack: {
      transfer_code: transferJson?.data?.transfer_code ?? null,
      status: transferJson?.data?.status ?? null,
    },
    fee_policy: "flat_20",
  });
});
