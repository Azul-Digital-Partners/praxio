import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import {
  defaultApiKeyValidator,
  getApiKeyStore,
  type ApiKeyValidator,
} from '../apiKeyStore';

interface Props {
  /** Override for tests. */
  validator?: ApiKeyValidator;
}

export function Step2ApiKey({ validator = defaultApiKeyValidator }: Props) {
  const { state, patch } = usePraxioOnboardingContext();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'validating' | 'ok' | 'format' | 'rejected' | 'network'>(
    state.apiKeyValidated ? 'ok' : 'idle',
  );

  async function handleValidate() {
    setStatus('validating');
    const result = await validator(key);
    if (result.ok) {
      await getApiKeyStore().set(key);
      patch({ apiKeyValidated: true, apiKeyMaskedTail: result.maskedTail });
      setStatus('ok');
    } else {
      patch({ apiKeyValidated: false });
      setStatus(result.reason);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Connect Claude</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Praxio runs on Claude, Anthropic&rsquo;s AI. Paste your API key below to get started.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-api-key">Anthropic API key</Label>
        <Input
          id="praxio-api-key"
          data-testid="step2-api-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          autoFocus
        />
        <a
          href="https://console.anthropic.com/keys"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Get your API key →
        </a>
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={handleValidate}
          disabled={status === 'validating' || key.trim().length === 0}
          data-testid="step2-validate"
        >
          {status === 'validating' ? 'Validating…' : 'Validate'}
        </Button>
        {status === 'ok' && (
          <span data-testid="step2-status-ok" className="text-sm text-green-600">
            Key validated. You&rsquo;re ready.
          </span>
        )}
        {status === 'format' && (
          <span data-testid="step2-status-format" className="text-sm text-red-600">
            API keys start with sk-ant- — check for extra spaces.
          </span>
        )}
        {status === 'rejected' && (
          <span data-testid="step2-status-rejected" className="text-sm text-red-600">
            Anthropic couldn&rsquo;t verify this key. Make sure it&rsquo;s active in your account.
          </span>
        )}
        {status === 'network' && (
          <span data-testid="step2-status-network" className="text-sm text-amber-600">
            Couldn&rsquo;t reach Anthropic to validate. Check your connection and try again.
          </span>
        )}
      </div>
    </div>
  );
}
