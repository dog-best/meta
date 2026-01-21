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
    const SUPABASE_URL = env("SUPABASE_URL", "SB_URL");
    const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", "SB_SERVICE_ROLE_KEY");
    const PAYSTACK_SECRET = env("PAYSTACK_SECRET_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PAYSTACK_SECRET) {
      return json(500, {
        ok: false,
        message: "Missing env vars",
        hasSUPABASE_URL: !!SUPABASE_URL,
        hasSUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─────────────────────────────────────────────
    // Wallet funding via bank transfer / DVA
    // ─────────────────────────────────────────────
    if (event === "charge.success") {
      const reference = data?.reference as string | undefined;
      const amount = data?.amount ? Number(data.amount) / 100 : null; // kobo -> NGN

      if (!reference || !amount || amount <= 0) {
        return json(400, { ok: false, message: "Missing reference/amount" });
      }

      // Identify user by virtual account number (best signal)
      const authorization = data?.authorization ?? {};
      const possibleAccountNumber =
        authorization?.receiver_bank_account_number ||
        authorization?.account_number ||
        data?.account_number ||
        null;

      let userId: string | null = null;

      if (possibleAccountNumber) {
        const { data: va, error: vaErr } = await admin
          .from("user_virtual_accounts")
          .select("user_id")
          .eq("account_number", String(possibleAccountNumber))
          .eq("active", true)
          .maybeSingle();

        if (vaErr) console.error("paystack-webhook VA lookup error", vaErr);
        userId = va?.user_id ?? null;
      }

      // Fallback: match by email
      if (!userId) {
        const email = data?.customer?.email as string | undefined;
        if (email) {
          const { data: profile, error: profErr } = await admin
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          if (profErr) console.error("paystack-webhook profile lookup error", profErr);
          userId = profile?.id ?? null;
        }
      }

      if (!userId) return json(404, { ok: false, message: "User not found for this payment" });

      // Credit simplified wallet (idempotent inside RPC)
      const { error: creditErr } = await admin.rpc("simple_credit_from_paystack", {
        p_user_id: userId,
        p_amount: amount,
        p_reference: reference,
        p_raw: data ?? {},
      });

      if (creditErr) return json(500, { ok: false, message: creditErr.message });

      return json(200, { ok: true });
    }

    // Ignore other Paystack events for now (we're doing deposits first)
    return json(200, { ok: true, ignored: true, event });
  } catch (err) {
    console.error("paystack-webhook error:", err);
    return json(500, { ok: false, message: "Server error" });
  }
});
