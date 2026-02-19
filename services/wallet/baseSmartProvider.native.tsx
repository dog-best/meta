import React, { useEffect } from "react";

import { setBaseSmartRuntime } from "@/services/wallet/baseSmartSession";

export function BaseSmartProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setBaseSmartRuntime({
      openModal: async () => {
        throw new Error("Base Smart Account is currently supported on web. Use WalletConnect on native app.");
      },
      disconnect: async () => undefined,
      switchNetwork: async () => {
        throw new Error("Base Smart Account network switching is not available on native app.");
      },
    });
  }, []);

  return <>{children}</>;
}

