import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const BUCKET_SELLERS = "market-sellers";
const BUCKET_LISTINGS = "market-listings";

type Seller = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string | null;
  bio: string | null;
  location_text: string | null;
  phone: string | null;
  is_verified: boolean;
  logo_path: string | null;
  banner_path: string | null;
  offers_remote: boolean;
  offers_in_person: boolean;
  payout_tier: "standard" | "fast";
};

type Listing = {
  id: string;
  title: string | null;
  price_amount: number | string | null;
  currency: string | null;
  delivery_type: string | null;
  category: string | null;
  sub_category: string | null;
  created_at: string;
  // derived:
  cover_url?: string | null;
};

function publicUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export default function PublicSellerProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = useMemo(
    () => String(username || "").trim().toLowerCase(),
    [username]
  );

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!handle) throw new Error("Missing username");

        // 1) Fetch seller profile
        const { data: sp, error: spErr } = await supabase
          .from("market_seller_profiles")
          .select(
            "user_id,market_username,display_name,business_name,bio,location_text,phone,is_verified,logo_path,banner_path,offers_remote,offers_in_person,payout_tier"
          )
          .eq("market_username", handle)
          .eq("active", true)
          .maybeSingle();

        if (spErr) throw new Error(spErr.message);
        if (!sp) {
          if (mounted) {
            setSeller(null);
            setListings([]);
            setLoading(false);
          }
          return;
        }

        // 2) Fetch listings for seller
        const { data: ls, error: lsErr } = await supabase
          .from("market_listings")
          .select(
            "id,title,price_amount,currency,delivery_type,category,sub_category,created_at"
          )
          .eq("seller_id", sp.user_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(60);

        if (lsErr) throw new Error(lsErr.message);

        // 3) For each listing, fetch the first image (cheap MVP approach)
        // Later we optimize with a view.
        const rows = (ls as any as Listing[]) ?? [];
        const listingIds = rows.map((r) => r.id);

        let coverMap: Record<string, string | null> = {};
        if (listingIds.length) {
          const { data: imgs } = await supabase
            .from("market_listing_images")
            .select("listing_id,storage_path,sort_order")
            .in("listing_id", listingIds)
            .order("sort_order", { ascending: true });

          (imgs ?? []).forEach((img: any) => {
            if (!coverMap[img.listing_id]) {
              coverMap[img.listing_id] =
                publicUrl(BUCKET_LISTINGS, img.storage_path) ?? null;
            }
          });
        }

        const rowsWithCovers = rows.map((r) => ({
          ...r,
          cover_url: coverMap[r.id] ?? null,
        }));

        if (mounted) {
          setSeller(sp as any);
          setListings(rowsWithCovers);
          setLoading(false);
        }
      } catch (e: any) {
        if (mounted) {
          setErr(e?.message || "Failed to load seller");
          setSeller(null);
          setListings([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [handle]);

  const bannerUrl = useMemo(
    () => publicUrl(BUCKET_SELLERS, seller?.banner_path ?? null),
    [seller?.banner_path]
  );
  const logoUrl = useMemo(
    () => publicUrl(BUCKET_SELLERS, seller?.logo_path ?? null),
    [seller?.logo_path]
  );

  if (loading) {
    return (
      <LinearGradient
        colors={[BG1, BG0]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>
          Loading store…
        </Text>
      </LinearGradient>
    );
  }

  if (err) {
    return (
      <LinearGradient
        colors={[BG1, BG0]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
      >
        <View
          style={{
            marginTop: 10,
            borderRadius: 22,
            padding: 16,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
            Could not load store
          </Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)" }}>
            {err}
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Go back</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  if (!seller) {
    return (
      <LinearGradient
        colors={[BG1, BG0]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}
      >
        <View
          style={{
            marginTop: 10,
            borderRadius: 22,
            padding: 16,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>
            Store not found
          </Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)" }}>
            @{handle}
          </Text>

          <Pressable
            onPress={() => router.push("/market/(tabs)" as any)}
            style={{
              marginTop: 12,
              borderRadius: 18,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>
              Back to Market
            </Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[BG1, BG0]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
        {/* Top banner */}
        <View style={{ height: 180, backgroundColor: "rgba(255,255,255,0.06)" }}>
          {bannerUrl ? (
            <Image source={{ uri: bannerUrl }} style={{ width: "100%", height: 180 }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="images-outline" size={28} color="rgba(255,255,255,0.55)" />
              <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontWeight: "800" }}>
                No banner
              </Text>
            </View>
          )}

          {/* Back button overlay */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: "absolute",
              top: 14,
              left: 16,
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "rgba(0,0,0,0.35)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Profile card */}
        <View style={{ paddingHorizontal: 16, marginTop: -34 }}>
          <View
            style={{
              borderRadius: 24,
              padding: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 24,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.35)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={{ width: 76, height: 76 }} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person-outline" size={22} color="rgba(255,255,255,0.55)" />
                  </View>
                )}
              </View>

              <View style={{ flex: 1, paddingBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>
                    {seller.business_name || seller.display_name || "Store"}
                  </Text>
                  {seller.is_verified ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: "rgba(16,185,129,0.15)",
                        borderWidth: 1,
                        borderColor: "rgba(16,185,129,0.35)",
                      }}
                    >
                      <Text style={{ color: "#10B981", fontWeight: "900", fontSize: 12 }}>
                        Verified
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                  @{seller.market_username}
                </Text>

                {!!seller.location_text && (
                  <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.55)" />{" "}
                    {seller.location_text}
                  </Text>
                )}
              </View>
            </View>

            {/* About */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>About</Text>
              <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", lineHeight: 18 }}>
                {seller.bio || "No bio yet."}
              </Text>
            </View>

            {/* Service badges */}
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {seller.offers_remote ? (
                <Pill icon="laptop-outline" label="Remote service" />
              ) : null}
              {seller.offers_in_person ? (
                <Pill icon="walk-outline" label="In-person service" />
              ) : null}
              <Pill icon="shield-checkmark-outline" label={`Payout: ${seller.payout_tier}`} />
            </View>
          </View>

          {/* Listings */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                Listings
              </Text>
              <Pressable onPress={() => router.push("/market/(tabs)" as any)}>
                <Text style={{ color: "#C4B5FD", fontWeight: "900" }}>Back to Market</Text>
              </Pressable>
            </View>

            {listings.length === 0 ? (
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 22,
                  padding: 16,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>No listings yet</Text>
                <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                  This seller hasn’t posted anything yet.
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {listings.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => router.push(`/market/listing/${l.id}` as any)}
                    style={{
                      width: "48%",
                      borderRadius: 22,
                      overflow: "hidden",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <View style={{ height: 120, backgroundColor: "rgba(255,255,255,0.06)" }}>
                      {l.cover_url ? (
                        <Image source={{ uri: l.cover_url }} style={{ width: "100%", height: 120 }} />
                      ) : (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.55)" />
                        </View>
                      )}
                    </View>

                    <View style={{ padding: 12 }}>
                      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900" }}>
                        {l.title || "Untitled"}
                      </Text>

                      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                        {l.currency || "NGN"}{" "}
                        <Text style={{ color: "#fff", fontWeight: "900" }}>
                          {Number(l.price_amount || 0).toLocaleString()}
                        </Text>
                      </Text>

                      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <MaterialCommunityIcons
                          name={l.category === "service" ? "briefcase-outline" : "shopping-outline"}
                          size={14}
                          color="rgba(255,255,255,0.6)"
                        />
                        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                          {l.category === "service" ? "Service" : "Product"} • {l.delivery_type || "—"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function Pill(props: { icon: any; label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons name={props.icon} size={14} color="rgba(255,255,255,0.75)" />
      <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 12 }}>
        {props.label}
      </Text>
    </View>
  );
}
