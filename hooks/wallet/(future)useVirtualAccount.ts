import { callFn } from "@/services/functions";
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
    console.log("[useVirtualAccount] load start");
    setLoading(true);
    setErrorText(null);

    try {
      const data = await callFn("paystack-dva", {});
      if (!data?.success) throw new Error(data?.message ?? "Failed to load account");
      setAccount(data.account);
    } catch (e: any) {
      setAccount(null);
      setErrorText(e?.message ?? "Failed to load account");
    } finally {
      setLoading(false);
      console.log("[useVirtualAccount] load end");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { account, loading, error: errorText, refetch: load };
}
