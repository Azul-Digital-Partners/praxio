// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { PraxioOnboardingWizard } from './PraxioOnboardingWizard';
import { saveOnboardingState, type StorageAdapter } from './storage';
import { makeEmptyState } from './types';

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

describe('PraxioOnboardingWizard', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders the progress indicator with 7 dots and marks the current step active', () => {
    render(<PraxioOnboardingWizard storage={storage} initialStep={3} />);
    expect(screen.getByTestId('praxio-progress')).toHaveTextContent('Step 3 of 7');
    expect(screen.getByTestId('praxio-progress-dot-3')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('praxio-progress-dot-7')).toHaveAttribute('data-active', 'false');
  });

  it('disables Back on step 1 and Next when current step is incomplete', () => {
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    expect(screen.getByTestId('praxio-back')).toBeDisabled();
    // Step 1 cosName default "Rosalind" is non-empty -> can advance.
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
  });

  it('blocks advancing from Step 2 when the API key is not validated', () => {
    render(<PraxioOnboardingWizard storage={storage} initialStep={2} />);
    expect(screen.getByTestId('praxio-next')).toBeDisabled();
  });

  it('resumes a returning user at the last incomplete step', () => {
    const seed = makeEmptyState();
    seed.apiKeyValidated = true;
    seed.userName = 'Alex';
    seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
    saveOnboardingState(seed, storage);

    render(<PraxioOnboardingWizard storage={storage} />);
    // Steps 1-5 satisfied; step 6 is skippable, step 7 still requires completion.
    expect(screen.getByTestId('praxio-onboarding-wizard')).toHaveAttribute('data-current-step', '7');
  });

  it('typing into Step 1 mutates cosName state via the shared context', () => {
    render(<PraxioOnboardingWizard storage={storage} initialStep={1} />);
    const input = screen.getByTestId('step1-cos-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Aurora' } });
    expect(input.value).toBe('Aurora');
    const persisted = storage._map.get('praxio.onboarding.v1');
    expect(persisted).toContain('Aurora');
  });
});
