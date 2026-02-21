-- Per-chain faucet metadata for one-click test token claims.
-- Default values keep faucet disabled until faucet_address is set and activated.

ALTER TABLE IF EXISTS public.market_chain_config
  ADD COLUMN IF NOT EXISTS faucet_address text,
  ADD COLUMN IF NOT EXISTS faucet_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS faucet_cooldown_seconds integer NOT NULL DEFAULT 86400,
  ADD COLUMN IF NOT EXISTS faucet_usdc_amount_raw numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faucet_usdt_amount_raw numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'market_chain_config_faucet_cooldown_check'
  ) THEN
    ALTER TABLE public.market_chain_config
      ADD CONSTRAINT market_chain_config_faucet_cooldown_check
      CHECK (faucet_cooldown_seconds >= 0);
  END IF;
END
$$;

-- Seed Base Sepolia stablecoin addresses and default faucet policy (1000 tokens / 24h).
UPDATE public.market_chain_config
SET
  usdc_address = '0x345a3659f26bc113fc3139f6b5ad8c53aee7ed2d',
  usdt_address = '0x13e7bedeeddee0a3c4e4cabe8195b8cad0baf3c4',
  faucet_cooldown_seconds = 86400,
  faucet_usdc_amount_raw = 1000000000, -- 1000 * 10^6
  faucet_usdt_amount_raw = 1000000000, -- 1000 * 10^6
  updated_at = NOW()
WHERE chain = 'base_sepolia';
