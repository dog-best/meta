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
  counterpartyName?: string;
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

      const baseTx = (t.data ?? []).map((x: any) => ({
        ...x,
        amount: Number(x.amount),
      })) as WalletTx[];

      const refs = Array.from(
        new Set(
          baseTx
            .filter((x) => (x.type === "transfer_in" || x.type === "transfer_out") && x.reference)
            .map((x) => x.reference as string),
        ),
      );

      const refToCounterparty = new Map<string, string>();
      for (const txItem of baseTx) {
        const meta = txItem.meta || {};
        const fromId = typeof meta.from_user_id === "string" ? meta.from_user_id : "";
        const toId = typeof meta.to_user_id === "string" ? meta.to_user_id : "";
        const cp = fromId && fromId !== userId ? fromId : toId && toId !== userId ? toId : "";
        if (cp && txItem.reference) refToCounterparty.set(txItem.reference, cp);
      }

      if (refs.length) {
        const { data: peerRows } = await supabase
          .from("app_wallet_tx_simple")
          .select("reference,user_id,type")
          .in("reference", refs)
          .neq("user_id", userId)
          .in("type", ["transfer_in", "transfer_out"]);

        for (const row of peerRows ?? []) {
          const ref = typeof (row as any).reference === "string" ? (row as any).reference : "";
          const uid = typeof (row as any).user_id === "string" ? (row as any).user_id : "";
          if (ref && uid && !refToCounterparty.has(ref)) refToCounterparty.set(ref, uid);
        }
      }

      const ids = Array.from(new Set(Array.from(refToCounterparty.values())));
      const profileMap = new Map<string, any>();
      const sellerMap = new Map<string, any>();

      if (ids.length) {
        const [profilesRes, sellersRes] = await Promise.all([
          supabase.from("profiles").select("id,full_name,username").in("id", ids),
          supabase.from("market_seller_profiles").select("user_id,display_name,business_name").in("user_id", ids),
        ]);
        for (const p of profilesRes.data ?? []) profileMap.set((p as any).id, p);
        for (const s of sellersRes.data ?? []) sellerMap.set((s as any).user_id, s);
      }

      setTx(
        baseTx.map((txItem) => {
          if (!(txItem.type === "transfer_in" || txItem.type === "transfer_out") || !txItem.reference) return txItem;
          const cp = refToCounterparty.get(txItem.reference);
          if (!cp) return txItem;
          const p = profileMap.get(cp);
          const s = sellerMap.get(cp);
          const name =
            p?.full_name ||
            p?.username ||
            s?.display_name ||
            s?.business_name ||
            "Counterparty";
          return { ...txItem, counterpartyName: name };
        }),
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
