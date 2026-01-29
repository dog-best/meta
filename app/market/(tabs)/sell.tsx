// app/market/(tabs)/sell.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getAllCategories } from "@/services/market/categories";
import { createListing, getMySellerProfile, insertListingImages, setListingCoverImage, uploadToBucket } from "@/services/market/marketService";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.09)";
const MUTED = "rgba(255,255,255,0.62)";

type Img = { uri: string; contentType: string };

type DeliveryType = "physical" | "digital" | "in_person";
type Currency = "NGN" | "USDC";
type MainCategory = "product" | "service";

function safeNumber(input: string) {
  const n = Number(String(input).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function ensureExtFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic")) return "heic";
  return "jpg";
}

function isValidUrl(u: string) {
  return /^https?:\/\/.+/i.test(u.trim());
}

function CardBox({ children }: any) {
  return (
    <View style={{ marginTop: 12, borderRadius: 22, padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
      {children}
    </View>
  );
}

function Label({ children }: any) {
  return <Text style={{ color: "rgba(255,255,255,0.72)", fontWeight: "800", marginTop: 10, fontSize: 12 }}>{children}</Text>;
}

function Row({ children, style }: any) {
  return <View style={[{ flexDirection: "row", gap: 10, marginTop: 10 }, style]}>{children}</View>;
}

function Input(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="rgba(255,255,255,0.35)"
      style={[
        {
          marginTop: 8,
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 12,
          color: "#fff",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          minHeight: props.multiline ? 92 : undefined,
          textAlignVertical: props.multiline ? "top" : "auto",
        },
        props.style,
      ]}
    />
  );
}

function Pill({
  active,
  label,
  icon,
  onPress,
  disabled,
}: {
  active: boolean;
  label: string;
  icon?: any;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.10)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color="#fff" /> : null}
      <Text style={{ color: "#fff", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function SellTab() {
  const [checkingSeller, setCheckingSeller] = useState(true);
  const [hasSellerProfile, setHasSellerProfile] = useState(false);

  const [category, setCategory] = useState<MainCategory>("product");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("physical");

  const [subCategory, setSubCategory] = useState<string>("");
  const [subSearch, setSubSearch] = useState("");
  const [useCustomSub, setUseCustomSub] = useState(false);
  const [customSub, setCustomSub] = useState("");

  const [websiteUrl, setWebsiteUrl] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");

  const [images, setImages] = useState<Img[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // merge your categories + extras
  const categories = useMemo(() => {
    const base = getAllCategories();

    const extras = [
      // Products
      { main: "product", slug: "phones", title: "Phones" },
      { main: "product", slug: "computers", title: "Computers" },
      { main: "product", slug: "electronics", title: "Electronics" },
      { main: "product", slug: "fashion", title: "Fashion" },
      { main: "product", slug: "beauty", title: "Beauty" },
      { main: "product", slug: "home_kitchen", title: "Home & Kitchen" },
      { main: "product", slug: "gaming", title: "Gaming" },
      { main: "product", slug: "books", title: "Books" },
      { main: "product", slug: "sports", title: "Sports" },
      // Services
      { main: "service", slug: "web_dev", title: "Web Development" },
      { main: "service", slug: "ui_ux", title: "UI/UX Design" },
      { main: "service", slug: "graphics", title: "Graphic Design" },
      { main: "service", slug: "video_editing", title: "Video Editing" },
      { main: "service", slug: "music_audio", title: "Music / Audio" },
      { main: "service", slug: "writing", title: "Writing" },
      { main: "service", slug: "marketing", title: "Marketing" },
      { main: "service", slug: "tutoring", title: "Tutoring" },
      { main: "service", slug: "photography", title: "Photography" },
      { main: "service", slug: "consulting", title: "Consulting" },
    ] as any[];

    const merged = [...base, ...extras];

    // unique by slug+main
    const map = new Map<string, any>();
    for (const c of merged) map.set(`${c.main}:${c.slug}`, c);
    return Array.from(map.values());
  }, []);

  const visibleSubs = useMemo(() => {
    const list = categories.filter((c: any) => c.main === category);
    const q = subSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c: any) => (c.title || c.slug).toLowerCase().includes(q));
  }, [categories, category, subSearch]);

  // Defaults when switching type
  useEffect(() => {
    if (category === "product") {
      setDeliveryType("physical");
    } else {
      // services: default digital
      setDeliveryType("digital");
    }

    setUseCustomSub(false);
    setCustomSub("");
    setSubSearch("");

    const first = categories.filter((c: any) => c.main === category)[0]?.slug ?? "";
    setSubCategory(first);
  }, [category]); // eslint-disable-line

  // ✅ seller check
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      setCheckingSeller(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (mountedRef.current) {
            setHasSellerProfile(false);
            setCheckingSeller(false);
          }
          router.replace("/(auth)/login" as any);
          return;
        }

        try {
          const prof = await getMySellerProfile();
          if (mountedRef.current) setHasSellerProfile(!!prof?.user_id);
        } catch {
          const { data } = await supabase.from("market_seller_profiles").select("user_id,active").eq("user_id", user.id).maybeSingle();
          if (mountedRef.current) setHasSellerProfile(!!data && (data as any)?.active !== false);
        }
      } catch {
        if (mountedRef.current) setHasSellerProfile(false);
      } finally {
        if (mountedRef.current) setCheckingSeller(false);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function pickImages() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert("Permission needed", "Allow photo access to upload images.");

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.85,
      });

      if (result.canceled) return;

      const picked = (result.assets ?? [])
        .filter((a) => !!a.uri)
        .map((a) => ({ uri: a.uri, contentType: a.mimeType ?? "image/jpeg" }));

      if (!picked.length) return;

      setImages((prev) => [...prev, ...picked].slice(0, 8));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not pick images");
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function finalSubCategory() {
    if (useCustomSub) return customSub.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40);
    return subCategory;
  }

  function validate(): string | null {
    const t = title.trim();
    if (!t) return "Title is required";

    const sc = finalSubCategory();
    if (!sc) return "Pick a sub-category (or type one in Other)";

    const p = safeNumber(price);
    if (!Number.isFinite(p) || p <= 0) return "Enter a valid price";

    if (category === "product") {
      const q = stockQty.trim() ? safeNumber(stockQty) : NaN;
      if (stockQty.trim() && (!Number.isFinite(q) || q < 0)) return "Stock must be 0 or more";
    }

    // media requirements:
    // - product: require at least 1 image
    // - service: require either at least 1 image OR website URL (for digital)
    if (category === "product" && images.length === 0) return "Add at least 1 image";
    if (category === "service") {
      if (deliveryType === "digital") {
        if (images.length === 0 && !websiteUrl.trim()) return "Add an image OR provide a website URL";
        if (websiteUrl.trim() && !isValidUrl(websiteUrl)) return "Website URL must start with https://";
      } else {
        if (images.length === 0) return "Add at least 1 image";
      }
    }

    return null;
  }

  async function onSubmit() {
    const err = validate();
    if (err) return Alert.alert("Fix this", err);

    setSubmitting(true);
    setStage(null);

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = auth?.user;
      if (!user) return router.replace("/(auth)/login" as any);

      const unitPrice = safeNumber(price);
      const qty = category === "product" && stockQty.trim() ? Math.max(0, Math.floor(safeNumber(stockQty))) : null;

      // Put website URL into description for now (until you add a DB column later)
      // This keeps you moving without migrations.
      const descBase = description.trim() || "";
      const extra =
        category === "service" && deliveryType === "digital" && websiteUrl.trim()
          ? `\n\n---\nWebsite preview link: ${websiteUrl.trim()}\n(Note: preview/watermark coming soon.)`
          : "";
      const finalDesc = (descBase + extra).trim() || null;

      setStage("Creating listing…");
      const listing = await createListing({
        seller_id: user.id,
        category,
        sub_category: finalSubCategory(),
        delivery_type: deliveryType,
        title: title.trim(),
        description: finalDesc,
        price_amount: unitPrice,
        currency,
        stock_qty: category === "product" ? qty : null,
      } as any);

      if (!listing?.id) throw new Error("Listing creation failed (missing id)");

      // If no images (allowed for digital service with website URL), skip images flow
      if (images.length > 0) {
        setStage("Uploading images…");
        const inserts: any[] = [];

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const ext = ensureExtFromMime(img.contentType);
          const random =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? (crypto as any).randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          const path = `${user.id}/listings/${listing.id}/${i + 1}-${random}.${ext}`;


          const up = await uploadToBucket({
            bucket: "market-listings",
            path,
            uri: img.uri,
            contentType: img.contentType,
          });

          inserts.push({
            listing_id: listing.id,
            storage_path: up.storagePath,
            public_url: up.publicUrl ?? null,
            sort_order: i,
            meta: { content_type: img.contentType },
          });
        }

        setStage("Saving images…");
        const rows = await insertListingImages(inserts);

        const coverId = rows?.[0]?.id;
        if (coverId) {
          setStage("Setting cover…");
          await setListingCoverImage(listing.id, coverId);
        }
      }

      Alert.alert("Posted", "Your listing is live.");
      setTitle("");
      setDescription("");
      setWebsiteUrl("");
      setPrice("");
      setStockQty("");
      setImages([]);
      setUseCustomSub(false);
      setCustomSub("");
      setStage(null);

      router.push("/market/(tabs)" as any);
    } catch (e: any) {
      const msg = e?.message ?? "Could not create listing";
      // Helpful hint for the exact error you're seeing
      if (String(msg).toLowerCase().includes("row-level security")) {
        Alert.alert("RLS blocked", "Your RLS policies for market_listings or market_listing_images are blocking inserts.\n\nRun the SQL policy fix I sent and try again.");
      } else {
        Alert.alert("Failed", msg);
      }
    } finally {
      setSubmitting(false);
      setStage(null);
    }
  }

  if (checkingSeller) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ marginTop: 60, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Checking seller profile…</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!hasSellerProfile) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ marginTop: 40 }}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Start selling</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>You need a Market Profile before you can post listings.</Text>

          <Pressable
            onPress={() => router.push("/market/profile/create" as any)}
            style={{ marginTop: 14, borderRadius: 18, paddingVertical: 14, alignItems: "center", backgroundColor: PURPLE, borderWidth: 1, borderColor: "rgba(124,58,237,0.8)" }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Create Market Profile</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[BG1, BG0]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Create Listing</Text>
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
          Products are physical. Services can be digital (remote) or in-person.
        </Text>

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900" }}>What are you listing?</Text>
          <Row>
            <Pill active={category === "product"} label="Product" icon="cube-outline" onPress={() => setCategory("product")} />
            <Pill active={category === "service"} label="Service" icon="sparkles-outline" onPress={() => setCategory("service")} />
          </Row>

          <Label>Delivery</Label>
          <Row>
            <Pill active={deliveryType === "physical"} label="Physical" icon="car-outline" disabled={category !== "product"} onPress={() => setDeliveryType("physical")} />
            <Pill active={deliveryType === "digital"} label="Digital" icon="cloud-outline" disabled={category !== "service"} onPress={() => setDeliveryType("digital")} />
            <Pill active={deliveryType === "in_person"} label="In-person" icon="walk-outline" disabled={category !== "service"} onPress={() => setDeliveryType("in_person")} />
          </Row>

          {category === "service" && deliveryType === "digital" ? (
            <>
              <Label>Website URL (optional)</Label>
              <Input value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://example.com" autoCapitalize="none" />
              <Text style={{ marginTop: 8, color: MUTED, fontSize: 12, lineHeight: 18 }}>
                Later you can add “preview + watermark” and partial audio/file previews. For now, we store the link in the description.
              </Text>
            </>
          ) : null}
        </CardBox>

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900" }}>Category</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>Pick a sub-category so buyers can find you faster.</Text>

          <Label>Search sub-categories</Label>
          <Input value={subSearch} onChangeText={setSubSearch} placeholder="Search… (e.g. phones, design)" />

          <Row style={{ flexWrap: "wrap" }}>
            {visibleSubs.slice(0, 18).map((c: any) => (
              <Chip key={`${c.main}:${c.slug}`} active={!useCustomSub && subCategory === c.slug} label={c.title} onPress={() => { setUseCustomSub(false); setSubCategory(c.slug); }} />
            ))}
            <Chip
              active={useCustomSub}
              label="Other…"
              onPress={() => {
                setUseCustomSub(true);
                setSubCategory("");
                if (!customSub) setCustomSub("");
              }}
            />
          </Row>

          {useCustomSub ? (
            <>
              <Label>Type your category</Label>
              <Input value={customSub} onChangeText={setCustomSub} placeholder="e.g. Website sales / SaaS / Music production" />
              <Text style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>We’ll save it as a searchable sub-category.</Text>
            </>
          ) : null}
        </CardBox>

        <CardBox>
          <Label>Title *</Label>
          <Input value={title} onChangeText={setTitle} placeholder={category === "product" ? "e.g. iPhone 12 Pro Max" : "e.g. Landing page design"} />

          <Label>Description</Label>
          <Input value={description} onChangeText={setDescription} placeholder="What the buyer gets, requirements, timeline…" multiline />

          <Label>Currency</Label>
          <Row>
            <Pill active={currency === "NGN"} label="NGN" onPress={() => setCurrency("NGN")} />
            <Pill active={currency === "USDC"} label="USDC" onPress={() => setCurrency("USDC")} />
          </Row>

          <Label>Price *</Label>
          <Input value={price} onChangeText={setPrice} placeholder="e.g. 250000" keyboardType="numeric" />

          {category === "product" ? (
            <>
              <Label>Stock qty (optional)</Label>
              <Input value={stockQty} onChangeText={setStockQty} placeholder="e.g. 5" keyboardType="numeric" />
            </>
          ) : null}
        </CardBox>

        <CardBox>
          <Text style={{ color: "#fff", fontWeight: "900" }}>Media</Text>
          <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
            {category === "product"
              ? "Add at least 1 image. The first image becomes the cover."
              : deliveryType === "digital"
              ? "Add an image OR provide a website URL. Images make your listing look more trusted."
              : "Add at least 1 image."}
          </Text>

          <Pressable
            onPress={pickImages}
            style={{
              marginTop: 12,
              height: 50,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="images-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900" }}>{images.length ? "Add more images" : "Pick images"}</Text>
          </Pressable>

          {images.length > 0 ? (
            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {images.map((img, idx) => (
                <Pressable
                  key={`${img.uri}-${idx}`}
                  onPress={() => removeImage(idx)}
                  style={{
                    width: "31%",
                    aspectRatio: 1,
                    borderRadius: 16,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Image source={{ uri: img.uri }} style={{ width: "100%", height: "100%" }} />
                  <View style={{ position: "absolute", left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 11 }}>{idx === 0 ? "Cover" : `#${idx + 1}`}</Text>
                  </View>
                  <View style={{ position: "absolute", right: 8, top: 8, width: 28, height: 28, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </CardBox>

        {stage ? (
          <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.06)", padding: 12, flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color="#fff" />
            <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900" }}>{stage}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={submitting}
          onPress={onSubmit}
          style={{
            marginTop: 14,
            borderRadius: 18,
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: PURPLE,
            borderWidth: 1,
            borderColor: "rgba(124,58,237,0.8)",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? <ActivityIndicator /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Publish listing</Text>}
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}
