import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';

export function Step1Name() {
  const { state, setField } = usePraxioOnboardingContext();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Welcome to Praxio</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Before we begin, what would you like to call your Chief of Staff?
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-cos-name">Chief of Staff name</Label>
        <Input
          id="praxio-cos-name"
          data-testid="step1-cos-name"
          value={state.cosName}
          onChange={(e) => setField('cosName', e.target.value)}
          placeholder="Rosalind"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Default accepted. You can change this later.</p>
      </div>
    </div>
  );
}
