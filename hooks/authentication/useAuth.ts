import { supabase } from "@/services/supabase";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

type Profile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
  public_uid?: string | null;
};

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async (u: User | null) => {
      if (!u) {
        if (mounted) setProfile(null);
        return;
      }

      try {
        const profileReq = supabase
          .from("profiles")
          .select("id,email,username,full_name,public_uid")
          .eq("id", u.id)
          .maybeSingle<Profile>();
        const { data, error } = await withTimeout<{
          data: Profile | null;
          error: { message?: string } | null;
        }>(profileReq as unknown as PromiseLike<{ data: Profile | null; error: { message?: string } | null }>, 10000, "profile fetch");
        if (error) console.error("[auth] profile fetch error:", error.message);
        if (!mounted) return;
        setProfile(data ?? null);
      } catch (e: any) {
        console.error("[auth] profile fetch timeout:", String(e?.message || e));
        if (!mounted) return;
        setProfile(null);
      }
    };

    (async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 10000, "auth session");
        if (!mounted) return;
        const u = data.session?.user ?? null;
        setUser(u);
        await fetchProfile(u);
      } catch (e: any) {
        console.error("[auth] getSession failed:", String(e?.message || e));
        if (!mounted) return;
        setUser(null);
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      void (async () => {
        await fetchProfile(u);
        if (mounted) setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    loading,
    onboarded: true, // you can re-add onboarding later
  };
}
