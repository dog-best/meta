BEGIN;

CREATE OR REPLACE FUNCTION public.market_stock_enforce_create_permission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_create boolean;
BEGIN
  SELECT p.can_create
  INTO v_can_create
  FROM public.store_identity_permissions p
  WHERE p.store_id = NEW.store_id;

  IF coalesce(v_can_create, true) = false THEN
    RAISE EXCEPTION 'Store cannot create stock identity right now';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_stock_lock_create_after_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.store_identity_permissions (store_id, can_create)
  VALUES (NEW.store_id, false)
  ON CONFLICT (store_id)
  DO UPDATE
    SET can_create = false,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_stock_enforce_create_permission ON public.market_stock_identities;
CREATE TRIGGER trg_market_stock_enforce_create_permission
BEFORE INSERT ON public.market_stock_identities
FOR EACH ROW
EXECUTE FUNCTION public.market_stock_enforce_create_permission();

DROP TRIGGER IF EXISTS trg_market_stock_lock_create_after_insert ON public.market_stock_identities;
CREATE TRIGGER trg_market_stock_lock_create_after_insert
AFTER INSERT ON public.market_stock_identities
FOR EACH ROW
EXECUTE FUNCTION public.market_stock_lock_create_after_insert();

COMMIT;