import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';

export function Step6Goals() {
  const { state, setField } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">What&rsquo;s this period about for you?</h2>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="step6-skip-hint">
          Optional — skip and {cos} will ask you about this in your first conversation.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-focus">Focus theme</Label>
        <Input
          id="praxio-focus"
          data-testid="step6-focus"
          value={state.focusTheme}
          onChange={(e) => setField('focusTheme', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-goals">Top 3 work goals (one per line)</Label>
        <textarea
          id="praxio-goals"
          data-testid="step6-goals"
          rows={4}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
          value={state.topGoals.join('\n')}
          onChange={(e) =>
            setField(
              'topGoals',
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter((s, i, arr) => s.length > 0 || i < arr.length - 1),
            )
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-cycle">Cycle end date</Label>
        <Input
          id="praxio-cycle"
          data-testid="step6-cycle"
          type="date"
          value={state.cycleEndDate ?? ''}
          onChange={(e) => setField('cycleEndDate', e.target.value || null)}
        />
      </div>
    </div>
  );
}
