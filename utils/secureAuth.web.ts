import type { LocalAuthResult } from "./secureAuth";

export async function requireLocalAuth(_reason = "Confirm this action"): Promise<LocalAuthResult> {
  // Browsers do not have expo-local-authentication in this app flow.
  return { ok: true };
}
