BEGIN;

-- 1) Remove legacy/over-strict listing edit guards that block stock updates during checkout.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'market_listings'
      AND NOT t.tgisinternal
      AND (
        pg_get_functiondef(p.oid) ILIKE '%Listings cannot be edited%'
        OR pg_get_functiondef(p.oid) ILIKE '%delete and create a new listing%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.market_listings', r.tgname);
  END LOOP;
END
$$;

-- 2) Keep price/details immutable, but allow system stock updates (stock_qty/is_active/payment_options).
CREATE OR REPLACE FUNCTION public.market_listings_guard_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF
    NEW.seller_id IS DISTINCT FROM OLD.seller_id OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.sub_category IS DISTINCT FROM OLD.sub_category OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.price_amount IS DISTINCT FROM OLD.price_amount OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.delivery_type IS DISTINCT FROM OLD.delivery_type OR
    NEW.website_url IS DISTINCT FROM OLD.website_url
  THEN
    RAISE EXCEPTION 'Listings cannot be edited. To change price/details, delete and create a new listing.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_listings_guard_immutable_fields ON public.market_listings;
CREATE TRIGGER trg_market_listings_guard_immutable_fields
BEFORE UPDATE ON public.market_listings
FOR EACH ROW EXECUTE FUNCTION public.market_listings_guard_immutable_fields();

-- 3) Ensure stock reservation RPC exists and is executable by edge functions.
CREATE OR REPLACE FUNCTION public.market_reserve_listing_stock(
  p_listing_id uuid,
  p_quantity integer
)
RETURNS TABLE (
  stock_before integer,
  stock_after integer,
  depleted boolean,
  listing_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer;
  v_after integer;
  v_current_options jsonb;
BEGIN
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_id required';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1';
  END IF;

  SELECT stock_qty, COALESCE(payment_options, '{}'::jsonb)
    INTO v_before, v_current_options
  FROM public.market_listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_before IS NULL THEN
    stock_before := NULL;
    stock_after := NULL;
    depleted := false;
    listing_active := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_before < p_quantity THEN
    RAISE EXCEPTION 'Not enough stock';
  END IF;

  v_after := v_before - p_quantity;

  UPDATE public.market_listings
  SET
    stock_qty = v_after,
    is_active = CASE WHEN v_after <= 0 THEN false ELSE is_active END,
    payment_options = CASE
      WHEN v_after <= 0 THEN
        (v_current_options - 'out_of_stock' - 'out_of_stock_at') || jsonb_build_object(
          'out_of_stock', true,
          'out_of_stock_at', now()
        )
      ELSE
        (v_current_options - 'out_of_stock' - 'out_of_stock_at')
    END,
    updated_at = now()
  WHERE id = p_listing_id;

  stock_before := v_before;
  stock_after := v_after;
  depleted := (v_after <= 0);
  listing_active := (v_after > 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.market_reserve_listing_stock(uuid, integer) TO authenticated, service_role;

COMMIT;
