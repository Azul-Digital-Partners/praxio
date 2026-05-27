import { describe, it, expect } from 'vitest';
import {
  isStepComplete,
  makeEmptyState,
  nextIncompleteStep,
  type PraxioOnboardingState,
} from './types';

function withOverrides(overrides: Partial<PraxioOnboardingState>): PraxioOnboardingState {
  return { ...makeEmptyState(() => '2026-01-01T00:00:00.000Z'), ...overrides };
}

describe('isStepComplete', () => {
  it('step 1 satisfied by non-empty cosName (default "Rosalind" is accepted)', () => {
    expect(isStepComplete(makeEmptyState(), 1)).toBe(true);
    expect(isStepComplete(withOverrides({ cosName: '' }), 1)).toBe(false);
  });

  it('step 2 satisfied only when apiKeyValidated is true', () => {
    expect(isStepComplete(makeEmptyState(), 2)).toBe(false);
    expect(isStepComplete(withOverrides({ apiKeyValidated: true }), 2)).toBe(true);
  });

  it('step 3 requires userName (other fields optional)', () => {
    expect(isStepComplete(makeEmptyState(), 3)).toBe(false);
    expect(isStepComplete(withOverrides({ userName: 'Alex' }), 3)).toBe(true);
  });

  it('steps 4 and 6 are always considered complete (skippable)', () => {
    expect(isStepComplete(makeEmptyState(), 4)).toBe(true);
    expect(isStepComplete(makeEmptyState(), 6)).toBe(true);
  });

  it('step 5 requires at least one tool connection entry (connected OR skipped acknowledgement)', () => {
    expect(isStepComplete(makeEmptyState(), 5)).toBe(false);
    expect(
      isStepComplete(
        withOverrides({ toolConnections: [{ tool: 'slack', status: 'skipped' }] }),
        5,
      ),
    ).toBe(true);
  });

  it('step 7 satisfied only after completedAt is set', () => {
    expect(isStepComplete(makeEmptyState(), 7)).toBe(false);
    expect(isStepComplete(withOverrides({ completedAt: '2026-01-01T00:00:00Z' }), 7)).toBe(true);
  });
});

describe('nextIncompleteStep', () => {
  it('returns step 2 for a fresh user (cosName defaulted, api key not validated)', () => {
    expect(nextIncompleteStep(makeEmptyState())).toBe(2);
  });

  it('returns step 3 once api key is validated', () => {
    expect(nextIncompleteStep(withOverrides({ apiKeyValidated: true }))).toBe(3);
  });

  it('returns step 5 once name+api+name-step are satisfied (4 is skippable)', () => {
    expect(
      nextIncompleteStep(
        withOverrides({ apiKeyValidated: true, userName: 'Alex' }),
      ),
    ).toBe(5);
  });

  it('returns step 7 once steps 1-6 are satisfied', () => {
    expect(
      nextIncompleteStep(
        withOverrides({
          apiKeyValidated: true,
          userName: 'Alex',
          toolConnections: [{ tool: 'slack', status: 'connected' }],
        }),
      ),
    ).toBe(7);
  });
});
