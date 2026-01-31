import ConfirmPurchase from "@/components/common/confirmpurchase";
import { callFn } from "@/services/functions";
import { requireLocalAuth } from "@/utils/secureAuth";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";

export default function FundWallet({ onSuccess }: { onSuccess: () => void }) {
  const [amount, setAmount] = useState("1000");
  const [checkout, setCheckout] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const a = useMemo(() => Number(amount || 0), [amount]);

  async function start() {
    if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
    const auth = await requireLocalAuth("Confirm wallet funding");
    if (!auth.ok) throw new Error(auth.message || "Authentication required");

    const res = await callFn<{ authorization_url: string }>("paystack-init", { amount: a });
    setCheckout(res.authorization_url);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Fund Wallet</Text>
      <Text style={styles.sub}>Instant funding via Paystack</Text>

      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        style={styles.input}
        placeholder="1000"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <Pressable style={[styles.btn, loading ? styles.btnDisabled : null]} onPress={() => setConfirm(true)} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue to Paystack</Text>}
      </Pressable>

      <ConfirmPurchase
        visible={confirm}
        title="Confirm deposit"
        message={`You are about to fund ₦${(a || 0).toLocaleString()} into your wallet.`}
        confirmText="Proceed"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setLoading(true);
          setMsg(null);
          try {
            await start();
          } catch (e: any) {
            setMsg(e?.message ?? "Funding failed");
          } finally {
            setLoading(false);
          }
        }}
      />

      <Modal visible={!!checkout} animationType="slide" onRequestClose={() => setCheckout(null)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.webTop}>
            <Pressable onPress={() => { setCheckout(null); onSuccess(); }}>
              <Text style={styles.webClose}>Close</Text>
            </Pressable>
            <Text style={styles.webTitle}>Paystack Checkout</Text>
            <View style={{ width: 60 }} />
          </View>

          {checkout ? <WebView source={{ uri: checkout }} /> : null}
        </View>
      </Modal>
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
  btn: { marginTop: 12, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "white", fontWeight: "900" },
  msg: { color: "rgba(255,255,255,0.75)", marginTop: 10 },
  webTop: {
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B0F17",
  },
  webClose: { color: "#93C5FD", fontWeight: "900", width: 60 },
  webTitle: { color: "white", fontWeight: "900" },
});
