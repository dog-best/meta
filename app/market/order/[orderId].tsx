import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";

import { OrderPreviewModal, PreviewPayload } from "@/components/market/OrderPreviewModal";
import { listOrderDeliverables, signedUrlForDeliverable, OrderDeliverable } from "@/services/market/orderDeliverables";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

// ✅ Real function names in your repo
const FN_SELLER_OUT_FOR_DELIVERY = "market-seller-out-for-delivery";
const FN_OTP_GENERATE = "market-otp-generate";
const FN_OTP_VERIFY = "market-otp-verify";
const FN_RELEASE_ESCROW = "market-release-escrow";
const FN_DISPUTE_OPEN = "market-dispute-open";
const FN_BUYER_CANCEL = "market-buyer-cancel-order";

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
  website_url?: string | null; // ✅ new
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
  intent_type: string;
  status: string;
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
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: `${s.fg}55`,
      }}
    >
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

  const [deliverables, setDeliverables] = useState<OrderDeliverable[]>([]);

  const [otpInput, setOtpInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload | null>(null);

  const isBuyer = useMemo(() => !!me && !!order && order.buyer_id === me, [me, order]);
  const isSeller = useMemo(() => !!me && !!order && order.seller_id === me, [me, order]);

  const otpVerified = !!otp?.verified_at;

  async function safeLoadListing(listingId: string) {
    // ✅ Try select with website_url; fallback if column not exists
    const attempt1 = await supabase
      .from(LISTINGS_TABLE)
      .select("id,title,delivery_type,category,sub_category,website_url")
      .eq("id", listingId)
      .maybeSingle();

    if (!attempt1.error) return attempt1.data as any;

    const msg = String(attempt1.error.message || "");
    if (msg.toLowerCase().includes("website_url") && msg.toLowerCase().includes("does not exist")) {
      const attempt2 = await supabase
        .from(LISTINGS_TABLE)
        .select("id,title,delivery_type,category,sub_category")
        .eq("id", listingId)
        .maybeSingle();

      if (attempt2.error) throw new Error(attempt2.error.message);
      return attempt2.data as any;
    }

    throw new Error(attempt1.error.message);
  }

  async function load() {
    console.log("[OrderDetails] load start", { oid });
    setLoading(true);
    setErr(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.replace("/(auth)/login" as any);
        return;
      }
      setMe(user.id);

      const { data: o, error: oErr } = await supabase
        .from(ORDERS_TABLE)
        .select(
          "id,buyer_id,seller_id,listing_id,quantity,unit_price,amount,currency,status,created_at,in_escrow_at,out_for_delivery_at,delivered_at,released_at,refunded_at,cancelled_at"
        )
        .eq("id", oid)
        .maybeSingle();

      if (oErr) throw new Error(oErr.message);
      if (!o) throw new Error("Order not found");

      if ((o as any).buyer_id !== user.id && (o as any).seller_id !== user.id) {
        throw new Error("You are not allowed to view this order.");
      }

      const l = await safeLoadListing((o as any).listing_id);

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

      // ✅ Deliverables (safe: won't break if table missing)
      try {
        const dels = await listOrderDeliverables(oid);
        setDeliverables(dels);
      } catch (e: any) {
        console.log("[OrderDetails] deliverables load skipped:", e?.message ?? e);
        setDeliverables([]);
      }

      setOrder(o as any);
      setListing((l as any) ?? null);
      setSeller((s as any) ?? null);
      setOtp((otpRow as any) ?? null);
      setIntents(((ints as any) ?? []) as any);
    } catch (e: any) {
      setErr(e?.message || "Failed to load order");
      setOrder(null);
      setListing(null);
      setSeller(null);
      setOtp(null);
      setIntents([]);
      setDeliverables([]);
    } finally {
      setLoading(false);
      console.log("[OrderDetails] load end");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oid]);

  // Buttons conditions
  const canGoCheckout = !!order && order.status === "CREATED" && isBuyer;
  const canCancel = !!order && order.status === "CREATED" && isBuyer;

  const canOutForDelivery = !!order && isSeller && order.status === "IN_ESCROW";
  const canRequestOtp = !!order && isBuyer && order.status === "OUT_FOR_DELIVERY";
  const canVerifyOtp = !!order && isSeller && order.status === "OUT_FOR_DELIVERY";

  // Buyer releases only after OTP verified + delivered
  const canRelease =
    !!order &&
    isBuyer &&
    otpVerified &&
    order.status === "DELIVERED";

  async function doOutForDelivery() {
    if (!order) return;
    console.log("[OrderDetails] outForDelivery start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_SELLER_OUT_FOR_DELIVERY, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not mark out for delivery");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] outForDelivery end");
    }
  }

  async function requestOTP() {
    if (!order) return;
    console.log("[OrderDetails] requestOTP start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_OTP_GENERATE, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "OTP request failed");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] requestOTP end");
    }
  }

  async function verifyOTP() {
    if (!order) return;
    const code = otpInput.trim();
    if (code.length < 4) return setErr("Enter the OTP");

    console.log("[OrderDetails] verifyOTP start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_OTP_VERIFY, { order_id: order.id, otp: code });

      setOtpInput("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "OTP verify failed");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] verifyOTP end");
    }
  }

  async function releaseFunds() {
    if (!order) return;
    console.log("[OrderDetails] releaseFunds start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_RELEASE_ESCROW, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Release failed");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] releaseFunds end");
    }
  }

  async function openDispute() {
    if (!order) return;
    console.log("[OrderDetails] openDispute start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_DISPUTE_OPEN, { order_id: order.id, reason: "Buyer requested refund / issue with delivery" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not open dispute");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] openDispute end");
    }
  }

  async function cancelOrder() {
    if (!order) return;
    console.log("[OrderDetails] cancelOrder start", { orderId: order.id });
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_BUYER_CANCEL, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
      console.log("[OrderDetails] cancelOrder end");
    }
  }

  async function openDeliverablePreview(d: OrderDeliverable) {
    // Buyer sees preview before release.
    setErr(null);

    if (d.kind === "link") {
      const url = d.link_url ?? listing?.website_url ?? "";
      if (!url) return setErr("No website link available for preview.");

      setPreviewPayload({
        kind: "link",
        title: d.title ?? "Website preview",
        url,
        // seller-controlled: lock to initial host reduces browsing around (best-effort)
        lockToInitialHost: true,
        // if you REALLY want Google search inside, set to true (but it reduces “hiding”)
        allowGoogleSearch: true,
      });

      setPreviewOpen(true);
      return;
    }

    setPreviewPayload({
      kind: d.kind as any,
      title: d.title ?? `${d.kind.toUpperCase()} preview`,
      previewSeconds: d.preview_seconds ?? 20,
      urlPromise: async () => {
        const u = await signedUrlForDeliverable(d, 600);
        return u;
      },
    } as any);

    setPreviewOpen(true);
  }

  const previewItemsForBuyer = useMemo(() => {
    // buyer can preview "preview" deliverables anytime (before release), and "final" only after release (RLS enforces too)
    return deliverables.filter((d) => d.access === "preview");
  }, [deliverables]);

  const canShowWebsiteFromListing = useMemo(() => {
    return !!listing?.website_url && String(listing?.delivery_type ?? "").toLowerCase() === "digital";
  }, [listing?.website_url, listing?.delivery_type]);

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
              Escrow + OTP delivery protection
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
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>Qty: {order.quantity}</Text>
                </View>
              </View>
            </View>

            {/* ✅ Buyer Preview Section */}
            {isBuyer ? (
              <Card title="Preview (before release)">
                <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                  Preview the seller’s work with BestCity watermark before you release funds.
                </Text>

                {/* Website preview from listing (digital services) */}
                {canShowWebsiteFromListing ? (
                  <Pressable
                    onPress={() => {
                      setPreviewPayload({
                        kind: "link",
                        title: "Website preview",
                        url: String(listing?.website_url ?? ""),
                        lockToInitialHost: true,
                        allowGoogleSearch: true,
                      });
                      setPreviewOpen(true);
                    }}
                    style={{
                      marginTop: 12,
                      borderRadius: 18,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: "rgba(124,58,237,0.20)",
                      borderWidth: 1,
                      borderColor: "rgba(124,58,237,0.35)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>Open website preview</Text>
                    <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                      Embedded browser • URL hidden in-app
                    </Text>
                  </Pressable>
                ) : null}

                {/* Deliverables (seller uploaded for this order) */}
                {previewItemsForBuyer.length === 0 ? (
                  <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.60)" }}>
                    No deliverables uploaded yet.
                  </Text>
                ) : (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {previewItemsForBuyer.map((d) => (
                      <Pressable
                        key={d.id}
                        onPress={() => openDeliverablePreview(d)}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          backgroundColor: "rgba(255,255,255,0.06)",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "900" }}>
                          {d.title ?? `${d.kind.toUpperCase()} preview`}
                        </Text>
                        <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                          Tap to open • Watermarked preview
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>
            ) : null}

            {/* Buyer checkout */}
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
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                  Continue to checkout
                </Text>
                <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
                  Choose NGN wallet or USDC
                </Text>
              </Pressable>
            ) : null}

            {canCancel ? (
              <Pressable
                disabled={busy}
                onPress={cancelOrder}
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
                  {busy ? "Working…" : "Cancel order"}
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
                3) OTP is generated for buyer{"\n"}
                4) Seller enters OTP after delivery{"\n"}
                5) Buyer releases funds to seller
              </Text>
            </Card>

            {/* Crypto intents */}
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
                  After escrow is confirmed, mark order as out for delivery. OTP will be generated for buyer.
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
                    Buyer shares OTP after receiving item. Server checks hash + limits attempts.
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
                      backgroundColor:
                        canVerifyOtp && !busy ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor:
                        canVerifyOtp && !busy ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)",
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
                  When seller is out-for-delivery, generate OTP and only share it after you receive your item.
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
                    {busy ? "Working…" : "Generate delivery OTP"}
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
                  onPress={openDispute}
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
                    {busy ? "Working…" : "Report issue / request refund"}
                  </Text>
                </Pressable>

                {otp ? (
                  <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                    OTP status: {otp.verified_at ? "Verified ✅" : "Pending"} • expires: {new Date(otp.expires_at).toLocaleString()}
                  </Text>
                ) : null}
              </Card>
            ) : null}

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

      {/* Preview modal */}
      <OrderPreviewModal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewPayload(null);
        }}
        payload={previewPayload}
      />
    </LinearGradient>
  );
}
