import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { envAny } from "../_shared/market/env.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const SB_URL = envAny(["SB_URL", "SUPABASE_URL", "sb_url"], "");
    const SB_SERVICE = envAny(
      ["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "sb_secret_key", "sb_scret_key"],
      "",
    );

    if (!SB_URL || !SB_SERVICE) {
      return json(500, {
        ok: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE,
      });
    }

    const payload = await req.json();

    const admin = createClient(SB_URL, SB_SERVICE);

    const activities = payload?.event?.activity;
    if (!Array.isArray(activities)) {
      return json(200, { ok: true, message: "No activity" });
    }

    for (const activity of activities) {
      const toAddress = activity.toAddress?.toLowerCase();
      if (!toAddress) continue;

      // wallet lookup
      const { data: wallet, error: walletErr } = await admin
        .from("crypto_wallets")
        .select("id, user_id, chain")
        .eq("address", toAddress)
        .eq("chain", "ethereum")
        .maybeSingle();

      if (walletErr) {
        console.error("wallet lookup error:", walletErr);
        continue;
      }
      if (!wallet) continue;

      // idempotency
      const { data: existing, error: existErr } = await admin
        .from("crypto_deposits")
        .select("id")
        .eq("tx_hash", activity.hash)
        .eq("chain", "ethereum")
        .maybeSingle();

      if (existErr) {
        console.error("deposit check error:", existErr);
        continue;
      }
      if (existing) continue;

      const amountEth = Number(activity.value) / 1e18;

      const { error: insErr } = await admin.from("crypto_deposits").insert({
        user_id: wallet.user_id,
        wallet_id: wallet.id,
        asset_symbol: "ETH",
        chain: "ethereum",
        tx_hash: activity.hash,
        amount: amountEth,
        confirmations: activity.confirmations ?? 0,
        status: "pending",
        raw_tx: activity,
      });

      if (insErr) {
        console.error("deposit insert error:", insErr);
      }
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error("alchemy-webhook error:", err);
    return json(500, { ok: false, message: "Server error" });
  }
});
