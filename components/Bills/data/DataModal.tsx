import { generateReference } from "@/services/utils";
import { supabase } from "@/supabase/client";
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

/**
 * NOTE:
 * These bundle codes MUST match Paystack bill plans.
 * You can later fetch these dynamically from your backend.
 */
const DATA_PLANS = {
  mtn: [
    { label: "500MB - ₦500", plan: "mtn-500mb", amount: 500 },
    { label: "1GB - ₦1000", plan: "mtn-1gb", amount: 1000 },
  ],
  airtel: [
    { label: "1GB - ₦1000", plan: "airtel-1gb", amount: 1000 },
  ],
  glo: [
    { label: "1GB - ₦1000", plan: "glo-1gb", amount: 1000 },
  ],
  "9mobile": [
    { label: "1GB - ₦1000", plan: "9mobile-1gb", amount: 1000 },
  ],
};

export default function DataModal({ visible, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<keyof typeof DATA_PLANS>("mtn");
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = async () => {
    setError(null);

    if (!phone || !plan) {
      setError("Phone number and data plan are required");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "paystack-data",
        {
          body: {
            phone,
            provider,
            product_code: plan.plan,
            reference: generateReference("DATA"),
          },
        }
      );

      if (error || !data?.success) {
        throw new Error("Data purchase failed");
      }

      onClose();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white p-5 rounded-t-2xl">
          <Text className="text-lg font-semibold mb-4">
            Buy Data
          </Text>

          {error && <Text className="text-red-500 mb-2">{error}</Text>}

          <TextInput
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            className="border p-3 rounded mb-3"
          />

          {/* PROVIDERS */}
          <View className="flex-row justify-between mb-3">
            {Object.keys(DATA_PLANS).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => {
                  setProvider(p as any);
                  setPlan(null);
                }}
                className={`px-3 py-2 rounded border ${
                  provider === p
                    ? "bg-primary border-primary"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={
                    provider === p ? "text-white" : "text-gray-700"
                  }
                >
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* DATA PLANS */}
          {DATA_PLANS[provider].map((p) => (
            <TouchableOpacity
              key={p.plan}
              onPress={() => setPlan(p)}
              className={`p-3 mb-2 rounded border ${
                plan?.plan === p.plan
                  ? "border-primary bg-primary/10"
                  : "border-gray-200"
              }`}
            >
              <Text>{p.label}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={handlePurchase}
            disabled={loading}
            className="bg-primary py-4 rounded items-center mt-3"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">
                Buy Data
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            className="mt-4 items-center"
          >
            <Text className="text-gray-500">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
