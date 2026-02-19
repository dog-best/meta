import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useUnifiedWallet } from "@/components/market/wallet/useUnifiedWallet";

type UnifiedWalletData = ReturnType<typeof useUnifiedWallet>;

type Props = {
  wallet: UnifiedWalletData;
  compact?: boolean;
  onOpenNgnWallet?: () => void;
  onOpenCryptoWallet?: () => void;
};

function isAddress(value?: string | null) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function shortAddress(value?: string | null) {
  const v = String(value || "");
  if (!isAddress(v)) return "Not connected";
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

function chainLabel(v?: string | null) {
  return String(v || "").toUpperCase().replace(/_/g, " ");
}

export default function UnifiedWalletPanel({ wallet, compact = false, onOpenNgnWallet, onOpenCryptoWallet }: Props) {
  const portfolio = wallet.portfolioPositions.slice(0, compact ? 3 : 5);

  return (
    <View
      style={{
        borderRadius: 22,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 17 }}>Unified Wallet</Text>
          <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
            NGN, crypto, and stock portfolio in one place.
          </Text>
        </View>
        <Pressable
          onPress={wallet.refreshAll}
          disabled={wallet.busy}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            backgroundColor: "rgba(255,255,255,0.06)",
            opacity: wallet.busy ? 0.6 : 1,
          }}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
        </Pressable>
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          padding: 12,
          backgroundColor: "rgba(124,58,237,0.16)",
          borderWidth: 1,
          borderColor: "rgba(167,139,250,0.35)",
        }}
      >
        <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11 }}>TOTAL PORTFOLIO (USD APPROX)</Text>
        <Text style={{ marginTop: 5, color: "#fff", fontWeight: "900", fontSize: 22 }}>
          ${wallet.overallUsdApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </Text>
        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.66)", fontSize: 11 }}>
          Stable ${wallet.stableTotalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} + Stock ${wallet.portfolioTotalUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </Text>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" }}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: "800" }}>NGN</Text>
          <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
            NGN {wallet.ngnBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" }}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: "800" }}>USDC</Text>
          <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
            {wallet.usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          </Text>
        </View>
        <View style={{ flex: 1, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" }}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: "800" }}>USDT</Text>
          <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
            {wallet.usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          </Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 10,
          borderRadius: 14,
          padding: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          backgroundColor: "rgba(255,255,255,0.04)",
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontWeight: "700", fontSize: 11 }}>Saved wallet</Text>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{shortAddress(wallet.savedAddress)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: "rgba(255,255,255,0.62)", fontWeight: "700", fontSize: 11 }}>Connected session</Text>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{shortAddress(wallet.connectedAddress)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 11, marginBottom: 8 }}>
          Network
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {wallet.chains.map((c) => {
            const selected = wallet.chain?.chain === c.chain;
            return (
              <Pressable
                key={c.chain}
                onPress={() => wallet.selectChain(c)}
                disabled={!c.active}
                style={{
                  marginRight: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.12)",
                  backgroundColor: selected ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)",
                  opacity: c.active ? 1 : 0.5,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>{chainLabel(c.chain)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={wallet.connectWallet}
          disabled={wallet.busy || !wallet.chain?.active}
          style={{
            flex: 1,
            borderRadius: 14,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#7C3AED",
            borderWidth: 1,
            borderColor: "#7C3AED",
            opacity: wallet.busy || !wallet.chain?.active ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>{wallet.busy ? "Working..." : "Connect Wallet"}</Text>
        </Pressable>
        <Pressable
          onPress={wallet.useConnectedWallet}
          disabled={wallet.busy || !wallet.chain?.active || !isAddress(wallet.connectedAddress)}
          style={{
            flex: 1,
            borderRadius: 14,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            opacity: wallet.busy || !wallet.chain?.active || !isAddress(wallet.connectedAddress) ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>Use Connected</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={async () => {
            if (!isAddress(wallet.savedAddress)) return;
            await Clipboard.setStringAsync(wallet.savedAddress);
            Alert.alert("Copied", "Wallet address copied.");
          }}
          disabled={!isAddress(wallet.savedAddress)}
          style={{
            flex: 1,
            borderRadius: 12,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.1)",
            opacity: isAddress(wallet.savedAddress) ? 1 : 0.6,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Copy Address</Text>
        </Pressable>
        {wallet.isNigeria ? (
          <Pressable
            onPress={onOpenNgnWallet}
            style={{
              flex: 1,
              borderRadius: 12,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(45,212,191,0.18)",
              borderWidth: 1,
              borderColor: "rgba(45,212,191,0.4)",
            }}
          >
            <Text style={{ color: "#ECFEFF", fontWeight: "800", fontSize: 12 }}>Open NGN Wallet</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onOpenCryptoWallet}
            style={{
              flex: 1,
              borderRadius: 12,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Open Crypto Wallet</Text>
          </Pressable>
        )}
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: 14,
          padding: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          backgroundColor: "rgba(255,255,255,0.03)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>Stock Portfolio</Text>
        {portfolio.length === 0 ? (
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
            No stock holdings yet.
          </Text>
        ) : (
          <View style={{ marginTop: 8, gap: 7 }}>
            {portfolio.map((row) => (
              <View key={`${row.stock_id}-${row.slug}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.85)", fontWeight: "800", flex: 1 }}>
                  {row.name} ({row.symbol || "STK"}) - {row.qty.toFixed(4)}
                </Text>
                <Text style={{ color: "#fff", fontWeight: "900" }}>${row.value_usdc.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {!!wallet.error ? (
        <Text style={{ marginTop: 10, color: "#FCA5A5", fontWeight: "800", fontSize: 12 }}>{wallet.error}</Text>
      ) : null}
    </View>
  );
}
