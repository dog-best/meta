import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

// ✅ Rename these to your real Edge Function names
const FN_MARKET_PAY_NGN_INIT = "market-pay-ngn-init"; // locks NGN escrow (wallet/paystack) + sets order IN_ESCROW
const FN_MARKET_USDC_INTENT_CREATE = "market-usdc-intent-create"; // creates crypto intent for deposit + sets order IN_ESCROW (or leaves CREATED until deposit confirmed)

const LISTINGS_TABLE = "market_listings";
const SELLERS_TABLE = "market_seller_profiles";
const ORDERS_TABLE = "market_orders";
const WALLETS_TABLE = "app_wallets_simple";

type OrderRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

type ListingRow = {
  id: string;
  title: string | null;
  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;
  category: string | null;
  sub_category: string | null;
};

type SellerRow = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  is_verified: boolean | null;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency?.toUpperCase() === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function Pill({
  active,
  title,
  subtitle,
  icon,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.55)" : "rgba(255,255,255,0.10)",
        backgroundColor: active ? "rgba(124,58,237,0.16)" : "rgba(255,255,255,0.06)",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 18,
          backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: active ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.10)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color="#fff" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontWeight: "900" }}>{title}</Text>
        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{subtitle}</Text>
      </View>

      <Ionicons name={active ? "checkmark-circle" : "chevron-forward"} size={20} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
}

export default function CheckoutOrder() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const oid = useMemo(() => String(orderId || ""), [orderId]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [walletBal, setWalletBal] = useState<number>(0);

  const [method, setMethod] = useState<"NGN" | "USDC" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      router.replace("/(auth)/login" as any);
      return;
    }

    try {
      const { data: o, error: oErr } = await supabase
        .from(ORDERS_TABLE)
        .select("id,buyer_id,seller_id,listing_id,quantity,unit_price,amount,currency,status,created_at")
        .eq("id", oid)
        .maybeSingle();

      if (oErr) throw new Error(oErr.message);
      if (!o) throw new Error("Order not found");

      // (optional) ensure this user is the buyer
      if ((o as any).buyer_id !== user.id) {
        throw new Error("You are not allowed to checkout this order.");
      }

      const { data: l, error: lErr } = await supabase
        .from(LISTINGS_TABLE)
        .select("id,title,price_amount,currency,delivery_type,category,sub_category")
        .eq("id", (o as any).listing_id)
        .maybeSingle();
      if (lErr) throw new Error(lErr.message);

      const { data: s, error: sErr } = await supabase
        .from(SELLERS_TABLE)
        .select("user_id,market_username,display_name,business_name,is_verified")
        .eq("user_id", (o as any).seller_id)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const { data: w, error: wErr } = await supabase
        .from(WALLETS_TABLE)
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (wErr) {
        // ignore wallet error — not fatal for USDC
      }

      setOrder(o as any);
      setListing((l as any) ?? null);
      setSeller((s as any) ?? null);
      setWalletBal(Number((w as any)?.balance ?? 0));

      // default method
      setMethod(((o as any).currency || "").toUpperCase() === "USDC" ? "USDC" : "NGN");
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to load checkout");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid]);

  async function startNGN() {
    if (!order) return;
    setBusy(true);
    setErr(null);

    try {
      // ✅ Server should: validate buyer, compute fees, lock funds, set order IN_ESCROW, write market_escrow_ledger + market_wallet_events
      const { data, error } = await supabase.functions.invoke(FN_MARKET_PAY_NGN_INIT, {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "NGN init failed");

      router.replace(`/market/order/${order.id}` as any);
    } catch (e: any) {
      setErr(e?.message || "NGN payment init failed");
    } finally {
      setBusy(false);
    }
  }

  async function startUSDC() {
    if (!order) return;
    setBusy(true);
    setErr(null);

    try {
      // ✅ Server should: create market_crypto_intents row (DEPOSIT), set expected chain/token, and return intent info
      const { data, error } = await supabase.functions.invoke(FN_MARKET_USDC_INTENT_CREATE, {
        body: { order_id: order.id, chain: "base" }, // base for MVP
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "USDC intent failed");

      // After intent created, user goes to order page where deposit step is shown
      router.replace(`/market/order/${order.id}` as any);
    } catch (e: any) {
      setErr(e?.message || "USDC intent failed");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !order || !method;

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
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
              Choose NGN or USDC • Escrow protected
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : !order ? (
          <View
            style={{
              marginTop: 18,
              borderRadius: 22,
              padding: 16,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Order not found</Text>
            {!!err && <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>}
          </View>
        ) : (
          <>
            {/* Summary */}
            <View
              style={{
                marginTop: 6,
                borderRadius: 22,
                padding: 16,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Order summary</Text>

              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Item</Text>
                <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
                  {listing?.title ?? "Listing"}
                </Text>
              </View>

              <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Seller</Text>
                  <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
                    {seller?.business_name || seller?.display_name || "Seller"}
                    {seller?.is_verified ? " ✅" : ""}
                  </Text>
                  <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    @{seller?.market_username || "seller"}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Total</Text>
                  <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900", fontSize: 18 }}>
                    {money(order.currency, order.amount)}
                  </Text>
                  <Text style={{ marginTop: 2, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    Qty: {order.quantity}
                  </Text>
                </View>
              </View>
            </View>

            {/* Payment method */}
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Pay with</Text>
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                You choose. Escrow holds funds until delivery OTP is verified and you release.
              </Text>
            </View>

            <View style={{ marginTop: 10, gap: 10 }}>
              <Pill
                active={method === "NGN"}
                title="NGN Wallet / Paystack"
                subtitle={`Balance: ₦${Number(walletBal ?? 0).toLocaleString()} • Fast checkout`}
                icon="wallet-outline"
                onPress={() => setMethod("NGN")}
              />

              <Pill
                active={method === "USDC"}
                title="USDC (Base)"
                subtitle="Smart wallet • Paymaster gas • Escrow contract"
                icon="logo-usd"
                onPress={() => setMethod("USDC")}
              />
            </View>

            {!!err ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
              </View>
            ) : null}

            {/* CTA */}
            <Pressable
              disabled={disabled}
              onPress={() => (method === "NGN" ? startNGN() : startUSDC())}
              style={{
                marginTop: 16,
                borderRadius: 22,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor: disabled ? "rgba(124,58,237,0.35)" : PURPLE,
                borderWidth: 1,
                borderColor: disabled ? "rgba(124,58,237,0.35)" : PURPLE,
              }}
            >
              {busy ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Starting…</Text>
                </View>
              ) : (
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                  {method === "NGN" ? "Pay with NGN" : "Continue with USDC"}
                </Text>
              )}
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                Next: order status + OTP + release
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace(`/market/order/${order.id}` as any)}
              style={{
                marginTop: 10,
                borderRadius: 22,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>View order</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
