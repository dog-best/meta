import ConfirmPurchase from "@/components/common/confirmpurchase";
import { supabase } from "@/services/supabase";
import { requireLocalAuth } from "@/utils/secureAuth";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type TransferResponse = {
  reference: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
};

export default function SendMoney({ onSuccess }: { onSuccess: () => void }) {
  const [uid, setUid] = useState("");
  const [amount, setAmount] = useState("100");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const a = useMemo(() => Number(amount || 0), [amount]);

  async function send() {
    setMsg(null);

    const toUid = uid.trim();
    if (!toUid) throw new Error("Recipient UID is required");

    if (!Number.isFinite(a) || a <= 0) {
      throw new Error("Enter a valid amount");
    }

    // Ensure signed in (DB function uses auth.uid() server-side)
    const { data: u, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw new Error(userErr.message);
    if (!u.user?.id) throw new Error("Not signed in");

    const auth = await requireLocalAuth("Confirm transfer");
    if (!auth.ok) throw new Error(auth.message || "Authentication required");

    // Call NEW signature: (p_to_public_uid text, p_amount numeric) returns jsonb
    const { data, error } = await supabase.rpc("simple_transfer_by_public_uid", {
      p_to_public_uid: toUid,
      p_amount: a,
    });

    if (error) throw new Error(error.message);

    // returns jsonb, so `data` should be an object
    const res = data as TransferResponse | null;

    if (!res?.reference) {
      throw new Error("Transfer completed but no reference returned");
    }

    return res;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Send</Text>
      <Text style={styles.sub}>Send to another user using their UID</Text>

      <Text style={styles.label}>Recipient UID</Text>
      <TextInput
        value={uid}
        onChangeText={setUid}
        style={styles.input}
        placeholder="e.g. a1b2c3d4"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Amount (NGN)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        style={styles.input}
        placeholder="100"
        placeholderTextColor="rgba(255,255,255,0.35)"
      />

      <Pressable style={[styles.btn, loading ? styles.btnDisabled : null]} disabled={loading} onPress={() => setConfirm(true)}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Review & Send</Text>}
      </Pressable>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <ConfirmPurchase
        visible={confirm}
        title="Confirm transfer"
        message={`Send ₦${(a || 0).toLocaleString()} to UID: ${uid.trim()}?`}
        confirmText={loading ? "Sending..." : "Send"}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setLoading(true);
          try {
            const res = await send();
            setMsg(`Sent successfully. Ref: ${res.reference}`);
            onSuccess();
          } catch (e: any) {
            setMsg(e?.message ?? "Transfer failed");
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
  btn: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: { color: "white", fontWeight: "900" },
  msg: { color: "rgba(255,255,255,0.75)", marginTop: 12 },
});
