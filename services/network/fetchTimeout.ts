// services/network/fetchTimeout.ts
declare global {
  // eslint-disable-next-line no-var
  var __FETCH_TIMEOUT_INSTALLED__: boolean | undefined;
}

export function installFetchTimeout(timeoutMs = 15000) {
  if (globalThis.__FETCH_TIMEOUT_INSTALLED__) return;
  globalThis.__FETCH_TIMEOUT_INSTALLED__ = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Chain caller’s abort signal if present
    const callerSignal = init.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      return await originalFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
