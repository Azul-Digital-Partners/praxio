// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

// AZU-740 Step 6 — Goals.
//
// Spec:
//   - Focus theme (one sentence)
//   - Top 3 work goals (one per line)
//   - Cycle end date (date picker, optional)
//   - Fully skippable: "Rosalind will ask you about this in your first
//     conversation."

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { PraxioOnboardingWizard } from '../PraxioOnboardingWizard';
import { saveOnboardingState, type StorageAdapter } from '../storage';
import { makeEmptyState } from '../types';

expect.extend(matchers);

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

describe('Step 6 — Goals (AZU-740)', () => {
  afterEach(() => {
    cleanup();
  });

  it('is fully skippable — Continue is enabled with no fields filled', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={6} />);
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
  });

  it('shows the "[CoS] will ask in your first conversation" skip hint', () => {
    const storage = memoryStorage();
    const state = makeEmptyState();
    state.cosName = 'Aurora';
    saveOnboardingState(state, storage);

    render(<PraxioOnboardingWizard storage={storage} initialStep={6} />);
    const hint = screen.getByTestId('step6-skip-hint');
    expect(hint).toHaveTextContent(/Aurora/);
    expect(hint).toHaveTextContent(/first conversation/);
  });

  it('persists the focus theme', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={6} />);
    fireEvent.change(screen.getByTestId('step6-focus'), {
      target: { value: 'Ship MVP by Q3' },
    });
    expect(storage._map.get('praxio.onboarding.v1')).toContain('Ship MVP by Q3');
  });

  it('persists top goals as newline-separated entries', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={6} />);
    fireEvent.change(screen.getByTestId('step6-goals'), {
      target: { value: 'Ship MVP\nLand 3 design partners\nHire ops lead' },
    });
    const persisted = storage._map.get('praxio.onboarding.v1') ?? '';
    expect(persisted).toContain('Ship MVP');
    expect(persisted).toContain('Land 3 design partners');
    expect(persisted).toContain('Hire ops lead');
  });

  it('persists the cycle end date when picked, and null when cleared', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={6} />);
    const cycle = screen.getByTestId('step6-cycle') as HTMLInputElement;
    fireEvent.change(cycle, { target: { value: '2026-09-30' } });
    expect(storage._map.get('praxio.onboarding.v1')).toContain('2026-09-30');

    fireEvent.change(cycle, { target: { value: '' } });
    expect(storage._map.get('praxio.onboarding.v1')).toContain('"cycleEndDate":null');
  });
});
