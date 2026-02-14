import { router } from "expo-router";
import { useEffect } from "react";

export default function LegacyStocksRouteRedirect() {
  useEffect(() => {
    router.replace("/market/stock" as any);
  }, []);

  return null;
}
