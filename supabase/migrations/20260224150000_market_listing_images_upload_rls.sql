BEGIN;

-- Ensure listing images table can be read by signed-in users (for active listings)
-- and written only by the listing owner.
ALTER TABLE IF EXISTS public.market_listing_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_listing_images_select_visible ON public.market_listing_images;
CREATE POLICY market_listing_images_select_visible
ON public.market_listing_images
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.market_listings l
    WHERE l.id = market_listing_images.listing_id
      AND (l.is_active = true OR l.seller_id = auth.uid())
  )
);

DROP POLICY IF EXISTS market_listing_images_insert_owner ON public.market_listing_images;
CREATE POLICY market_listing_images_insert_owner
ON public.market_listing_images
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.market_listings l
    WHERE l.id = market_listing_images.listing_id
      AND l.seller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS market_listing_images_update_owner ON public.market_listing_images;
CREATE POLICY market_listing_images_update_owner
ON public.market_listing_images
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.market_listings l
    WHERE l.id = market_listing_images.listing_id
      AND l.seller_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.market_listings l
    WHERE l.id = market_listing_images.listing_id
      AND l.seller_id = auth.uid()
  )
);

DROP POLICY IF EXISTS market_listing_images_delete_owner ON public.market_listing_images;
CREATE POLICY market_listing_images_delete_owner
ON public.market_listing_images
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.market_listings l
    WHERE l.id = market_listing_images.listing_id
      AND l.seller_id = auth.uid()
  )
);

-- Make sure authenticated role has table privileges when RLS is enabled.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_listing_images TO authenticated;

-- Ensure listings image bucket exists and remains public for reads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-listings', 'market-listings', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

-- Storage policies: each user can manage only files under "<auth.uid()>/..."
DROP POLICY IF EXISTS market_listings_objects_select ON storage.objects;
CREATE POLICY market_listings_objects_select
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'market-listings');

DROP POLICY IF EXISTS market_listings_objects_insert_owner ON storage.objects;
CREATE POLICY market_listings_objects_insert_owner
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'market-listings'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

DROP POLICY IF EXISTS market_listings_objects_update_owner ON storage.objects;
CREATE POLICY market_listings_objects_update_owner
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'market-listings'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'market-listings'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

DROP POLICY IF EXISTS market_listings_objects_delete_owner ON storage.objects;
CREATE POLICY market_listings_objects_delete_owner
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'market-listings'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

COMMIT;
