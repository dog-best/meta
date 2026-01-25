import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

// ✅ Rename these to your real Edge Function names
const FN_MARKET_MARK_OUT_FOR_DELIVERY = "market-order-out-for-delivery"; // seller only
const FN_MARKET_REQUEST_OTP = "market-order-request-otp"; // system -> creates market_order_otps + sends otp to buyer
const FN_MARKET_VERIFY_OTP = "market-order-verify-otp"; // seller verifies OTP on delivery
const FN_MARKET_RELEASE = "market-order-release"; // buyer releases escrow to seller (NGN or USDC)
const FN_MARKET_REFUND = "market-order-refund"; // buyer/admin refund (rules)

// Tables
const ORDERS_TABLE = "market_orders";
const LISTINGS_TABLE = "market_listings";
const SELLERS_TABLE = "market_seller_profiles";
const OTP_TABLE = "market_order_otps";
const CRYPTO_INTENTS_TABLE = "market_crypto_intents";

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

  in_escrow_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  cancelled_at: string | null;
};

type ListingRow = {
  id: string;
  title: string | null;
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

type OtpRow = {
  order_id: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
};

type CryptoIntent = {
  id: string;
  intent_type: string; // DEPOSIT / RELEASE / REFUND depending on your enum
  status: string; // CREATED / SENT / CONFIRMED etc
  chain: string;
  tx_hash: string | null;
  created_at: string;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency?.toUpperCase() === "USDC") return `$${n.toLocaleString()}`;
  return `₦${n.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    CREATED: { bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB", label: "Created" },
    IN_ESCROW: { bg: "rgba(124,58,237,0.18)", fg: "#C4B5FD", label: "In Escrow" },
    OUT_FOR_DELIVERY: { bg: "rgba(59,130,246,0.14)", fg: "#93C5FD", label: "Out for delivery" },
    DELIVERED: { bg: "rgba(16,185,129,0.14)", fg: "#6EE7B7", label: "Delivered" },
    RELEASED: { bg: "rgba(16,185,129,0.14)", fg: "#34D399", label: "Released" },
    REFUNDED: { bg: "rgba(239,68,68,0.14)", fg: "#FCA5A5", label: "Refunded" },
    CANCELLED: { bg: "rgba(239,68,68,0.14)", fg: "#FCA5A5", label: "Cancelled" },
  };

  const s = map[status] ?? { bg: "rgba(255,255,255,0.08)", fg: "#E5E7EB", label: status };

  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: s.bg, borderWidth: 1, borderColor: `${s.fg}55` }}>
      <Text style={{ color: s.fg, fontWeight: "900", fontSize: 12 }}>{s.label}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
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
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{title}</Text>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

export default function OrderDetails() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const oid = useMemo(() => String(orderId || ""), [orderId]);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [seller, setSeller] = useState<SellerRow | null>(null);

  const [otp, setOtp] = useState<OtpRow | null>(null);
  const [intents, setIntents] = useState<CryptoIntent[]>([]);

  const [otpInput, setOtpInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isBuyer = useMemo(() => !!me && !!order && order.buyer_id === me, [me, order]);
  const isSeller = useMemo(() => !!me && !!order && order.seller_id === me, [me, order]);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      router.replace("/(auth)/login" as any);
      return;
    }
    setMe(user.id);

    try {
      const { data: o, error: oErr } = await supabase
        .from(ORDERS_TABLE)
        .select(
          "id,buyer_id,seller_id,listing_id,quantity,unit_price,amount,currency,status,created_at,in_escrow_at,out_for_delivery_at,delivered_at,released_at,refunded_at,cancelled_at"
        )
        .eq("id", oid)
        .maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) throw new Error("Order not found");

      // only buyer or seller can see (for MVP)
      if ((o as any).buyer_id !== user.id && (o as any).seller_id !== user.id) {
        throw new Error("You are not allowed to view this order.");
      }

      const { data: l, error: lErr } = await supabase
        .from(LISTINGS_TABLE)
        .select("id,title,delivery_type,category,sub_category")
        .eq("id", (o as any).listing_id)
        .maybeSingle();
      if (lErr) throw new Error(lErr.message);

      const { data: s, error: sErr } = await supabase
        .from(SELLERS_TABLE)
        .select("user_id,market_username,display_name,business_name,is_verified")
        .eq("user_id", (o as any).seller_id)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const { data: otpRow } = await supabase
        .from(OTP_TABLE)
        .select("order_id,expires_at,attempts,verified_at")
        .eq("order_id", oid)
        .maybeSingle();

      const { data: ints } = await supabase
        .from(CRYPTO_INTENTS_TABLE)
        .select("id,intent_type,status,chain,tx_hash,created_at")
        .eq("order_id", oid)
        .order("created_at", { ascending: false });

      setOrder(o as any);
      setListing((l as any) ?? null);
      setSeller((s as any) ?? null);
      setOtp((otpRow as any) ?? null);
      setIntents(((ints as any) ?? []) as any);

      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || "Failed to load order");
      setOrder(null);
      setListing(null);
      setSeller(null);
      setOtp(null);
      setIntents([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid]);

  async function doOutForDelivery() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      // seller only: sets status OUT_FOR_DELIVERY and timestamps
      const { data, error } = await supabase.functions.invoke(FN_MARKET_MARK_OUT_FOR_DELIVERY, {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "Failed");
      await load();

      // request OTP right after (system sends to buyer)
      const { data: otpData, error: otpErr } = await supabase.functions.invoke(FN_MARKET_REQUEST_OTP, {
        body: { order_id: order.id },
      });
      if (otpErr) throw new Error(otpErr.message);
      if (otpData?.success === false) throw new Error(otpData?.message || "OTP request failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not mark out for delivery");
    } finally {
      setBusy(false);
    }
  }

  async function requestOTP() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke(FN_MARKET_REQUEST_OTP, {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "OTP request failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "OTP request failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOTP() {
    if (!order) return;
    const code = otpInput.trim();
    if (code.length < 4) {
      setErr("Enter the OTP");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // seller verifies OTP (server checks hash in market_order_otps, increments attempts, sets verified_at)
      const { data, error } = await supabase.functions.invoke(FN_MARKET_VERIFY_OTP, {
        body: { order_id: order.id, otp: code },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "OTP verification failed");
      setOtpInput("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "OTP verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function releaseFunds() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      // buyer releases escrow (server: checks OTP verified, status, then releases NGN/USDC)
      const { data, error } = await supabase.functions.invoke(FN_MARKET_RELEASE, {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "Release failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Release failed");
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke(FN_MARKET_REFUND, {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data?.message || "Refund failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  const canGoCheckout = !!order && order.status === "CREATED";
  const canOutForDelivery = !!order && isSeller && order.status === "IN_ESCROW";
  const canRequestOtp = !!order && order.status === "OUT_FOR_DELIVERY" && isBuyer;
  const canVerifyOtp = !!order && isSeller && order.status === "OUT_FOR_DELIVERY";
  const otpVerified = !!otp?.verified_at;

  // Buyer releases only after OTP verified
  const canRelease = !!order && isBuyer && otpVerified && (order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERED" || order.status === "IN_ESCROW");

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
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Order</Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              OTP delivery + escrow release
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading…</Text>
          </View>
        ) : !order ? (
          <View style={{ marginTop: 18, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Order not found</Text>
            {!!err && <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>}
          </View>
        ) : (
          <>
            {/* Top summary */}
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>Item</Text>
                  <Text style={{ marginTop: 4, color: "#fff", fontWeight: "900" }}>
                    {listing?.title ?? "Listing"}
                  </Text>

                  <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    {listing?.category ?? "—"} • {listing?.delivery_type ?? "—"} • {listing?.sub_category ?? "—"}
                  </Text>

                  <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    Seller: {seller?.business_name || seller?.display_name || "Seller"}
                    {seller?.is_verified ? " ✅" : ""} @{seller?.market_username || "seller"}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <StatusBadge status={order.status} />
                  <Text style={{ marginTop: 10, color: "#fff", fontWeight: "900", fontSize: 18 }}>
                    {money(order.currency, order.amount)}
                  </Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    Qty: {order.quantity}
                  </Text>
                </View>
              </View>
            </View>

            {/* Primary CTA for buyer if not paid */}
            {canGoCheckout ? (
              <Pressable
                onPress={() => router.push(`/market/checkout/${order.id}` as any)}
                style={{
                  marginTop: 12,
                  borderRadius: 22,
                  paddingVertical: 16,
                  alignItems: "center",
                  backgroundColor: PURPLE,
                  borderWidth: 1,
                  borderColor: PURPLE,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Continue to checkout</Text>
                <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                  Choose NGN or USDC
                </Text>
              </Pressable>
            ) : null}

            {!!err ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
              </View>
            ) : null}

            {/* Timeline */}
            <Card title="Progress">
              <Text style={{ color: "rgba(255,255,255,0.75)", lineHeight: 20 }}>
                1) Buyer pays → funds go to escrow{"\n"}
                2) Seller marks out-for-delivery{"\n"}
                3) OTP is sent to buyer{"\n"}
                4) Seller enters OTP after delivery{"\n"}
                5) Buyer releases funds to seller
              </Text>
            </Card>

            {/* Crypto intents display (if USDC used) */}
            <Card title="Crypto activity (USDC)">
              {intents.length === 0 ? (
                <Text style={{ color: "rgba(255,255,255,0.65)" }}>No crypto intents yet.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {intents.slice(0, 4).map((i) => (
                    <View
                      key={i.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        backgroundColor: "rgba(255,255,255,0.06)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>
                        {i.intent_type} • {String(i.chain).toUpperCase()}
                      </Text>
                      <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                        Status: {i.status}
                        {i.tx_hash ? ` • tx: ${i.tx_hash.slice(0, 10)}…` : ""}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* Seller actions */}
            {isSeller ? (
              <Card title="Seller actions">
                <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                  After escrow is confirmed, mark order as out for delivery. OTP will be sent to buyer.
                </Text>

                <Pressable
                  disabled={!canOutForDelivery || busy}
                  onPress={doOutForDelivery}
                  style={{
                    marginTop: 12,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: canOutForDelivery && !busy ? PURPLE : "rgba(124,58,237,0.35)",
                    borderWidth: 1,
                    borderColor: canOutForDelivery && !busy ? PURPLE : "rgba(124,58,237,0.35)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    {busy ? "Working…" : "Mark out for delivery"}
                  </Text>
                </Pressable>

                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Enter OTP (after delivery)</Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                    Buyer gives you OTP. Server verifies hash + attempts.
                  </Text>

                  <View
                    style={{
                      marginTop: 10,
                      borderRadius: 18,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons name="key-outline" size={18} color="rgba(255,255,255,0.75)" />
                    <TextInput
                      value={otpInput}
                      onChangeText={setOtpInput}
                      placeholder="Enter OTP"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      style={{ flex: 1, color: "#fff", fontWeight: "900" }}
                      keyboardType="number-pad"
                    />
                  </View>

                  <Pressable
                    disabled={!canVerifyOtp || busy}
                    onPress={verifyOTP}
                    style={{
                      marginTop: 10,
                      borderRadius: 18,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: canVerifyOtp && !busy ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: canVerifyOtp && !busy ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>
                      {otpVerified ? "OTP verified ✅" : busy ? "Verifying…" : "Verify OTP"}
                    </Text>
                  </Pressable>

                  {otp ? (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                      OTP status: {otp.verified_at ? "Verified" : "Pending"} • attempts: {otp.attempts}
                    </Text>
                  ) : (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                      OTP not created yet.
                    </Text>
                  )}
                </View>
              </Card>
            ) : null}

            {/* Buyer actions */}
            {isBuyer ? (
              <Card title="Buyer actions">
                <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                  When seller marks out-for-delivery, request OTP and share it only after delivery.
                </Text>

                <Pressable
                  disabled={!canRequestOtp || busy}
                  onPress={requestOTP}
                  style={{
                    marginTop: 12,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: canRequestOtp && !busy ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: canRequestOtp && !busy ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    {busy ? "Working…" : "Request delivery OTP"}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!canRelease || busy}
                  onPress={releaseFunds}
                  style={{
                    marginTop: 10,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: canRelease && !busy ? "rgba(16,185,129,0.25)" : "rgba(16,185,129,0.10)",
                    borderWidth: 1,
                    borderColor: canRelease && !busy ? "rgba(16,185,129,0.40)" : "rgba(16,185,129,0.18)",
                    opacity: canRelease ? 1 : 0.7,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    {busy ? "Releasing…" : "Release funds to seller"}
                  </Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                    Requires OTP verified
                  </Text>
                </Pressable>

                <Pressable
                  disabled={busy}
                  onPress={refund}
                  style={{
                    marginTop: 10,
                    borderRadius: 18,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: "rgba(239,68,68,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.25)",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>
                    {busy ? "Working…" : "Request refund"}
                  </Text>
                </Pressable>

                {otp ? (
                  <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                    OTP status: {otp.verified_at ? "Verified ✅" : "Pending"} • expires:{" "}
                    {new Date(otp.expires_at).toLocaleString()}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {/* Footer */}
            <Pressable
              onPress={load}
              disabled={busy}
              style={{
                marginTop: 14,
                borderRadius: 22,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Refresh</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
