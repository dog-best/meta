// app/(bills)/_layout.tsx
import { isNigeriaCountry, resolveUserCountry, type UserCountry } from "@/utils/country";
import { Redirect, Stack } from "expo-router";
import React, { useEffect, useState } from "react";

export default function BillsLayout() {
  const [userCountry, setUserCountry] = useState<UserCountry | undefined>(undefined);
  const isNigeria = isNigeriaCountry(userCountry?.code || userCountry?.name);

  useEffect(() => {
    let mounted = true;
    const fallback = setTimeout(() => {
      if (mounted) setUserCountry(null);
    }, 4000);
    (async () => {
      try {
        const c = await resolveUserCountry({ prompt: true });
        if (mounted) setUserCountry(c);
      } catch {
        if (mounted) setUserCountry(null);
      }
      clearTimeout(fallback);
    })();
    return () => {
      mounted = false;
      clearTimeout(fallback);
    };
  }, []);

  if (userCountry === undefined) return null;
  if (!isNigeria) return <Redirect href="/fintech/(tabs)/wallet?action=crypto" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="electricity" />
      <Stack.Screen name="airtime" />
      <Stack.Screen name="data" />
      <Stack.Screen name="betting" />
    </Stack>
  );
}
