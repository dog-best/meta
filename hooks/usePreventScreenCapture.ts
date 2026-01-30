import { useEffect } from "react";
import { Platform } from "react-native";
import * as ScreenCapture from "expo-screen-capture";

export function usePreventScreenCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === "web") return;

    let mounted = true;

    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync();
      } catch {
        // best-effort (some platforms/versions may not support)
      }
    })();

    return () => {
      mounted = false;
      (async () => {
        try {
          await ScreenCapture.allowScreenCaptureAsync();
        } catch {}
      })();
    };
  }, [enabled]);
}
