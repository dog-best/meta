import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { callFn } from "@/services/functions";
import { supabase } from "@/services/supabase";

import { OrderPreviewModal, PreviewPayload } from "@/components/market/OrderPreviewModal";
import {
  listOrderDeliverables,
  signedUrlForDeliverable,
  OrderDeliverable,
  insertFileDeliverable,
  guessKindFromMime,
} from "@/services/market/orderDeliverables";

import { uploadToSupabaseStorage } from "@/services/market/storageUpload";


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
  website_url?: string | null;
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

async function safeLoadListing(listingId: string) {
  const attempt1 = await supabase
    .from(LISTINGS_TABLE)
    .select("id,title,delivery_type,category,sub_category,website_url")
    .eq("id", listingId)
    .maybeSingle();

  if (!attempt1.error) return attempt1.data as any;

  const msg = String(attempt1.error.message || "").toLowerCase();
  if (msg.includes("website_url") && msg.includes("does not exist")) {
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

  // Upload (seller)
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const isBuyer = useMemo(() => !!me && !!order && order.buyer_id === me, [me, order]);
  const isSeller = useMemo(() => !!me && !!order && order.seller_id === me, [me, order]);

  const otpVerified = !!otp?.verified_at;

  const previewItems = useMemo(() => deliverables.filter((d) => d.access === "preview"), [deliverables]);
  const finalItems = useMemo(() => deliverables.filter((d) => d.access === "final"), [deliverables]);

  const isDigital = useMemo(() => String(listing?.delivery_type ?? "").toLowerCase() === "digital", [listing?.delivery_type]);
  const hasWebsite = useMemo(() => !!listing?.website_url, [listing?.website_url]);

  // Buyer can download full-quality after OTP verified + delivered/released
  const canDownloadFinal =
    !!order &&
    isBuyer &&
    otpVerified &&
    (order.status === "DELIVERED" || order.status === "RELEASED");

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

      // deliverables (safe)
      try {
        const ds = await listOrderDeliverables(oid);
        setDeliverables(ds);
      } catch (e: any) {
        console.log("[OrderDetails] deliverables skipped:", e?.message ?? e);
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

  // Buttons conditions (your existing logic)
  const canGoCheckout = !!order && order.status === "CREATED" && isBuyer;
  const canCancel = !!order && order.status === "CREATED" && isBuyer;

  const canOutForDelivery = !!order && isSeller && order.status === "IN_ESCROW";
  const canRequestOtp = !!order && isBuyer && order.status === "OUT_FOR_DELIVERY";
  const canVerifyOtp = !!order && isSeller && order.status === "OUT_FOR_DELIVERY";

  // Buyer releases only after OTP verified + delivered
  const canRelease = !!order && isBuyer && otpVerified && order.status === "DELIVERED";

  async function doOutForDelivery() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_SELLER_OUT_FOR_DELIVERY, { order_id: order.id });
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
      await callFn(FN_OTP_GENERATE, { order_id: order.id });
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
    if (code.length < 4) return setErr("Enter the OTP");

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
    }
  }

  async function releaseFunds() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_RELEASE_ESCROW, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Release failed");
    } finally {
      setBusy(false);
    }
  }

  async function openDispute() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_DISPUTE_OPEN, { order_id: order.id, reason: "Buyer requested refund / issue with delivery" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not open dispute");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    setBusy(true);
    setErr(null);
    try {
      await callFn(FN_BUYER_CANCEL, { order_id: order.id });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  function openPreview(payload: PreviewPayload) {
    setPreviewPayload(payload);
    setPreviewOpen(true);
  }

  async function previewDeliverable(d: OrderDeliverable) {
    if (d.kind === "link") {
      const url = d.link_url ?? listing?.website_url ?? "";
      if (!url) return setErr("No website link available.");
      openPreview({ kind: "link", access: d.access, title: d.title ?? "Website preview", url });
      return;
    }

    openPreview({
      kind: d.kind as any,
      access: d.access,
      title: d.title ?? `${d.kind.toUpperCase()} ${d.access === "preview" ? "preview" : "full"}`,
      previewSeconds: d.preview_seconds ?? 20,
      mimeType: d.mime_type,
      urlPromise: async () => signedUrlForDeliverable(d, 900),
    });
  }

  async function downloadDeliverable(d: OrderDeliverable) {
    try {
      const url = await signedUrlForDeliverable(d, 900);
      if (!url) throw new Error("No download URL");
      await Linking.openURL(url);
    } catch (e: any) {
      setErr(e?.message || "Download failed");
    }
  }

  // Seller upload preview/final (safe + production)
async function pickAndUpload(access: "preview" | "final") {
  if (!order) return;

  // extra safety: only seller should upload
  if (!isSeller) {
    setUploadErr("Only the seller can upload deliverables for this order.");
    return;
  }

  setUploadBusy(true);
  setUploadErr(null);

  try {
    const DocumentPicker = await import("expo-document-picker");

    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: "*/*",
    });

    if (res.canceled) return;

    const asset = res.assets?.[0];
    if (!asset?.uri) throw new Error("No file selected");

    const name = asset.name ?? `file-${Date.now()}`;
    const mime = asset.mimeType ?? null;

    // keep your existing kind guessing logic
    const kind = guessKindFromMime(mime, name);

    const bucket = "market-deliverables";
    const safeName = name.replace(/[^\w.\-]+/g, "_");
    const path = `orders/${order.id}/${access}/${Date.now()}-${safeName}`;

    // ✅ Upload (no expo-file-system EncodingType / bytes here)
    const uploaded = await uploadToSupabaseStorage({
      bucket,
      path,
      localUri: asset.uri,
      contentType: mime ?? "application/octet-stream",
      upsert: false,
    });

    // ✅ Save DB row
    await insertFileDeliverable({
      orderId: order.id,
      access, // "preview" | "final" (matches your current UI & filters)
      kind,
      title: access === "preview" ? `Preview: ${name}` : `Full: ${name}`,
      sortOrder: access === "preview" ? previewItems.length : finalItems.length,
      bucket,
      storagePath: uploaded.storagePath,
      mimeType: mime,
      meta: {
        note: access === "preview" ? "Low quality / watermarked recommended" : "Full quality",
        originalName: name,
        size: asset.size ?? null,
      },
    });

    await load();
  } catch (e: any) {
    setUploadErr(e?.message || "Upload failed");
  } finally {
    setUploadBusy(false);
  }
}


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
          <View style={{ marginTop: 18, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Order not found</Text>
            {!!err && <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>}
          </View>
        ) : (
          <>
            {/* Summary */}
            <View style={{ marginTop: 6, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
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

            {/* Deliverables & Previews (works for digital + physical; message adapts) */}
            <Card title="Deliverables & previews">
              {isBuyer ? (
                <>
                  {!isDigital && previewItems.length === 0 && !hasWebsite ? (
                    <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                      This looks like a physical / non-digital delivery. No previews required. Track delivery using the timeline below.
                    </Text>
                  ) : (
                    <Text style={{ color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
                      Preview the work (low quality / watermarked). After OTP is verified and marked delivered, full-quality downloads unlock.
                    </Text>
                  )}

                  {hasWebsite ? (
                    <Pressable
                      onPress={() =>
                        openPreview({
                          kind: "link",
                          access: "preview",
                          title: "Website preview",
                          url: String(listing?.website_url ?? ""),
                        })
                      }
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
                        Embedded preview • Watermarked
                      </Text>
                    </Pressable>
                  ) : null}

                  {previewItems.length === 0 ? (
                    <Text style={{ marginTop: 12, color: "rgba(255,255,255,0.60)" }}>No preview files uploaded yet.</Text>
                  ) : (
                    <View style={{ marginTop: 12, gap: 10 }}>
                      {previewItems.map((d) => (
                        <Pressable
                          key={d.id}
                          onPress={() => previewDeliverable(d)}
                          style={{
                            padding: 12,
                            borderRadius: 16,
                            backgroundColor: "rgba(255,255,255,0.06)",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.10)",
                          }}
                        >
                          <Text style={{ color: "#fff", fontWeight: "900" }}>
                            {d.title ?? `${String(d.kind).toUpperCase()} preview`}
                          </Text>
                          <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                            Tap to open • Watermarked / low quality recommended
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {canDownloadFinal ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={{ color: "#fff", fontWeight: "900" }}>Full quality downloads</Text>
                      <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                        Unlocked (OTP verified + delivered). Download and then release funds when satisfied.
                      </Text>

                      {finalItems.length === 0 ? (
                        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.60)" }}>
                          Seller has not uploaded full-quality files yet.
                        </Text>
                      ) : (
                        <View style={{ marginTop: 10, gap: 10 }}>
                          {finalItems.map((d) => (
                            <View
                              key={d.id}
                              style={{
                                padding: 12,
                                borderRadius: 16,
                                backgroundColor: "rgba(255,255,255,0.06)",
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.10)",
                              }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "900" }}>
                                {d.title ?? `${String(d.kind).toUpperCase()} full`}
                              </Text>

                              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                                <Pressable
                                  onPress={() => previewDeliverable(d)}
                                  style={{
                                    flex: 1,
                                    borderRadius: 14,
                                    paddingVertical: 12,
                                    alignItems: "center",
                                    backgroundColor: "rgba(255,255,255,0.08)",
                                    borderWidth: 1,
                                    borderColor: "rgba(255,255,255,0.10)",
                                  }}
                                >
                                  <Text style={{ color: "#fff", fontWeight: "900" }}>View</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => downloadDeliverable(d)}
                                  style={{
                                    flex: 1,
                                    borderRadius: 14,
                                    paddingVertical: 12,
                                    alignItems: "center",
                                    backgroundColor: "rgba(16,185,129,0.22)",
                                    borderWidth: 1,
                                    borderColor: "rgba(16,185,129,0.35)",
                                  }}
                                >
                                  <Text style={{ color: "#fff", fontWeight: "900" }}>Download</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : null}
                </>
              ) : null}

              {isSeller ? (
                <View style={{ marginTop: isBuyer ? 16 : 0 }}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Seller upload</Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                    Upload preview (low quality / watermarked) and then full-quality deliverables.
                  </Text>

                  {!!uploadErr ? <Text style={{ marginTop: 10, color: "#FCA5A5", fontWeight: "800" }}>{uploadErr}</Text> : null}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    <Pressable
                      disabled={uploadBusy}
                      onPress={() => pickAndUpload("preview")}
                      style={{
                        flex: 1,
                        borderRadius: 16,
                        paddingVertical: 14,
                        alignItems: "center",
                        backgroundColor: "rgba(124,58,237,0.20)",
                        borderWidth: 1,
                        borderColor: "rgba(124,58,237,0.35)",
                        opacity: uploadBusy ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>{uploadBusy ? "Uploading…" : "Upload preview"}</Text>
                    </Pressable>

                    <Pressable
                      disabled={uploadBusy}
                      onPress={() => pickAndUpload("final")}
                      style={{
                        flex: 1,
                        borderRadius: 16,
                        paddingVertical: 14,
                        alignItems: "center",
                        backgroundColor: "rgba(16,185,129,0.20)",
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.35)",
                        opacity: uploadBusy ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "900" }}>{uploadBusy ? "Uploading…" : "Upload full"}</Text>
                    </Pressable>
                  </View>

                  {deliverables.length ? (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.60)", fontSize: 12 }}>
                      Uploaded: {previewItems.length} preview • {finalItems.length} full
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>

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
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Continue to checkout</Text>
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
                <Text style={{ color: "#fff", fontWeight: "900" }}>{busy ? "Working…" : "Cancel order"}</Text>
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
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{busy ? "Working…" : "Mark out for delivery"}</Text>
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
                      backgroundColor: canVerifyOtp && !busy ? "rgba(16,185,129,0.25)" : "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: canVerifyOtp && !busy ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900" }}>{otpVerified ? "OTP verified ✅" : busy ? "Verifying…" : "Verify OTP"}</Text>
                  </Pressable>

                  {otp ? (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                      OTP status: {otp.verified_at ? "Verified" : "Pending"} • attempts: {otp.attempts}
                    </Text>
                  ) : (
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>OTP not created yet.</Text>
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
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{busy ? "Working…" : "Generate delivery OTP"}</Text>
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
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{busy ? "Releasing…" : "Release funds to seller"}</Text>
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
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{busy ? "Working…" : "Report issue / request refund"}</Text>
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

