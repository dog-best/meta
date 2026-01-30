import { Stack } from "expo-router";
import React from "react";

export default function MarketLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="dm/[username]" />
    </Stack>
  );
}
