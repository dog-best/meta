import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/followcome/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/followcome/use-color-scheme";

let BlurViewComp: any = null;
if (Platform.OS === "ios") {
  try {
    BlurViewComp = require("expo-blur").BlurView;
  } catch {
    BlurViewComp = null;
  }
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const tint = Colors[scheme ?? "dark"].tint;
  const insets = useSafeAreaInsets();

  const TABBAR_HEIGHT = 64;
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: "#6B7280",
        tabBarHideOnKeyboard: true,

        tabBarBackground: () => {
          if (Platform.OS === "ios" && BlurViewComp) {
            return <BlurViewComp intensity={70} tint="dark" style={StyleSheet.absoluteFill} />;
          }
          return <View style={[StyleSheet.absoluteFill, { backgroundColor: "#050814" }]} />;
        },

        tabBarStyle: [
          styles.tabBar,
          {
            height: TABBAR_HEIGHT + bottomPad,
            paddingBottom: bottomPad,
            backgroundColor: Platform.OS === "android" ? "#050814" : "transparent",
          },
        ],
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons
              name={focused ? "home-variant" : "home-variant-outline"}
              size={focused ? 28 : 24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "wallet" : "wallet-outline"}
              size={focused ? 28 : 24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={focused ? 28 : 24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 0,
    elevation: 0,
    left: 14,
    right: 14,
    bottom: 10,
    borderRadius: 20,
    overflow: "hidden",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
});
