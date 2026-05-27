// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

// AZU-740 Step 3 — About You.
//
// Spec:
//   - Your name (required)
//   - Your role: quick-pick + Other free text
//   - Your #1 priority right now (free text)
//   - Timezone (auto-detect + confirm dropdown)
//   - Agent disclosure line below fields
//   - Skip: name required; others have "I'll tell [CoS name] about this later."
//   - CoS name from Step 1 interpolated into copy

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

function seedWithCos(storage: StorageAdapter, cosName: string) {
  const state = makeEmptyState();
  state.cosName = cosName;
  saveOnboardingState(state, storage);
}

describe('Step 3 — About You (AZU-740)', () => {
  afterEach(() => {
    cleanup();
  });

  it('blocks Continue until a name is entered (name is the only required field)', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    expect(screen.getByTestId('praxio-next')).toBeDisabled();
    expect(screen.getByTestId('step3-name-error')).toBeInTheDocument();

    const name = screen.getByTestId('step3-name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Steven' } });
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
  });

  it('renders all 9 role quick-pick options and patches state when selected', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);

    for (const slug of [
      'fractional-executive',
      'ceo',
      'coo',
      'cmo',
      'cfo',
      'cro',
      'consultant',
      'advisor',
      'other',
    ]) {
      expect(screen.getByTestId(`step3-role-${slug}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('step3-role-cfo'));
    expect(screen.getByTestId('step3-role-cfo')).toHaveAttribute('aria-pressed', 'true');
    expect(storage._map.get('praxio.onboarding.v1')).toContain('"userRole":"cfo"');
  });

  it('reveals the free-text "Other" input when the Other chip is selected', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    expect(screen.queryByTestId('step3-role-other-text')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('step3-role-other'));
    const otherField = screen.getByTestId('step3-role-other-text') as HTMLInputElement;
    expect(otherField).toBeInTheDocument();
    fireEvent.change(otherField, { target: { value: 'Fractional CRO + COO' } });
    expect(storage._map.get('praxio.onboarding.v1')).toContain('Fractional CRO + COO');
  });

  it('renders the priority field with a "tell [CoS] later" skip placeholder', () => {
    const storage = memoryStorage();
    seedWithCos(storage, 'Aurora');
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    const priority = screen.getByTestId('step3-priority') as HTMLInputElement;
    expect(priority.placeholder).toContain('Aurora');
    expect(priority.placeholder.toLowerCase()).toContain('later');
  });

  it('renders the timezone as a dropdown (select) pre-populated with the auto-detected value', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    const tz = screen.getByTestId('step3-tz') as HTMLSelectElement;
    expect(tz.tagName.toLowerCase()).toBe('select');
    // The auto-detected zone is always the first option so it's preserved.
    expect(tz.options.length).toBeGreaterThan(1);
    expect(tz.value.length).toBeGreaterThan(0);

    // Picking a different zone patches state.
    fireEvent.change(tz, { target: { value: 'Europe/London' } });
    expect(tz.value).toBe('Europe/London');
    expect(storage._map.get('praxio.onboarding.v1')).toContain('Europe/London');
  });

  it('shows the marketing+ops agent disclosure line', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    const disclosure = screen.getByTestId('step3-agent-disclosure');
    expect(disclosure).toHaveTextContent(/marketing and operations assistant/i);
  });

  it('interpolates the CoS name from Step 1 into the heading copy', () => {
    const storage = memoryStorage();
    seedWithCos(storage, 'Aurora');
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Aurora/);
  });
});
