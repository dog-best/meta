import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import UnifiedWalletSheet from "@/components/market/wallet/UnifiedWalletSheet";
import { useUnifiedWallet } from "@/components/market/wallet/useUnifiedWallet";

export default function UnifiedWalletLauncher() {
  const pathname = usePathname();
  const wallet = useUnifiedWallet();
  const [open, setOpen] = useState(false);

  const hidden = useMemo(() => {
    const p = String(pathname || "");
    if (!p.startsWith("/market")) return true;
    if (p.includes("/market/wallet")) return true;
    if (p.includes("/market/checkout/")) return true;
    return false;
  }, [pathname]);

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="box-none" style={{ alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 96 : 82 }}>
        <Pressable
          onPress={() => setOpen(true)}
          style={{
            minWidth: 146,
            height: 54,
            borderRadius: 20,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(12,10,25,0.92)",
            borderWidth: 1,
            borderColor: "rgba(124,58,237,0.45)",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(124,58,237,0.3)",
              }}
            >
              <Ionicons name="wallet-outline" size={17} color="#fff" />
            </View>
            <View>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Wallet</Text>
              <Text style={{ color: "rgba(255,255,255,0.72)", fontWeight: "700", fontSize: 10 }}>
                ${wallet.overallUsdApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-up" size={16} color="#fff" />
        </Pressable>
      </View>

      <UnifiedWalletSheet
        visible={open}
        onClose={() => setOpen(false)}
        wallet={wallet}
        onOpenNgnWallet={() => {
          setOpen(false);
          router.push("/fintech/(tabs)/wallet?action=fund" as any);
        }}
        onOpenCryptoWallet={() => {
          setOpen(false);
          router.push("/market/wallet" as any);
        }}
      />
    </View>
  );
}
