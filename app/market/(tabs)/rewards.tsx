import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";

const BG0 = "#05040B";
const BG1 = "#0A0620";

export default function RewardsTab() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <AppHeader title="Rewards" subtitle="Earn more as you sell" />
      <View style={{ marginTop: 40, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Coming soon</Text>
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
          Reward tiers, bonuses, and streaks will show here.
        </Text>
      </View>
    </LinearGradient>
  );
}
