import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { keccak256, stringToHex } from "https://esm.sh/viem@2.45.1";
import { envAny } from "../_shared/market/env.ts";

type AlchemyLog = {
  address?: string;
  topics?: string[];
  data?: string;
  transactionHash?: string;
  logIndex?: number;
  blockNumber?: number;
  blockTimestamp?: string;
};

const TOPIC_DEPOSIT_MULTI = keccak256(stringToHex("EscrowDeposited(bytes32,address,address,address,uint256)"));
const TOPIC_RELEASE_MULTI = keccak256(stringToHex("EscrowReleased(bytes32,address,address,address,uint256)"));
const TOPIC_REFUND_MULTI = keccak256(stringToHex("EscrowRefunded(bytes32,address,address,address,uint256)"));

const TOPIC_DEPOSIT_SINGLE = keccak256(stringToHex("EscrowDeposited(bytes32,address,address,uint256)"));
const TOPIC_RELEASE_SINGLE = keccak256(stringToHex("EscrowReleased(bytes32,address,address,uint256)"));
const TOPIC_REFUND_SINGLE = keccak256(stringToHex("EscrowRefunded(bytes32,address,address,uint256)"));

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeChain(input: unknown): string {
  const raw = String(input ?? "").toLowerCase().trim();
  if (!raw) return "base_sepolia";

  if (raw.includes("80002") || raw.includes("polygon-amoy") || raw.includes("polygon_amoy") || raw.includes("amoy")) {
    return "polygon_amoy";
  }
  if (raw.includes("84532") || raw.includes("base-sepolia") || raw.includes("base_sepolia")) return "base_sepolia";
  if (raw.includes("421614") || raw.includes("arbitrum-sepolia") || raw.includes("arbitrum_sepolia")) {
    return "arbitrum_sepolia";
  }
  if (raw.includes("97") || raw.includes("bnb-testnet") || raw.includes("bnb_testnet")) return "bnb_testnet";
  if (raw.includes("8453") || raw === "base") return "base";
  if (raw.includes("42161") || raw === "arbitrum") return "arbitrum";
  if (raw.includes("137") || raw === "polygon") return "polygon";
  if (raw.includes("56") || raw === "bnb") return "bnb";
  if (raw.includes("10") || raw === "optimism") return "optimism";
  if (raw.includes("1") || raw === "ethereum") return "ethereum";

  return "base_sepolia";
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

function normalizeOrderKey(key: string | null | undefined) {
  const raw = String(key ?? "").toLowerCase().replace(/^0x/, "");
  return raw.padStart(64, "0");
}

function extractLogs(payload: any): AlchemyLog[] {
  const logs: AlchemyLog[] = [];
  const pushLog = (entry: any, ctx: Partial<AlchemyLog> = {}) => {
    const topics = entry?.topics;
    if (!Array.isArray(topics) || topics.length === 0) return;
    const out: AlchemyLog = {
      address: String(entry?.address ?? entry?.account?.address ?? ctx.address ?? "").toLowerCase() || undefined,
      topics: topics.map((t: any) => String(t).toLowerCase()),
      data: typeof entry?.data === "string" ? entry.data : undefined,
      transactionHash: String(entry?.transactionHash ?? entry?.transaction?.hash ?? ctx.transactionHash ?? ""),
      logIndex: Number(entry?.logIndex ?? entry?.index ?? ctx.logIndex ?? 0),
      blockNumber: Number(entry?.blockNumber ?? entry?.block?.number ?? ctx.blockNumber ?? 0),
      blockTimestamp: String(entry?.blockTimestamp ?? ctx.blockTimestamp ?? ""),
    };
    logs.push(out);
  };

  const act = payload?.event?.activity;
  if (Array.isArray(act)) {
    for (const item of act) {
      pushLog(item?.log);
      pushLog(item?.rawContract);
    }
  }

  if (Array.isArray(payload?.event?.logs)) {
    for (const item of payload.event.logs) pushLog(item);
  }
  if (payload?.event?.log) pushLog(payload.event.log);
  if (Array.isArray(payload?.logs)) {
    for (const item of payload.logs) pushLog(item);
  }
  if (payload?.log) pushLog(payload.log);

  // Alchemy Custom Webhook (GraphQL) commonly nests logs under event.data.block.logs.
  const gqlBlock = payload?.event?.data?.block;
  if (gqlBlock) {
    const blockCtx: Partial<AlchemyLog> = {
      blockNumber: Number(gqlBlock?.number ?? 0),
      blockTimestamp: String(gqlBlock?.timestamp?.iso8601 ?? ""),
    };
    if (Array.isArray(gqlBlock?.logs)) {
      for (const entry of gqlBlock.logs) {
        pushLog(entry, blockCtx);
        if (Array.isArray(entry?.transaction?.logs)) {
          const txHash = String(entry?.transaction?.hash ?? "");
          for (const txLog of entry.transaction.logs) {
            pushLog(txLog, { ...blockCtx, transactionHash: txHash });
          }
        }
      }
    }
  }

  // Generic GraphQL fallback if query returns event.data.logs directly.
  if (Array.isArray(payload?.event?.data?.logs)) {
    for (const item of payload.event.data.logs) pushLog(item);
  }

  return logs.filter((l) => Array.isArray(l.topics) && l.topics.length > 0);
}

serve(async (req) => {
  try {
    const SB_URL = envAny(["SB_URL", "SUPABASE_URL", "sb_url"], "");
    const SB_SERVICE = envAny(
      ["SB_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "sb_secret_key", "sb_scret_key"],
      "",
    );
    if (!SB_URL || !SB_SERVICE) {
      return json(500, {
        ok: false,
        message: "Missing env vars",
        hasSB_URL: !!SB_URL,
        hasSB_SERVICE_ROLE_KEY: !!SB_SERVICE,
      });
    }

    const payload = await req.json();
    const admin = createClient(SB_URL, SB_SERVICE);
    const chain = normalizeChain(payload?.event?.network ?? payload?.network ?? payload?.event?.chainId);

    const logs = extractLogs(payload);
    if (!logs.length) return json(200, { ok: true, message: "No logs" });

    const { data: cfg } = await admin
      .from("market_chain_config")
      .select("chain,usdc_address,usdt_address")
      .eq("chain", chain)
      .maybeSingle();

    for (const log of logs) {
      const topic0 = String(log.topics?.[0] ?? "").toLowerCase();
      const isDeposit = topic0 === TOPIC_DEPOSIT_MULTI || topic0 === TOPIC_DEPOSIT_SINGLE;
      const isRelease = topic0 === TOPIC_RELEASE_MULTI || topic0 === TOPIC_RELEASE_SINGLE;
      const isRefund = topic0 === TOPIC_REFUND_MULTI || topic0 === TOPIC_REFUND_SINGLE;
      if (!isDeposit && !isRelease && !isRefund) continue;

      const orderKey = String(log.topics?.[1] ?? "").toLowerCase();
      const orderKeyNo0x = orderKey.startsWith("0x") ? orderKey.slice(2) : orderKey;
      const buyer = hexToAddress(log.topics?.[2]);
      const seller = hexToAddress(log.topics?.[3]);
      const { token, amountRaw } = decodeData(log.data);
      const decimals = 6n; // USDC/USDT mocks on Base Sepolia use 6 decimals
      const amountUnits = Number(amountRaw) / Number(10n ** decimals);

      const { data: esc } = await admin
        .from("market_crypto_escrows")
        .select("order_id,order_key,token_address")
        .in("order_key", [orderKey, orderKeyNo0x, normalizeOrderKey(orderKey), normalizeOrderKey(orderKeyNo0x)])
        .maybeSingle();

      if (!esc?.order_id) {
        console.warn("escrow not found for order_key", orderKey);
        continue;
      }
      const tokenAddr = (token || esc.token_address || cfg?.usdc_address || "").toLowerCase();

      const txHash = String(log.transactionHash ?? "");
      const logIndex = Number(log.logIndex ?? 0);
      const blockNumber = Number(log.blockNumber ?? 0);
      const blockTime = log.blockTimestamp ? new Date(log.blockTimestamp).toISOString() : null;

      if (isDeposit) {
        try {
          await admin.rpc("market_apply_chain_deposit", {
            p_order_id: esc.order_id,
            p_buyer_wallet: buyer,
            p_seller_wallet: seller,
            p_amount_raw: amountRaw ? amountRaw.toString() : null,
            p_amount_units: amountUnits,
            p_tx_hash: txHash,
            p_log_index: logIndex,
            p_block_number: blockNumber,
            p_block_time: blockTime,
            p_raw: log,
            p_token_address: tokenAddr || esc.token_address || null,
          });
        } catch (e: any) {
          console.error("market-escrow-webhook deposit apply failed", {
            chain,
            order_id: esc.order_id,
            txHash,
            logIndex,
            message: String(e?.message || e),
          });
        }
      }

      if (isRelease) {
        try {
          await admin.rpc("market_apply_chain_release", {
            p_order_id: esc.order_id,
            p_tx_hash: txHash,
            p_log_index: logIndex,
            p_block_number: blockNumber,
            p_block_time: blockTime,
            p_raw: log,
          });
        } catch (e: any) {
          console.error("market-escrow-webhook release apply failed", {
            chain,
            order_id: esc.order_id,
            txHash,
            logIndex,
            message: String(e?.message || e),
          });
        }
      }

      if (isRefund) {
        try {
          await admin.rpc("market_apply_chain_refund", {
            p_order_id: esc.order_id,
            p_tx_hash: txHash,
            p_log_index: logIndex,
            p_block_number: blockNumber,
            p_block_time: blockTime,
            p_raw: log,
          });
        } catch (e: any) {
          console.error("market-escrow-webhook refund apply failed", {
            chain,
            order_id: esc.order_id,
            txHash,
            logIndex,
            message: String(e?.message || e),
          });
        }
      }
    }

    return json(200, { ok: true, processed: logs.length });
  } catch (err) {
    console.error("market-escrow-webhook error:", err);
    return json(500, { ok: false, message: "Server error" });
  }
});
