const PREFIX = "bc_web_secure_store_v1__";
const memoryStore = new Map<string, string>();

function toStorageKey(key: string) {
  return `${PREFIX}${String(key || "").trim()}`;
}

function getLocalStorageSafe() {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  const storageKey = toStorageKey(key);
  const ls = getLocalStorageSafe();
  if (ls) {
    try {
      const value = ls.getItem(storageKey);
      if (value !== null) return value;
    } catch {
      // ignore localStorage access issues
    }
  }
  return memoryStore.has(storageKey) ? memoryStore.get(storageKey)! : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  const storageKey = toStorageKey(key);
  const safeValue = String(value ?? "");
  const ls = getLocalStorageSafe();
  if (ls) {
    try {
      ls.setItem(storageKey, safeValue);
      return;
    } catch {
      // fallback to in-memory storage
    }
  }
  memoryStore.set(storageKey, safeValue);
}

export async function deleteItemAsync(key: string): Promise<void> {
  const storageKey = toStorageKey(key);
  const ls = getLocalStorageSafe();
  if (ls) {
    try {
      ls.removeItem(storageKey);
    } catch {
      // ignore localStorage access issues
    }
  }
  memoryStore.delete(storageKey);
}

