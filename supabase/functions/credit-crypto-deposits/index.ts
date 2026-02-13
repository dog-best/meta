import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REQUIRED_CONFIRMATIONS = 12;

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Fetch confirmed but uncredited deposits
  const { data: deposits, error } = await supabase
    .from("crypto_deposits")
    .select("*")
    .eq("status", "pending")
    .gte("confirmations", REQUIRED_CONFIRMATIONS);

  if (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }

  for (const deposit of deposits ?? []) {
    const { user_id, asset_symbol, amount, tx_hash } = deposit;

    // 2. Ensure user ledger account exists
    let { data: account } = await supabase
      .from("ledger_accounts")
      .select("id")
      .eq("owner_type", "user")
      .eq("owner_id", user_id)
      .eq("currency", asset_symbol)
      .single();

    if (!account) {
      const { data: created } = await supabase
        .from("ledger_accounts")
        .insert({
          owner_type: "user",
          owner_id: user_id,
          currency: asset_symbol,
          account_type: "wallet",
        })
        .select()
        .single();

      if (!created?.id) continue;
      account = created;
    }

    if (!account?.id) continue;

    // 3. Credit ledger
    await supabase.from("ledger_entries").insert({
      account_id: account.id,
      direction: "credit",
      amount: Number(amount),
      reference: `crypto_deposit:${tx_hash}`,
      metadata: {
        chain: deposit.chain,
        tx_hash,
      },
    });

    // 4. Mark deposit as credited
    await supabase
      .from("crypto_deposits")
      .update({ status: "credited" })
      .eq("id", deposit.id);
  }

  return new Response("ok", { status: 200 });
});
