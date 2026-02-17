import * as LocalAuthentication from "expo-local-authentication";

export type LocalAuthInfo = {
  hasHardware: boolean;
  enrolled: boolean;
  hasFace: boolean;
  hasFinger: boolean;
};

export type LocalAuthPromptResult = {
  success: boolean;
  error?: string;
};

export async function getLocalAuthInfo(): Promise<LocalAuthInfo> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

  return {
    hasHardware,
    enrolled,
    hasFace: supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION),
    hasFinger: supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
  };
}

export async function authenticateWithDevice(promptMessage: string): Promise<LocalAuthPromptResult> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Use device passcode",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });

  return {
    success: !!res.success,
    error: res.success ? undefined : String(res.error || "failed"),
  };
}
