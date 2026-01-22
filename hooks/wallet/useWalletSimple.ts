import { supabase } from "@/services/supabase";
import { useCallback, useEffect, useState } from "react";

export type WalletTx = {
  id: string;
  type: "deposit" | "transfer_in" | "transfer_out" | "withdrawal" | "fee" | "bill";
  amount: number;
  reference: string | null;
  meta: any;
  created_at: string;
};

export function useWalletSimple() {
  const [balance, setBalance] = useState<number>(0);
  const [tx, setTx] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) {
      setError("Not signed in");
      setLoading(false);
      return;
    }

    const w = await supabase.from("app_wallets_simple").select("balance").eq("user_id", userId).maybeSingle();
    if (w.error) {
      setError(w.error.message);
      setLoading(false);
      return;
    }
    setBalance(Number(w.data?.balance ?? 0));

    const t = await supabase
      .from("app_wallet_tx_simple")
      .select("id,type,amount,reference,meta,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (t.error) {
      setError(t.error.message);
      setLoading(false);
      return;
    }

    setTx((t.data ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { balance, tx, loading, error, reload: load };
}
