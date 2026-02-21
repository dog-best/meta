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

CREATE OR REPLACE FUNCTION public.market_history_withdrawal_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_status, ''))
    WHEN 'successful' THEN 'SUCCESS'
    WHEN 'processing' THEN 'PENDING'
    WHEN 'pending' THEN 'PENDING'
    WHEN 'failed' THEN 'FAILED'
    WHEN 'reversed' THEN 'FAILED'
    WHEN 'refunded' THEN 'REFUNDED'
    ELSE 'PENDING'
  END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
  v_amount numeric;
BEGIN
  v_currency := UPPER(COALESCE(NULLIF(TRIM(COALESCE(NEW.meta->>'currency', '')), ''), 'NGN'));
  v_amount := COALESCE(NEW.total_debit, COALESCE(NEW.amount, 0) + COALESCE(NEW.fee, 0), 0);

  PERFORM public.market_history_upsert(
    NEW.user_id,
    'withdrawals_simple',
    NEW.id::text,
    'withdrawal',
    'Bank withdrawal',
    v_amount,
    v_currency,
    public.market_history_withdrawal_status(NEW.status),
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'status', NEW.status,
      'bank_name', NEW.bank_name,
      'account_number', NEW.account_number,
      'account_name', NEW.account_name,
      'paystack_reference', NEW.paystack_reference,
      'paystack_transfer_code', NEW.paystack_transfer_code,
      'meta', COALESCE(NEW.meta, '{}'::jsonb)
    ),
    COALESCE(NEW.updated_at, NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_paystack_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text;
BEGIN
  v_currency := UPPER(COALESCE(NULLIF(TRIM(COALESCE(NEW.raw->>'currency', '')), ''), 'NGN'));

  PERFORM public.market_history_upsert(
    NEW.user_id,
    'paystack_events_simple',
    NEW.reference,
    'deposit',
    'Paystack deposit received',
    COALESCE(NEW.amount, 0),
    v_currency,
    'SUCCESS',
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'reference', NEW.reference,
      'fee', NEW.fee,
      'raw', COALESCE(NEW.raw, '{}'::jsonb)
    ),
    COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_from_chain_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid;
  v_seller uuid;
  v_currency text;
  v_event text;
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

  v_event := UPPER(COALESCE(NEW.event_type::text, ''));

  IF v_event LIKE '%DEPOSIT%' THEN
    v_user_id := v_buyer;
    v_title := 'On-chain escrow deposit confirmed';
  ELSIF v_event LIKE '%RELEASE%' THEN
    v_user_id := v_seller;
    v_title := 'On-chain escrow release confirmed';
  ELSIF v_event LIKE '%REFUND%' THEN
    v_user_id := v_buyer;
    v_title := 'On-chain escrow refund confirmed';
  ELSE
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.market_history_upsert(
    v_user_id,
    'market_chain_events',
    NEW.id::text,
    'market_crypto',
    v_title,
    COALESCE(NEW.amount_units, 0),
    v_currency,
    'CONFIRMED',
    NULLIF(TRIM(COALESCE(NEW.tx_hash, '')), ''),
    NEW.order_id,
    NULL,
    jsonb_build_object(
      'event_type', NEW.event_type,
      'chain', NEW.chain,
      'log_index', NEW.log_index,
      'block_number', NEW.block_number,
      'buyer_wallet', NEW.buyer_wallet,
      'seller_wallet', NEW.seller_wallet,
      'amount_raw', NEW.amount_raw,
      'raw', COALESCE(NEW.raw, '{}'::jsonb)
    ),
    COALESCE(NEW.block_time, NEW.created_at, now())
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_backfill_user(
  p_user_id uuid,
  p_limit integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 50000);
  v_rows bigint := 0;
  v_added bigint := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    t.user_id,
    'app_wallet_tx_simple',
    t.id::text,
    CASE lower(COALESCE(t.type, ''))
      WHEN 'deposit' THEN 'deposit'
      WHEN 'withdrawal' THEN 'withdrawal'
      WHEN 'transfer_in' THEN 'transfer_in'
      WHEN 'transfer_out' THEN 'transfer_out'
      WHEN 'bill' THEN 'fee'
      WHEN 'fee' THEN 'fee'
      ELSE 'fee'
    END,
    CASE lower(COALESCE(t.type, ''))
      WHEN 'deposit' THEN 'NGN wallet deposit'
      WHEN 'withdrawal' THEN 'NGN wallet withdrawal'
      WHEN 'transfer_in' THEN 'Wallet transfer received'
      WHEN 'transfer_out' THEN 'Wallet transfer sent'
      WHEN 'bill' THEN 'Wallet bill payment'
      WHEN 'fee' THEN 'Wallet fee'
      ELSE 'Wallet transaction'
    END,
    COALESCE(t.amount, 0),
    UPPER(COALESCE(NULLIF(TRIM(COALESCE(t.meta->>'currency', '')), ''), 'NGN')),
    'SUCCESS',
    NULL,
    NULL,
    NULL,
    jsonb_build_object('reference', t.reference, 'meta', COALESCE(t.meta, '{}'::jsonb)),
    COALESCE(t.created_at, now()),
    now()
  FROM public.app_wallet_tx_simple t
  WHERE t.user_id = p_user_id
  ORDER BY t.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    w.user_id,
    'withdrawals_simple',
    w.id::text,
    'withdrawal',
    'Bank withdrawal',
    COALESCE(w.total_debit, COALESCE(w.amount, 0) + COALESCE(w.fee, 0), 0),
    UPPER(COALESCE(NULLIF(TRIM(COALESCE(w.meta->>'currency', '')), ''), 'NGN')),
    public.market_history_withdrawal_status(w.status),
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'status', w.status,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_name', w.account_name,
      'paystack_reference', w.paystack_reference,
      'paystack_transfer_code', w.paystack_transfer_code,
      'meta', COALESCE(w.meta, '{}'::jsonb)
    ),
    COALESCE(w.updated_at, w.created_at, now()),
    now()
  FROM public.withdrawals_simple w
  WHERE w.user_id = p_user_id
  ORDER BY w.updated_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    p.user_id,
    'paystack_events_simple',
    p.reference,
    'deposit',
    'Paystack deposit received',
    COALESCE(p.amount, 0),
    UPPER(COALESCE(NULLIF(TRIM(COALESCE(p.raw->>'currency', '')), ''), 'NGN')),
    'SUCCESS',
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'reference', p.reference,
      'fee', p.fee,
      'raw', COALESCE(p.raw, '{}'::jsonb)
    ),
    COALESCE(p.created_at, now()),
    now()
  FROM public.paystack_events_simple p
  WHERE p.user_id = p_user_id
  ORDER BY p.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    o.buyer_id,
    'market_orders',
    o.id::text || ':buyer',
    'market_buy',
    'Marketplace purchase',
    COALESCE(o.amount, 0) + COALESCE(o.fee_amount, 0),
    UPPER(COALESCE(o.currency::text, 'USD')),
    public.market_order_history_status(o.status),
    NULL,
    o.id,
    NULL,
    jsonb_build_object(
      'role', 'buyer',
      'order_status', o.status,
      'listing_id', o.listing_id,
      'quantity', o.quantity,
      'unit_price', o.unit_price,
      'base_amount', o.amount,
      'fee_amount', o.fee_amount
    ),
    COALESCE(o.released_at, o.refunded_at, o.cancelled_at, o.delivered_at, o.in_escrow_at, o.created_at, now()),
    now()
  FROM public.market_orders o
  WHERE o.buyer_id = p_user_id
  ORDER BY o.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    o.seller_id,
    'market_orders',
    o.id::text || ':seller',
    'market_sell',
    'Marketplace sale',
    COALESCE(o.amount, 0),
    UPPER(COALESCE(o.currency::text, 'USD')),
    public.market_order_history_status(o.status),
    NULL,
    o.id,
    NULL,
    jsonb_build_object(
      'role', 'seller',
      'order_status', o.status,
      'listing_id', o.listing_id,
      'quantity', o.quantity,
      'unit_price', o.unit_price,
      'base_amount', o.amount,
      'fee_amount', o.fee_amount
    ),
    COALESCE(o.released_at, o.refunded_at, o.cancelled_at, o.delivered_at, o.in_escrow_at, o.created_at, now()),
    now()
  FROM public.market_orders o
  WHERE o.seller_id = p_user_id
  ORDER BY o.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    CASE
      WHEN i.intent_type = 'DEPOSIT' THEN o.buyer_id
      WHEN i.intent_type = 'REFUND' THEN o.buyer_id
      WHEN i.intent_type = 'RELEASE' THEN o.seller_id
      ELSE NULL
    END AS user_id,
    'market_crypto_intents',
    i.id::text,
    'market_crypto',
    CASE
      WHEN i.intent_type = 'DEPOSIT' THEN 'Crypto escrow deposit'
      WHEN i.intent_type = 'RELEASE' THEN 'Crypto escrow release'
      WHEN i.intent_type = 'REFUND' THEN 'Crypto escrow refund'
      ELSE 'Crypto escrow activity'
    END,
    COALESCE(i.amount_units, 0),
    UPPER(COALESCE(o.currency::text, 'USDC')),
    UPPER(COALESCE(i.status::text, 'PENDING')),
    NULLIF(TRIM(COALESCE(i.tx_hash, '')), ''),
    i.order_id,
    NULL,
    jsonb_build_object(
      'intent_type', i.intent_type,
      'chain', i.chain,
      'from_wallet', i.from_wallet,
      'to_wallet', i.to_wallet,
      'amount_raw', i.amount_raw,
      'client_reference', i.client_reference
    ),
    COALESCE(i.updated_at, i.created_at, now()),
    now()
  FROM public.market_crypto_intents i
  JOIN public.market_orders o ON o.id = i.order_id
  WHERE (
      (i.intent_type IN ('DEPOSIT', 'REFUND') AND o.buyer_id = p_user_id)
      OR (i.intent_type = 'RELEASE' AND o.seller_id = p_user_id)
    )
  ORDER BY i.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    tx_hash = COALESCE(EXCLUDED.tx_hash, public.market_transaction_history.tx_hash),
    order_id = COALESCE(EXCLUDED.order_id, public.market_transaction_history.order_id),
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    CASE
      WHEN UPPER(COALESCE(e.event_type::text, '')) LIKE '%DEPOSIT%' THEN o.buyer_id
      WHEN UPPER(COALESCE(e.event_type::text, '')) LIKE '%REFUND%' THEN o.buyer_id
      WHEN UPPER(COALESCE(e.event_type::text, '')) LIKE '%RELEASE%' THEN o.seller_id
      ELSE NULL
    END AS user_id,
    'market_chain_events',
    e.id::text,
    'market_crypto',
    'On-chain escrow event confirmed',
    COALESCE(e.amount_units, 0),
    UPPER(COALESCE(o.currency::text, 'USDC')),
    'CONFIRMED',
    NULLIF(TRIM(COALESCE(e.tx_hash, '')), ''),
    e.order_id,
    NULL,
    jsonb_build_object(
      'event_type', e.event_type,
      'chain', e.chain,
      'log_index', e.log_index,
      'block_number', e.block_number,
      'buyer_wallet', e.buyer_wallet,
      'seller_wallet', e.seller_wallet,
      'amount_raw', e.amount_raw,
      'raw', COALESCE(e.raw, '{}'::jsonb)
    ),
    COALESCE(e.block_time, e.created_at, now()),
    now()
  FROM public.market_chain_events e
  JOIN public.market_orders o ON o.id = e.order_id
  WHERE (
      (UPPER(COALESCE(e.event_type::text, '')) LIKE '%DEPOSIT%' AND o.buyer_id = p_user_id)
      OR (UPPER(COALESCE(e.event_type::text, '')) LIKE '%REFUND%' AND o.buyer_id = p_user_id)
      OR (UPPER(COALESCE(e.event_type::text, '')) LIKE '%RELEASE%' AND o.seller_id = p_user_id)
    )
  ORDER BY e.created_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    tx_hash = COALESCE(EXCLUDED.tx_hash, public.market_transaction_history.tx_hash),
    order_id = COALESCE(EXCLUDED.order_id, public.market_transaction_history.order_id),
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    t.user_id,
    'market_stock_trades',
    t.id::text,
    CASE WHEN t.side = 'sell' THEN 'stock_sell' ELSE 'stock_buy' END,
    CASE WHEN t.side = 'sell' THEN 'Stock sell: ' || COALESCE(i.symbol, 'STOCK') ELSE 'Stock buy: ' || COALESCE(i.symbol, 'STOCK') END,
    COALESCE(t.notional_usdc, 0),
    'USDC',
    'SUCCESS',
    NULLIF(TRIM(COALESCE(t.chain_tx_hash, '')), ''),
    NULL,
    t.stock_id,
    jsonb_build_object(
      'stock_name', i.name,
      'stock_symbol', i.symbol,
      'side', t.side,
      'price_usdc', t.price_usdc,
      'quantity', t.quantity,
      'fee_usdc', t.fee_usdc,
      'traded_at', t.traded_at
    ),
    COALESCE(t.traded_at, t.created_at, now()),
    now()
  FROM public.market_stock_trades t
  LEFT JOIN public.market_stock_identities i ON i.id = t.stock_id
  WHERE t.user_id = p_user_id
  ORDER BY t.traded_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    tx_hash = COALESCE(EXCLUDED.tx_hash, public.market_transaction_history.tx_hash),
    stock_id = COALESCE(EXCLUDED.stock_id, public.market_transaction_history.stock_id),
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  INSERT INTO public.market_transaction_history (
    user_id, source_table, source_id, kind, title, amount, currency, status, tx_hash, order_id, stock_id, details, occurred_at, updated_at
  )
  SELECT
    p.user_id,
    'market_stock_positions',
    p.stock_id::text || ':' || p.user_id::text || ':snapshot',
    'stock_profit',
    CASE
      WHEN COALESCE(p.realized_pnl_usdc, 0) >= 0 THEN 'Realized stock profit: ' || COALESCE(i.symbol, 'STOCK')
      ELSE 'Realized stock loss: ' || COALESCE(i.symbol, 'STOCK')
    END,
    COALESCE(p.realized_pnl_usdc, 0),
    'USDC',
    'SUCCESS',
    NULL,
    NULL,
    p.stock_id,
    jsonb_build_object(
      'stock_name', i.name,
      'stock_symbol', i.symbol,
      'balance_qty', p.balance_qty,
      'avg_cost_usdc', p.avg_cost_usdc,
      'realized_pnl_usdc_total', p.realized_pnl_usdc
    ),
    COALESCE(p.updated_at, now()),
    now()
  FROM public.market_stock_positions p
  LEFT JOIN public.market_stock_identities i ON i.id = p.stock_id
  WHERE p.user_id = p_user_id
    AND COALESCE(p.realized_pnl_usdc, 0) <> 0
  ORDER BY p.updated_at DESC
  LIMIT v_limit
  ON CONFLICT (user_id, source_table, source_id, kind)
  DO UPDATE SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    stock_id = COALESCE(EXCLUDED.stock_id, public.market_transaction_history.stock_id),
    details = COALESCE(public.market_transaction_history.details, '{}'::jsonb) || COALESCE(EXCLUDED.details, '{}'::jsonb),
    occurred_at = COALESCE(EXCLUDED.occurred_at, public.market_transaction_history.occurred_at),
    updated_at = now();
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_rows := v_rows + v_added;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_backfill_me(p_limit integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.market_history_backfill_user(v_uid, p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.market_history_backfill_all(p_limit integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_total bigint := 0;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT uid FROM (
      SELECT user_id AS uid FROM public.app_wallet_tx_simple
      UNION
      SELECT user_id AS uid FROM public.withdrawals_simple
      UNION
      SELECT user_id AS uid FROM public.paystack_events_simple
      UNION
      SELECT buyer_id AS uid FROM public.market_orders
      UNION
      SELECT seller_id AS uid FROM public.market_orders
      UNION
      SELECT user_id AS uid FROM public.market_stock_trades
      UNION
      SELECT user_id AS uid FROM public.market_stock_positions
    ) q
    WHERE uid IS NOT NULL
  LOOP
    v_total := v_total + public.market_history_backfill_user(v_uid, p_limit);
  END LOOP;
  RETURN v_total;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_history_withdrawal ON public.withdrawals_simple;
CREATE TRIGGER trg_market_history_withdrawal
AFTER INSERT OR UPDATE OF status, amount, fee, total_debit, paystack_reference, paystack_transfer_code, updated_at
ON public.withdrawals_simple
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_withdrawal();

DROP TRIGGER IF EXISTS trg_market_history_paystack_event ON public.paystack_events_simple;
CREATE TRIGGER trg_market_history_paystack_event
AFTER INSERT ON public.paystack_events_simple
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_paystack_event();

DROP TRIGGER IF EXISTS trg_market_history_chain_event ON public.market_chain_events;
CREATE TRIGGER trg_market_history_chain_event
AFTER INSERT ON public.market_chain_events
FOR EACH ROW EXECUTE FUNCTION public.market_history_from_chain_event();

GRANT SELECT ON public.market_transaction_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.market_history_upsert(uuid, text, text, text, text, numeric, text, text, text, uuid, uuid, jsonb, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_history_backfill_user(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.market_history_backfill_me(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_history_backfill_all(integer) TO service_role;

COMMIT;
