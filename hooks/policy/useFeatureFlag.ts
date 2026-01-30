import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

export function useFeatureFlag(key: string) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadFlag = async () => {
      try {
        const { data, error } = await supabase
          .from("app_feature_flags")
          .select("enabled")
          .eq("key", key)
          .maybeSingle();

        if (!mounted) return;

        if (error || !data) {
          setEnabled(false); // 🔒 SAFE FALLBACK
        } else {
          setEnabled(!!data.enabled);
        }
      } catch (err) {
        if (mounted) {
          setEnabled(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadFlag();

    return () => {
      mounted = false;
    };
  }, [key]);

  return { enabled, loading };
}
