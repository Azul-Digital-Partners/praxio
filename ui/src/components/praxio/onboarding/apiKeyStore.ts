// ApiKeyStore — the wizard never persists the raw Anthropic key to the
// shared onboarding state. It hands it to this store, which the Electron
// preload bridges to OS-level secure storage (safeStorage / keychain).
//
// In tests / web builds with no bridge, a process-local in-memory store is
// used so the wizard contract still holds.

import type { PraxioOnboardingState } from './types';

export interface ApiKeyStore {
  /** Persist the key. Returns the masked tail used for display. */
  set(key: string): Promise<{ maskedTail: string }>;
  /** Read back the key (e.g. for the server fork to consume). */
  get(): Promise<string | null>;
  /** Wipe the key. */
  clear(): Promise<void>;
}

declare global {
  // Electron preload exposes window.praxio.apiKey when running in the app.
  // Tests can stub this by assigning to globalThis.
  // eslint-disable-next-line no-var
  var praxio: { apiKey?: ApiKeyStore } | undefined;
}

const memoryStore: { value: string | null } = { value: null };

const inMemoryAdapter: ApiKeyStore = {
  async set(key: string) {
    memoryStore.value = key;
    return { maskedTail: maskKey(key) };
  },
  async get() {
    return memoryStore.value;
  },
  async clear() {
    memoryStore.value = null;
  },
};

export function getApiKeyStore(): ApiKeyStore {
  const bridged = (globalThis as unknown as { praxio?: { apiKey?: ApiKeyStore } }).praxio?.apiKey;
  return bridged ?? inMemoryAdapter;
}

export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••';
  return `…${trimmed.slice(-4)}`;
}

/** Format check (no network). Real validation happens via validator hook. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

export type ApiKeyValidator = (key: string) => Promise<
  | { ok: true; maskedTail: string }
  | { ok: false; reason: 'format' | 'rejected' | 'network' }
>;

/** Default validator — calls the local server's validation endpoint when
 *  available, else does a best-effort format check. The Praxio server
 *  exposes /api/anthropic/validate-key (added separately). */
export const defaultApiKeyValidator: ApiKeyValidator = async (key) => {
  if (!looksLikeAnthropicKey(key)) {
    return { ok: false, reason: 'format' };
  }
  if (typeof fetch === 'undefined') {
    return { ok: true, maskedTail: maskKey(key) };
  }
  try {
    const res = await fetch('/api/anthropic/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      if (res.status >= 500) return { ok: false, reason: 'network' };
      return { ok: false, reason: 'rejected' };
    }
    return { ok: true, maskedTail: maskKey(key) };
  } catch {
    return { ok: false, reason: 'network' };
  }
};

export function asMaskedSummary(state: Pick<PraxioOnboardingState, 'apiKeyMaskedTail' | 'apiKeyValidated'>): string {
  if (!state.apiKeyValidated) return 'Not connected';
  return `Connected (${state.apiKeyMaskedTail ?? '…'})`;
}
