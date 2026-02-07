import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { keccak256, stringToHex } from "https://esm.sh/viem@2.45.1";

type ChainConfig = {
  chain: string;
  rpc_url: string | null;
  escrow_address: string | null;
  confirmations_required: number | null;
  usdc_address: string | null;
  usdt_address: string | null;
};

type ChainSync = { chain: string; last_block: number };

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  transactionHash?: string;
  logIndex?: string | number;
  blockNumber?: string | number;
};

const TOPIC_DEPOSIT_MULTI = keccak256(stringToHex("EscrowDeposited(bytes32,address,address,address,uint256)"));
const TOPIC_RELEASE_MULTI = keccak256(stringToHex("EscrowReleased(bytes32,address,address,address,uint256)"));
const TOPIC_REFUND_MULTI = keccak256(stringToHex("EscrowRefunded(bytes32,address,address,address,uint256)"));

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `RPC ${method} failed`);
  return json?.result;
}

function toNum(hexOrNum: string | number | null | undefined): number {
  if (typeof hexOrNum === "number") return hexOrNum;
  if (!hexOrNum) return 0;
  const raw = String(hexOrNum);
  return raw.startsWith("0x") ? parseInt(raw, 16) : Number(raw);
}

function hexToAddress(topicHex?: string): string | null {
  if (!topicHex || !topicHex.startsWith("0x")) return null;
  return `0x${topicHex.slice(-40)}`.toLowerCase();
}

function hexToBigInt(hex?: string): bigint {
  if (!hex || !hex.startsWith("0x")) return 0n;
  return BigInt(hex);
}

function decodeData(dataHex?: string) {
  const data = String(dataHex ?? "");
  if (!data.startsWith("0x")) return { token: null, amountRaw: 0n };
  const payload = data.slice(2);
  if (payload.length >= 64 * 2) {
    const tokenSlot = payload.slice(0, 64);
    const amountSlot = payload.slice(64, 128);
    const token = `0x${tokenSlot.slice(24 * 2)}`.toLowerCase();
    const amountRaw = hexToBigInt(`0x${amountSlot}`);
    return { token, amountRaw };
  }
  if (payload.length >= 64) {
    const amountRaw = hexToBigInt(`0x${payload.slice(0, 64)}`);
    return { token: null, amountRaw };
  }
  return { token: null, amountRaw: 0n };
}

async function processLogs(
  admin: ReturnType<typeof createClient>,
  cfg: ChainConfig,
  logs: RpcLog[],
) {
  for (const log of logs) {
    const topic0 = String(log.topics?.[0] ?? "").toLowerCase();
    const isDeposit = topic0 === TOPIC_DEPOSIT_MULTI;
    const isRelease = topic0 === TOPIC_RELEASE_MULTI;
    const isRefund = topic0 === TOPIC_REFUND_MULTI;
    if (!isDeposit && !isRelease && !isRefund) continue;

    const orderKey = String(log.topics?.[1] ?? "").toLowerCase();
    const orderKeyNo0x = orderKey.startsWith("0x") ? orderKey.slice(2) : orderKey;
    const buyer = hexToAddress(log.topics?.[2]);
    const seller = hexToAddress(log.topics?.[3]);
    const { token, amountRaw } = decodeData(log.data);
    const tokenAddr = (token || cfg.usdc_address || "").toLowerCase();
    const decimals = 6n;
    const amountUnits = Number(amountRaw) / Number(10n ** decimals);

    const { data: esc } = await admin
      .from("market_crypto_escrows")
      .select("order_id,order_key")
      .in("order_key", [orderKey, orderKeyNo0x])
      .maybeSingle();

    if (!esc?.order_id) continue;

    const txHash = String(log.transactionHash ?? "");
    const logIndex = toNum(log.logIndex as any);
    const blockNumber = toNum(log.blockNumber as any);

    if (isDeposit) {
      await admin.rpc("market_apply_chain_deposit", {
        p_order_id: esc.order_id,
        p_buyer_wallet: buyer,
        p_seller_wallet: seller,
        p_amount_raw: amountRaw ? amountRaw.toString() : null,
        p_amount_units: amountUnits,
        p_tx_hash: txHash,
        p_log_index: logIndex,
        p_block_number: blockNumber,
        p_block_time: null,
        p_raw: log,
        p_token_address: tokenAddr,
      });
    }

    if (isRelease) {
      await admin.rpc("market_apply_chain_release", {
        p_order_id: esc.order_id,
        p_tx_hash: txHash,
        p_log_index: logIndex,
        p_block_number: blockNumber,
        p_block_time: null,
        p_raw: log,
      });
    }

    if (isRefund) {
      await admin.rpc("market_apply_chain_refund", {
        p_order_id: esc.order_id,
        p_tx_hash: txHash,
        p_log_index: logIndex,
        p_block_number: blockNumber,
        p_block_time: null,
        p_raw: log,
      });
    }
  }
}

serve(async () => {
  try {
    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE = Deno.env.get("SB_SERVICE_ROLE_KEY");
    if (!SB_URL || !SB_SERVICE) {
      return json(500, {
        ok: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE,
      });
    }

    const admin = createClient(SB_URL, SB_SERVICE);

    const { data: chains, error: cfgErr } = await admin
      .from("market_chain_config")
      .select("chain,rpc_url,escrow_address,confirmations_required,usdc_address,usdt_address,active")
      .eq("active", true);

    if (cfgErr) return json(500, { ok: false, message: cfgErr.message });
    if (!chains?.length) return json(200, { ok: true, message: "No active chains" });

    const results: Record<string, unknown> = {};

    for (const cfg of chains as ChainConfig[]) {
      if (!cfg.rpc_url || !cfg.escrow_address) {
        results[cfg.chain] = { ok: false, reason: "rpc_url or escrow_address missing" };
        continue;
      }

      const { data: syncRow } = await admin
        .from("market_chain_sync")
        .select("chain,last_block")
        .eq("chain", cfg.chain)
        .maybeSingle();

      const backfill = 60;
      let lastBlock = Number((syncRow as ChainSync | null)?.last_block ?? 0);
      const latestHex = await rpcCall(cfg.rpc_url, "eth_blockNumber", []);
      const latest = toNum(latestHex);
      const required = Math.max(1, Number(cfg.confirmations_required ?? 1));
      const toBlock = Math.max(0, latest - required + 1);

      const maxRange = 10;
      const backfillStart = Math.max(0, toBlock - backfill);
      let cursor = Math.max(0, lastBlock + 1);
      let truncated = backfillStart > 0;
      let reset = false;

      if (lastBlock > toBlock) {
        lastBlock = backfillStart - 1;
        cursor = Math.max(0, lastBlock + 1);
        reset = true;
      }

      if (cursor > backfillStart) {
        cursor = backfillStart;
      }

      if (cursor > toBlock) {
        results[cfg.chain] = {
          ok: true,
          message: "No new confirmed blocks",
          latest,
          required,
          toBlock,
        };
        continue;
      }

      let processed = 0;

      while (cursor <= toBlock) {
        const end = Math.min(cursor + maxRange - 1, toBlock);
        let logs: RpcLog[] = [];
        try {
          logs = (await rpcCall(cfg.rpc_url, "eth_getLogs", [
            {
              address: cfg.escrow_address,
              fromBlock: `0x${cursor.toString(16)}`,
              toBlock: `0x${end.toString(16)}`,
              topics: [[TOPIC_DEPOSIT_MULTI, TOPIC_RELEASE_MULTI, TOPIC_REFUND_MULTI]],
            },
          ])) as RpcLog[];
        } catch (err: any) {
          const msg = String(err?.message || err);
          results[cfg.chain] = {
            ok: false,
            error: "rpc_throttled",
            message: msg,
            fromBlock: cursor,
            toBlock,
            latest,
            required,
          };
          return json(200, { ok: true, results });
        }

        await processLogs(admin, cfg, logs ?? []);
        processed += logs?.length ?? 0;
        cursor = end + 1;
      }

      await admin
        .from("market_chain_sync")
        .upsert({ chain: cfg.chain, last_block: toBlock })
        .select();

      results[cfg.chain] = {
        ok: true,
        processed,
        fromBlock: cursor,
        toBlock,
        latest,
        required,
        truncated,
        reset,
      };
    }

    return json(200, { ok: true, results });
  } catch (err: any) {
    console.error("market-escrow-poller error:", err);
    return json(500, { ok: false, message: String(err?.message || err) });
  }
});
