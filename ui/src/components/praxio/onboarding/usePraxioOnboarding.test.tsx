// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePraxioOnboarding } from './usePraxioOnboarding';
import { saveOnboardingState, type StorageAdapter } from './storage';
import { makeEmptyState } from './types';

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

describe('usePraxioOnboarding', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });
  afterEach(() => {
    cleanup();
  });

  it('starts a fresh user at step 2 (cosName default, API key not yet validated)', () => {
    const { result } = renderHook(() => usePraxioOnboarding({ storage }));
    // Step 1 ("Rosalind" defaulted) is auto-complete, so resume jumps to 2.
    expect(result.current.currentStep).toBe(2);
  });

  it('resumes a returning user at the last incomplete step', () => {
    const s = makeEmptyState();
    s.apiKeyValidated = true;
    s.apiKeyMaskedTail = '…wxyz';
    s.userName = 'Alex';
    saveOnboardingState(s, storage);

    const { result } = renderHook(() => usePraxioOnboarding({ storage }));
    // 1: cosName ok, 2: validated, 3: name ok, 4: skippable, so first incomplete is 5.
    expect(result.current.currentStep).toBe(5);
    expect(result.current.state.userName).toBe('Alex');
  });

  it('setField updates state and persists', () => {
    const { result } = renderHook(() => usePraxioOnboarding({ storage }));
    act(() => {
      result.current.setField('userName', 'Alex');
    });
    expect(result.current.state.userName).toBe('Alex');
    const persisted = storage._map.get('praxio.onboarding.v1');
    expect(persisted).toContain('Alex');
  });

  it('next advances the step', () => {
    const { result } = renderHook(() => usePraxioOnboarding({ storage, initialStep: 1 }));
    expect(result.current.currentStep).toBe(1);
    act(() => {
      result.current.next();
    });
    expect(result.current.currentStep).toBe(2);
  });

  it('back retreats but does not go below 1', () => {
    const { result } = renderHook(() => usePraxioOnboarding({ storage, initialStep: 1 }));
    act(() => {
      result.current.back();
    });
    expect(result.current.currentStep).toBe(1);
  });

  it('Step 2 hard gate: stepping back into Step 2 clears apiKeyValidated', () => {
    // Set up a state where Step 2 is validated and we're sitting on Step 3.
    const seed = makeEmptyState();
    seed.apiKeyValidated = true;
    seed.apiKeyMaskedTail = '…wxyz';
    saveOnboardingState(seed, storage);

    const { result } = renderHook(() =>
      usePraxioOnboarding({ storage, initialStep: 3 }),
    );
    expect(result.current.state.apiKeyValidated).toBe(true);

    act(() => {
      result.current.back(); // back from 3 → 2
    });

    expect(result.current.currentStep).toBe(2);
    expect(result.current.state.apiKeyValidated).toBe(false);
    // Masked tail is retained for display continuity.
    expect(result.current.state.apiKeyMaskedTail).toBe('…wxyz');
  });

  it('Step 2 hard gate: jumping into Step 2 via goTo also clears apiKeyValidated', () => {
    const seed = makeEmptyState();
    seed.apiKeyValidated = true;
    saveOnboardingState(seed, storage);

    const { result } = renderHook(() =>
      usePraxioOnboarding({ storage, initialStep: 4 }),
    );
    act(() => {
      result.current.goTo(2);
    });
    expect(result.current.currentStep).toBe(2);
    expect(result.current.state.apiKeyValidated).toBe(false);
  });

  it('complete marks completedAt and snaps to last step', () => {
    const { result } = renderHook(() =>
      usePraxioOnboarding({ storage, now: () => '2026-05-27T12:00:00.000Z' }),
    );
    act(() => {
      result.current.complete();
    });
    expect(result.current.state.completedAt).toBe('2026-05-27T12:00:00.000Z');
    expect(result.current.currentStep).toBe(7);
    expect(result.current.isComplete).toBe(true);
  });

  it('reset clears persisted state and returns to Step 1', () => {
    const { result } = renderHook(() => usePraxioOnboarding({ storage }));
    act(() => {
      result.current.setField('userName', 'Alex');
      result.current.complete();
    });
    expect(result.current.isComplete).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.isComplete).toBe(false);
    expect(result.current.state.userName).toBe('');
    expect(result.current.currentStep).toBe(1);
    // Persistence is reset to a fresh empty state — not a leftover completed one.
    const persisted = storage._map.get('praxio.onboarding.v1');
    expect(persisted).toBeDefined();
    expect(persisted).not.toContain('"completedAt":"2026');
  });
});
