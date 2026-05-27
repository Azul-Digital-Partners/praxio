// Step 3 — About You.
//
// AZU-740 scope:
//   - Your name (required — wizard Continue gated by isStepComplete)
//   - Your role: quick-pick chips + Other free text
//   - Your #1 priority right now (free text, optional)
//   - Timezone (auto-detected default + confirm dropdown)
//   - Agent disclosure line below fields
//   - Optional fields use "I'll tell [CoS] about this later" affordance

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type { PraxioRole } from '../types';

const ROLES: { value: PraxioRole; label: string }[] = [
  { value: 'fractional-executive', label: 'Fractional Executive' },
  { value: 'ceo', label: 'CEO' },
  { value: 'coo', label: 'COO' },
  { value: 'cmo', label: 'CMO' },
  { value: 'cfo', label: 'CFO' },
  { value: 'cro', label: 'CRO' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'other', label: 'Other' },
];

/** Common IANA timezones offered in the dropdown. The user's auto-detected
 *  zone is always shown first (and included again in this list if it
 *  matches), so the value is preserved even on unfamiliar systems. */
const COMMON_TIMEZONES: string[] = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function buildTimezoneOptions(current: string): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const tz of [current, ...COMMON_TIMEZONES]) {
    if (!tz) continue;
    if (seen.has(tz)) continue;
    seen.add(tz);
    list.push(tz);
  }
  return list;
}

export function Step3AboutYou() {
  const { state, setField } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';
  const skipHint = `I'll tell ${cos} about this later`;
  const tzOptions = buildTimezoneOptions(state.timezone);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Let&rsquo;s help {cos} get to know you</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {cos} needs a few basics to be useful from minute one.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="praxio-user-name">Your name *</Label>
        <Input
          id="praxio-user-name"
          data-testid="step3-name"
          value={state.userName}
          onChange={(e) => setField('userName', e.target.value)}
          required
          aria-required="true"
        />
        {state.userName.trim().length === 0 && (
          <p className="text-xs text-destructive" data-testid="step3-name-error">
            Your name is required so {cos} can address you.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Your role</Label>
        <div className="flex flex-wrap gap-2" data-testid="step3-role-grid">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              data-testid={`step3-role-${r.value}`}
              aria-pressed={state.userRole === r.value}
              onClick={() => setField('userRole', r.value)}
              className={
                'rounded-md border px-3 py-1 text-sm ' +
                (state.userRole === r.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border')
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        {state.userRole === 'other' && (
          <Input
            data-testid="step3-role-other-text"
            placeholder="Your role"
            value={state.userRoleOther}
            onChange={(e) => setField('userRoleOther', e.target.value)}
          />
        )}
        {state.userRole === null && (
          <p className="text-xs text-muted-foreground">{skipHint}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="praxio-priority">Your #1 priority right now</Label>
        <Input
          id="praxio-priority"
          data-testid="step3-priority"
          value={state.topPriority}
          onChange={(e) => setField('topPriority', e.target.value)}
          placeholder={skipHint}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="praxio-tz">Timezone</Label>
        <select
          id="praxio-tz"
          data-testid="step3-tz"
          value={state.timezone}
          onChange={(e) => setField('timezone', e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          {tzOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Auto-detected from your system. Confirm or pick a different zone.
        </p>
      </div>

      <p className="text-xs text-muted-foreground" data-testid="step3-agent-disclosure">
        Your CoS also coordinates a marketing and operations assistant.
      </p>
    </div>
  );
}
