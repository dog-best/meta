import React from "react";
import { Platform, Text, View, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import * as Linking from "expo-linking";

const WatermarkIcon = require("../../assets/images/icon.png");

export function WatermarkedWeb({ url }: { url: string }) {
  if (Platform.OS === "web") {
    return (
      <View style={{ padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
        <Text style={{ color: "#fff", fontWeight: "900" }}>Website preview</Text>
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{url}</Text>
        <Pressable
          onPress={() => window.open(url, "_blank")}
          style={{ marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(124,58,237,0.85)" }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Open preview</Text>
        </Pressable>
        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          Watermark is best-effort on web (screenshots can’t be fully blocked).
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height: 420, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
      <WebView source={{ uri: url }} />
      <View pointerEvents="none" style={{ position: "absolute", top: 14, right: 14, alignItems: "center" }}>
        <View style={{ padding: 10, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center" }}>
          <View style={{ width: 44, height: 44, opacity: 0.35 }}>
            <View style={{ flex: 1 }}>
              {/* icon */}
              <View style={{ flex: 1 }}>
                {/* use Image for icon */}
              </View>
            </View>
          </View>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 12 }}>
            BestCity Preview
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => Linking.openURL(url)}
        style={{ position: "absolute", left: 14, bottom: 14, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "rgba(124,58,237,0.90)" }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Open in browser</Text>
      </Pressable>
    </View>
  );
}
