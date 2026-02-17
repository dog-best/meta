import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

function normalizeUrl(input: string) {
  const s = input.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

export function WatermarkedBrowser({
  initialUrl,
  allowGoogleSearch = true,
  lockToInitialHost: _lockToInitialHost = true,
  title = "Website preview",
}: {
  initialUrl: string;
  allowGoogleSearch?: boolean;
  lockToInitialHost?: boolean;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const initial = useMemo(() => normalizeUrl(initialUrl), [initialUrl]);

  function openUrl(value: string) {
    const next = normalizeUrl(value);
    if (!next) return;
    window.open(next, "_blank", "noopener,noreferrer");
  }

  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
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
          Browser preview opens in a new tab on web.
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
              placeholder="Search domain or keywords..."
              placeholderTextColor="rgba(255,255,255,0.40)"
              style={{ flex: 1, color: "#fff", fontWeight: "800" }}
              returnKeyType="search"
              onSubmitEditing={() => openUrl(q)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => openUrl(q)}
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

        <Pressable
          onPress={() => openUrl(initial)}
          style={{
            marginTop: 10,
            borderRadius: 14,
            paddingVertical: 11,
            alignItems: "center",
            backgroundColor: "rgba(124,58,237,0.90)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Open Initial Website</Text>
        </Pressable>
      </View>

      <View
        style={{
          height: 220,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.03)",
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900", textAlign: "center" }}>
          BestCity Preview
        </Text>
        <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          Embedded WebView is native-only. On web, preview is opened in a browser tab.
        </Text>
      </View>
    </View>
  );
}
