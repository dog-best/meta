import { uploadToSupabaseStorage } from "@/services/market/storageUpload";
import { supabase } from "@/services/supabase";

export type MarketSellerProfile = {
  user_id: string;
  market_username: string | null;
  display_name: string | null;
  business_name: string;
  bio: string | null;
  phone: string | null;
  location_text: string | null;
  logo_path: string | null;
  banner_path: string | null;
  offers_remote: boolean;
  offers_in_person: boolean;
  is_verified: boolean;
  payout_tier: "standard" | "fast";
  active: boolean;
};

export type CreateListingInput = {
  seller_id: string;
  category: "product" | "service";
  sub_category: string; // you store slug e.g "mens-wear"
  delivery_type: "physical" | "digital" | "in_person";
  title: string;
  description?: string | null;
  price_amount: number;
  currency: "NGN" | "USDC";
  stock_qty?: number | null; // products
  availability?: any;
};

export type ListingImageInsert = {
  listing_id: string;
  storage_path: string;
  public_url: string | null;
  sort_order: number;
  meta?: any;
};

export async function getMySellerProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("market_seller_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as MarketSellerProfile | null;
}

export async function upsertSellerProfile(input: Partial<MarketSellerProfile> & { business_name: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Not authenticated");

  const payload = {
    user_id: user.id,
    business_name: input.business_name,
    market_username: input.market_username ?? null,
    display_name: input.display_name ?? null,
    bio: input.bio ?? null,
    phone: input.phone ?? null,
    location_text: input.location_text ?? null,
    address: (input as any).address ?? {},
    logo_path: input.logo_path ?? null,
    banner_path: input.banner_path ?? null,
    offers_remote: input.offers_remote ?? false,
    offers_in_person: input.offers_in_person ?? false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("market_seller_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as MarketSellerProfile;
}

export async function createListing(input: CreateListingInput) {
  const { data, error } = await supabase
    .from("market_listings")
    .insert({
      seller_id: input.seller_id,
      category: input.category,
      sub_category: input.sub_category,
      title: input.title,
      description: input.description ?? null,
      price_amount: input.price_amount,
      currency: input.currency,
      delivery_type: input.delivery_type,
      stock_qty: input.stock_qty ?? null,
      availability: input.availability ?? {},
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function setListingCoverImage(listingId: string, coverImageId: string) {
  const { error } = await supabase
    .from("market_listings")
    .update({ cover_image_id: coverImageId, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (error) throw new Error(error.message);
}

export async function insertListingImages(images: ListingImageInsert[]) {
  const { data, error } = await supabase
    .from("market_listing_images")
    .insert(images)
    .select("*");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function uploadToBucket(params: {
  bucket: string;
  path: string;
  uri: string;
  contentType: string;
}) {
  // fetch file as blob (works in Expo)

  return uploadToSupabaseStorage({
    bucket: params.bucket,
    path: params.path,
    localUri: params.uri,
    contentType: params.contentType,

  });

  
}
