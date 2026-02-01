import { keccak_256 } from "https://esm.sh/@noble/hashes@1.3.3/sha3";

// keccak256(utf8(order_uuid)) -> 0x...
export function orderKeyKeccak(orderId: string): string {
  const bytes = new TextEncoder().encode(orderId);
  const hash = keccak_256(bytes);
  return "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toUsdcRaw(amountUnits: number): string {
  return String(Math.round(amountUnits * 1_000_000));
}

export function getFeeBps(defaultBps = 50): number {
  const raw = Deno.env.get("MARKET_USDC_FEE_BPS");
  const n = raw ? Number(raw) : defaultBps;
  if (!Number.isFinite(n) || n < 0 || n > 200) return defaultBps;
  return Math.round(n);
}

export function getFeeRecipient(): string | null {
  const v = Deno.env.get("MARKET_USDC_FEE_RECIPIENT");
  return v && v.startsWith("0x") ? v : null;
}

export function feeFromRaw(amountRaw: string, feeBps: number): string {
  const amt = BigInt(amountRaw);
  const fee = (amt * BigInt(feeBps)) / 10000n;
  return fee.toString();
}

export function addRaw(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

