import * as LocalAuthentication from "expo-local-authentication";

export type LocalAuthResult = {
  ok: boolean;
  code?: "no_hardware" | "not_enrolled" | "failed" | "cancelled";
  message?: string;
};

export async function requireLocalAuth(reason = "Confirm this action"): Promise<LocalAuthResult> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { ok: false, code: "no_hardware", message: "Biometric hardware is not available on this device." };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return { ok: false, code: "not_enrolled", message: "Biometrics are not set up. Please enroll Face ID / Fingerprint in settings." };
    }

    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: "Use device passcode",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (res.success) return { ok: true };
    if (res.error === "user_cancel") return { ok: false, code: "cancelled", message: "Authentication cancelled." };
    return { ok: false, code: "failed", message: "Authentication failed." };
  } catch {
    return { ok: false, code: "failed", message: "Authentication failed." };
  }
}
