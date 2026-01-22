import ConfirmPurchase from "@/components/common/confirmpurchase";
import { supabase } from "@/services/supabase";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SendMoney({ onSuccess }: { onSuccess: () => void }) {
  const [uid, setUid] = useState("");
  const [amount, setAmount] = useState("100");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const a = useMemo(() => Number(amount || 0), [amount]);

  async function send() {
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) throw new Error("Not signed in");

    const { data, error } = await supabase.rpc("simple_transfer_by_public_uid", {
      p_from_user_id: userId,
      p_to_public_uid: uid.trim(),
      p_amount: a,
    });

    if (error) throw new Error(error.message);
    return data;
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

      <Pressable style={styles.btn} onPress={() => setConfirm(true)}>
        <Text style={styles.btnText}>Review & Send</Text>
      </Pressable>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <ConfirmPurchase
        visible={confirm}
        title="Confirm transfer"
        message={`Send ₦${(a || 0).toLocaleString()} to UID: ${uid.trim()}?`}
        confirmText="Send"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try {
            const res = await send();
            setMsg(`Sent successfully. Ref: ${res.reference}`);
            onSuccess();
          } catch (e: any) {
            setMsg(e.message);
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
  btn: { marginTop: 12, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnText: { color: "white", fontWeight: "900" },
  msg: { color: "rgba(255,255,255,0.75)", marginTop: 12 },
});
