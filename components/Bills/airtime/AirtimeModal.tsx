import { callFn } from "@/services/functions";
import { generateReference } from "@/services/utils";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const PROVIDERS = ["mtn", "airtel", "glo", "9mobile"] as const;
type Provider = (typeof PROVIDERS)[number];

export default function AirtimeModal({ visible, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<Provider>("mtn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPurchase = async () => {
    setError(null);
    const numeric = Number(amount);
    if (!phone.trim() || !Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a valid phone number and amount.");
      return;
    }

    setLoading(true);
    try {
      await callFn("paystack-airtime", {
        phone: phone.trim(),
        provider,
        amount: numeric,
        reference: generateReference("AIRTIME"),
      });
      onClose();
      setAmount("");
      setPhone("");
    } catch (e: any) {
      setError(e?.message ?? "Airtime purchase failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white p-5 rounded-t-2xl">
          <Text className="text-lg font-semibold mb-4">Buy Airtime</Text>

          {error ? <Text className="text-red-500 mb-2">{error}</Text> : null}

          <TextInput
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            className="border p-3 rounded mb-3"
          />

          <TextInput
            placeholder="Amount (NGN)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            className="border p-3 rounded mb-3"
          />

          <View className="flex-row flex-wrap gap-2 mb-3">
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setProvider(p)}
                className={`px-3 py-2 rounded border ${
                  provider === p ? "bg-primary border-primary" : "border-gray-300"
                }`}
              >
                <Text className={provider === p ? "text-white" : "text-gray-700"}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={onPurchase}
            disabled={loading}
            className="bg-primary py-4 rounded items-center mt-2"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Buy Airtime</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} className="mt-4 items-center">
            <Text className="text-gray-500">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
