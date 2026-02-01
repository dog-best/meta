import { useEffect, useMemo, useState } from "react";
import {
  convertCryptoToNgn,
  CryptoAsset,
  ensureCryptoWallet,
  getCryptoPrice,
} from "@/services/crypto/cryptoService";

function friendly(err: any) {
  const status = err?.context?.status;
  const body = err?.context?.body;
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    if (parsed?.message) return parsed.message;
  } catch {}
  if (status === 401) return "Please sign in to continue.";
  return "We couldn’t complete your request right now. Please try again.";
}

export function useCrypto() {
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<any>(null);
  const [price, setPrice] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshWallet = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await ensureCryptoWallet();
      setWallet(data);
    } catch (e: any) {
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchPrice = async (asset: CryptoAsset) => {
    setError(null);
    setLoading(true);
    try {
      const data = await getCryptoPrice(asset);
      setPrice(data);
    } catch (e: any) {
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  };

  const convert = async (asset: CryptoAsset, amount: number) => {
    setError(null);
    setLoading(true);
    try {
      const reference = `CRYPTO-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const data = await convertCryptoToNgn({ asset, amount, reference });
      return data;
    } catch (e: any) {
      setError(friendly(e));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const depositAddress = useMemo(() => {
    return wallet?.address ?? wallet?.data?.address ?? null;
  }, [wallet]);

  return {
    loading,
    error,
    wallet,
    price,
    depositAddress,
    refreshWallet,
    fetchPrice,
    convert,
  };
}
