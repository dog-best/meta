import ConfirmPurchaseModal from "@/components/common/confirmpurchase";
import { useCrypto } from "@/services/crypto/useCrypto";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ASSETS = ["USDT", "USDC", "ETH"] as const;

type Asset = (typeof ASSETS)[number];

export default function CryptoConvert() {
  const { loading, error, convert } = useCrypto();
  const [asset, setAsset] = useState<Asset>("USDT");
  const [amount, setAmount] = useState("");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const canContinue = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 && !loading;
  }, [amount, loading]);

  const submit = async () => {
    setConfirmVisible(false);
    try {
      await convert(asset, Number(amount));
      Alert.alert("Success", "Conversion queued. Your NGN wallet will update after verification.");
      setAmount("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Conversion failed.");
    }
  };

  return (
    <View className="flex-1 bg-white p-4 gap-4">
      <Text className="text-xl font-semibold">Convert Crypto to NGN</Text>

      <Text className="font-medium">Asset</Text>
      <View className="flex-row flex-wrap gap-2">
        {ASSETS.map((a) => (
          <TouchableOpacity
            key={a}
            onPress={() => setAsset(a)}
            className={`px-4 py-2 rounded-xl border ${
              asset === a ? "bg-blue-600 border-blue-700" : "border-gray-300"
            }`}
          >
            <Text className={asset === a ? "text-white" : "text-gray-800"}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        placeholder="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        className="border p-3 rounded-lg"
      />

      {error && <Text className="text-red-500">{error}</Text>}

      <TouchableOpacity
        disabled={!canContinue}
        onPress={() => setConfirmVisible(true)}
        className={`rounded-lg p-4 ${canContinue ? "bg-black" : "bg-gray-300"}`}
      >
        {loading ? <ActivityIndicator /> : <Text className="text-white text-center font-medium">Continue</Text>}
      </TouchableOpacity>

      <ConfirmPurchaseModal
        visible={confirmVisible}
        lines={[
          { label: "Asset", value: asset },
          { label: "Amount", value: amount },
        ]}
        loading={loading}
        onClose={() => setConfirmVisible(false)}
        onConfirm={submit}
      />

      <Text className="text-gray-500 text-xs">
        This screen uses your existing Edge Function: convert-crypto-to-ngn.
      </Text>
    </View>
  );
}
