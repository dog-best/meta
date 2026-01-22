import ConfirmPurchaseModal from "@/components/common/confirmpurchase";
import { useMakePurchase } from "@/hooks/Purchase/useMakePurchase";
import { useProviders } from "@/hooks/Purchase/useProviders";
import { useServiceProducts } from "@/hooks/Purchase/useServiceProducts";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import BundleList from "./BundleList";
import ProviderSelect from "./ProviderSelect";

export default function DataScreen() {
  const { providers } = useProviders();
  const [provider, setProvider] = useState("");

  const { products, loading: productsLoading, error: productsError } =
    useServiceProducts("data", provider);

  const { buyData, loading } = useMakePurchase();

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [phone, setPhone] = useState("");

  const submit = async () => {
    setConfirmVisible(false);

    if (!selectedPlan?.product_code) {
      Alert.alert("Select a bundle", "Please choose a data bundle first.");
      return;
    }

    if (!provider) {
      Alert.alert("Select provider", "Please choose a network provider.");
      return;
    }

    if (!phone) {
      Alert.alert("Phone required", "Enter a phone number.");
      return;
    }

    const payload = {
      provider,
      phone,
      product_code: selectedPlan.product_code,
      reference: `DATA-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };

    try {
      await buyData(payload);
      Alert.alert("Success", "Data purchase successful");
      setSelectedPlan(null);
      // optional:
      // setPhone("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Data purchase failed");
    }
  };

  return (
    <View className="flex-1 p-4 gap-4 bg-white">
      <Text className="text-xl font-semibold">Buy Data</Text>

      <ProviderSelect providers={providers} value={provider} onChange={(v: string) => {
        setProvider(v);
        setSelectedPlan(null); // reset when changing network
      }} />

      {productsLoading ? (
        <ActivityIndicator />
      ) : productsError ? (
        <Text className="text-red-500">{productsError}</Text>
      ) : (
        <BundleList products={products} onSelect={setSelectedPlan} />
      )}

      {selectedPlan && (
        <TouchableOpacity
          onPress={() => setConfirmVisible(true)}
          className="bg-blue-600 rounded-lg p-4"
        >
          <Text className="text-white text-center font-medium">
            Buy {selectedPlan.name}
          </Text>
        </TouchableOpacity>
      )}

      <ConfirmPurchaseModal
  visible={confirmVisible}
  title="Confirm Data Purchase"
  lines={[
    { label: "Plan", value: selectedPlan?.name ?? "" },
    { label: "Price", value: `₦${Number(selectedPlan?.final_price ?? 0).toLocaleString()}` },
    { label: "Provider", value: provider?.toUpperCase() },
  ]}
  inputLabel="Phone Number"
  inputPlaceholder="Enter phone number"
  inputValue={phone}
  onInputChange={setPhone}
  inputKeyboardType="number-pad"
  loading={loading}
  onClose={() => setConfirmVisible(false)}
  onConfirm={submit}
/>

    </View>
  );
}


