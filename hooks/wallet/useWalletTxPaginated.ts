import { useAuth } from "@/hooks/authentication/useAuth";
import { supabase } from "@/services/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

export type WalletTx = {
  id: string;
  type: string;
  amount: number;
  reference: string | null;
  meta: any;
  created_at: string;
  counterpartyName?: string;
};

const PAGE_SIZE = 25;

function asText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function displayName(
  profile: { full_name?: string | null; username?: string | null } | null,
  seller: { display_name?: string | null; business_name?: string | null } | null,
  fallback = "User",
) {
  return asText(profile?.full_name) || asText(profile?.username) || asText(seller?.display_name) || asText(seller?.business_name) || fallback;
}

export function useWalletTxPaginated() {
  const { user, loading: authLoading } = useAuth();
  const userId = useMemo(() => user?.id ?? null, [user]);

  const [items, setItems] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const enrichCounterpartyNames = useCallback(
    async (base: WalletTx[]) => {
      if (!userId || base.length === 0) return base;

      const refs = Array.from(
        new Set(
          base
            .filter((x) => (x.type === "transfer_in" || x.type === "transfer_out") && x.reference)
            .map((x) => x.reference as string),
        ),
      );

      const refToCounterparty = new Map<string, string>();

      for (const tx of base) {
        const meta = tx.meta || {};
        const fromId = asText(meta.from_user_id);
        const toId = asText(meta.to_user_id);
        const cp = fromId && fromId !== userId ? fromId : toId && toId !== userId ? toId : "";
        if (cp && tx.reference) refToCounterparty.set(tx.reference, cp);
      }

      if (refs.length) {
        const { data: peerRows } = await supabase
          .from("app_wallet_tx_simple")
          .select("reference,user_id,type")
          .in("reference", refs)
          .neq("user_id", userId)
          .in("type", ["transfer_in", "transfer_out"]);

        for (const row of peerRows ?? []) {
          const ref = asText((row as any).reference);
          const uid = asText((row as any).user_id);
          if (ref && uid && !refToCounterparty.has(ref)) refToCounterparty.set(ref, uid);
        }
      }

      const userIds = Array.from(new Set(Array.from(refToCounterparty.values())));
      if (userIds.length === 0) return base;

      const [profilesRes, sellersRes] = await Promise.all([
        supabase.from("profiles").select("id,full_name,username").in("id", userIds),
        supabase.from("market_seller_profiles").select("user_id,display_name,business_name").in("user_id", userIds),
      ]);

      const profileMap = new Map<string, { full_name?: string | null; username?: string | null }>();
      const sellerMap = new Map<string, { display_name?: string | null; business_name?: string | null }>();

      for (const p of profilesRes.data ?? []) profileMap.set((p as any).id, p as any);
      for (const s of sellersRes.data ?? []) sellerMap.set((s as any).user_id, s as any);

      return base.map((tx) => {
        if (!(tx.type === "transfer_in" || tx.type === "transfer_out") || !tx.reference) return tx;
        const cp = refToCounterparty.get(tx.reference);
        if (!cp) return tx;
        const name = displayName(profileMap.get(cp) ?? null, sellerMap.get(cp) ?? null, "Counterparty");
        return { ...tx, counterpartyName: name };
      });
    },
    [userId],
  );

  const loadPage = useCallback(
    async (pageIndex: number): Promise<WalletTx[]> => {
      if (!userId) return [];

      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await supabase
        .from("app_wallet_tx_simple")
        .select("id,type,amount,reference,meta,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (res.error) throw new Error(res.error.message);

      const base = (res.data ?? []).map((x: any) => ({
        ...x,
        amount: Number(x.amount),
      })) as WalletTx[];

      return enrichCounterpartyNames(base);
    },
    [userId, enrichCounterpartyNames],
  );

  const refresh = useCallback(async () => {
    if (authLoading) return;

    if (!userId) {
      setLoading(false);
      setError("Please sign in");
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    setPage(0);
    setHasMore(true);

    try {
      const first = await loadPage(0);
      setItems(first);
      setHasMore(first.length === PAGE_SIZE);
    } catch (e: any) {
      setError(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, userId, loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading || !userId) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const next = await loadPage(nextPage);
      setItems((prev) => [...prev, ...next]);
      setPage(nextPage);
      setHasMore(next.length === PAGE_SIZE);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, userId, page, loadPage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, loadingMore, error, refresh, loadMore, hasMore };
}
