-- Add polygon_amoy to chain enum and seed an inactive config row.
-- Replace zero addresses after contracts are deployed on Polygon Amoy.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'chain_name'
      AND e.enumlabel = 'polygon_amoy'
  ) THEN
    ALTER TYPE public.chain_name ADD VALUE 'polygon_amoy';
  END IF;
END
$$;

INSERT INTO public.market_chain_config (
  chain,
  chain_id,
  rpc_url,
  usdc_address,
  usdt_address,
  escrow_address,
  confirmations_required,
  active
)
VALUES (
  'polygon_amoy',
  80002,
  'https://polygon-amoy.g.alchemy.com/v2/4NbifAMKleGdLp21N2KYV',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000000',
  '0x0000000000000000000000000000000000000000',
  3,
  false
)
ON CONFLICT (chain) DO UPDATE
SET
  chain_id = EXCLUDED.chain_id,
  rpc_url = EXCLUDED.rpc_url,
  confirmations_required = EXCLUDED.confirmations_required,
  updated_at = NOW();
