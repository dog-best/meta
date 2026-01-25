import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getAllCategories } from "@/services/market/categories";
import {
  createListing,
  getMySellerProfile,
  insertListingImages,
  setListingCoverImage,
  uploadToBucket,
} from "@/services/market/marketService";
import { supabase } from "@/services/supabase";

const BG0 = "#05040B";
const BG1 = "#0A0620";
const PURPLE = "#7C3AED";

type Img = { uri: string; contentType: string };

export default function SellTab() {
  const [checkingSeller, setCheckingSeller] = useState(true);
  const [hasSellerProfile, setHasSellerProfile] = useState(false);

  const [category, setCategory] = useState<"product" | "service">("product");
  const [subCategory, setSubCategory] = useState<string>("");
  const [deliveryType, setDeliveryType] = useState<"physical" | "digital" | "in_person">("physical");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<"NGN" | "USDC">("NGN");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");

  const [images, setImages] = useState<Img[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(() => getAllCategories(), []);

  useEffect(() => {
    (async () => {
      setCheckingSeller(true);
      try {
        const prof = await getMySellerProfile();
        setHasSellerProfile(!!prof?.user_id);
      } catch {
        setHasSellerProfile(false);
      } finally {
        setCheckingSeller(false);
      }
    })();
  }, []);

  useEffect(() => {
    // default subcategory for category
    const first = categories.find((c) => c.slug)?.slug ?? "";
    if (!subCategory) setSubCategory(first);
  }, [categories]);

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to upload images.");
      return;
    }

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

    if (picked.length === 0) return;

    setImages((prev) => {
      const merged = [...prev, ...picked];
      return merged.slice(0, 8); // cap
    });
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate() {
    if (!title.trim()) return "Title is required";
    if (!subCategory) return "Pick a category";
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return "Enter a valid price";
    if (category === "product") {
      const q = stockQty ? Number(stockQty) : null;
      if (q !== null && (!Number.isFinite(q) || q < 0)) return "Stock must be 0 or more";
    }
    if (images.length === 0) return "Add at least 1 image";
    return null;
  }

  async function onSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Fix this", err);
      return;
    }

    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error("Not authenticated");

      // create listing first
      const listing = await createListing({
        seller_id: user.id,
        category,
        sub_category: subCategory,
        delivery_type: deliveryType,
        title: title.trim(),
        description: description.trim() || null,
        price_amount: Number(price),
        currency,
        stock_qty: category === "product" ? (stockQty ? Number(stockQty) : null) : null,
      });

      // upload images
      const inserts: any[] = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const ext = (img.contentType.includes("png") ? "png" : "jpg") as "png" | "jpg";
        const path = `listings/${listing.id}/${i + 1}-${crypto.randomUUID()}.${ext}`;

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

      const rows = await insertListingImages(inserts);

      // set cover to first image
      if (rows?.[0]?.id) {
        await setListingCoverImage(listing.id, rows[0].id);
      }

      Alert.alert("Posted", "Your listing is live.");
      // reset form
      setTitle("");
      setDescription("");
      setPrice("");
      setStockQty("");
      setImages([]);
      router.push("/market/(tabs)");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not create listing");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSeller) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ marginTop: 60, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.7)" }}>Checking seller profile…</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!hasSellerProfile) {
    return (
      <LinearGradient colors={[BG1, BG0]} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ marginTop: 40 }}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Start selling</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
            You need a Market Profile before you can post listings.
          </Text>

          <Pressable
            onPress={() => router.push("/market/account/create-profile" as any)}
            style={{
              marginTop: 14,
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: PURPLE,
              borderWidth: 1,
              borderColor: PURPLE,
            }}
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
          Add multiple images. The first becomes the cover.
        </Text>

        <Card>
          <Row>
            <Pill active={category === "product"} onPress={() => setCategory("product")} label="Product" />
            <Pill active={category === "service"} onPress={() => setCategory("service")} label="Service" />
          </Row>

          <Label>Sub category</Label>
          <Row style={{ flexWrap: "wrap" }}>
            {categories.slice(0, 10).map((c) => (
              <Chip key={c.slug} active={subCategory === c.slug} onPress={() => setSubCategory(c.slug)} label={c.title} />
            ))}
          </Row>

          <Label>Delivery type</Label>
          <Row>
            <Pill active={deliveryType === "physical"} onPress={() => setDeliveryType("physical")} label="Physical" />
            <Pill active={deliveryType === "digital"} onPress={() => setDeliveryType("digital")} label="Digital" />
            <Pill active={deliveryType === "in_person"} onPress={() => setDeliveryType("in_person")} label="In-person" />
          </Row>
        </Card>

        <Card>
          <Label>Title *</Label>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. iPhone 12 Pro Max" />

          <Label>Description</Label>
          <Input value={description} onChangeText={setDescription} placeholder="Condition, specs, what buyer gets..." multiline />

          <Label>Currency</Label>
          <Row>
            <Pill active={currency === "NGN"} onPress={() => setCurrency("NGN")} label="NGN" />
            <Pill active={currency === "USDC"} onPress={() => setCurrency("USDC")} label="USDC" />
          </Row>

          <Label>Price *</Label>
          <Input value={price} onChangeText={setPrice} placeholder="e.g. 250000" keyboardType="numeric" />

          {category === "product" && (
            <>
              <Label>Stock qty (optional)</Label>
              <Input value={stockQty} onChangeText={setStockQty} placeholder="e.g. 5" keyboardType="numeric" />
            </>
          )}
        </Card>

        <Card>
          <Text style={{ color: "#fff", fontWeight: "900" }}>Images *</Text>
          <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
            Add up to 8 images. First is cover.
          </Text>

          <Pressable onPress={pickImages} style={Btn}>
            <Ionicons name="images-outline" size={18} color="#fff" />
            <Text style={BtnText}>{images.length ? "Add more images" : "Pick images"}</Text>
          </Pressable>

          {images.length > 0 && (
            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {images.map((img, idx) => (
                <Pressable
                  key={`${img.uri}-${idx}`}
                  onLongPress={() => removeImage(idx)}
                  style={{
                    width: "31%",
                    height: 86,
                    borderRadius: 16,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>{idx === 0 ? "Cover" : `#${idx + 1}`}</Text>
                  <Text style={{ marginTop: 4, color: "rgba(255,255,255,0.55)", fontSize: 11 }}>Hold to remove</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

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
            borderColor: PURPLE,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? <ActivityIndicator /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Publish listing</Text>}
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

function Card({ children }: any) {
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: 22,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </View>
  );
}

function Label({ children }: any) {
  return <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800", marginTop: 10, fontSize: 12 }}>{children}</Text>;
}

function Input(props: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="rgba(255,255,255,0.35)"
      style={{
        marginTop: 8,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: "#fff",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    />
  );
}

function Row({ children, style }: any) {
  return <View style={[{ flexDirection: "row", gap: 10, marginTop: 10 }, style]}>{children}</View>;
}

function Pill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: active ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.10)",
      }}
    >
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

const Btn = {
  height: 50,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  flexDirection: "row" as const,
  gap: 10,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  marginTop: 12,
};

const BtnText = { color: "#fff", fontWeight: "900" as const };
