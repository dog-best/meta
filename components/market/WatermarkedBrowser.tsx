import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";

const WatermarkIcon = require("../../assets/images/icon.png");

function normalizeUrl(input: string) {
  const s = input.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  // domain-like -> https
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  // otherwise search terms
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

function hostOf(u: string) {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

export function WatermarkedBrowser({
  initialUrl,
  allowGoogleSearch = true,
  lockToInitialHost = false,
  title = "Website preview",
}: {
  initialUrl: string;
  allowGoogleSearch?: boolean;
  lockToInitialHost?: boolean; // if true: only allow initial host + google
  title?: string;
}) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  const initial = useMemo(() => normalizeUrl(initialUrl), [initialUrl]);
  const initialHost = useMemo(() => hostOf(initial), [initial]);

  const allowedHosts = useMemo(() => {
    const base = new Set<string>();
    if (initialHost) base.add(initialHost);
    base.add("google.com");
    base.add("www.google.com");
    return Array.from(base);
  }, [initialHost]);

  const injected = `
    (function() {
      try {
        const style = document.createElement('style');
        style.innerHTML = '*{ -webkit-user-select:none !important; user-select:none !important; -webkit-touch-callout:none !important; }';
        document.head.appendChild(style);
        document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);
        document.addEventListener('copy', function(e){ e.preventDefault(); }, true);
      } catch (e) {}
    })();
    true;
  `;

  function onSubmitSearch() {
    const next = normalizeUrl(q);
    if (!next) return;
    webRef.current?.stopLoading?.();
    webRef.current?.injectJavaScript?.(`window.location.href = ${JSON.stringify(next)}; true;`);
  }

  function shouldStart(req: any) {
    const url: string = req?.url ?? "";
    if (!url) return false;

    // block weird schemes
    if (!/^https?:\/\//i.test(url)) return false;

    if (!lockToInitialHost) return true;

    const h = hostOf(url);
    return allowedHosts.includes(h);
  }

  return (
    <View style={{ marginTop: 12, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
      {/* Top bar (NO URL displayed) */}
      <View
        style={{
          padding: 12,
          backgroundColor: "rgba(0,0,0,0.35)",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.10)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>{title}</Text>
        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
          Watermarked preview • URL hidden in-app • Best-effort protection
        </Text>

        {allowGoogleSearch ? (
          <View
            style={{
              marginTop: 10,
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.75)" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search domain or keywords…"
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{ flex: 1, color: "#fff", fontWeight: "800" }}
              returnKeyType="search"
              onSubmitEditing={onSubmitSearch}
              autoCapitalize="none"
            />
            <Pressable
              onPress={onSubmitSearch}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: "rgba(124,58,237,0.85)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Go</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Navigation controls */}
        <View style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => webRef.current?.goBack()}
            disabled={!canBack}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: canBack ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              opacity: canBack ? 1 : 0.6,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Back</Text>
          </Pressable>

          <Pressable
            onPress={() => webRef.current?.goForward()}
            disabled={!canForward}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: canForward ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              opacity: canForward ? 1 : 0.6,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Forward</Text>
          </Pressable>

          <Pressable
            onPress={() => webRef.current?.reload()}
            style={{
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 14,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Reload</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 440, backgroundColor: "rgba(255,255,255,0.03)" }}>
        <WebView
          ref={webRef}
          source={{ uri: initial }}
          injectedJavaScript={injected}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(st) => {
            setCanBack(!!st.canGoBack);
            setCanForward(!!st.canGoForward);
          }}
          setSupportMultipleWindows={false}
          incognito
          javaScriptEnabled
          domStorageEnabled
          onShouldStartLoadWithRequest={shouldStart}
          originWhitelist={["https://*", "http://*"]}
        />

        {loading ? (
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Loading preview…</Text>
          </View>
        ) : null}

        {/* Watermark overlay */}
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 90, height: 90, opacity: 0.18 }}>
              {/* Use RN Image without importing to keep file simple */}
            </View>
            {/* Use native Image */}
          </View>
        </View>

        {/* Corner watermark (visible even while scrolling) */}
        <View pointerEvents="none" style={{ position: "absolute", right: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 }}>BestCity • Preview</Text>
        </View>
      </View>
    </View>
  );
}
