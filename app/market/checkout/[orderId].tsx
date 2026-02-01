import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import { DeliveryGeo, availabilityMayMatch, formatAvailabilitySummary, getCurrentLocationWithGeocode } from "@/utils/location";
import { payUsdcForOrder } from "@/services/market/usdcCheckout";
import { getPreferredMarketChain } from "@/services/market/chainConfig";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

// ✅ Real function names in your repo
const FN_MARKET_CHECKOUT_WALLET = "market-checkout-wallet"; // NGN wallet escrow lock

function Pill({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={!!disabled}
      onPress={onPress}
      style={{
        marginTop: 12,
        borderRadius: 22,
        padding: 16,
        backgroundColor: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 18,
            backgroundColor: "rgba(124,58,237,0.25)",
            borderWidth: 1,
            borderColor: "rgba(124,58,237,0.35)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={22} color="#fff" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{title}</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{subtitle}</Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.75)" />
      </View>
    </Pressable>
  );
}

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const oid = useMemo(() => String(orderId || ""), [orderId]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [listing, setListing] = useState<any>(null);
  const [deliveryGeo, setDeliveryGeo] = useState<DeliveryGeo | null>(null);
  const [savingGeo, setSavingGeo] = useState(false);
  const [chain, setChain] = useState<{ chain: string } | null>(null);

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) {
      router.replace("/(auth)/login" as any);
      return null;
    }
    return user;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!oid) return;
      setLoading(true);
      try {
        const { data: o, error: oErr } = await supabase
          .from("market_orders")
          .select("id,listing_id,delivery_address")
          .eq("id", oid)
          .maybeSingle();
        if (oErr) throw oErr;

        const listingId = (o as any)?.listing_id;
        let l: any = null;
        if (listingId) {
          const { data: lRow, error: lErr } = await supabase
            .from("market_listings")
            .select("id,title,delivery_type,availability")
            .eq("id", listingId)
            .maybeSingle();
          if (lErr) throw lErr;
          l = lRow;
        }

        if (mounted) {
          setOrder(o);
          setListing(l);
          const geo = (o as any)?.delivery_address?.geo ?? null;
          setDeliveryGeo(geo && Object.keys(geo).length ? geo : null);
        }
      } catch (e: any) {
        if (mounted) setErr(e?.message || "Failed to load order");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    (async () => {
      const c = await getPreferredMarketChain().catch(() => null);
      if (mounted) setChain(c);
    })();
    return () => {
      mounted = false;
    };
  }, [oid]);

  async function saveDeliveryGeo(geo: DeliveryGeo) {
    if (!oid) return;
    setSavingGeo(true);
    try {
      const next = { ...(order?.delivery_address ?? {}), geo };
      const { error } = await supabase
        .from("market_orders")
        .update({ delivery_address: next })
        .eq("id", oid);
      if (error) throw error;
      setOrder((prev: any) => ({ ...(prev ?? {}), delivery_address: next }));
      setDeliveryGeo(geo);
    } catch (e: any) {
      setErr(e?.message || "Failed to save location");
    } finally {
      setSavingGeo(false);
    }
  }

  async function useCurrentLocation() {
    setErr(null);
    setSavingGeo(true);
    try {
      const res = await getCurrentLocationWithGeocode();
      const geo: DeliveryGeo = {
        lat: res.coords.lat,
        lng: res.coords.lng,
        city: res.geo.city || "",
        region: res.geo.region || "",
        country: res.geo.country || "",
        countryCode: res.geo.countryCode || "",
        label: res.label,
      };
      await saveDeliveryGeo(geo);
    } catch (e: any) {
      setErr(e?.message || "Could not access location");
    } finally {
      setSavingGeo(false);
    }
  }

  async function payWithWallet() {
    setErr(null);
    if (!oid) return setErr("Missing orderId");
    const user = await requireAuth();
    if (!user) return;

    console.log("[Checkout] payWithWallet start", { orderId: oid });
    setBusy(true);
    try {
      const auth = await requireLocalAuth("Confirm wallet payment");
      if (!auth.ok) throw new Error(auth.message || "Authentication required");
      await callFn(FN_MARKET_CHECKOUT_WALLET, { order_id: oid });

      router.replace(`/market/order/${oid}` as any);
    } catch (e: any) {
      setErr(e?.message || "Wallet checkout failed");
    } finally {
      setBusy(false);
      console.log("[Checkout] payWithWallet end");
    }
  }

  async function payWithUsdc() {
    setErr(null);
    if (!oid) return setErr("Missing orderId");
    const user = await requireAuth();
    if (!user) return;

    console.log("[Checkout] payWithUsdc start", { orderId: oid });
    setBusy(true);
    try {
      await payUsdcForOrder(oid);

      // We route back to order screen where you can show deposit instructions/intents history
      router.replace(`/market/order/${oid}` as any);
    } catch (e: any) {
      setErr(e?.message || "USDC deposit intent failed");
    } finally {
      setBusy(false);
      console.log("[Checkout] payWithUsdc end");
    }
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <AppHeader title="Checkout" subtitle="Choose how you want to pay for this order" />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Checkout</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Choose how you want to pay for this order
            </Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 22,
            padding: 16,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Availability</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", lineHeight: 20 }}>
            {formatAvailabilitySummary(listing?.availability)}
          </Text>

          {deliveryGeo && !availabilityMayMatch(listing?.availability, deliveryGeo) ? (
            <View
              style={{
                marginTop: 10,
                borderRadius: 14,
                padding: 10,
                borderWidth: 1,
                borderColor: "rgba(251,191,36,0.55)",
                backgroundColor: "rgba(251,191,36,0.10)",
              }}
            >
              <Text style={{ color: "rgba(254,243,199,0.95)", fontWeight: "900", fontSize: 12 }}>
                Warning: your delivery location may be outside the seller’s availability. You can still continue.
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={useCurrentLocation}
            disabled={savingGeo}
            style={{
              marginTop: 12,
              borderRadius: 16,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              opacity: savingGeo ? 0.7 : 1,
            }}
          >
            {savingGeo ? <ActivityIndicator /> : <Ionicons name="locate-outline" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "900" }}>Use my current location</Text>
          </Pressable>

          {loading ? (
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Loading order detailsâ€¦</Text>
          ) : deliveryGeo ? (
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Delivery location: {deliveryGeo.label || "Saved"} • {deliveryGeo.lat.toFixed(5)}, {deliveryGeo.lng.toFixed(5)}
            </Text>
          ) : (
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
              No delivery location set yet.
            </Text>
          )}
        </View>

        <View
          style={{
            marginTop: 12,
            borderRadius: 22,
            padding: 16,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Payment options</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
            • **NGN Wallet**: uses your existing in-app wallet balance (top up via Paystack in Wallet tab).{"\n"}
            • **USDC**: uses your smart account and deposits USDC into escrow on-chain.
          </Text>
          {chain ? (
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Network: {String(chain.chain).toUpperCase().replace("_", " ")}
            </Text>
          ) : null}

          <Pill
            icon="wallet-outline"
            title="Pay with NGN wallet"
            subtitle="Instant escrow lock from your in-app balance"
            onPress={payWithWallet}
            disabled={busy}
          />

          <Pill
            icon="logo-bitcoin"
            title="Pay with USDC"
            subtitle="Approve + deposit into escrow using your smart account"
            onPress={payWithUsdc}
            disabled={busy}
          />

          {busy ? (
            <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator />
              <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Processing…</Text>
            </View>
          ) : null}

          {!!err ? (
            <Text style={{ marginTop: 12, color: "#FCA5A5", fontWeight: "800" }}>
              {err}
            </Text>
          ) : null}

          <Pressable
            onPress={() => router.replace(`/market/order/${oid}` as any)}
            style={{
              marginTop: 14,
              borderRadius: 20,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Back to order</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 14, alignItems: "center" }}>
          <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
            Order ID: {oid}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

