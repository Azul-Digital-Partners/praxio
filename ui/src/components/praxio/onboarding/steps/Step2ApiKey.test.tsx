// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { PraxioOnboardingProvider } from '../PraxioOnboardingContext';
import { Step2ApiKey } from './Step2ApiKey';
import { usePraxioOnboarding } from '../usePraxioOnboarding';
import type { ApiKeyValidator } from '../apiKeyStore';
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

// Wrap Step2 in the onboarding context so it has access to state/patch.
function Harness({ validator }: { validator: ApiKeyValidator }) {
  const api = usePraxioOnboarding({ storage: memoryStorage(), initialStep: 2 });
  return (
    <PraxioOnboardingProvider api={api}>
      <Step2ApiKey validator={validator} />
      <div data-testid="probe-validated">{String(api.state.apiKeyValidated)}</div>
      <div data-testid="probe-tail">{api.state.apiKeyMaskedTail ?? ''}</div>
    </PraxioOnboardingProvider>
  );
}

describe('Step2ApiKey', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    // Reset the in-memory api-key store between tests so a previous test's
    // bridge mock doesn't leak.
    (globalThis as unknown as { praxio?: { apiKey?: unknown } }).praxio = undefined;
  });

  it('renders the spec copy and the Get your API key link', () => {
    const validator: ApiKeyValidator = vi.fn();
    render(<Harness validator={validator} />);
    expect(screen.getByText('Connect Claude')).toBeInTheDocument();
    expect(screen.getByText(/Praxio runs on Claude\./i)).toBeInTheDocument();
    const link = screen.getByTestId('step2-get-key-link') as HTMLAnchorElement;
    expect(link.href).toBe('https://console.anthropic.com/keys');
    expect(link.target).toBe('_blank');
  });

  it('uses a masked (type=password) input with sk-ant- placeholder', () => {
    const validator: ApiKeyValidator = vi.fn();
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.placeholder).toBe('sk-ant-...');
    expect(input.autocomplete).toBe('off');
  });

  it('validates on paste — valid key shows green check and patches state', async () => {
    const validator: ApiKeyValidator = vi.fn().mockResolvedValue({
      ok: true,
      maskedTail: '…abcd',
    });
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    const pasted = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';

    await act(async () => {
      fireEvent.paste(input, {
        clipboardData: { getData: () => pasted },
      });
      // queueMicrotask resolves on the next tick.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(validator).toHaveBeenCalledWith(pasted);
    await waitFor(() => {
      expect(screen.getByTestId('step2-status-ok')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step2-status-icon').getAttribute('data-status')).toBe('valid');
    expect(screen.getByTestId('probe-validated').textContent).toBe('true');
    expect(screen.getByTestId('probe-tail').textContent).toBe('…abcd');
  });

  it('validates on blur — invalid format shows the format error and red X', async () => {
    const validator: ApiKeyValidator = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'format',
    });
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'not-an-anthropic-key' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('step2-status-format')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step2-status-icon').getAttribute('data-status')).toBe('invalid_format');
    expect(screen.getByTestId('probe-validated').textContent).toBe('false');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the api_rejected error state when Anthropic rejects the key', async () => {
    const validator: ApiKeyValidator = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'rejected',
    });
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-bogus-key-with-correct-shape-xxxxxxxx' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('step2-status-rejected')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step2-status-icon').getAttribute('data-status')).toBe('api_rejected');
    expect(screen.getByTestId('probe-validated').textContent).toBe('false');
  });

  it('shows the network_error state with a Retry button that re-validates', async () => {
    const validator: ApiKeyValidator = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce({ ok: true, maskedTail: '…zzzz' });
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('step2-status-network')).toBeInTheDocument();
    });
    expect(screen.getByTestId('step2-status-icon').getAttribute('data-status')).toBe('network_error');

    const retry = screen.getByTestId('step2-retry');
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByTestId('step2-status-ok')).toBeInTheDocument();
    });
    expect(validator).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('probe-validated').textContent).toBe('true');
  });

  it('thrown validator errors are surfaced as network_error (recoverable)', async () => {
    const validator: ApiKeyValidator = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-something' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('step2-status-network')).toBeInTheDocument();
    });
  });

  it('editing the input after success drops the validated flag (must re-check)', async () => {
    const validator: ApiKeyValidator = vi.fn().mockResolvedValue({
      ok: true,
      maskedTail: '…wxyz',
    });
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sk-ant-api03-pppppppppppppppppppppppp' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByTestId('probe-validated').textContent).toBe('true');
    });

    // User mutates the key — proceed must drop back to unvalidated.
    fireEvent.change(input, { target: { value: 'sk-ant-api03-pppppppppppppppppppppppX' } });
    expect(screen.getByTestId('probe-validated').textContent).toBe('false');
    expect(screen.getByTestId('step2-status-icon').getAttribute('data-status')).toBe('idle');
  });

  it('uses the secure ApiKeyStore bridge and never writes the raw key to the shared state', async () => {
    const set = vi.fn().mockResolvedValue({ maskedTail: '…qrst' });
    const get = vi.fn().mockResolvedValue(null);
    const clear = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { praxio: { apiKey: unknown } }).praxio = {
      apiKey: { set, get, clear },
    };

    const validator: ApiKeyValidator = vi.fn().mockResolvedValue({
      ok: true,
      maskedTail: '…qrst',
    });

    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    const value = 'sk-ant-api03-secret-that-should-never-be-persisted';
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(set).toHaveBeenCalledWith(value);
    });
    // Shared onboarding state must never contain the raw key — only the masked tail.
    const persisted = JSON.stringify({
      tail: screen.getByTestId('probe-tail').textContent,
      validated: screen.getByTestId('probe-validated').textContent,
    });
    expect(persisted).not.toContain(value);
  });

  it('does not validate on blur when the input is empty', async () => {
    const validator: ApiKeyValidator = vi.fn();
    render(<Harness validator={validator} />);
    const input = screen.getByTestId('step2-api-key') as HTMLInputElement;
    fireEvent.blur(input);
    // Give async work a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(validator).not.toHaveBeenCalled();
  });
});
