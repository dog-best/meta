import { supabase } from "@/supabase/client";
import { useCallback, useEffect, useState } from "react";

export type VirtualAccount = {
  account_number: string;
  bank_name: string;
  account_name: string;
  currency: string;
  active: boolean;
};

export function useVirtualAccount() {
  const [account, setAccount] = useState<VirtualAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      // Force include auth header (removes any ambiguity)
      const session = (await supabase.auth.getSession()).data.session;

      const { data, error } = await supabase.functions.invoke("paystack-dva", {
        body: {},
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (error) {
        // supabase-js Functions errors often include useful context
        const status = (error as any)?.context?.status;
        const body = (error as any)?.context?.body;

        console.error("Edge function error:", { error, status, body });

        throw new Error(
          body?.message ||
            body?.error ||
            `${error.message}${status ? ` (HTTP ${status})` : ""}`
        );
      }

      if (!data?.success) throw new Error(data?.message ?? "Failed to load account");
      setAccount(data.account);
    } catch (e: any) {
      setAccount(null);
      setErrorText(e?.message ?? "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { account, loading, error: errorText, refetch: load };
}
