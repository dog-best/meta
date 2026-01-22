import { supabase } from "@/services/supabase";
import { useEffect, useState } from "react";

export function useBanks() {
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await supabase.from("banks_ng").select("code,name").eq("active", true).order("name");
      setBanks(res.data ?? []);
      setLoading(false);
    })();
  }, []);

  return { banks, loading };
}

export function filterBanks(banks: { code: string; name: string }[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return banks.slice(0, 30);
  return banks.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 30);
}
