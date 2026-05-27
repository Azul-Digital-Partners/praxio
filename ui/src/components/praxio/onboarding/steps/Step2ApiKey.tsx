// Step 2 — BYOK Anthropic API key entry (AZU-739).
//
// Behavior contract (AZU-719 wizard spec, Step 2 section):
// - Masked password input with `sk-ant-...` placeholder.
// - Live validation on paste AND blur. The user does not click a separate
//   "Validate" button — entering or pasting the key drives the state machine.
// - Visual indicator inline with the input:
//     • spinner during `validating`
//     • green check for `valid`
//     • red X for `invalid_format` or `api_rejected`
//     • amber alert + Retry for `network_error`
// - Hard gate: the wizard's Continue button is disabled until
//   `state.apiKeyValidated === true` (enforced by `isStepComplete(state, 2)`).
//   This component never advances the wizard itself.
// - The raw key is never persisted to the shared onboarding state. It is
//   handed to `getApiKeyStore()` (an OS-level secure store bridged via the
//   Electron preload) and we keep only the masked tail for display.

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { CheckCircle2, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import {
  defaultApiKeyValidator,
  getApiKeyStore,
  type ApiKeyValidator,
} from '../apiKeyStore';

type Status =
  | 'idle'
  | 'validating'
  | 'valid'
  | 'invalid_format'
  | 'api_rejected'
  | 'network_error';

interface Props {
  /** Override for tests. */
  validator?: ApiKeyValidator;
}

export function Step2ApiKey({ validator = defaultApiKeyValidator }: Props) {
  const { state, patch } = usePraxioOnboardingContext();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>(state.apiKeyValidated ? 'valid' : 'idle');
  // Track the in-flight validation so concurrent paste/blur events don't race.
  const inFlight = useRef(0);

  const runValidation = useCallback(
    async (candidate: string) => {
      const trimmed = candidate.trim();
      if (trimmed.length === 0) {
        setStatus('idle');
        return;
      }
      const ticket = ++inFlight.current;
      setStatus('validating');
      let result: Awaited<ReturnType<ApiKeyValidator>>;
      try {
        result = await validator(trimmed);
      } catch {
        if (ticket !== inFlight.current) return;
        patch({ apiKeyValidated: false });
        setStatus('network_error');
        return;
      }
      // Stale response — a newer attempt has already started.
      if (ticket !== inFlight.current) return;

      if (result.ok) {
        await getApiKeyStore().set(trimmed);
        patch({ apiKeyValidated: true, apiKeyMaskedTail: result.maskedTail });
        setStatus('valid');
        return;
      }
      patch({ apiKeyValidated: false });
      switch (result.reason) {
        case 'format':
          setStatus('invalid_format');
          return;
        case 'rejected':
          setStatus('api_rejected');
          return;
        case 'network':
        default:
          setStatus('network_error');
          return;
      }
    },
    [validator, patch],
  );

  // If the user edits the input after a previous validation, drop the
  // validated flag and return to idle — the new value must be re-checked.
  useEffect(() => {
    if (status === 'valid' && key.trim() !== '' && !key.endsWith(state.apiKeyMaskedTail ?? '###')) {
      // Best-effort: if the typed value no longer matches the last validated
      // tail, invalidate. Note `apiKeyMaskedTail` is the only signal we keep
      // in shared state — the raw key lives in the secure store.
      // (Functional check is delegated to the validator on next paste/blur.)
    }
  }, [key, status, state.apiKeyMaskedTail]);

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    // Allow the default paste to populate the input value, then validate.
    const trimmed = pasted.trim();
    // Defer so React state from the underlying onChange settles first.
    queueMicrotask(() => {
      setKey(trimmed);
      void runValidation(trimmed);
    });
  }

  function handleBlur() {
    if (key.trim().length === 0) return;
    if (status === 'validating' || status === 'valid') return;
    void runValidation(key);
  }

  function handleChange(value: string) {
    setKey(value);
    // Typing invalidates a previously-validated key — the user must let it
    // settle (blur) or paste a complete one to revalidate.
    if (status === 'valid' || status === 'api_rejected' || status === 'invalid_format' || status === 'network_error') {
      setStatus('idle');
      if (state.apiKeyValidated) patch({ apiKeyValidated: false });
    }
  }

  function handleRetry() {
    void runValidation(key);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Connect Claude</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Praxio runs on Claude. Paste your API key below.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="praxio-api-key">Anthropic API key</Label>
        <div className="relative">
          <Input
            id="praxio-api-key"
            data-testid="step2-api-key"
            type="password"
            value={key}
            onChange={(e) => handleChange(e.target.value)}
            onPaste={handlePaste}
            onBlur={handleBlur}
            placeholder="sk-ant-..."
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-invalid={status === 'invalid_format' || status === 'api_rejected'}
            aria-describedby="step2-status-msg"
            className="pr-10"
          />
          <span
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            data-testid="step2-status-icon"
            data-status={status}
            aria-hidden="true"
          >
            {status === 'validating' && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {status === 'valid' && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {(status === 'invalid_format' || status === 'api_rejected') && (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            {status === 'network_error' && (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
          </span>
        </div>
        <a
          href="https://console.anthropic.com/keys"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline"
          data-testid="step2-get-key-link"
        >
          Get your API key →
        </a>
      </div>

      <div id="step2-status-msg" className="min-h-[1.25rem] text-sm" role="status" aria-live="polite">
        {status === 'validating' && (
          <span data-testid="step2-status-validating" className="text-muted-foreground">
            Checking key with Anthropic…
          </span>
        )}
        {status === 'valid' && (
          <span data-testid="step2-status-ok" className="text-green-600">
            Key validated. You&rsquo;re ready.
          </span>
        )}
        {status === 'invalid_format' && (
          <span data-testid="step2-status-format" className="text-red-600">
            That doesn&rsquo;t look like an Anthropic key. Keys start with{' '}
            <code>sk-ant-</code>.
          </span>
        )}
        {status === 'api_rejected' && (
          <span data-testid="step2-status-rejected" className="text-red-600">
            Anthropic rejected this key. Make sure it&rsquo;s active in your account.
          </span>
        )}
        {status === 'network_error' && (
          <span data-testid="step2-status-network" className="flex items-center gap-3 text-amber-600">
            Couldn&rsquo;t reach Anthropic to validate. Check your connection and try again.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRetry}
              data-testid="step2-retry"
            >
              Retry
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
