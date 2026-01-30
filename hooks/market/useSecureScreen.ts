import { useEffect } from "react";
import * as ScreenCapture from "expo-screen-capture";

/**
 * Best-effort screen protection:
 * - Android: prevents screenshots/recording in many cases (FLAG_SECURE)
 * - iOS: limited (Apple does not fully allow prevention)
 */
export function useSecureScreen(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync();
      } catch {
        // ignore (some environments/OS versions may not support)
      }
    })();

    return () => {
      mounted = false;
      (async () => {
        try {
          await ScreenCapture.allowScreenCaptureAsync();
        } catch {
          // ignore
        }
      })();
    };
  }, [enabled]);
}
