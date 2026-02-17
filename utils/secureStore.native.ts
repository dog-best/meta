import * as ExpoSecureStore from "expo-secure-store";

export async function getItemAsync(key: string): Promise<string | null> {
  return ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await ExpoSecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  await ExpoSecureStore.deleteItemAsync(key);
}

