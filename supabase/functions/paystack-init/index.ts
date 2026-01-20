import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { success: false, message: "Method not allowed" });
    }

    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE = Deno.env.get("SB_SERVICE_ROLE_KEY");
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!SB_URL || !SB_SERVICE || !PAYSTACK_SECRET) {
      return json(500, {
        success: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE,
        hasPAYSTACK_SECRET_KEY: !!PAYSTACK_SECRET,
      });
    }

    // (Optional) Admin client, if you later want to write a pending tx record
    // Not strictly needed just to initialize Paystack
    const admin = createClient(SB_URL, SB_SERVICE);

    const body = await req.json().catch(() => null);
    const amount = body?.amount;
    const email = body?.email;

    if (!amount || typeof amount !== "number" || amount <= 0 || !email || typeof email !== "string") {
      return json(400, { success: false, message: "Invalid payload", received: { amount, email } });
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // NGN -> kobo
        email,
        currency: "NGN",
      }),
    });

    const paystackJson = await res.json().catch(() => ({}));

    if (!res.ok || !paystackJson?.status) {
      console.error("Paystack init failed:", paystackJson);
      return json(502, { success: false, message: "Paystack error", raw: paystackJson });
    }

    // If you want: store a pending record here (optional)
    // await admin.from("paystack_transactions").insert({ reference: paystackJson.data.reference, user_id: ..., amount, status: "pending", raw: paystackJson })

    return json(200, { success: true, ...paystackJson });
  } catch (err) {
    console.error("paystack-init error:", err);
    return json(500, { success: false, message: "Server error" });
  }
});
