import { Stack } from "expo-router";
import React from "react";

export default function MarketLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="menu/index" />
      <Stack.Screen name="social/index" />
      <Stack.Screen name="dm/[username]" />
      <Stack.Screen name="stock/index" />
      <Stack.Screen name="stock/[slug]" />
      <Stack.Screen name="stock/create" />
      <Stack.Screen name="stock/portfolio" />
      <Stack.Screen name="stocks/index" />
    </Stack>
  );
}
