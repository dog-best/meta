import { useAuth } from "@/hooks/authentication/useAuth";
import { supabase } from "@/services/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

export type WalletTx = {
  id: string;
  type: "deposit" | "transfer_in" | "transfer_out" | "withdrawal" | "fee" | "bill";
  amount: number;
  reference: string | null;
  meta: any;
  created_at: string;
};

export function useWalletSimple() {
  const { user, loading: authLoading } = useAuth();

  const [balance, setBalance] = useState<number>(0);
  const [tx, setTx] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = useMemo(() => user?.id ?? null, [user]);

  const reload = useCallback(async () => {
    if (!userId) return; // wait for auth

    setLoading(true);
    setError(null);

    // balance (wallet row might not exist yet; treat as 0)
    const w = await supabase
      .from("app_wallets_simple")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

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
      .limit(40);

    if (t.error) {
      setError(t.error.message);
      setLoading(false);
      return;
    }

    setTx(
      (t.data ?? []).map((x: any) => ({
        ...x,
        amount: Number(x.amount),
      }))
    );

    setLoading(false);
  }, [userId]);

  // Load only when auth is ready
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      setError("Please sign in");
      return;
    }
    reload();
  }, [authLoading, userId, reload]);

  return { balance, tx, loading, error, reload, userId };
}
