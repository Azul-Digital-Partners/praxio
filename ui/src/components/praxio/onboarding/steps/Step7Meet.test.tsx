// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

// AZU-742 Step 7 — Rosalind first conversation scripted greeting.
//
// Spec (from AZU-719 wizard-spec document):
//   - Screen title: "Meet [CoS name]"
//   - tools-connected greeting interpolates: first name, role, #1 priority,
//     connected tool names
//   - no-tools greeting takes the alternate copy path
//   - Branch is determined by whether at least one primary-tier tool was
//     connected (slack / gmail / outlook / teams)
//   - Clicking Start sets completedAt, calls onComplete, and the gate
//     hands off to the live conversation UI

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { PraxioOnboardingWizard } from '../PraxioOnboardingWizard';
import { PraxioOnboardingGate } from '../PraxioOnboardingGate';
import { saveOnboardingState, type StorageAdapter } from '../storage';
import { makeEmptyState, PRAXIO_ONBOARDING_STORAGE_KEY } from '../types';

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

describe('Step 7 — Meet [CoS name] (AZU-742)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the "Meet [CoS name]" title with the user-chosen CoS name', () => {
    const storage = memoryStorage();
    const seed = makeEmptyState();
    seed.cosName = 'Aurora';
    seed.userName = 'Alex Rivera';
    seed.apiKeyValidated = true;
    seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
    saveOnboardingState(seed, storage);

    render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
    expect(screen.getByTestId('step7-title')).toHaveTextContent('Meet Aurora');
  });

  it('falls back to "Rosalind" when cosName was somehow blanked', () => {
    const storage = memoryStorage();
    const seed = makeEmptyState();
    seed.cosName = '   ';
    seed.userName = 'Alex';
    saveOnboardingState(seed, storage);

    render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
    expect(screen.getByTestId('step7-title')).toHaveTextContent('Meet Rosalind');
  });

  describe('tools-connected branch', () => {
    it('interpolates first name, human role label, priority, and tool list', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.cosName = 'Aurora';
      seed.userName = 'Alex Rivera';
      seed.userRole = 'fractional-executive';
      seed.topPriority = 'shipping the Q3 launch';
      seed.apiKeyValidated = true;
      seed.toolConnections = [
        { tool: 'slack', status: 'connected' },
        { tool: 'gmail', status: 'connected' },
      ];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      const greeting = screen.getByTestId('step7-greeting');
      expect(greeting).toHaveAttribute('data-variant', 'tools');
      // First name only — surname is dropped.
      expect(greeting).toHaveTextContent(/Hi Alex\b/);
      expect(greeting).not.toHaveTextContent('Rivera');
      // Human role label, not the enum slug.
      expect(greeting).toHaveTextContent('Fractional Executive');
      expect(greeting).not.toHaveTextContent('fractional-executive');
      // Top priority is included verbatim.
      expect(greeting).toHaveTextContent('shipping the Q3 launch');
      // Tool list uses human labels and "X and Y" formatting.
      expect(greeting).toHaveTextContent('Slack and Gmail');
      // Follow-up prompt is included.
      expect(greeting).toHaveTextContent(/reviewing what.s on your plate/);
    });

    it('uses Oxford-comma list formatting when 3+ tools are connected', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Jordan';
      seed.apiKeyValidated = true;
      seed.toolConnections = [
        { tool: 'slack', status: 'connected' },
        { tool: 'gmail', status: 'connected' },
        { tool: 'notion', status: 'connected' },
      ];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      expect(screen.getByTestId('step7-greeting')).toHaveTextContent(
        'Slack, Gmail, and Notion',
      );
    });

    it('uses the user-typed "other" role when userRole === "other"', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Sam';
      seed.userRole = 'other';
      seed.userRoleOther = 'Chief of Staff';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      expect(screen.getByTestId('step7-greeting')).toHaveTextContent('Chief of Staff');
    });

    it('takes the tools branch when only a secondary tool is connected but a primary is too', () => {
      // Primary-tier presence is the branch trigger. We confirm by mixing a
      // secondary tool with a primary tool — should still hit the tools branch.
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Sam';
      seed.apiKeyValidated = true;
      seed.toolConnections = [
        { tool: 'notion', status: 'connected' },
        { tool: 'gmail', status: 'connected' },
      ];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      expect(screen.getByTestId('step7-greeting')).toHaveAttribute('data-variant', 'tools');
    });
  });

  describe('no-tools branch', () => {
    it('renders the alternate copy when no primary-tier tool is connected', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Alex';
      seed.apiKeyValidated = true;
      // Step 5 was visited but the user skipped every primary tool.
      seed.toolConnections = [
        { tool: 'slack', status: 'skipped' },
        { tool: 'gmail', status: 'skipped' },
        { tool: 'outlook', status: 'skipped' },
        { tool: 'teams', status: 'skipped' },
      ];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      const greeting = screen.getByTestId('step7-greeting');
      expect(greeting).toHaveAttribute('data-variant', 'no-tools');
      expect(greeting).toHaveTextContent(/Hi Alex/);
      expect(greeting).toHaveTextContent(/haven.t connected Slack or email yet/);
      expect(greeting).toHaveTextContent(/won.t be able to reach you proactively/);
      expect(greeting).toHaveTextContent(/set that up now, or shall we get started/);
    });

    it('takes the no-tools branch when only a secondary tool is connected', () => {
      // Secondary tools alone do NOT count as a delivery channel.
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Sam';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'notion', status: 'connected' }];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      expect(screen.getByTestId('step7-greeting')).toHaveAttribute('data-variant', 'no-tools');
    });
  });

  describe('hand-off to live conversation UI', () => {
    it('Start button is enabled on Step 7 even though isStepComplete(7) is still false', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Alex';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      expect(screen.getByTestId('praxio-next')).toHaveTextContent('Start');
      expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
    });

    it('clicking Start marks onboarding complete, persists completedAt, and fires onComplete', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = 'Alex';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
      saveOnboardingState(seed, storage);

      const onComplete = vi.fn();
      render(
        <PraxioOnboardingWizard
          storage={storage}
          initialStep={7}
          onComplete={onComplete}
          now={() => '2026-05-27T12:34:56.000Z'}
        />,
      );

      fireEvent.click(screen.getByTestId('praxio-next'));

      expect(onComplete).toHaveBeenCalledTimes(1);
      const persisted = storage._map.get(PRAXIO_ONBOARDING_STORAGE_KEY) ?? '';
      expect(persisted).toContain('"completedAt":"2026-05-27T12:34:56.000Z"');
    });

    it('PraxioOnboardingGate renders children once Step 7 is completed', () => {
      const storage = memoryStorage();
      // Seed an already-completed state — the gate reads from default
      // (localStorage) storage on mount, so we mirror the persisted entry
      // there too. The gate uses the default StorageAdapter (localStorage).
      const seed = makeEmptyState();
      seed.userName = 'Alex';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
      seed.completedAt = '2026-05-27T12:34:56.000Z';
      // Default storage = window.localStorage in jsdom.
      window.localStorage.setItem(PRAXIO_ONBOARDING_STORAGE_KEY, JSON.stringify(seed));

      render(
        <PraxioOnboardingGate>
          <div data-testid="conversation-ui">Live conversation</div>
        </PraxioOnboardingGate>,
      );

      expect(screen.getByTestId('conversation-ui')).toBeInTheDocument();
      expect(screen.queryByTestId('praxio-onboarding-wizard')).not.toBeInTheDocument();

      window.localStorage.removeItem(PRAXIO_ONBOARDING_STORAGE_KEY);
    });
  });

  describe('graceful fallbacks when optional Step 3 fields are blank', () => {
    it('falls back to "there" / "leader" / "your top priority" when fields are empty', () => {
      const storage = memoryStorage();
      const seed = makeEmptyState();
      seed.userName = '';
      seed.userRole = null;
      seed.topPriority = '';
      seed.apiKeyValidated = true;
      seed.toolConnections = [{ tool: 'slack', status: 'connected' }];
      saveOnboardingState(seed, storage);

      render(<PraxioOnboardingWizard storage={storage} initialStep={7} />);
      const greeting = screen.getByTestId('step7-greeting');
      expect(greeting).toHaveTextContent(/Hi there/);
      expect(greeting).toHaveTextContent('leader');
      expect(greeting).toHaveTextContent('your top priority');
    });
  });
});
