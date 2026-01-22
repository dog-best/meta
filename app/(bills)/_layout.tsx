// app/(bills)/_layout.tsx
import { Stack } from "expo-router";

export default function BillsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="electricity" />
      <Stack.Screen name="airtime" />
      <Stack.Screen name="data" />
      <Stack.Screen name="betting" />
    </Stack>
  );
}
