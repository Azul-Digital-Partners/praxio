import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
  type StorageAdapter,
} from './storage';
import { makeEmptyState, PRAXIO_ONBOARDING_STORAGE_KEY } from './types';

function memoryStorage(): StorageAdapter & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    _map: map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('storage', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns null when nothing is persisted', () => {
    expect(loadOnboardingState(storage)).toBeNull();
  });

  it('round-trips a saved state', () => {
    const s = makeEmptyState(() => '2026-01-01T00:00:00.000Z');
    s.cosName = 'Aurora';
    s.userName = 'Alex';
    saveOnboardingState(s, storage);
    const loaded = loadOnboardingState(storage);
    expect(loaded?.cosName).toBe('Aurora');
    expect(loaded?.userName).toBe('Alex');
  });

  it('discards persisted state with a non-matching version', () => {
    storage.setItem(
      PRAXIO_ONBOARDING_STORAGE_KEY,
      JSON.stringify({ ...makeEmptyState(), version: 99 }),
    );
    expect(loadOnboardingState(storage)).toBeNull();
  });

  it('discards corrupt JSON', () => {
    storage.setItem(PRAXIO_ONBOARDING_STORAGE_KEY, '{not-json');
    expect(loadOnboardingState(storage)).toBeNull();
  });

  it('clear removes the key', () => {
    saveOnboardingState(makeEmptyState(), storage);
    expect(storage._map.has(PRAXIO_ONBOARDING_STORAGE_KEY)).toBe(true);
    clearOnboardingState(storage);
    expect(storage._map.has(PRAXIO_ONBOARDING_STORAGE_KEY)).toBe(false);
  });

  it('never persists a raw API key field', () => {
    // The state shape intentionally excludes a raw `apiKey` field;
    // we record only the validated flag + masked tail.
    const s = makeEmptyState();
    s.apiKeyValidated = true;
    s.apiKeyMaskedTail = '…abcd';
    saveOnboardingState(s, storage);
    const raw = storage._map.get(PRAXIO_ONBOARDING_STORAGE_KEY)!;
    expect(raw).toContain('apiKeyMaskedTail');
    expect(raw).not.toContain('sk-ant-');
    expect(raw).not.toMatch(/"apiKey":/);
  });

  it('forward-compatibly fills missing optional fields from defaults', () => {
    // Simulate an older payload that lacks newer fields.
    const partial = {
      version: 1,
      cosName: 'Aurora',
      apiKeyValidated: true,
      apiKeyMaskedTail: '…1234',
    };
    storage.setItem(PRAXIO_ONBOARDING_STORAGE_KEY, JSON.stringify(partial));
    const loaded = loadOnboardingState(storage);
    expect(loaded?.cosName).toBe('Aurora');
    expect(loaded?.toolConnections).toEqual([]);
    expect(loaded?.topGoals).toEqual([]);
  });
});
