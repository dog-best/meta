import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

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

// allow SB_URL / SUPABASE_URL, etc
function envAny(...names: string[]) {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return null;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────
   Main
───────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, message: "Method not allowed" });

  /* ───────── ENV ───────── */
  const SUPABASE_URL = envAny("SUPABASE_URL", "SB_URL");
  const SUPABASE_ANON_KEY = envAny("SUPABASE_ANON_KEY", "SB_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = envAny("SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY");
  const PAYSTACK_SECRET_KEY = envAny("PAYSTACK_SECRET_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) {
    return json(500, { success: false, message: "Missing env vars" });
  }

  /* ───────── AUTH ───────── */
  const authHeader =
    req.headers.get("authorization") ??
    req.headers.get("Authorization");

  if (!authHeader) {
    return json(401, { success: false, message: "Missing Authorization" });
  }

  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const authJson = await safeJson(authRes);
  if (!authRes.ok || !authJson?.id) {
    return json(401, { success: false, message: "Invalid session" });
  }

  const userId = authJson.id;
  const userEmail = authJson.email ?? null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  /* ───────── INPUT ───────── */
  const body = await req.json().catch(() => ({}));

  const amount = Number(body.amount ?? 0);
  const account_number = String(body.account_number ?? "");
  const bank_code = String(body.bank_code ?? "");
  const account_name = body.account_name ? String(body.account_name) : userEmail ?? "User";
  const clientReference = body.reference ? String(body.reference) : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, { success: false, message: "Invalid amount" });
  }
  if (!account_number || account_number.length < 8) {
    return json(400, { success: false, message: "Invalid account number" });
  }
  if (!bank_code) {
    return json(400, { success: false, message: "Missing bank code" });
  }

  /* ───────── KYC / VERIFICATION GATE ───────── */
  const { data: sellerProfile } = await admin
    .from("market_seller_profiles")
    .select("is_verified, active")
    .eq("user_id", userId)
    .maybeSingle();

  if (!sellerProfile || !sellerProfile.active) {
    return json(403, {
      success: false,
      code: "SELLER_PROFILE_REQUIRED",
      message: "Active seller profile required",
    });
  }

  if (!sellerProfile.is_verified) {
    return json(403, {
      success: false,
      code: "KYC_REQUIRED",
      message: "Withdrawal locked until seller verification is completed",
    });
  }

  /* ───────── IDEMPOTENCY ───────── */
  const reference =
    clientReference ??
    `WD-${userId}-${crypto.randomUUID()}`;

  const { data: existing } = await admin
    .from("withdrawals_simple")
    .select("id,status,paystack_reference,paystack_transfer_code")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (existing) {
    return json(200, {
      success: true,
      idempotent: true,
      reference,
      withdrawal_id: existing.id,
      status: existing.status,
      paystack_transfer_code: existing.paystack_transfer_code ?? null,
    });
  }

  /* ───────── PAYSTACK: CREATE RECIPIENT ───────── */
  const recipRes = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "nuban",
      name: account_name,
      account_number,
      bank_code,
      currency: "NGN",
    }),
  });

  const recipJson = await safeJson(recipRes);
  if (!recipRes.ok || !recipJson?.status) {
    return json(502, {
      success: false,
      message: "Failed to create Paystack recipient",
      raw: recipJson,
    });
  }

  const recipientCode = recipJson.data.recipient_code;
  const bankName = recipJson?.data?.details?.bank_name ?? null;

  /* ───────── LOCK FUNDS FIRST (SQL) ───────── */
  const { data: withdrawalId, error: wdErr } = await admin.rpc(
    "simple_create_withdrawal",
    {
      p_user_id: userId,
      p_amount: amount,
      p_bank_name: bankName,
      p_account_number: account_number,
      p_account_name: account_name,
      p_reference: reference,
      p_meta: {
        recipient: recipJson.data,
        source: "market_withdrawal",
      },
    },
  );

  if (wdErr) {
    return json(400, { success: false, message: wdErr.message });
  }

  /* ───────── PAYSTACK: INITIATE TRANSFER ───────── */
  const transferRes = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reason: "Market withdrawal",
      reference,
      metadata: {
        user_id: userId,
        purpose: "market_withdrawal",
      },
    }),
  });

  const transferJson = await safeJson(transferRes);

  if (!transferRes.ok || !transferJson?.status) {
    // rollback (refund) immediately
    await admin.rpc("simple_refund_withdrawal", {
      p_reference: reference,
      p_reason: "transfer_init_failed",
    });

    return json(502, {
      success: false,
      message: "Paystack transfer failed (funds refunded)",
      raw: transferJson,
    });
  }

  const transferCode = transferJson.data.transfer_code ?? null;

  await admin
    .from("withdrawals_simple")
    .update({
      paystack_transfer_code: transferCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawalId as string);

  return json(200, {
    success: true,
    reference,
    withdrawal_id: withdrawalId,
    status: "processing",
    paystack: {
      transfer_code: transferCode,
    },
  });
});
