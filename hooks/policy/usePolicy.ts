import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

type Policy = {
  id: string;
  title: string;
  content: string;
  version: number;
  effective_from: string;
};

export function usePolicy(slug: string) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPolicy = async () => {
      console.log("[policy] fetching:", slug);
      setLoading(true);

      try {
        const { data, error } = await supabase
          .rpc("get_active_policy")
          .select("id,title,content,version,effective_from")
          .eq("slug", slug)
          .eq("is_active", true)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("[policy] error:", error.message);
          setPolicy(null);
        } else if (!data) {
          console.warn("[policy] no active policy found");
          setPolicy(null);
        } else {
          console.log("[policy] loaded version:", data.version);
          setPolicy(data);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("[policy] error:", e?.message ?? e);
          setPolicy(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPolicy();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { policy, loading };
}
