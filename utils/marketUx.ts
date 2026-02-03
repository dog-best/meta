export function friendlyMarketError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = String((error as any)?.message ?? error ?? "").trim();
  if (!raw) return fallback;

  const msg = raw.toLowerCase();
  if (msg.includes("invalid jwt") || msg.includes("session expired") || msg.includes("jwt")) {
    return "Your session expired. Please sign in again.";
  }
  if (msg.includes("non-2xx") || msg.includes("edge function")) {
    return "We couldn't complete this request right now. Please try again.";
  }
  if (msg.includes("timeout") || msg.includes("aborted")) {
    return "The request took too long. Please check your connection and try again.";
  }
  if (msg.includes("network request failed") || msg.includes("failed to fetch")) {
    return "Network connection issue. Please try again.";
  }
  if (msg.includes("insufficient")) {
    return "Insufficient wallet balance for this action.";
  }
  if (msg.includes("row-level security") || msg.includes("permission") || msg.includes("policy")) {
    return "This action is currently blocked by permissions. Please contact support if it keeps happening.";
  }
  if (msg.includes("order not found")) {
    return "Order not found. Refresh and try again.";
  }
  if (msg.includes("not your order")) {
    return "You can only perform this action on your own order.";
  }

  return raw.length > 180 ? fallback : raw;
}

