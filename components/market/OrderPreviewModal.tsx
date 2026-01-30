import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { usePreventScreenCapture } from "@/hooks/usePreventScreenCapture";
import { WatermarkedBrowser } from "@/components/market/WatermarkedBrowser";

const BG0 = "#05040B";
const BG1 = "#0A0620";

const WatermarkIcon = require("../../assets/images/icon.png");

export type PreviewPayload =
  | { kind: "image"; title?: string | null; urlPromise: () => Promise<string | null> }
  | { kind: "audio"; title?: string | null; previewSeconds?: number | null; urlPromise: () => Promise<string | null> }
  | { kind: "link"; title?: string | null; url: string; lockToInitialHost?: boolean; allowGoogleSearch?: boolean };

export function OrderPreviewModal({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload: PreviewPayload | null;
}) {
  usePreventScreenCapture(open);

  const [busy, setBusy] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const title = useMemo(() => payload?.title ?? "Preview", [payload]);

  useEffect(() => {
    let alive = true;
    setErr(null);
    setResolvedUrl(null);

    (async () => {
      if (!open) return;
      if (!payload) return;

      if (payload.kind === "link") {
        setResolvedUrl(payload.url);
        return;
      }

      setBusy(true);
      try {
        const u = await payload.urlPromise();
        if (!alive) return;
        setResolvedUrl(u);
        if (!u) setErr("Could not load preview URL");
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Could not load preview");
      } finally {
        if (!alive) return;
        setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, payload]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingTop: 18, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable
            onPress={onClose}
            style={{
              borderRadius: 16,
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Close</Text>
          </Pressable>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>{title}</Text>
            <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              BestCity watermark • preview only
            </Text>
          </View>
        </View>

        {busy ? (
          <View style={{ marginTop: 30, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Loading…</Text>
          </View>
        ) : err ? (
          <View style={{ marginTop: 18, borderRadius: 18, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Preview failed</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>
          </View>
        ) : !payload ? null : payload.kind === "image" ? (
          resolvedUrl ? (
            <View style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
              <View style={{ height: 360, backgroundColor: "rgba(255,255,255,0.05)" }}>
                <Image source={{ uri: resolvedUrl }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                  <Image source={WatermarkIcon} style={{ width: 92, height: 92, opacity: 0.20 }} />
                  <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontWeight: "900" }}>BestCity Preview</Text>
                </View>
              </View>
              <View style={{ padding: 12, backgroundColor: "rgba(0,0,0,0.35)" }}>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 }}>
                  Preview Only • Release funds to unlock final delivery
                </Text>
              </View>
            </View>
          ) : null
        ) : payload.kind === "link" ? (
          resolvedUrl ? (
            <View style={{ marginTop: 12 }}>
              <WatermarkedBrowser
                initialUrl={resolvedUrl}
                allowGoogleSearch={payload.allowGoogleSearch ?? true}
                lockToInitialHost={payload.lockToInitialHost ?? false}
                title="Website preview (URL hidden)"
              />
              <View style={{ marginTop: 10, borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 18, fontSize: 12 }}>
                  Note: URL is hidden in-app, but full URL hiding cannot be guaranteed on the internet. This is best-effort protection.
                </Text>
              </View>
            </View>
          ) : null
        ) : payload.kind === "audio" ? (
          <AudioPreviewBlock uri={resolvedUrl} previewSeconds={payload.previewSeconds ?? 20} />
        ) : null}
      </LinearGradient>
    </Modal>
  );
}

function AudioPreviewBlock({ uri, previewSeconds }: { uri: string | null; previewSeconds: number }) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await import("expo-av");
        if (!alive) return;
        setAvailable(true);
      } catch {
        if (!alive) return;
        setAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!uri) {
    return (
      <View style={{ marginTop: 18, alignItems: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Loading audio…</Text>
      </View>
    );
  }

  if (available === false) {
    return (
      <View style={{ marginTop: 18, borderRadius: 18, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
        <Text style={{ color: "#fff", fontWeight: "900" }}>Audio preview not installed</Text>
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
          Install expo-av to enable audio previews.
        </Text>
      </View>
    );
  }

  // We keep this simple in this modal. If you want full play/pause + timer,
  // we can swap this for a dedicated AudioPreview component.
  return (
    <View style={{ marginTop: 18, borderRadius: 18, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
      <Text style={{ color: "#fff", fontWeight: "900" }}>Audio preview</Text>
      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
        Audio preview is enabled, but play controls aren’t wired here yet. Tell me and I’ll add the full player (play/pause, stop at {previewSeconds}s).
      </Text>
    </View>
  );
}
