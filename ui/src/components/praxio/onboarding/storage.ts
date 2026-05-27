// Praxio onboarding wizard — persistence layer.
//
// Persists wizard progress so a user who quits mid-wizard resumes at the
// last incomplete step (AZU-736 acceptance criterion).
//
// SECURITY: The raw Anthropic API key is NOT persisted here. The wizard
// records only `apiKeyValidated` + a masked tail. The actual secret is
// handed off to an external `ApiKeyStore` (Electron safeStorage in the
// shipped app; an in-memory shim in tests). See `apiKeyStore.ts`.

import {
  PRAXIO_ONBOARDING_STORAGE_KEY,
  makeEmptyState,
  type PraxioOnboardingState,
} from './types';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  const ls = (globalThis as { localStorage?: StorageAdapter }).localStorage;
  return ls ?? null;
}

/** Load persisted state, or `null` if nothing/corrupt/wrong-version. */
export function loadOnboardingState(storage: StorageAdapter | null = defaultStorage()): PraxioOnboardingState | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(PRAXIO_ONBOARDING_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<PraxioOnboardingState>;
  if (candidate.version !== 1) return null;
  // Fill any newer optional fields with empty defaults so the persisted
  // payload remains forward-compatible within v1.
  const empty = makeEmptyState();
  return { ...empty, ...candidate, version: 1 } as PraxioOnboardingState;
}

export function saveOnboardingState(
  state: PraxioOnboardingState,
  storage: StorageAdapter | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PRAXIO_ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Swallow storage errors (quota, private mode). Wizard remains usable
    // in-memory; persistence will retry on next state mutation.
  }
}

export function clearOnboardingState(storage: StorageAdapter | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PRAXIO_ONBOARDING_STORAGE_KEY);
  } catch {
    // ignore
  }
}
