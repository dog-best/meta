import { bad, methodNotAllowed, ok, unauth } from "../_shared/market/http.ts";
import { supabaseAdminClient, supabaseUserClient } from "../_shared/market/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return methodNotAllowed();

  const supabase = supabaseUserClient(req);
  const admin = supabaseAdminClient();

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return unauth();

  const body = await req.json().catch(() => ({}));
  const chain = String(body?.chain ?? "base");
  const address = String(body?.address ?? "");

  if (!address || !address.startsWith("0x")) {
    return bad("address required");
  }

  const { data, error } = await admin
    .from("crypto_wallets")
    .upsert(
      {
        user_id: u.user.id,
        chain,
        address,
      },
      { onConflict: "user_id,chain" },
    )
    .select("user_id,chain,address")
    .single();

  if (error) return bad(error.message);
  return ok({ wallet: data });
});
