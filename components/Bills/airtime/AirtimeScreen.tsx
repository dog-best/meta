import ConfirmPurchaseModal from "@/components/common/confirmpurchase";
import { useMakePurchase } from "@/hooks/Purchase/useMakePurchase";
import { useProviders } from "@/hooks/Purchase/useProviders";
import { supabase } from "@/supabase/client";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ProviderSelect from "./ProviderSelect";

function buildReference(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AirtimeScreen() {
  const { providers, loading: providersLoading } = useProviders();
  const { buyAirtime, loading } = useMakePurchase();

  const [provider, setProvider] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const canContinue = useMemo(() => {
    const numericAmount = Number(amount);
    return (
      !!provider &&
      !!phone.trim() &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0 &&
      !loading
    );
  }, [provider, phone, amount, loading]);

  const submit = async () => {
    setConfirmVisible(false);

    // ✅ Auth check (prevents 401)
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session?.access_token) {
      Alert.alert("Sign in required", "Please sign in to continue.");
      return;
    }

    const payload = {
      provider,
      phone: phone.trim(),
      amount: Number(amount),
      reference: buildReference("AIRTIME"),
    };

    try {
      await buyAirtime(payload);
      Alert.alert("Success", "Airtime purchase successful");
      setAmount("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "We couldn’t complete your request right now. Please try again.");
    }
  };

  return (
    <View className="flex-1 p-4 gap-4 bg-white">
      <Text className="text-xl font-semibold">Buy Airtime</Text>

      {providersLoading ? (
        <View className="py-2">
          <ActivityIndicator />
        </View>
      ) : (
        <ProviderSelect providers={providers} value={provider} onChange={setProvider} />
      )}

      <TextInput
        placeholder="Phone Number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="number-pad"
        className="border p-3 rounded-lg"
      />

      <TextInput
        placeholder="Amount (₦)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        className="border p-3 rounded-lg"
      />

      <TouchableOpacity
        disabled={!canContinue}
        onPress={() => setConfirmVisible(true)}
        className={`rounded-lg p-4 ${canContinue ? "bg-blue-600" : "bg-gray-300"}`}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-white text-center font-medium">Continue</Text>
        )}
      </TouchableOpacity>

      <ConfirmPurchaseModal
        visible={confirmVisible}
        lines={[
          { label: "Provider", value: provider?.toUpperCase() },
          { label: "Phone", value: phone },
          { label: "Amount", value: `₦${Number(amount).toLocaleString()}` },
        ]}
        loading={loading}
        onClose={() => setConfirmVisible(false)}
        onConfirm={submit}
      />
    </View>
  );
}
