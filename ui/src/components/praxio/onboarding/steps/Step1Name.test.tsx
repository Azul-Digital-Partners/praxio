// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

// AZU-740 Step 1 — Welcome + Name CoS.
//
// Spec:
//   - Pre-filled default: Rosalind
//   - Free text, required (default accepted counts)

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { PraxioOnboardingWizard } from '../PraxioOnboardingWizard';
import type { StorageAdapter } from '../storage';

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

describe('Step 1 — Welcome + Name CoS (AZU-740)', () => {
  afterEach(() => {
    cleanup();
  });

  it('pre-fills the CoS name with "Rosalind"', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    const input = screen.getByTestId('step1-cos-name') as HTMLInputElement;
    expect(input.value).toBe('Rosalind');
  });

  it('treats the default as acceptable — Continue is enabled with no edits', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
  });

  it('disables Continue when the user clears the CoS name', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    const input = screen.getByTestId('step1-cos-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('praxio-next')).toBeDisabled();
  });

  it('persists a custom CoS name through the shared state', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    const input = screen.getByTestId('step1-cos-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Aurora' } });
    expect(input.value).toBe('Aurora');
    expect(storage._map.get('praxio.onboarding.v1')).toContain('Aurora');
  });
});
