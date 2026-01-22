import { useEffect, useState } from "react";
import { supabase } from "@/supabase/client";



export function useRealtimeTotalBalance() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: any;

    const start = async () => {
      // ✅ wait for session (layout already signed in)
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        console.warn("No user session yet");
        setLoading(false);
        return;
      }

      console.log("User ID:", user.id);

      // ✅ initial fetch
      const { data, error } = await supabase
        .from("user_profiles")
        .select("total_balance")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Balance fetch error:", error);
      } else {
        console.log("Initial balance:", data.total_balance);
        setBalance(data.total_balance);
      }

      setLoading(false);

      // ✅ realtime
      channel = supabase
        .channel(`balance-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "user_profiles",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log("Realtime balance update:", payload.new.total_balance);
            setBalance(payload.new.total_balance);
          }
        )
        .subscribe();
    };

    start();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { balance, loading };
}
