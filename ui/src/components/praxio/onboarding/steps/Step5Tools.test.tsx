// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
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

// Step 5 is only legally rendered once Steps 1-3 are satisfied. The
// wizard's resume logic uses `nextIncompleteStep`, so we seed a state that
// lands on Step 5 (cosName default, apiKeyValidated, userName set, etc.)
// and then render with `initialStep={5}` to short-circuit any redirect.
function seedStep5Ready(storage: StorageAdapter) {
  const seed = makeEmptyState(() => '2026-01-01T00:00:00.000Z');
  seed.apiKeyValidated = true;
  seed.userName = 'Alex';
  saveOnboardingState(seed, storage);
}

describe('Step 5 — Tool OAuth connection flows (AZU-741)', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function renderStep5() {
    seedStep5Ready(storage);
    return render(<PraxioOnboardingWizard storage={storage} initialStep={5} />);
  }

  it('renders all primary and secondary tools with their scope copy', () => {
    renderStep5();
    // Primary tier
    expect(screen.getByTestId('step5-row-slack')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-gmail')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-outlook')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-teams')).toBeInTheDocument();
    // Secondary tier
    expect(screen.getByTestId('step5-row-google-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-outlook-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-notion')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-hubspot')).toBeInTheDocument();
    expect(screen.getByTestId('step5-row-salesforce')).toBeInTheDocument();
    // Field note for Slack from the spec.
    expect(screen.getByTestId('step5-row-slack').textContent).toContain(
      'Multi-workspace support is coming',
    );
  });

  it('Slack connect runs the OAuth state machine: idle → connecting → connected', async () => {
    renderStep5();
    const slack = screen.getByTestId('step5-row-slack');
    expect(slack.getAttribute('data-phase')).toBe('idle');

    fireEvent.click(screen.getByTestId('step5-connect-slack'));
    expect(slack.getAttribute('data-phase')).toBe('connecting');
    expect(screen.getByTestId('step5-connecting-slack')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(slack.getAttribute('data-phase')).toBe('connected');
    expect(screen.getByTestId('step5-connected-slack')).toBeInTheDocument();
    expect(screen.getByTestId('step5-test-slack')).toBeInTheDocument();
    expect(screen.getByTestId('step5-disconnect-slack')).toBeInTheDocument();
  });

  it('appends a SlackWorkspace to state.slackWorkspaces[] on Slack connect (multi-workspace data model)', async () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-connect-slack'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(Array.isArray(persisted.slackWorkspaces)).toBe(true);
    expect(persisted.slackWorkspaces).toHaveLength(1);
    expect(persisted.slackWorkspaces[0]).toMatchObject({
      name: expect.any(String),
      defaultChannel: null,
    });
    expect(persisted.toolConnections.find((c: { tool: string }) => c.tool === 'slack')).toMatchObject({
      status: 'connected',
    });
  });

  it('"send test DM" shows a Sending… → Sent ✓ transition without affecting persisted state', async () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-connect-slack'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const test = screen.getByTestId('step5-test-slack');
    expect(test.textContent).toMatch(/Send test DM/);
    fireEvent.click(test);
    expect(test.textContent).toMatch(/Sending…/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByTestId('step5-test-slack').textContent).toMatch(/Sent ✓/);

    // The persisted state should still show Slack as connected (test action
    // does not mutate the connection record).
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(persisted.toolConnections.find((c: { tool: string }) => c.tool === 'slack').status).toBe(
      'connected',
    );
  });

  it('first connected primary becomes the suggested defaultDeliveryChannel', async () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-connect-gmail'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(persisted.defaultDeliveryChannel).toBe('gmail');
    expect(screen.getByTestId('step5-default-channel-picker')).toBeInTheDocument();
    expect(screen.getByTestId('step5-default-gmail')).toBeInTheDocument();
  });

  it('user can change the default delivery channel after multiple connects', async () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-connect-gmail'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    fireEvent.click(screen.getByTestId('step5-connect-slack'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    fireEvent.click(screen.getByTestId('step5-default-slack'));
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(persisted.defaultDeliveryChannel).toBe('slack');
  });

  it('Disconnect clears the tool from toolConnections, slackWorkspaces, and defaultDeliveryChannel when applicable', async () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-connect-slack'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    fireEvent.click(screen.getByTestId('step5-disconnect-slack'));
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(persisted.toolConnections.find((c: { tool: string }) => c.tool === 'slack')).toBeUndefined();
    expect(persisted.slackWorkspaces).toEqual([]);
    expect(persisted.defaultDeliveryChannel).toBeNull();
  });

  it('Skipping a single tool records a "skipped" entry without surfacing the modal', () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-skip-slack'));
    const persisted = JSON.parse(storage._map.get('praxio.onboarding.v1')!);
    expect(persisted.toolConnections.find((c: { tool: string }) => c.tool === 'slack')).toMatchObject({
      status: 'skipped',
    });
    expect(screen.queryByTestId('step5-skip-all-modal')).toBeNull();
  });

  it('Skipping every primary tool opens the soft-block modal', () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-skip-slack'));
    fireEvent.click(screen.getByTestId('step5-skip-gmail'));
    fireEvent.click(screen.getByTestId('step5-skip-outlook'));
    fireEvent.click(screen.getByTestId('step5-skip-teams'));
    expect(screen.getByTestId('step5-skip-all-modal')).toBeInTheDocument();
    // Modal exposes recovery actions per spec.
    expect(screen.getByTestId('step5-skip-all-connect-slack')).toBeInTheDocument();
    expect(screen.getByTestId('step5-skip-all-connect-gmail')).toBeInTheDocument();
    expect(screen.getByTestId('step5-skip-all-proceed')).toBeInTheDocument();
  });

  it('"Skip for now" on the modal dismisses without breaking advance — step is still considered complete (skipped acknowledgements count)', () => {
    renderStep5();
    fireEvent.click(screen.getByTestId('step5-skip-slack'));
    fireEvent.click(screen.getByTestId('step5-skip-gmail'));
    fireEvent.click(screen.getByTestId('step5-skip-outlook'));
    fireEvent.click(screen.getByTestId('step5-skip-teams'));
    fireEvent.click(screen.getByTestId('step5-skip-all-proceed'));
    expect(screen.queryByTestId('step5-skip-all-modal')).toBeNull();
    // Continue button should now be enabled — isStepComplete treats any
    // toolConnections entry (including skipped) as acknowledgement.
    expect(screen.getByTestId('praxio-next')).not.toBeDisabled();
  });

  it('Step 4 selected categories sort matching tools to the top', () => {
    const seed = makeEmptyState(() => '2026-01-01T00:00:00.000Z');
    seed.apiKeyValidated = true;
    seed.userName = 'Alex';
    seed.toolCategories = ['crm']; // HubSpot + Salesforce match.
    saveOnboardingState(seed, storage);

    render(<PraxioOnboardingWizard storage={storage} initialStep={5} />);

    const secondary = screen.getByTestId('step5-secondary-section');
    const rows = within(secondary).getAllByTestId(/^step5-row-/);
    const order = rows.map((r) => r.getAttribute('data-testid'));
    // CRM tools should appear before calendars/notion since 'crm' was the
    // only selected Step 4 category.
    const firstCrmIndex = Math.min(
      order.indexOf('step5-row-hubspot'),
      order.indexOf('step5-row-salesforce'),
    );
    const lastNonMatchIndex = Math.max(
      order.indexOf('step5-row-google-calendar'),
      order.indexOf('step5-row-outlook-calendar'),
      order.indexOf('step5-row-notion'),
    );
    expect(firstCrmIndex).toBeLessThan(lastNonMatchIndex);
  });

  it('renders the Settings reminder footer copy from the spec', () => {
    renderStep5();
    expect(
      screen.getByText(/You can connect tools anytime in Settings → Connected Tools/),
    ).toBeInTheDocument();
  });
});
