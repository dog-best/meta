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

    console.log("[useWalletSimple] load start");
    setLoading(true);
    setError(null);

    try {
      // balance (wallet row might not exist yet; treat as 0)
      const w = await supabase
        .from("app_wallets_simple")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (w.error) throw new Error(w.error.message);

      setBalance(Number(w.data?.balance ?? 0));

      const t = await supabase
        .from("app_wallet_tx_simple")
        .select("id,type,amount,reference,meta,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);

      if (t.error) throw new Error(t.error.message);

      setTx(
        (t.data ?? []).map((x: any) => ({
          ...x,
          amount: Number(x.amount),
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load wallet");
    } finally {
      setLoading(false);
      console.log("[useWalletSimple] load end");
    }
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
