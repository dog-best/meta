import { useAuth } from "@/hooks/authentication/useAuth";
import { supabase } from "@/services/supabase";
import { useCallback, useEffect, useState } from "react";

export type WalletTx = {
  id: string;
  type: string;
  amount: number;
  reference: string | null;
  meta: any;
  created_at: string;
};

const PAGE_SIZE = 25;

export function useWalletTxPaginated() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

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

      return (res.data ?? []).map((x: any) => ({
        ...x,
        amount: Number(x.amount),
      }));
    },
    [userId]
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
      const first: WalletTx[] = await loadPage(0);
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
      const next: WalletTx[] = await loadPage(nextPage);
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
