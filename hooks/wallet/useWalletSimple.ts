import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

export function useWalletSimple() {
  const [balance, setBalance] = useState<number>(0);
  const [tx, setTx] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Not logged in");
      return;
    }

    const w = await supabase
      .from("app_wallets_simple")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (w.error) {
      setLoading(false);
      setError(w.error.message);
      return;
    }

    setBalance(Number(w.data?.balance ?? 0));

    const t = await supabase
      .from("app_wallet_tx_simple")
      .select("id,type,amount,reference,meta,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (t.error) {
      setLoading(false);
      setError(t.error.message);
      return;
    }

    setTx(t.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { balance, tx, loading, error, reload: load };
}
