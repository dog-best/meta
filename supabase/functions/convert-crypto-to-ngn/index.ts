import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { asset, amount } = await req.json();
    if (!asset || !amount || amount <= 0) {
      return new Response("Invalid request", { status: 400 });
    }

    // ---- CONFIG ----
    const MARKET_RATE = 1500; // NGN per 1 asset (mock for now)
    const MARGIN = 0.02;      // 2% profit

    const userRate = MARKET_RATE * (1 - MARGIN);
    const ngnAmount = amount * userRate;
    const revenue = amount * MARKET_RATE - ngnAmount;

    // ---- USER CRYPTO ACCOUNT ----
    const { data: cryptoAccount } = await supabase
      .from("ledger_accounts")
      .select("id")
      .eq("owner_type", "user")
      .eq("owner_id", user.id)
      .eq("currency", asset)
      .single();

    if (!cryptoAccount) {
      return new Response("Crypto account not found", { status: 400 });
    }

    // ---- USER NGN ACCOUNT ----
    let { data: ngnAccount } = await supabase
      .from("ledger_accounts")
      .select("id")
      .eq("owner_type", "user")
      .eq("owner_id", user.id)
      .eq("currency", "NGN")
      .single();

    if (!ngnAccount) {
      const { data: created } = await supabase
        .from("ledger_accounts")
        .insert({
          owner_type: "user",
          owner_id: user.id,
          currency: "NGN",
          account_type: "wallet",
        })
        .select()
        .single();
      if (!created?.id) {
        return new Response("Failed to create NGN account", { status: 500 });
      }
      ngnAccount = created;
    }

    if (!ngnAccount?.id) {
      return new Response("NGN account unavailable", { status: 500 });
    }

    const reference = `convert_${cryptoAccount.id}_${Date.now()}`;

    // ---- LEDGER ENTRIES ----
    await supabase.from("ledger_entries").insert([
      {
        account_id: cryptoAccount.id,
        direction: "debit",
        amount,
        reference,
        metadata: { asset, type: "crypto_to_ngn" },
      },
      {
        account_id: ngnAccount.id,
        direction: "credit",
        amount: ngnAmount,
        reference,
        metadata: { asset, type: "crypto_to_ngn" },
      },
    ]);

    // ---- PLATFORM REVENUE ----
    const { data: revenueAccount } = await supabase
      .from("ledger_accounts")
      .select("id")
      .eq("owner_type", "system")
      .eq("currency", "NGN")
      .eq("account_type", "revenue")
      .single();

    if (revenueAccount && revenue > 0) {
      await supabase.from("ledger_entries").insert({
        account_id: revenueAccount.id,
        direction: "credit",
        amount: revenue,
        reference,
        metadata: { source: "conversion_margin" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, ngnAmount }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
