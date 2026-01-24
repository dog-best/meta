import { bad, unauth } from "./http.ts";

export function requireAdmin(req: Request) {
  const expected = Deno.env.get("MARKET_ADMIN_TOKEN") ?? "";
  if (!expected) {
    // If you forget to set token, block by default.
    throw new Error("MARKET_ADMIN_TOKEN env var not set");
  }

  const token =
    req.headers.get("x-admin-token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!token || token !== expected) {
    return unauth();
  }

  return null; // ok
}

export function adminError(e: unknown) {
  const msg = String((e as any)?.message ?? e);
  return bad(msg);
}
