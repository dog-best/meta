import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import WatermarkOverlay from "./WatermarkOverlay";

type Props = {
  url: string;
  locked?: boolean;
  watermarkLabel?: string;
};

export default function PreviewWebsite({
  url,
  locked = true,
  watermarkLabel = "BestCity Preview",
}: Props) {
  if (locked) {
    return (
      <View style={styles.card}>
        <WatermarkOverlay label={watermarkLabel} opacity={0.10} />
        <Text style={styles.title}>Website Preview</Text>
        <Text style={styles.sub}>Locked until escrow is released.</Text>
      </View>
    );
  }

  return (
    <View style={styles.cardWeb}>
      <View style={styles.content}>
        <Text style={styles.title}>Website Preview</Text>
        <Text style={styles.sub}>Open preview in a new browser tab.</Text>
        <Pressable
          onPress={() => window.open(url, "_blank", "noopener,noreferrer")}
          style={styles.openBtn}
        >
          <Text style={styles.openBtnText}>Open Website</Text>
        </Pressable>
        <Text style={styles.hint}>Watermark on web is best-effort only.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    minHeight: 140,
  },
  cardWeb: {
    marginTop: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.20)",
    minHeight: 220,
  },
  content: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  title: { color: "#fff", fontWeight: "900", fontSize: 14 },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "700", textAlign: "center" },
  openBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: "rgba(124,58,237,0.9)",
  },
  openBtnText: { color: "#fff", fontWeight: "900" },
  hint: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 },
});
