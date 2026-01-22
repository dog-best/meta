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

type Operator = { label: string; value: string };

const OPERATORS: Operator[] = [
  { label: "Bet9ja", value: "bet9ja" },
  { label: "SportyBet", value: "sportybet" },
  { label: "1xBet", value: "1xbet" },
  { label: "BetKing", value: "betking" },
];

export default function BettingScreen() {
  const { fundBetting, loading } = useMakePurchase();

  const [operator, setOperator] = useState<string>(OPERATORS[0].value);
  const [customerId, setCustomerId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [confirmVisible, setConfirmVisible] = useState(false);

  const canContinue = useMemo(() => {
    const numericAmount = Number(amount);
    return (
      !!customerId.trim() &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0 &&
      !loading
    );
  }, [customerId, amount, loading]);

  const submit = async () => {
    setConfirmVisible(false);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData.session?.access_token) {
      Alert.alert("Sign in required", "Please sign in to continue.");
      return;
    }

    try {
      await fundBetting({
        operator,
        customer_id: customerId.trim(),
        amount: Number(amount),
        reference: buildReference("BET"),
      });

      Alert.alert("Success", "Betting wallet funded");
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
      <Text className="text-xl font-semibold">Fund Betting</Text>

      <Text className="font-medium">Operator</Text>
      <View className="flex-row flex-wrap gap-2">
        {OPERATORS.map((o) => (
          <TouchableOpacity
            key={o.value}
            onPress={() => setOperator(o.value)}
            className={`px-3 py-2 rounded-xl border ${
              operator === o.value ? "bg-blue-600 border-blue-700" : "border-gray-300"
            }`}
          >
            <Text className={operator === o.value ? "text-white" : "text-gray-800"}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        placeholder="Betting account ID / phone"
        value={customerId}
        onChangeText={setCustomerId}
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
          { label: "Operator", value: OPERATORS.find((o) => o.value === operator)?.label ?? operator },
          { label: "Account", value: customerId },
          { label: "Amount", value: `₦${Number(amount).toLocaleString()}` },
        ]}
        loading={loading}
        onClose={() => setConfirmVisible(false)}
        onConfirm={submit}
      />
    </View>
  );
}
