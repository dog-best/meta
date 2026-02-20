BEGIN;

CREATE TABLE IF NOT EXISTS public.market_transaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN (
      'deposit',
      'withdrawal',
      'transfer_in',
      'transfer_out',
      'market_buy',
      'market_sell',
      'market_crypto',
      'stock_buy',
      'stock_sell',
      'stock_profit',
      'fee',
      'refund',
      'release'
    )
  ),
  title text NOT NULL,
  amount numeric(20,8) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'SUCCESS',
  tx_hash text,
  order_id uuid REFERENCES public.market_orders(id) ON DELETE SET NULL,
  stock_id uuid REFERENCES public.market_stock_identities(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_transaction_history_source_uidx
  ON public.market_transaction_history (user_id, source_table, source_id, kind);

CREATE INDEX IF NOT EXISTS market_transaction_history_user_time_idx
  ON public.market_transaction_history (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS market_transaction_history_tx_hash_idx
  ON public.market_transaction_history (tx_hash)
  WHERE tx_hash IS NOT NULL;

ALTER TABLE public.market_transaction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_transaction_history_read_own ON public.market_transaction_history;
CREATE POLICY market_transaction_history_read_own
ON public.market_transaction_history
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.market_history_upsert(
  p_user_id uuid,
  p_source_table text,
  p_source_id text,
  p_kind text,
  p_title text,
  p_amount numeric,
  p_currency text,
  p_status text DEFAULT 'SUCCESS',
  p_tx_hash text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_stock_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.market_transaction_history (
    user_id,
    source_table,
    source_id,
    kind,
    title,
    amount,
    currency,
    status,
    tx_hash,
    order_id,
    stock_id,
    details,
    occurred_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_source_table,
    p_source_id,
    p_kind,
    p_title,
    COALESCE(p_amount, 0),
    UPPER(COALESCE(NULLIF(TRIM(p_currency), ''), 'USD')),
    UPPER(COALESCE(NULLIF(TRIM(p_status), ''), 'SUCCESS')),
    NULLIF(TRIM(p_tx_hash), ''),
    p_order_id,
    p_stock_id,
    COALESCE(p_details, '{}'::jsonb),
    COALESCE(p_occurred_at, now()),
    now()
  )
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    tx_hash = COALESCE(EXCLUDED.tx_hash, public.market_transaction_history.tx_hash),
    order_id = COALESCE(EXCLUDED.order_id, public.market_transaction_history.order_id),
    stock_id = COALESCE(EXCLUDED.stock_id, public.market_transaction_history.stock_id),
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_order_history_status(p_status public.market_order_status)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IN ('CREATED','IN_ESCROW','OUT_FOR_DELIVERY','DELIVERED') THEN 'PENDING'
    WHEN p_status = 'RELEASED' THEN 'SUCCESS'
    WHEN p_status = 'REFUNDED' THEN 'REFUNDED'
    WHEN p_status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'PENDING'
  END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_title text;
  v_currency text;
BEGIN
  v_kind := CASE lower(COALESCE(NEW.type, ''))
    WHEN 'deposit' THEN 'deposit'
    WHEN 'withdrawal' THEN 'withdrawal'
    WHEN 'transfer_in' THEN 'transfer_in'
    WHEN 'transfer_out' THEN 'transfer_out'
    WHEN 'bill' THEN 'fee'
    WHEN 'fee' THEN 'fee'
    ELSE 'fee'
  END;

  v_title := CASE lower(COALESCE(NEW.type, ''))
    WHEN 'deposit' THEN 'NGN wallet deposit'
    WHEN 'withdrawal' THEN 'NGN wallet withdrawal'
    WHEN 'transfer_in' THEN 'Wallet transfer received'
    WHEN 'transfer_out' THEN 'Wallet transfer sent'
    WHEN 'bill' THEN 'Wallet bill payment'
    WHEN 'fee' THEN 'Wallet fee'
    ELSE 'Wallet transaction'
  END;

  v_currency := UPPER(COALESCE(NULLIF(TRIM(COALESCE(NEW.meta->>'currency', '')), ''), 'NGN'));

  PERFORM public.market_history_upsert(
    NEW.user_id,
    'app_wallet_tx_simple',
    NEW.id::text,
    v_kind,
    v_title,
    COALESCE(NEW.amount, 0),
    v_currency,
    'SUCCESS',
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'reference', NEW.reference,
      'meta', COALESCE(NEW.meta, '{}'::jsonb)
    ),
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_buyer_total numeric;
  v_seller_total numeric;
  v_occurred_at timestamptz;
  v_currency text;
BEGIN
  v_status := public.market_order_history_status(NEW.status);
  v_currency := UPPER(COALESCE(NEW.currency::text, 'USD'));
  v_buyer_total := COALESCE(NEW.amount, 0) + COALESCE(NEW.fee_amount, 0);
  v_seller_total := COALESCE(NEW.amount, 0);
  v_occurred_at := COALESCE(
    NEW.released_at,
    NEW.refunded_at,
    NEW.cancelled_at,
    NEW.delivered_at,
    NEW.out_for_delivery_at,
    NEW.in_escrow_at,
    NEW.created_at,
    now()
  );

  PERFORM public.market_history_upsert(
    NEW.buyer_id,
    'market_orders',
    NEW.id::text || ':buyer',
    'market_buy',
    'Marketplace purchase',
    v_buyer_total,
    v_currency,
    v_status,
    NULL,
    NEW.id,
    NULL,
    jsonb_build_object(
      'role', 'buyer',
      'order_status', NEW.status,
      'listing_id', NEW.listing_id,
      'quantity', NEW.quantity,
      'unit_price', NEW.unit_price,
      'base_amount', NEW.amount,
      'fee_amount', NEW.fee_amount
    ),
    v_occurred_at
  );

  PERFORM public.market_history_upsert(
    NEW.seller_id,
    'market_orders',
    NEW.id::text || ':seller',
    'market_sell',
    'Marketplace sale',
    v_seller_total,
    v_currency,
    v_status,
    NULL,
    NEW.id,
    NULL,
    jsonb_build_object(
      'role', 'seller',
      'order_status', NEW.status,
      'listing_id', NEW.listing_id,
      'quantity', NEW.quantity,
      'unit_price', NEW.unit_price,
      'base_amount', NEW.amount,
      'fee_amount', NEW.fee_amount
    ),
    v_occurred_at
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_crypto_intent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_seller uuid;
  v_currency text;
  v_user_id uuid;
  v_title text;
BEGIN
  SELECT o.buyer_id, o.seller_id, UPPER(COALESCE(o.currency::text, 'USDC'))
    INTO v_buyer, v_seller, v_currency
  FROM public.market_orders o
  WHERE o.id = NEW.order_id;

  IF v_buyer IS NULL AND v_seller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.intent_type = 'DEPOSIT' THEN
    v_user_id := v_buyer;
    v_title := 'Crypto escrow deposit';
  ELSIF NEW.intent_type = 'RELEASE' THEN
    v_user_id := v_seller;
    v_title := 'Crypto escrow release';
  ELSIF NEW.intent_type = 'REFUND' THEN
    v_user_id := v_buyer;
    v_title := 'Crypto escrow refund';
  ELSE
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.market_history_upsert(
    v_user_id,
    'market_crypto_intents',
    NEW.id::text,
    'market_crypto',
    v_title,
    COALESCE(NEW.amount_units, 0),
    v_currency,
    UPPER(COALESCE(NEW.status::text, 'PENDING')),
    NULLIF(TRIM(COALESCE(NEW.tx_hash, '')), ''),
    NEW.order_id,
    NULL,
    jsonb_build_object(
      'intent_type', NEW.intent_type,
      'chain', NEW.chain,
      'from_wallet', NEW.from_wallet,
      'to_wallet', NEW.to_wallet,
      'amount_raw', NEW.amount_raw,
      'client_reference', NEW.client_reference
    ),
    COALESCE(NEW.updated_at, NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_stock_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_symbol text;
  v_name text;
  v_kind text;
  v_title text;
BEGIN
  SELECT i.symbol, i.name
    INTO v_symbol, v_name
  FROM public.market_stock_identities i
  WHERE i.id = NEW.stock_id;

  v_kind := CASE WHEN NEW.side = 'sell' THEN 'stock_sell' ELSE 'stock_buy' END;
  v_title := CASE
    WHEN NEW.side = 'sell' THEN 'Stock sell: ' || COALESCE(v_symbol, 'STOCK')
    ELSE 'Stock buy: ' || COALESCE(v_symbol, 'STOCK')
  END;

  PERFORM public.market_history_upsert(
    NEW.user_id,
    'market_stock_trades',
    NEW.id::text,
    v_kind,
    v_title,
    COALESCE(NEW.notional_usdc, 0),
    'USDC',
    'SUCCESS',
    NULLIF(TRIM(COALESCE(NEW.chain_tx_hash, '')), ''),
    NULL,
    NEW.stock_id,
    jsonb_build_object(
      'stock_name', v_name,
      'stock_symbol', v_symbol,
      'side', NEW.side,
      'price_usdc', NEW.price_usdc,
      'quantity', NEW.quantity,
      'fee_usdc', NEW.fee_usdc,
      'traded_at', NEW.traded_at
    ),
    COALESCE(NEW.traded_at, NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_stock_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta numeric;
  v_symbol text;
  v_title text;
  v_source text;
BEGIN
  v_delta := COALESCE(NEW.realized_pnl_usdc, 0) - COALESCE(OLD.realized_pnl_usdc, 0);
  IF v_delta = 0 THEN
    RETURN NEW;
  END IF;

  SELECT i.symbol INTO v_symbol
  FROM public.market_stock_identities i
  WHERE i.id = NEW.stock_id;

  IF v_delta >= 0 THEN
    v_title := 'Realized stock profit: ' || COALESCE(v_symbol, 'STOCK');
  ELSE
    v_title := 'Realized stock loss: ' || COALESCE(v_symbol, 'STOCK');
  END IF;

  v_source := NEW.stock_id::text || ':' || NEW.user_id::text || ':' || to_char(COALESCE(NEW.updated_at, now()), 'YYYYMMDDHH24MISSMS');

  PERFORM public.market_history_upsert(
    NEW.user_id,
    'market_stock_positions',
    v_source,
    'stock_profit',
    v_title,
    v_delta,
    'USDC',
    'SUCCESS',
    NULL,
    NULL,
    NEW.stock_id,
    jsonb_build_object(
      'balance_qty', NEW.balance_qty,
      'avg_cost_usdc', NEW.avg_cost_usdc,
      'realized_pnl_usdc_total', NEW.realized_pnl_usdc
    ),
    COALESCE(NEW.updated_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_listing_has_open_orders(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.market_orders o
    WHERE o.listing_id = p_listing_id
      AND o.status IN ('CREATED', 'IN_ESCROW', 'OUT_FOR_DELIVERY', 'DELIVERED')
  );
$$;

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

DROP TRIGGER IF EXISTS trg_market_history_wallet_tx ON public.app_wallet_tx_simple;
CREATE TRIGGER trg_market_history_wallet_tx
AFTER INSERT ON public.app_wallet_tx_simple
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_wallet_tx();

DROP TRIGGER IF EXISTS trg_market_history_order ON public.market_orders;
CREATE TRIGGER trg_market_history_order
AFTER INSERT OR UPDATE OF status, amount, fee_amount, currency, in_escrow_at, out_for_delivery_at, delivered_at, released_at, refunded_at, cancelled_at
ON public.market_orders
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_order();

DROP TRIGGER IF EXISTS trg_market_history_crypto_intent ON public.market_crypto_intents;
CREATE TRIGGER trg_market_history_crypto_intent
AFTER INSERT OR UPDATE OF status, tx_hash, amount_units, intent_type
ON public.market_crypto_intents
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_crypto_intent();

DROP TRIGGER IF EXISTS trg_market_history_stock_trade ON public.market_stock_trades;
CREATE TRIGGER trg_market_history_stock_trade
AFTER INSERT ON public.market_stock_trades
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_stock_trade();

DROP TRIGGER IF EXISTS trg_market_history_stock_position ON public.market_stock_positions;
CREATE TRIGGER trg_market_history_stock_position
AFTER UPDATE OF realized_pnl_usdc ON public.market_stock_positions
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_stock_position();

GRANT SELECT ON public.market_transaction_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.market_history_upsert(uuid, text, text, text, text, numeric, text, text, text, uuid, uuid, jsonb, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_listing_has_open_orders(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_reserve_listing_stock(uuid, integer) TO authenticated, service_role;

COMMIT;
