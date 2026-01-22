import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "../../supabase/client";

type Profile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  has_completed_onboarding?: boolean | null;
  public_uid?: string | null;
};

/**
 * Loads auth session + profile.
 *
 * IMPORTANT:
 * - profiles are keyed by `id` (same as auth.users.id)
 * - do NOT query profiles by `user_id`
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async (u: User | null) => {
      if (!u) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .maybeSingle<Profile>();

      if (error) {
        console.error("[auth] profile fetch error:", error.message);
      }

      if (!mounted) return;
      setProfile(data ?? null);
    };

    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const u = data.session?.user ?? null;
        setUser(u);
        await fetchProfile(u);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        const u = session?.user ?? null;
        setUser(u);
        await fetchProfile(u);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    profile,
    loading,
    onboarded: !!profile?.has_completed_onboarding,
  };
}
