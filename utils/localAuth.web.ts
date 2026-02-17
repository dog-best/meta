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
  return {
    hasHardware: false,
    enrolled: false,
    hasFace: false,
    hasFinger: false,
  };
}

export async function authenticateWithDevice(_promptMessage: string): Promise<LocalAuthPromptResult> {
  return {
    success: false,
    error: "failed",
  };
}
