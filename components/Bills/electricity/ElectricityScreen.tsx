import ConfirmPurchaseModal from "@/components/common/confirmpurchase";
import { useMakePurchase } from "@/hooks/Purchase/useMakePurchase";
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

function buildReference(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type Disco = { label: string; value: string };

const DISCOS: Disco[] = [
  { label: "Ikeja Electric", value: "ikeja" },
  { label: "Eko Electric", value: "eko" },
  { label: "PHED", value: "phed" },
  { label: "Abuja (AEDC)", value: "aedc" },
  { label: "Kano (KEDCO)", value: "kedco" },
];

export default function ElectricityScreen() {
  const { payElectricity, loading } = useMakePurchase();

  const [disco, setDisco] = useState<string>(DISCOS[0].value);
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [meterNumber, setMeterNumber] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const canContinue = useMemo(() => {
    const numericAmount = Number(amount);
    return (
      !!meterNumber.trim() &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0 &&
      !loading
    );
  }, [meterNumber, amount, loading]);

  const submit = async () => {
    setConfirmVisible(false);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session?.access_token) {
      Alert.alert("Sign in required", "Please sign in to continue.");
      return;
    }

    try {
      await payElectricity({
        disco,
        meter_number: meterNumber.trim(),
        meter_type: meterType,
        amount: Number(amount),
        reference: buildReference("ELEC"),
      });

      Alert.alert("Success", "Electricity payment request submitted");
      setAmount("");
    } catch (e: any) {
      Alert.alert(
        "Failed",
        e?.message ?? "We couldn’t complete your request right now. Please try again."
      );
    }
  };

  return (
    <View className="flex-1 p-4 gap-4 bg-white">
      <Text className="text-xl font-semibold">Pay Electricity</Text>

      <Text className="font-medium">Disco</Text>
      <View className="flex-row flex-wrap gap-2">
        {DISCOS.map((d) => (
          <TouchableOpacity
            key={d.value}
            onPress={() => setDisco(d.value)}
            className={`px-3 py-2 rounded-xl border ${
              disco === d.value ? "bg-blue-600 border-blue-700" : "border-gray-300"
            }`}
          >
            <Text className={disco === d.value ? "text-white" : "text-gray-800"}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="font-medium">Meter type</Text>
      <View className="flex-row gap-2">
        {(["prepaid", "postpaid"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setMeterType(t)}
            className={`px-4 py-2 rounded-xl border ${
              meterType === t ? "bg-blue-600 border-blue-700" : "border-gray-300"
            }`}
          >
            <Text className={meterType === t ? "text-white" : "text-gray-800"}>
              {t.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        placeholder="Meter number"
        value={meterNumber}
        onChangeText={setMeterNumber}
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
          { label: "Disco", value: DISCOS.find((d) => d.value === disco)?.label ?? disco },
          { label: "Meter type", value: meterType.toUpperCase() },
          { label: "Meter", value: meterNumber },
          { label: "Amount", value: `₦${Number(amount).toLocaleString()}` },
        ]}
        loading={loading}
        onClose={() => setConfirmVisible(false)}
        onConfirm={submit}
      />
    </View>
  );
}
