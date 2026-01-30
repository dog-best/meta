import { useEffect } from "react";
import { Platform } from "react-native";

export function usePreventScreenCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === "web") return;

    let mounted = true;

    (async () => {
      try {
        const ScreenCapture = await import("expo-screen-capture");
        if (!mounted) return;
        await ScreenCapture.preventScreenCaptureAsync();
      } catch {}
    })();

    return () => {
      mounted = false;
      (async () => {
        try {
          const ScreenCapture = await import("expo-screen-capture");
          await ScreenCapture.allowScreenCaptureAsync();
        } catch {}
      })();
    };
  }, [enabled]);
}
