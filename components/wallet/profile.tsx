import { supabase } from "@/services/supabase";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function ProfileModal({ visible, onClose }: Props) {
  const [uid, setUid] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return;

      const p = await supabase.from("profiles").select("public_uid").eq("id", userId).maybeSingle();
      setUid(p.data?.public_uid ?? "");
    })();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.h}>Profile</Text>
          <Text style={styles.label}>Your UID (share to receive money)</Text>
          <View style={styles.uidBox}>
            <Text style={styles.uid}>{uid || "—"}</Text>
          </View>

          <View style={{ height: 12 }} />

          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={async () => {
              await supabase.auth.signOut();
              onClose();
            }}
          >
            <Text style={styles.btnGhostText}>Sign out</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
            <Text style={styles.btnPrimaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0B0F17",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  h: { color: "white", fontSize: 16, fontWeight: "900" },
  label: { color: "rgba(255,255,255,0.65)", marginTop: 10, fontWeight: "700" },
  uidBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  uid: { color: "white", fontWeight: "900", fontSize: 16, letterSpacing: 0.6 },
  btn: { marginTop: 10, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnGhost: { backgroundColor: "rgba(255,255,255,0.06)" },
  btnGhostText: { color: "white", fontWeight: "900" },
  btnPrimary: { backgroundColor: "#2563EB" },
  btnPrimaryText: { color: "white", fontWeight: "900" },
});
