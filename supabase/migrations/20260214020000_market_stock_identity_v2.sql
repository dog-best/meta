BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'chain_name'
      AND t.typnamespace = 'public'::regnamespace
      AND e.enumlabel = 'polygon_amoy'
  ) THEN
    ALTER TYPE public.chain_name ADD VALUE 'polygon_amoy';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF TO_REGCLASS('public.store_identity_permissions') IS NULL THEN
    CREATE TABLE public.store_identity_permissions (
      store_id uuid PRIMARY KEY REFERENCES public.market_seller_profiles(user_id) ON DELETE CASCADE,
      can_create boolean NOT NULL DEFAULT true,
      allow_reserved boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'seller_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'store_id'
    ) THEN
      ALTER TABLE public.store_identity_permissions RENAME COLUMN seller_id TO store_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'allow_create'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'can_create'
    ) THEN
      ALTER TABLE public.store_identity_permissions RENAME COLUMN allow_create TO can_create;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'can_create'
    ) THEN
      ALTER TABLE public.store_identity_permissions ADD COLUMN can_create boolean NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'allow_reserved'
    ) THEN
      ALTER TABLE public.store_identity_permissions ADD COLUMN allow_reserved boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE public.store_identity_permissions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_identity_permissions' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.store_identity_permissions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.market_stock_reserved_terms (
  term_norm text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.market_stock_reserved_terms (term_norm, active) VALUES
('BESTCITY', true), ('BCM', true), ('BC', true)
ON CONFLICT (term_norm) DO UPDATE SET active = EXCLUDED.active;

CREATE TABLE IF NOT EXISTS public.market_stock_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.market_seller_profiles(user_id) ON DELETE CASCADE,
  chain public.chain_name NOT NULL REFERENCES public.market_chain_config(chain),
  chain_id integer NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  token_address text,
  pool_address text,
  total_supply numeric(30,0) NOT NULL DEFAULT 10000000 CHECK (total_supply = 10000000),
  decimals integer NOT NULL DEFAULT 18 CHECK (decimals BETWEEN 0 AND 18),
  creation_fee_usdc numeric(20,6) NOT NULL DEFAULT 50 CHECK (creation_fee_usdc = 50),
  creation_lp_usdc numeric(20,6) NOT NULL DEFAULT 45 CHECK (creation_lp_usdc = 45),
  creation_reserve_usdc numeric(20,6) NOT NULL DEFAULT 5 CHECK (creation_reserve_usdc = 5),
  reinvest_ops_bps integer NOT NULL DEFAULT 5000 CHECK (reinvest_ops_bps BETWEEN 0 AND 10000),
  reinvest_liquidity_bps integer NOT NULL DEFAULT 4500 CHECK (reinvest_liquidity_bps BETWEEN 0 AND 10000),
  reinvest_staking_bps integer NOT NULL DEFAULT 500 CHECK (reinvest_staking_bps BETWEEN 0 AND 10000),
  launch_guard_until timestamptz,
  trading_paused_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  launched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reinvest_ops_bps + reinvest_liquidity_bps + reinvest_staking_bps = 10000),
  CHECK (slug ~ '^[a-z0-9-]{3,40}$'),
  CHECK (length(trim(name)) BETWEEN 3 AND 60),
  CHECK (symbol ~ '^[A-Z0-9$]{2,10}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS market_stock_identities_slug_uidx
  ON public.market_stock_identities ((lower(slug)));

CREATE INDEX IF NOT EXISTS market_stock_identities_chain_idx
  ON public.market_stock_identities (chain, active);

CREATE TABLE IF NOT EXISTS public.market_stock_reserve_balance (
  stock_id uuid PRIMARY KEY REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  store_id uuid NOT NULL UNIQUE REFERENCES public.market_seller_profiles(user_id) ON DELETE CASCADE,
  reserve_usdc numeric(20,6) NOT NULL DEFAULT 0 CHECK (reserve_usdc >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stock_trade_side' AND typnamespace='public'::regnamespace) THEN
    CREATE TYPE public.stock_trade_side AS ENUM ('buy','sell');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stock_order_status' AND typnamespace='public'::regnamespace) THEN
    CREATE TYPE public.stock_order_status AS ENUM ('pending','submitted','filled','failed','cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.market_stock_reinvestments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.market_seller_profiles(user_id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.market_orders(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('creation_fee','order_fee','manual_adjustment')),
  gross_usdc numeric(20,6) NOT NULL CHECK (gross_usdc >= 0),
  platform_usdc numeric(20,6) NOT NULL CHECK (platform_usdc >= 0),
  liquidity_usdc numeric(20,6) NOT NULL CHECK (liquidity_usdc >= 0),
  staking_usdc numeric(20,6) NOT NULL DEFAULT 0 CHECK (staking_usdc >= 0),
  chain public.chain_name NOT NULL,
  tx_hash text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','submitted','confirmed','failed')),
  idempotency_key text UNIQUE,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (platform_usdc + liquidity_usdc + staking_usdc = gross_usdc)
);

CREATE UNIQUE INDEX IF NOT EXISTS market_stock_reinvestments_order_source_uidx
  ON public.market_stock_reinvestments (order_id, source_type)
  WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.market_stock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side public.stock_trade_side NOT NULL,
  quote_price_usdc numeric(20,8) NOT NULL CHECK (quote_price_usdc > 0),
  amount_usdc numeric(20,8),
  quantity numeric(30,12),
  slippage_bps integer NOT NULL DEFAULT 100 CHECK (slippage_bps BETWEEN 1 AND 3000),
  max_price_impact_bps integer NOT NULL DEFAULT 1200 CHECK (max_price_impact_bps BETWEEN 1 AND 5000),
  status public.stock_order_status NOT NULL DEFAULT 'pending',
  submitted_tx_hash text,
  filled_trade_id uuid,
  fail_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((amount_usdc IS NOT NULL) <> (quantity IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.market_stock_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side public.stock_trade_side NOT NULL,
  price_usdc numeric(20,8) NOT NULL CHECK (price_usdc > 0),
  quantity numeric(30,12) NOT NULL CHECK (quantity > 0),
  notional_usdc numeric(20,8) NOT NULL CHECK (notional_usdc > 0),
  fee_usdc numeric(20,8) NOT NULL DEFAULT 0 CHECK (fee_usdc >= 0),
  chain_tx_hash text,
  chain_block bigint,
  chain_log_index integer,
  traded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_stock_trades_tx_log_uidx
  ON public.market_stock_trades (chain_tx_hash, chain_log_index)
  WHERE chain_tx_hash IS NOT NULL AND chain_log_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_stock_trades_stock_time_idx
  ON public.market_stock_trades (stock_id, traded_at DESC);

CREATE TABLE IF NOT EXISTS public.market_stock_candles_1m (
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  open_price_usdc numeric(20,8) NOT NULL,
  high_price_usdc numeric(20,8) NOT NULL,
  low_price_usdc numeric(20,8) NOT NULL,
  close_price_usdc numeric(20,8) NOT NULL,
  volume_qty numeric(30,12) NOT NULL DEFAULT 0,
  volume_usdc numeric(20,8) NOT NULL DEFAULT 0,
  trades_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stock_id, bucket_start)
);

CREATE TABLE IF NOT EXISTS public.market_stock_price_points (
  stock_id uuid PRIMARY KEY REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  last_price_usdc numeric(20,8) NOT NULL CHECK (last_price_usdc > 0),
  market_cap_usdc numeric(24,8) NOT NULL CHECK (market_cap_usdc >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_stock_positions (
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_qty numeric(30,12) NOT NULL DEFAULT 0 CHECK (balance_qty >= 0),
  avg_cost_usdc numeric(20,8) NOT NULL DEFAULT 0 CHECK (avg_cost_usdc >= 0),
  realized_pnl_usdc numeric(20,8) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stock_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.market_stock_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES public.market_stock_identities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 280),
  is_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.market_stock_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.market_stock_norm(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]+', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.market_stock_has_reserved_text(p_name text, p_symbol text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_name text := public.market_stock_norm(p_name);
  v_symbol text := public.market_stock_norm(p_symbol);
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.market_stock_reserved_terms r
    WHERE r.active
      AND (v_symbol = r.term_norm OR (length(r.term_norm) >= 4 AND position(r.term_norm in v_name) > 0))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.market_stock_enforce_reserved_terms()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_allow_reserved boolean := false;
BEGIN
  SELECT coalesce(p.allow_reserved, false)
  INTO v_allow_reserved
  FROM public.store_identity_permissions p
  WHERE p.store_id = NEW.store_id;

  IF v_allow_reserved = false AND public.market_stock_has_reserved_text(NEW.name, NEW.symbol) THEN
    RAISE EXCEPTION 'Reserved stock identity name/symbol. Contact BestCity support.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_stock_reserved_terms ON public.market_stock_identities;
CREATE TRIGGER trg_market_stock_reserved_terms
BEFORE INSERT OR UPDATE ON public.market_stock_identities
FOR EACH ROW EXECUTE FUNCTION public.market_stock_enforce_reserved_terms();

DROP TRIGGER IF EXISTS trg_store_identity_permissions_updated_at ON public.store_identity_permissions;
CREATE TRIGGER trg_store_identity_permissions_updated_at
BEFORE UPDATE ON public.store_identity_permissions
FOR EACH ROW EXECUTE FUNCTION public.market_stock_set_updated_at();

DROP TRIGGER IF EXISTS trg_market_stock_identities_updated_at ON public.market_stock_identities;
CREATE TRIGGER trg_market_stock_identities_updated_at
BEFORE UPDATE ON public.market_stock_identities
FOR EACH ROW EXECUTE FUNCTION public.market_stock_set_updated_at();

DROP TRIGGER IF EXISTS trg_market_stock_reserve_balance_updated_at ON public.market_stock_reserve_balance;
CREATE TRIGGER trg_market_stock_reserve_balance_updated_at
BEFORE UPDATE ON public.market_stock_reserve_balance
FOR EACH ROW EXECUTE FUNCTION public.market_stock_set_updated_at();

DROP TRIGGER IF EXISTS trg_market_stock_reinvestments_updated_at ON public.market_stock_reinvestments;
CREATE TRIGGER trg_market_stock_reinvestments_updated_at
BEFORE UPDATE ON public.market_stock_reinvestments
FOR EACH ROW EXECUTE FUNCTION public.market_stock_set_updated_at();

DROP TRIGGER IF EXISTS trg_market_stock_orders_updated_at ON public.market_stock_orders;
CREATE TRIGGER trg_market_stock_orders_updated_at
BEFORE UPDATE ON public.market_stock_orders
FOR EACH ROW EXECUTE FUNCTION public.market_stock_set_updated_at();

ALTER TABLE public.market_stock_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_candles_1m ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_stock_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_stock_identities_read ON public.market_stock_identities;
CREATE POLICY market_stock_identities_read ON public.market_stock_identities
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS market_stock_orders_read_self ON public.market_stock_orders;
CREATE POLICY market_stock_orders_read_self ON public.market_stock_orders
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS market_stock_orders_insert_self ON public.market_stock_orders;
CREATE POLICY market_stock_orders_insert_self ON public.market_stock_orders
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS market_stock_trades_read ON public.market_stock_trades;
CREATE POLICY market_stock_trades_read ON public.market_stock_trades
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS market_stock_candles_read ON public.market_stock_candles_1m;
CREATE POLICY market_stock_candles_read ON public.market_stock_candles_1m
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS market_stock_price_points_read ON public.market_stock_price_points;
CREATE POLICY market_stock_price_points_read ON public.market_stock_price_points
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS market_stock_positions_read_self ON public.market_stock_positions;
CREATE POLICY market_stock_positions_read_self ON public.market_stock_positions
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS market_stock_chat_read ON public.market_stock_chat_messages;
CREATE POLICY market_stock_chat_read ON public.market_stock_chat_messages
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS market_stock_chat_insert ON public.market_stock_chat_messages;
CREATE POLICY market_stock_chat_insert ON public.market_stock_chat_messages
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.market_stock_identities TO anon, authenticated;
GRANT SELECT ON public.market_stock_orders TO authenticated;
GRANT INSERT ON public.market_stock_orders TO authenticated;
GRANT SELECT ON public.market_stock_trades TO anon, authenticated;
GRANT SELECT ON public.market_stock_candles_1m TO anon, authenticated;
GRANT SELECT ON public.market_stock_price_points TO anon, authenticated;
GRANT SELECT ON public.market_stock_positions TO authenticated;
GRANT SELECT ON public.market_stock_chat_messages TO anon, authenticated;
GRANT INSERT ON public.market_stock_chat_messages TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='market_stock_trades'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.market_stock_trades';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='market_stock_candles_1m'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.market_stock_candles_1m';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='market_stock_chat_messages'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.market_stock_chat_messages';
    END IF;
  END IF;
END $$;

COMMIT;
