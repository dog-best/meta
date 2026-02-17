import React from "react";
import { Pressable, Text, View } from "react-native";

export function WatermarkedWeb({ url }: { url: string }) {
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900" }}>Website preview</Text>
      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{url}</Text>
      <Pressable
        onPress={() => window.open(url, "_blank", "noopener,noreferrer")}
        style={{
          marginTop: 12,
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: "center",
          backgroundColor: "rgba(124,58,237,0.85)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>Open preview</Text>
      </Pressable>
      <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
        Watermark is best-effort on web (screenshots cannot be fully blocked).
      </Text>
    </View>
  );
}
