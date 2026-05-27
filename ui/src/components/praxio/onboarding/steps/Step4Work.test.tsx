// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

// AZU-740 Step 4 — Work Context.
//
// Spec:
//   - Business/team name (optional)
//   - What it does (optional)
//   - Tools you use — checkbox grid by category
//     (Messaging / Calendar / CRM / Project mgmt / Finance)
//   - Selection feeds Step 5 default tool list
//   - Fully skippable

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

describe('Step 4 — Work Context (AZU-740)', () => {
  afterEach(() => {
    cleanup();
  });

  it('is fully skippable — Continue is enabled with no fields filled', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={4} />);
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
    expect(screen.getByTestId('step4-skip-hint')).toBeInTheDocument();
  });

  it('renders the 5 category checkboxes from the spec', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={4} />);
    for (const slug of ['messaging', 'calendar', 'crm', 'project-management', 'finance']) {
      expect(screen.getByTestId(`step4-cat-${slug}`)).toBeInTheDocument();
    }
  });

  it('patches shared state when business name and one-liner are filled', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={4} />);
    fireEvent.change(screen.getByTestId('step4-biz'), { target: { value: 'Azul Digital' } });
    fireEvent.change(screen.getByTestId('step4-biz-line'), {
      target: { value: 'AI ops platform' },
    });
    const persisted = storage._map.get('praxio.onboarding.v1') ?? '';
    expect(persisted).toContain('Azul Digital');
    expect(persisted).toContain('AI ops platform');
  });

  it('toggles tool categories on the checkbox grid (feeds Step 5 default list)', () => {
    const storage = memoryStorage();
    render(<PraxioOnboardingWizard storage={storage} initialStep={4} />);

    fireEvent.click(screen.getByTestId('step4-cat-messaging'));
    fireEvent.click(screen.getByTestId('step4-cat-crm'));
    expect((screen.getByTestId('step4-cat-messaging') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('step4-cat-crm') as HTMLInputElement).checked).toBe(true);

    const persistedAfter = storage._map.get('praxio.onboarding.v1') ?? '';
    expect(persistedAfter).toContain('messaging');
    expect(persistedAfter).toContain('crm');

    // Toggling off removes from the list.
    fireEvent.click(screen.getByTestId('step4-cat-messaging'));
    expect((screen.getByTestId('step4-cat-messaging') as HTMLInputElement).checked).toBe(false);
  });

  it('interpolates the CoS name into the heading and skip hint', () => {
    const storage = memoryStorage();
    const state = makeEmptyState();
    state.cosName = 'Aurora';
    saveOnboardingState(state, storage);

    render(<PraxioOnboardingWizard storage={storage} initialStep={4} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Aurora/);
    expect(screen.getByTestId('step4-skip-hint')).toHaveTextContent(/Aurora/);
  });
});
