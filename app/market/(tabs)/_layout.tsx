import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";

const BG = "#05040B";
const PURPLE = "#7C3AED";

function CenterTabButton({
  accessibilityState,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
}: any) {
  const focused = !!accessibilityState?.selected;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      hitSlop={10}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          marginTop: -18,
          backgroundColor: focused ? PURPLE : "rgba(124,58,237,0.85)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.16)",
        }}
      >
        <Ionicons name="grid-outline" size={28} color="#fff" />
      </View>

      <Text
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: "900",
          color: focused ? PURPLE : "rgba(255,255,255,0.65)",
        }}
      >
        Category
      </Text>
    </Pressable>
  );
}

export default function MarketTabsLayout() {
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 980;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarPosition: isWebDesktop ? "top" : "bottom",
        tabBarStyle: isWebDesktop
          ? {
              backgroundColor: "rgba(9,9,17,0.96)",
              borderBottomColor: "rgba(255,255,255,0.09)",
              borderBottomWidth: 1,
              borderTopWidth: 0,
              height: 66,
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: 24,
            }
          : {
              backgroundColor: BG,
              borderTopColor: "rgba(255,255,255,0.08)",
              height: 64,
              paddingTop: 6,
              paddingBottom: 8,
            },
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: "rgba(255,255,255,0.6)",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800" as any },
        sceneStyle: isWebDesktop
          ? {
              width: "100%",
              maxWidth: 1400,
              alignSelf: "center",
            }
          : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Market",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="sell"
        options={{
          title: "Sell",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="category"
        options={{
          title: "Category",
          tabBarLabel: isWebDesktop ? "Category" : () => null,
          tabBarButton: isWebDesktop ? undefined : (props) => <CenterTabButton {...props} />,
          tabBarIcon: isWebDesktop
            ? ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />
            : undefined,
        }}
      />

      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          href: null,
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="rewards"
        options={{
          href: null,
          title: "Rewards",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="gift-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
