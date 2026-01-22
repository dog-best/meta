import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmPurchase({
  visible,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.msg}>{message}</Text>

          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>{cancelText}</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, danger ? styles.btnDanger : styles.btnPrimary]}
              onPress={onConfirm}
            >
              <Text style={styles.btnPrimaryText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0B0F17",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: { color: "white", fontSize: 16, fontWeight: "800" },
  msg: { color: "rgba(255,255,255,0.75)", marginTop: 10, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnGhost: { backgroundColor: "rgba(255,255,255,0.06)" },
  btnGhostText: { color: "white", fontWeight: "700" },
  btnPrimary: { backgroundColor: "#2563EB" },
  btnDanger: { backgroundColor: "#EF4444" },
  btnPrimaryText: { color: "white", fontWeight: "800" },
});
