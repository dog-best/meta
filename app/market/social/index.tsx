import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import SocialFeed from "@/components/market/SocialFeed";

const BG0 = "#05040B";
const BG1 = "#0A0620";

export default function SocialFeedScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}>
      <AppHeader title="Social Feed" subtitle="Followers-only business updates" />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <SocialFeed />
      </ScrollView>
    </LinearGradient>
  );
}
