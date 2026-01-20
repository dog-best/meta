import { useAuth } from "@/hooks/authenication/useAuth";
import { supabase } from "@/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type WalletBalance = {
  account_id: string;
  balance: number;
  last_activity_at: string | null;
};

export function useWallet() {
  const { user } = useAuth();

  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("wallet_balances")
      .select("account_id, balance, last_activity_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Wallet fetch error:", error);
      setError("Failed to load wallet balance");
      setWallet(null);
      setLoading(false);
      return;
    }

    // If no row yet: wallet isn't initialized / view not returning -> treat as 0, not an error
    if (!data) {
      setWallet({ account_id: "", balance: 0, last_activity_at: null });
      setError(null);
      setLoading(false);
      return;
    }

    setWallet(data as WalletBalance);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Only subscribe when we have a real account_id
  const accountId = useMemo(() => wallet?.account_id || "", [wallet?.account_id]);

  useEffect(() => {
    if (!user || !accountId) return;

    const channel = supabase
      .channel("wallet-balance-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ledger_entries",
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          fetchWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, accountId, fetchWallet]);

  return {
    wallet,
    balance: wallet?.balance ?? 0,
    loading,
    error,
    refetch: fetchWallet,
  };
}
