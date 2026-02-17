import { Platform } from "react-native";
import mobileAds from "react-native-google-mobile-ads";

export function initMobileAds() {
  if (Platform.OS !== "android") return;
  mobileAds().initialize().catch(() => {});
}
