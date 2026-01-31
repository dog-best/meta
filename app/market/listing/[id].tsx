import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import { supabase } from "@/services/supabase";
import { DeliveryGeo, formatAvailabilitySummary, getCurrentLocationWithGeocode } from "@/utils/location";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

const LISTINGS_TABLE = "market_listings";
const IMAGES_TABLE = "market_listing_images";
const SELLERS_TABLE = "market_seller_profiles";
const ORDERS_TABLE = "market_orders";
const LISTING_IMAGES_BUCKET = "market-listings";

type ListingImage = {
  id: string;
  public_url: string | null;
  storage_path: string;
  sort_order: number | null;
};

type Listing = {
  id: string;
  seller_id: string;
  title: string | null;
  description: string | null;
  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;
  category: string | null;
  sub_category: string | null;
  stock_qty: number | null;
  created_at?: string | null;
  availability?: any;
};

type ListingComment = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles?: { username?: string | null; full_name?: string | null } | null;
};

type Seller = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  bio: string | null;
  logo_path: string | null;
  banner_path: string | null;
  is_verified: boolean | null;
};

function money(currency: string | null, amt: any) {
  const n = Number(amt ?? 0);
  if (currency === "USDC") return `$${n.toLocaleString()}`;
  return `NGN ${n.toLocaleString()}`;
}

function imgUrl(img: ListingImage, supabaseUrl: string) {
  if (img.public_url) return img.public_url;
  if (img.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${LISTING_IMAGES_BUCKET}/${img.storage_path}`;
  }
  return null;
}

export default function ListingDetails() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listingId = useMemo(() => String(id || ""), [id]);

  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deliveryGeo, setDeliveryGeo] = useState<DeliveryGeo | null>(null);
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const [locatingDelivery, setLocatingDelivery] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myReaction, setMyReaction] = useState<"like" | "dislike" | null>(null);
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [commentInput, setCommentInput] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  const supabaseUrl =
    (supabase as any)?.supabaseUrl ?? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!listingId) {
          setErr("Missing listing id");
          return;
        }

        const { data: l, error: lErr } = await supabase
          .from(LISTINGS_TABLE)
          .select("id,seller_id,title,description,price_amount,currency,delivery_type,category,sub_category,stock_qty,created_at,availability")
          .eq("id", listingId)
          .maybeSingle();

        if (lErr) throw new Error(lErr.message);
        if (!l) {
          setErr("Listing not found");
          return;
        }

        const { data: imgs, error: iErr } = await supabase
          .from(IMAGES_TABLE)
          .select("id,public_url,storage_path,sort_order")
          .eq("listing_id", listingId)
          .order("sort_order", { ascending: true });

        if (iErr) throw new Error(iErr.message);

        const { data: s, error: sErr } = await supabase
          .from(SELLERS_TABLE)
          .select("user_id,market_username,display_name,business_name,bio,logo_path,banner_path,is_verified")
          .eq("user_id", (l as any).seller_id)
          .maybeSingle();

        if (sErr) throw new Error(sErr.message);

        if (mounted) {
          setListing(l as any);
          setImages((imgs as any) ?? []);
          setSeller((s as any) ?? null);
        }
      } catch (e: any) {
        if (mounted) {
          setErr(e?.message || "Failed to load listing");
          setListing(null);
          setImages([]);
          setSeller(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [listingId]);

  async function loadReactions() {
    if (!listingId) return;
    const { count: likeCount } = await supabase
      .from("market_listing_reactions")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listingId)
      .eq("reaction", "like");
    const { count: dislikeCount } = await supabase
      .from("market_listing_reactions")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listingId)
      .eq("reaction", "dislike");
    setLikes(likeCount ?? 0);
    setDislikes(dislikeCount ?? 0);

    if (meId) {
      const { data: mine } = await supabase
        .from("market_listing_reactions")
        .select("reaction")
        .eq("listing_id", listingId)
        .eq("user_id", meId)
        .maybeSingle();
      setMyReaction((mine as any)?.reaction ?? null);
    } else {
      setMyReaction(null);
    }
  }

  async function loadComments() {
    if (!listingId) return;
    const { data, count } = await supabase
      .from("market_listing_comments")
      .select("id,body,created_at,user_id,profiles(username,full_name)", { count: "exact" })
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(50);
    setComments((data as any) ?? []);
    setCommentCount(count ?? 0);
  }

  useEffect(() => {
    if (!listingId) return;
    loadReactions();
    loadComments();

    const ch = supabase
      .channel(`listing-social-${listingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_listing_reactions", filter: `listing_id=eq.${listingId}` }, () => {
        loadReactions();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_listing_comments", filter: `listing_id=eq.${listingId}` }, () => {
        loadComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [listingId, meId]);

  async function toggleReaction(next: "like" | "dislike") {
    if (!meId) {
      Alert.alert("Sign in required", "Please sign in to react to listings.");
      return;
    }
    if (!listingId) return;
    try {
      if (myReaction === next) {
        await supabase.from("market_listing_reactions").delete().eq("listing_id", listingId).eq("user_id", meId);
      } else {
        await supabase
          .from("market_listing_reactions")
          .upsert({ listing_id: listingId, user_id: meId, reaction: next }, { onConflict: "listing_id,user_id" });
      }
      await loadReactions();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not update reaction");
    }
  }

  async function submitComment() {
    if (!meId) {
      Alert.alert("Sign in required", "Please sign in to comment.");
      return;
    }
    if (!listingId) return;
    const body = commentInput.trim();
    if (body.length < 2) return;
    setCommentBusy(true);
    try {
      await supabase.from("market_listing_comments").insert({ listing_id: listingId, user_id: meId, body });
      setCommentInput("");
      await loadComments();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not post comment");
    } finally {
      setCommentBusy(false);
    }
  }

  async function buyNow() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.push("/(auth)/login" as any);
        return;
      }
      if (!listing) return;

      const needsLocation = String(listing.delivery_type ?? "").toLowerCase() !== "digital";
      const finalDeliveryGeo =
        deliveryGeo
          ? { ...deliveryGeo, label: deliveryLabel.trim() || deliveryGeo.label }
          : null;
      if (needsLocation && !finalDeliveryGeo) {
        Alert.alert("Add delivery location", "Use your current location to set delivery/service address before buying.");
        return;
      }

      const unit = Number(listing.price_amount ?? 0);
      const qty = 1;
      const amount = unit * qty;

      const { data: order, error: oErr } = await supabase
        .from(ORDERS_TABLE)
        .insert({
          buyer_id: user.id,
          seller_id: listing.seller_id,
          listing_id: listing.id,
          quantity: qty,
          unit_price: unit,
          amount,
          currency: listing.currency ?? "NGN",
          status: "CREATED",
          delivery_address: { geo: finalDeliveryGeo ?? {} },
        })
        .select("id")
        .single();

      if (oErr) throw new Error(oErr.message);

      router.push(`/market/checkout/${order.id}` as any);
    } catch (e: any) {
      setErr(e?.message || "Could not create order");
    }
  }

  async function useCurrentLocationForDelivery() {
    setLocatingDelivery(true);
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
      setDeliveryGeo(geo);
      setDeliveryLabel(res.label);
    } catch (e: any) {
      Alert.alert("Location error", e?.message || "Could not access location.");
    } finally {
      setLocatingDelivery(false);
    }
  }

  if (loading) {
    return (
      <LinearGradient
        colors={[BG1, BG0]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
      >
        <AppHeader title="Listing" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!listing) {
    return (
      <LinearGradient
        colors={[BG1, BG0]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
      >
        <AppHeader title="Listing" />
        <View style={{ marginTop: 18, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>Listing not found</Text>
          {!!err && <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>{err}</Text>}
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12, borderRadius: 18, paddingVertical: 12, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: PURPLE }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Go back</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  const imageUrls = images.map((im) => imgUrl(im, supabaseUrl)).filter(Boolean) as string[];
  const availabilitySummary = formatAvailabilitySummary((listing as any)?.availability);
  const recentComments = comments.slice(0, 4);
  const showSeeMore = commentCount > 4;

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 16 }}
    >
      <AppHeader
        title={listing.title ?? "Listing"}
        subtitle={`${listing.category ?? "-"} - ${listing.delivery_type ?? "-"} - ${listing.sub_category ?? "-"}`}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
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
            <Text numberOfLines={1} style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>
              {listing.title ?? "Listing"}
            </Text>
            <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              {listing.category ?? "-"} - {listing.delivery_type ?? "-"} - {listing.sub_category ?? "-"}
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {(imageUrls.length ? imageUrls : [null]).map((u, idx) => (
              <View
                key={`${u ?? "none"}-${idx}`}
                style={{
                  width: 280,
                  height: 200,
                  borderRadius: 22,
                  overflow: "hidden",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                {u ? (
                  <Image source={{ uri: u }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="image-outline" size={34} color="rgba(255,255,255,0.55)" />
                    <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                      No images
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={{
            marginTop: 14,
            borderRadius: 22,
            padding: 16,
            backgroundColor: "rgba(124,58,237,0.12)",
            borderWidth: 1,
            borderColor: "rgba(124,58,237,0.40)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 }}>
            Price
          </Text>
          <Text style={{ marginTop: 8, color: "#fff", fontWeight: "900", fontSize: 28 }}>
            {money(listing.currency, listing.price_amount)}
          </Text>

          {listing.stock_qty !== null && listing.category === "product" ? (
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
              Stock: {listing.stock_qty}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 10,
            borderRadius: 18,
            padding: 12,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Pressable
            onPress={() => toggleReaction("like")}
            style={{
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: myReaction === "like" ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.1)",
              backgroundColor: myReaction === "like" ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Ionicons name="thumbs-up-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900" }}>{likes}</Text>
          </Pressable>

          <Pressable
            onPress={() => toggleReaction("dislike")}
            style={{
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: myReaction === "dislike" ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.1)",
              backgroundColor: myReaction === "dislike" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
            }}
          >
            <Ionicons name="thumbs-down-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900" }}>{dislikes}</Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={{ color: "rgba(255,255,255,0.8)", fontWeight: "900" }}>{commentCount}</Text>
          </View>
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
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Available in</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", lineHeight: 20 }}>
            {availabilitySummary}
          </Text>
          {listing?.availability?.scope === "radius" && listing?.availability?.center?.lat ? (
            <Pressable
              onPress={() =>
                Linking.openURL(`https://maps.google.com/?q=${listing.availability.center.lat},${listing.availability.center.lng}`)
              }
              style={{
                marginTop: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Open in Google Maps</Text>
            </Pressable>
          ) : null}
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
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Details</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", lineHeight: 20 }}>
            {listing.description ?? "No description provided."}
          </Text>
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
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Seller</Text>

          <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                overflow: "hidden",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              {seller?.logo_path ? (
                <Image
                  source={{
                    uri: `${supabaseUrl}/storage/v1/object/public/market-sellers/${seller.logo_path}`,
                  }}
                  style={{ width: 56, height: 56 }}
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={24} color="rgba(255,255,255,0.55)" />
                </View>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>
                  {seller?.business_name || seller?.display_name || "Seller"}
                </Text>
                {seller?.is_verified ? (
                  <Ionicons name="checkmark-circle" size={16} color="#3B82F6" />
                ) : null}
              </View>
              <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                @{seller?.market_username || "seller"}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                const u = seller?.market_username;
                if (u) router.push(`/market/profile/${u}` as any);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 16,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>View</Text>
            </Pressable>
          </View>

          {seller?.market_username ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/market/dm/[username]" as any,
                  params: { username: seller.market_username },
                })
              }
              style={{
                marginTop: 10,
                borderRadius: 16,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: "rgba(124,58,237,0.20)",
                borderWidth: 1,
                borderColor: "rgba(124,58,237,0.45)",
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "900" }}>Message seller</Text>
            </Pressable>
          ) : null}

          {seller?.bio ? (
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.65)", lineHeight: 20 }}>
              {seller.bio}
            </Text>
          ) : null}
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
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Delivery / Service location</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
            Buyers set a delivery/service location when creating the order.
          </Text>

          <Pressable
            onPress={useCurrentLocationForDelivery}
            disabled={locatingDelivery}
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
              opacity: locatingDelivery ? 0.7 : 1,
            }}
          >
            {locatingDelivery ? <ActivityIndicator /> : <Ionicons name="locate-outline" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "900" }}>Use my current location</Text>
          </Pressable>

          <TextInput
            value={deliveryLabel}
            onChangeText={setDeliveryLabel}
            placeholder="Location label (optional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={{
              marginTop: 10,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: "#fff",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
          />

          {deliveryGeo ? (
            <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              {deliveryGeo.label || deliveryLabel || "Current location set"} - {deliveryGeo.lat.toFixed(5)}, {deliveryGeo.lng.toFixed(5)}
            </Text>
          ) : null}
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
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Comments</Text>

          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <TextInput
              value={commentInput}
              onChangeText={setCommentInput}
              placeholder="Write a public comment..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{
                flex: 1,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: "#fff",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            />
            <Pressable
              onPress={submitComment}
              disabled={commentBusy || commentInput.trim().length < 2}
              style={{
                paddingHorizontal: 14,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(124,58,237,0.85)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.2)",
                opacity: commentBusy ? 0.7 : 1,
              }}
            >
              {commentBusy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </Pressable>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            {recentComments.length === 0 ? (
              <Text style={{ color: "rgba(255,255,255,0.6)" }}>No comments yet.</Text>
            ) : (
              recentComments.map((c) => (
                <View key={c.id} style={{ borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    @{c.profiles?.username || "user"}{" "}
                    <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 11 }}>
                      - {new Date(c.created_at).toLocaleString()}
                    </Text>
                  </Text>
                  <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.7)" }}>{c.body}</Text>
                </View>
              ))
            )}
          </View>

          {showSeeMore ? (
            <Pressable
              onPress={() => setShowAllComments(true)}
              style={{
                marginTop: 10,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>See all comments</Text>
            </Pressable>
          ) : null}
        </View>

        {!!err ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: "#FCA5A5", fontWeight: "800" }}>{err}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: "rgba(5,4,11,0.92)",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
        }}
      >
        <Pressable
          onPress={buyNow}
          style={{
            borderRadius: 22,
            paddingVertical: 16,
            alignItems: "center",
            backgroundColor: PURPLE,
            borderWidth: 1,
            borderColor: PURPLE,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Buy now</Text>
          <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 }}>
            Escrow protected - choose NGN or USDC next
          </Text>
        </Pressable>
      </View>

      <Modal visible={showAllComments} transparent animationType="slide" onRequestClose={() => setShowAllComments(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}>
          <View
            style={{
              maxHeight: "80%",
              backgroundColor: BG0,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>All comments</Text>
              <Pressable onPress={() => setShowAllComments(false)}>
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
            </View>

            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              {commentCount} total comments
            </Text>

            <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 10 }}>
              {comments.length === 0 ? (
                <Text style={{ color: "rgba(255,255,255,0.6)" }}>No comments yet.</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={{ borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      @{c.profiles?.username || "user"}{" "}
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 11 }}>
                        - {new Date(c.created_at).toLocaleString()}
                      </Text>
                    </Text>
                    <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.7)" }}>{c.body}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
