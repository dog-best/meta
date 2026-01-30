import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

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

      {/* label under the big button */}
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: "rgba(255,255,255,0.08)",
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: "rgba(255,255,255,0.6)",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "800" as any },
      }}
    >
      {/* Market */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Market",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" color={color} size={size} />
          ),
        }}
      />

      {/* Sell */}
      <Tabs.Screen
        name="sell"
        options={{
          title: "Sell",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" color={color} size={size} />
          ),
        }}
      />


      {/* Orders */}
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" color={color} size={size} />
          ),
        }}
      />

      {/* BIG centered Category */}
      <Tabs.Screen
        name="category"
        options={{
          // We draw our own label inside the custom button
          title: "Category",
          tabBarLabel: () => null,
          tabBarButton: (props) => <CenterTabButton {...props} />,
        }}
      />


      {/* Messages */}
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}
      />



      {/* Rewards */}
      <Tabs.Screen
        name="rewards"
        options={{
          title: "Rewards",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="gift-outline" color={color} size={size} />
          ),
        }}
      />

      {/* Account */}
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
