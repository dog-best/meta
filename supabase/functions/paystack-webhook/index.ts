import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const encoder = new TextEncoder();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function env(name: string, fallback?: string) {
  return Deno.env.get(name) ?? (fallback ? Deno.env.get(fallback) : undefined);
}

async function verifyPaystackSignature(rawBody: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === signature;
}

serve(async (req) => {
  try {
    const SB_URL = env("SB_URL", "SUPABASE_URL");
    const SB_SERVICE_ROLE_KEY = env("SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    const PAYSTACK_SECRET = env("PAYSTACK_SECRET_KEY");

    if (!SB_URL || !SB_SERVICE_ROLE_KEY || !PAYSTACK_SECRET) {
      return json(500, {
        ok: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE_ROLE_KEY,
        hasPAYSTACK_SECRET_KEY: !!PAYSTACK_SECRET,
      });
    }

    const signature = req.headers.get("x-paystack-signature");
    if (!signature) return json(400, { ok: false, message: "Missing signature" });

    const rawBody = await req.text();

    const isValid = await verifyPaystackSignature(rawBody, signature, PAYSTACK_SECRET);
    if (!isValid) return json(401, { ok: false, message: "Invalid signature" });

    const payload = JSON.parse(rawBody);
    const event = payload?.event as string | undefined;
    const data = payload?.data;

    if (!event || !data) return json(400, { ok: false, message: "Invalid payload" });

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ─────────────────────────────────────────────
    // 1) WITHDRAWAL EVENTS
    // ─────────────────────────────────────────────
    if (event === "transfer.success" || event === "transfer.failed" || event === "transfer.reversed") {
      const reference = data?.reference as string | undefined;
      const transferCode = data?.transfer_code as string | undefined;

      if (!reference) return json(400, { ok: false, message: "Missing transfer reference" });

      if (event === "transfer.success") {
        const { error } = await admin.rpc("simple_finalize_withdrawal_success", {
          p_reference: reference,
          p_transfer_code: transferCode ?? null,
        });
        if (error) return json(500, { ok: false, message: error.message });
        return json(200, { ok: true });
      }

      // failed or reversed -> refund full debit (amount + fee)
      const { error: refundErr } = await admin.rpc("simple_refund_withdrawal", {
        p_reference: reference,
        p_reason: event,
      });
      if (refundErr) return json(500, { ok: false, message: refundErr.message });

      return json(200, { ok: true });
    }

    // ─────────────────────────────────────────────
    // 2) DEPOSIT EVENTS (Checkout / DVA later)
    // ─────────────────────────────────────────────
    if (event === "charge.success") {
      const reference = data?.reference as string | undefined;
      const amount = data?.amount ? Number(data.amount) / 100 : null;

      if (!reference || !amount || amount <= 0) {
        return json(400, { ok: false, message: "Missing reference/amount" });
      }

      let userId: string | null = null;

      // A) Best: metadata.user_id (Paystack checkout deposits)
      const metaUserId = data?.metadata?.user_id;
      if (metaUserId) userId = String(metaUserId);

      // B) DVA path (future)
      if (!userId) {
        const authorization = data?.authorization ?? {};
        const possibleAccountNumber =
          authorization?.receiver_bank_account_number ||
          authorization?.account_number ||
          data?.account_number ||
          null;

        if (possibleAccountNumber) {
          const { data: va } = await admin
            .from("user_virtual_accounts")
            .select("user_id")
            .eq("account_number", String(possibleAccountNumber))
            .eq("active", true)
            .maybeSingle();

          userId = va?.user_id ?? null;
        }
      }

      // C) Fallback: email
      if (!userId) {
        const email = data?.customer?.email as string | undefined;
        if (email) {
          const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
          userId = profile?.id ?? null;
        }
      }

      if (!userId) return json(404, { ok: false, message: "User not found for this payment" });

      // credit simplified wallet (idempotent inside RPC)
      const { error: creditErr } = await admin.rpc("simple_credit_from_paystack", {
        p_user_id: userId,
        p_amount: amount,
        p_reference: reference,
        p_raw: data ?? {},
      });

      if (creditErr) return json(500, { ok: false, message: creditErr.message });

      return json(200, { ok: true });
    }

    return json(200, { ok: true, ignored: true, event });
  } catch (err) {
    console.error("paystack-webhook error:", err);
    return json(500, { ok: false, message: "Server error" });
  }
});

