import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import AppHeader from "@/components/common/AppHeader";
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
  is_verified: boolean;
  logo_path: string | null;
  banner_path: string | null;
  offers_remote: boolean;
  offers_in_person: boolean;
  payout_tier: "standard" | "fast";
  active: boolean;
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
  cover_url?: string | null;
};

type Review = {
  id: string;
  seller_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles?: { username?: string | null; full_name?: string | null } | null;
};

function publicUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

export default function PublicSellerProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = useMemo(() => String(username || "").trim().toLowerCase(), [username]);

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);

  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [myRating, setMyRating] = useState<number>(0);
  const [myComment, setMyComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [canReview, setCanReview] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      console.log("[PublicSellerProfile] load start", { handle });
      setLoading(true);
      setErr(null);

      try {
        if (!handle) throw new Error("Missing username");

        // 1) Seller public profile (view)
        const { data: sp, error: spErr } = await supabase
          .from("market_seller_public_profiles")
          .select(
            "user_id,market_username,display_name,business_name,bio,location_text,is_verified,logo_path,banner_path,offers_remote,offers_in_person,payout_tier,active"
          )
          .eq("market_username", handle)
          .eq("active", true)
          .maybeSingle();

        if (spErr) throw new Error(spErr.message);
        if (!sp) {
          if (mounted) {
            setSeller(null);
            setListings([]);
          }
          return;
        }

        // 2) Active listings (RLS policy allows)
        const { data: ls, error: lsErr } = await supabase
          .from("market_listings")
          .select("id,title,price_amount,currency,delivery_type,category,sub_category,created_at")
          .eq("seller_id", (sp as any).user_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(60);

        if (lsErr) throw new Error(lsErr.message);

        // 3) Cover images (view)
        const rows = ((ls as any) ?? []) as Listing[];
        const listingIds = rows.map((r) => r.id);

        const coverMap: Record<string, string | null> = {};
        if (listingIds.length) {
          const { data: imgs, error: imgErr } = await supabase
            .from("market_listing_images_public")
            .select("listing_id,storage_path,sort_order")
            .in("listing_id", listingIds)
            .order("sort_order", { ascending: true });

          if (imgErr) throw new Error(imgErr.message);

          (imgs ?? []).forEach((img: any) => {
            if (!coverMap[img.listing_id]) {
              coverMap[img.listing_id] = publicUrl(BUCKET_LISTINGS, img.storage_path) ?? null;
            }
          });
        }

        const rowsWithCovers = rows.map((r) => ({ ...r, cover_url: coverMap[r.id] ?? null }));

        if (mounted) {
          setSeller(sp as any);
          setListings(rowsWithCovers);
        }
      } catch (e: any) {
        if (mounted) {
          setErr(e?.message || "Failed to load seller");
          setSeller(null);
          setListings([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          console.log("[PublicSellerProfile] load end");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [handle]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, []);

  async function loadFollowers() {
    if (!seller?.user_id) return;
    const { count } = await supabase
      .from("market_profile_follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_id", seller.user_id);
    setFollowersCount(count ?? 0);

    if (meId) {
      const { data } = await supabase
        .from("market_profile_follows")
        .select("id")
        .eq("followed_id", seller.user_id)
        .eq("follower_id", meId)
        .maybeSingle();
      setIsFollowing(!!data?.id);
    } else {
      setIsFollowing(false);
    }
  }

  async function loadReviews() {
    if (!seller?.user_id) return;
    const { data, count } = await supabase
      .from("market_seller_reviews")
      .select("id,seller_id,reviewer_id,rating,comment,created_at,profiles(username,full_name)", { count: "exact" })
      .eq("seller_id", seller.user_id)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data as any as Review[]) ?? [];
    setReviews(rows);
    setReviewCount(count ?? rows.length);
    if (rows.length) {
      const avg = rows.reduce((a, b) => a + Number(b.rating || 0), 0) / rows.length;
      setAvgRating(Math.round(avg * 10) / 10);
    } else {
      setAvgRating(0);
    }
  }

  async function loadCanReview() {
    if (!seller?.user_id || !meId) {
      setCanReview(false);
      return;
    }
    if (meId === seller.user_id) {
      setCanReview(false);
      return;
    }
    const { data } = await supabase
      .from("market_orders")
      .select("id,status")
      .eq("buyer_id", meId)
      .eq("seller_id", seller.user_id)
      .in("status", ["DELIVERED", "RELEASED"])
      .limit(1);
    setCanReview(!!data?.length);
  }

  useEffect(() => {
    if (!seller?.user_id) return;
    loadFollowers();
    loadReviews();
    loadCanReview();

    const ch = supabase
      .channel(`seller-social-${seller.user_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "market_profile_follows", filter: `followed_id=eq.${seller.user_id}` }, () => {
        loadFollowers();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_seller_reviews", filter: `seller_id=eq.${seller.user_id}` }, () => {
        loadReviews();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [seller?.user_id, meId]);

  async function toggleFollow() {
    if (!meId) {
      setErr("Please sign in to follow stores.");
      return;
    }
    if (!seller?.user_id) return;
    if (meId === seller.user_id) return;
    try {
      if (isFollowing) {
        await supabase.from("market_profile_follows").delete().eq("follower_id", meId).eq("followed_id", seller.user_id);
      } else {
        await supabase.from("market_profile_follows").insert({ follower_id: meId, followed_id: seller.user_id });
      }
      await loadFollowers();
    } catch (e: any) {
      setErr(e?.message || "Could not update follow");
    }
  }

  async function submitReview() {
    if (!seller?.user_id || !meId) return;
    if (meId === seller.user_id) return;
    if (!canReview) {
      setErr("Only buyers who completed an order can review this store.");
      return;
    }
    if (myRating < 1) {
      setErr("Select a star rating.");
      return;
    }
    setReviewBusy(true);
    setErr(null);
    try {
      await supabase
        .from("market_seller_reviews")
        .upsert(
          {
            seller_id: seller.user_id,
            reviewer_id: meId,
            rating: myRating,
            comment: myComment.trim() || null,
          },
          { onConflict: "seller_id,reviewer_id" }
        );
      setMyComment("");
      setMyRating(0);
      await loadReviews();
    } catch (e: any) {
      setErr(e?.message || "Could not submit review");
    } finally {
      setReviewBusy(false);
    }
  }

  const bannerUrl = useMemo(() => publicUrl(BUCKET_SELLERS, seller?.banner_path ?? null), [seller?.banner_path]);
  const logoUrl = useMemo(() => publicUrl(BUCKET_SELLERS, seller?.logo_path ?? null), [seller?.logo_path]);

  if (loading) {
    return (
      <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <AppHeader title="Store" />
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Loading store…</Text>
      </LinearGradient>
    );
  }

  if (err) {
    return (
      <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <AppHeader title="Store" />
        <View style={{ marginTop: 10, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Could not load store</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)" }}>{err}</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 12, borderRadius: 18, paddingVertical: 12, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: PURPLE }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Go back</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  if (!seller) {
    return (
      <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <AppHeader title="Store" />
        <View style={{ marginTop: 10, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>Store not found</Text>
          <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.65)" }}>@{handle}</Text>
          <Pressable onPress={() => router.push("/market/(tabs)" as any)} style={{ marginTop: 12, borderRadius: 18, paddingVertical: 12, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: PURPLE }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Back to Market</Text>
          </Pressable>
          
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <AppHeader title={seller?.business_name || seller?.display_name || "Store"} />
      <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
        <View style={{ height: 180, backgroundColor: "rgba(255,255,255,0.06)" }}>
          {bannerUrl ? (
            <Image source={{ uri: bannerUrl }} style={{ width: "100%", height: 180 }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="images-outline" size={28} color="rgba(255,255,255,0.55)" />
              <Text style={{ marginTop: 8, color: "rgba(255,255,255,0.55)", fontWeight: "800" }}>No banner</Text>
            </View>
          )}

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

        <View style={{ paddingHorizontal: 16, marginTop: -34 }}>
          <View style={{ borderRadius: 24, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.06)" }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end" }}>
              <View style={{ width: 76, height: 76, borderRadius: 24, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", backgroundColor: "rgba(255,255,255,0.06)" }}>
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
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(16,185,129,0.15)", borderWidth: 1, borderColor: "rgba(16,185,129,0.35)" }}>
                      <Text style={{ color: "#10B981", fontWeight: "900", fontSize: 12 }}>Verified</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "800" }}>
                  @{seller.market_username}
                </Text>

                {!!seller.location_text && (
                  <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                    <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.55)" /> {seller.location_text}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{followersCount} Followers</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>
                    {avgRating ? `${avgRating} ★` : "No ratings"} ({reviewCount})
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={toggleFollow}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isFollowing ? "rgba(239,68,68,0.35)" : "rgba(124,58,237,0.45)",
                  backgroundColor: isFollowing ? "rgba(239,68,68,0.12)" : "rgba(124,58,237,0.20)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{isFollowing ? "Unfollow" : "Follow"}</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>About</Text>
              <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", lineHeight: 18 }}>
                {seller.bio || "No bio yet."}
              </Text>
            </View>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/market/dm/[username]" as any,
                  params: { username: seller.market_username },
                })
              }
              style={{
                marginTop: 12,
                borderRadius: 18,
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
              <Text style={{ color: "#fff", fontWeight: "900" }}>Message</Text>
            </Pressable>

            <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {seller.offers_remote ? <Pill icon="laptop-outline" label="Remote service" /> : null}
              {seller.offers_in_person ? <Pill icon="walk-outline" label="In-person service" /> : null}
              <Pill icon="shield-checkmark-outline" label={`Payout: ${seller.payout_tier}`} />
            </View>
          </View>

          <View style={{ marginTop: 12, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Reviews</Text>
            <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              {reviewCount ? `${reviewCount} reviews • ${avgRating}★ average` : "No reviews yet"}
            </Text>

            {canReview ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setMyRating(n)} style={{ padding: 6 }}>
                      <Ionicons name={myRating >= n ? "star" : "star-outline"} size={20} color="#FBBF24" />
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={myComment}
                  onChangeText={setMyComment}
                  placeholder="Write a short review (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={{
                    marginTop: 8,
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
                  onPress={submitReview}
                  disabled={reviewBusy}
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    backgroundColor: "rgba(124,58,237,0.20)",
                    borderWidth: 1,
                    borderColor: "rgba(124,58,237,0.45)",
                    opacity: reviewBusy ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{reviewBusy ? "Submitting…" : "Submit review"}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                Only buyers who completed an order can review.
              </Text>
            )}

            <View style={{ marginTop: 12, gap: 10 }}>
              {reviews.length === 0 ? (
                <Text style={{ color: "rgba(255,255,255,0.6)" }}>No reviews yet.</Text>
              ) : (
                reviews.map((r) => (
                  <View key={r.id} style={{ borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
                      @{r.profiles?.username || "user"}{" "}
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontWeight: "600", fontSize: 11 }}>
                        • {new Date(r.created_at).toLocaleString()}
                      </Text>
                    </Text>
                    <View style={{ marginTop: 6, flexDirection: "row", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Ionicons key={n} name={r.rating >= n ? "star" : "star-outline"} size={14} color="#FBBF24" />
                      ))}
                    </View>
                    {r.comment ? <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.7)" }}>{r.comment}</Text> : null}
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Listings</Text>

  <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
    <Pressable onPress={() => router.push(`/market/listings?seller_id=${seller.user_id}` as any)}>
      <Text style={{ color: "#C4B5FD", fontWeight: "900" }}>See all</Text>
    </Pressable>

    <Pressable onPress={() => router.push("/market/(tabs)" as any)}>
      <Text style={{ color: "#C4B5FD", fontWeight: "900" }}>Back to Market</Text>
    </Pressable>
  </View>
</View> 


            {listings.length === 0 ? (
              <View style={{ marginTop: 10, borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>No listings yet</Text>
                <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>This seller hasn’t posted anything yet.</Text>
              </View>
            ) : (
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {listings.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => router.push(`/market/listing/${l.id}` as any)}
                    style={{ width: "48%", borderRadius: 22, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
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
                      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "900" }}>{l.title || "Untitled"}</Text>
                      <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                        {l.currency || "NGN"}{" "}
                        <Text style={{ color: "#fff", fontWeight: "900" }}>{Number(l.price_amount || 0).toLocaleString()}</Text>
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
    <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={props.icon} size={14} color="rgba(255,255,255,0.75)" />
      <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 12 }}>{props.label}</Text>
    </View>
  );
}

