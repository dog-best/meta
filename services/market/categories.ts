export type MarketMainCategory = "product" | "service";

export type ProductCategorySlug =
  | "mens-fashion"
  | "womens-fashion"
  | "kids-fashion"
  | "shoes-bags"
  | "phones-accessories"
  | "electronics"
  | "computing"
  | "home-kitchen"
  | "beauty-health"
  | "groceries"
  | "sports-outdoors"
  | "automobile"
  | "furniture-decor"
  | "baby-maternity"
  | "books-stationery"
  | "pets"
  | "gaming"
  | "tools-hardware";

export type ServiceCategorySlug =
  | "remote-services"
  | "in-person-services"
  | "digital-deliverables"
  | "repairs-maintenance"
  | "cleaning"
  | "beauty-wellness"
  | "events"
  | "education"
  | "video-audio"
  | "web-mobile-dev"
  | "graphics-branding"
  | "marketing-growth"
  | "writing-translation"
  | "virtual-assistance"
  | "it-support"
  | "photography";

export type CategorySlug = ProductCategorySlug | ServiceCategorySlug;

export type CategoryItem = {
  main: MarketMainCategory;
  slug: CategorySlug;
  title: string;
  subtitle: string;
  icon: string; // Ionicons name
};

export const PRODUCT_CATEGORIES: CategoryItem[] = [
  { main: "product", slug: "mens-fashion", title: "Men’s Wear", subtitle: "Clothes & accessories", icon: "shirt-outline" },
  { main: "product", slug: "womens-fashion", title: "Women’s Wear", subtitle: "Fashion & beauty", icon: "sparkles-outline" },
  { main: "product", slug: "kids-fashion", title: "Kids", subtitle: "Clothes & toys", icon: "happy-outline" },
  { main: "product", slug: "shoes-bags", title: "Shoes & Bags", subtitle: "Footwear & bags", icon: "bag-outline" },
  { main: "product", slug: "phones-accessories", title: "Phones", subtitle: "Devices & accessories", icon: "phone-portrait-outline" },
  { main: "product", slug: "electronics", title: "Electronics", subtitle: "TV, audio, gadgets", icon: "tv-outline" },
  { main: "product", slug: "computing", title: "Computing", subtitle: "Laptops & parts", icon: "laptop-outline" },
  { main: "product", slug: "home-kitchen", title: "Home & Kitchen", subtitle: "Appliances & decor", icon: "home-outline" },
  { main: "product", slug: "beauty-health", title: "Health & Beauty", subtitle: "Care & wellness", icon: "heart-outline" },
  { main: "product", slug: "groceries", title: "Groceries", subtitle: "Food & essentials", icon: "cart-outline" },
  { main: "product", slug: "sports-outdoors", title: "Sports", subtitle: "Fitness & outdoor", icon: "bicycle-outline" },
  { main: "product", slug: "automobile", title: "Automobile", subtitle: "Car parts & tools", icon: "car-outline" },

  { main: "product", slug: "furniture-decor", title: "Furniture & Decor", subtitle: "Sofas, beds, interior", icon: "bed-outline" },
  { main: "product", slug: "baby-maternity", title: "Baby & Maternity", subtitle: "Baby care & essentials", icon: "flower-outline" },
  { main: "product", slug: "books-stationery", title: "Books & Stationery", subtitle: "Books, office supplies", icon: "book-outline" },
  { main: "product", slug: "pets", title: "Pets", subtitle: "Food & accessories", icon: "paw-outline" },
  { main: "product", slug: "gaming", title: "Gaming", subtitle: "Consoles & accessories", icon: "game-controller-outline" },
  { main: "product", slug: "tools-hardware", title: "Tools & Hardware", subtitle: "Tools, power, fittings", icon: "hammer-outline" },
];

export const SERVICE_CATEGORIES: CategoryItem[] = [
  { main: "service", slug: "remote-services", title: "Remote Services", subtitle: "Online work & gigs", icon: "cloud-outline" },
  { main: "service", slug: "in-person-services", title: "In-Person Services", subtitle: "On-site services", icon: "walk-outline" },
  { main: "service", slug: "digital-deliverables", title: "Digital Delivery", subtitle: "Files & online work", icon: "document-outline" },
  { main: "service", slug: "repairs-maintenance", title: "Repairs", subtitle: "Fixing & maintenance", icon: "construct-outline" },
  { main: "service", slug: "cleaning", title: "Cleaning", subtitle: "Home & office", icon: "sparkles-outline" },
  { main: "service", slug: "beauty-wellness", title: "Beauty & Wellness", subtitle: "Barbing, spa, etc", icon: "cut-outline" },
  { main: "service", slug: "events", title: "Events", subtitle: "Planning & support", icon: "calendar-outline" },
  { main: "service", slug: "education", title: "Education", subtitle: "Tutoring & lessons", icon: "school-outline" },

  { main: "service", slug: "web-mobile-dev", title: "Website & App Building", subtitle: "Websites, apps, fixes", icon: "code-slash-outline" },
  { main: "service", slug: "video-audio", title: "Video & Audio Editing", subtitle: "Editing, mixing, ads", icon: "videocam-outline" },
  { main: "service", slug: "graphics-branding", title: "Design & Branding", subtitle: "Logos, flyers, UI/UX", icon: "color-palette-outline" },
  { main: "service", slug: "marketing-growth", title: "Marketing & Growth", subtitle: "Ads, SEO, social media", icon: "trending-up-outline" },
  { main: "service", slug: "writing-translation", title: "Writing & Translation", subtitle: "Copywriting, CVs, docs", icon: "create-outline" },
  { main: "service", slug: "virtual-assistance", title: "Virtual Assistance", subtitle: "Admin, research, support", icon: "headset-outline" },
  { main: "service", slug: "it-support", title: "IT Support", subtitle: "Tech support & setup", icon: "settings-outline" },
  { main: "service", slug: "photography", title: "Photography", subtitle: "Shoots & editing", icon: "camera-outline" },
];

export function getAllCategories() {
  return [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES];
}

export function getCategoryBySlug(slug: string) {
  return getAllCategories().find((c) => c.slug === slug) ?? null;
}

/** ✅ NEW: One map for both tabs + home dropdowns */
export const CATEGORIES_BY_MAIN: Record<MarketMainCategory, CategoryItem[]> = {
  product: PRODUCT_CATEGORIES,
  service: SERVICE_CATEGORIES,
};

/** ✅ NEW: Filtered list by main (for dropdown / tab) */
export function getCategoriesByMain(main: MarketMainCategory) {
  return CATEGORIES_BY_MAIN[main];
}

/** ✅ NEW: Quick title lookup */
export function getCategoryTitle(slug?: string | null) {
  if (!slug) return null;
  return getCategoryBySlug(slug)?.title ?? null;
}
