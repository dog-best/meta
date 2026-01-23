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

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,username,full_name,public_uid")
        .eq("id", u.id)
        .maybeSingle<Profile>();

      if (error) console.error("[auth] profile fetch error:", error.message);
      if (!mounted) return;
      setProfile(data ?? null);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const u = data.session?.user ?? null;
      setUser(u);
      await fetchProfile(u);
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      await fetchProfile(u);
      setLoading(false);
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
