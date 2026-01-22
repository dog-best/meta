import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase";

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
