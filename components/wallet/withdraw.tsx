import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import ConfirmPurchase from "@/components/common/confirmpurchase";
import { filterBanks, useBanks } from "@/hooks/wallet/useBanks";
import { callFn } from "@/services/functions";
import { requireLocalAuth } from "@/utils/secureAuth";

export default function Withdraw({ onSuccess }: { onSuccess: () => void }) {
  const { banks } = useBanks();
  const [search, setSearch] = useState("");
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);

  const [amount, setAmount] = useState("100");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const a = useMemo(() => Number(amount || 0), [amount]);
  const filtered = useMemo(() => filterBanks(banks, search), [banks, search]);

  async function submit() {
    setMsg(null);
    if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
    if (!bank) throw new Error("Select a bank");
    if (accountNumber.trim().length < 10) throw new Error("Enter a valid account number");
    if (!accountName.trim()) throw new Error("Account name is required");

    const auth = await requireLocalAuth("Confirm withdrawal");
    if (!auth.ok) throw new Error(auth.message || "Authentication required");

    const res = await callFn("paystack-withdraw-init", {
      amount: a,
      bank_code: bank.code,
      account_number: accountNumber,
      account_name: accountName,
    });
    return res;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Withdraw</Text>
      <Text style={styles.sub}>Fee: NGN 20 flat - Any amount</Text>

      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        style={styles.input}
        placeholder="100"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Bank</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        style={styles.input}
        placeholder="Search bank name"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />
      {bank ? <Text style={styles.selected}>Selected: {bank.name} ({bank.code})</Text> : null}

      <FlatList
        style={styles.bankList}
        data={filtered}
        keyExtractor={(i) => i.code}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setBank(item)} style={styles.bankRow}>
            <Text style={{ color: "white", fontWeight: "800" }}>{item.name}</Text>
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{item.code}</Text>
          </TouchableOpacity>
        )}
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Account number</Text>
      <TextInput
        value={accountNumber}
        onChangeText={setAccountNumber}
        keyboardType="number-pad"
        style={styles.input}
        placeholder="0123456789"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Account name</Text>
      <TextInput
        value={accountName}
        onChangeText={setAccountName}
        style={styles.input}
        placeholder="John Doe"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />

      <Pressable style={[styles.btn, loading ? styles.btnDisabled : null]} onPress={() => setConfirm(true)} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Review and Withdraw</Text>}
      </Pressable>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <ConfirmPurchase
        visible={confirm}
        title="Confirm withdrawal"
        message={`Withdraw NGN ${(a || 0).toLocaleString()} to ${bank?.name || "bank"}.\n\nFee: NGN 20\nTotal debit: NGN ${((a || 0) + 20).toLocaleString()}`}
        confirmText="Withdraw"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setLoading(true);
          try {
            const res: any = await submit();
            setMsg(`Withdrawal started. Ref: ${res.reference ?? "OK"}`);
            onSuccess();
          } catch (e: any) {
            setMsg(e.message);
          } finally {
            setLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: "#0B0F17",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  h: { color: "white", fontWeight: "900", fontSize: 16 },
  sub: { color: "rgba(255,255,255,0.6)", marginTop: 4, marginBottom: 14, fontSize: 12 },
  label: { color: "rgba(255,255,255,0.7)", fontWeight: "700", marginBottom: 8 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "white",
  },
  selected: { marginTop: 8, color: "rgba(255,255,255,0.75)" },
  bankList: {
    marginTop: 10,
    maxHeight: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  bankRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  btn: { marginTop: 12, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "white", fontWeight: "900" },
  msg: { color: "rgba(255,255,255,0.75)", marginTop: 12 },
});
