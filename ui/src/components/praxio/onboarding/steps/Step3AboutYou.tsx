import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type { PraxioRole } from '../types';

const ROLES: { value: PraxioRole; label: string }[] = [
  { value: 'fractional-cfo', label: 'Fractional CFO' },
  { value: 'fractional-cmo', label: 'Fractional CMO' },
  { value: 'fractional-coo', label: 'Fractional COO' },
  { value: 'founder', label: 'Founder' },
  { value: 'executive', label: 'Executive' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'other', label: 'Other' },
];

export function Step3AboutYou() {
  const { state, setField } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';
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
        />
      </div>
      <div className="space-y-2">
        <Label>Your role</Label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              data-testid={`step3-role-${r.value}`}
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
            data-testid="step3-role-other"
            placeholder="Your role"
            value={state.userRoleOther}
            onChange={(e) => setField('userRoleOther', e.target.value)}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-priority">Your #1 priority right now</Label>
        <Input
          id="praxio-priority"
          data-testid="step3-priority"
          value={state.topPriority}
          onChange={(e) => setField('topPriority', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-tz">Timezone</Label>
        <Input
          id="praxio-tz"
          data-testid="step3-tz"
          value={state.timezone}
          onChange={(e) => setField('timezone', e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Your CoS also coordinates a marketing and operations assistant — you&rsquo;ll meet them as
        your work evolves.
      </p>
    </div>
  );
}
