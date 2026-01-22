import React, { useRef } from "react";
import {
    ActivityIndicator,
    Modal,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Props = {
  visible: boolean;
  title?: string;

  lines: Array<{ label: string; value: string }>;

  // Optional single input (phone / recipient / etc.)
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  onInputChange?: (v: string) => void;
  inputKeyboardType?: "default" | "number-pad" | "numeric";

  loading?: boolean;

  onClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
};

export default function ConfirmPurchaseModal({
  visible,
  title = "Confirm",
  lines,

  inputLabel,
  inputPlaceholder = "Enter value",
  inputValue,
  onInputChange,
  inputKeyboardType = "default",

  loading = false,
  onClose,
  onConfirm,
  confirmText = "Continue",
}: Props) {
  const locked = useRef(false);

  const safeConfirm = async () => {
    if (loading) return;
    if (locked.current) return;
    locked.current = true;
    try {
      await onConfirm();
    } finally {
      locked.current = false;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/60 justify-center p-6">
        <View className="bg-white rounded-xl p-6">
          <Text className="text-lg font-semibold mb-3">{title}</Text>

          {lines.map((l, idx) => (
            <View key={idx} className="mb-1">
              <Text>
                {l.label}: {l.value}
              </Text>
            </View>
          ))}

          {typeof inputValue === "string" && onInputChange && (
            <View className="mt-4">
              {!!inputLabel && (
                <Text className="text-xs text-gray-600 mb-1">{inputLabel}</Text>
              )}
              <TextInput
                placeholder={inputPlaceholder}
                value={inputValue}
                onChangeText={onInputChange}
                keyboardType={inputKeyboardType}
                className="border p-3 rounded-lg"
              />
            </View>
          )}

          <View className="flex-row justify-between mt-6">
            <TouchableOpacity
              onPress={onClose}
              disabled={loading}
              className="px-4 py-3 border rounded-lg"
            >
              <Text>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={safeConfirm}
              disabled={loading}
              className="px-4 py-3 bg-blue-600 rounded-lg"
            >
              {loading ? <ActivityIndicator /> : <Text className="text-white">{confirmText}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
