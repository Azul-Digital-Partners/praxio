import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type { PraxioToolCategory } from '../types';

const CATEGORIES: { value: PraxioToolCategory; label: string }[] = [
  { value: 'messaging', label: 'Messaging' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'crm', label: 'CRM' },
  { value: 'project-management', label: 'Project management' },
  { value: 'finance', label: 'Finance' },
];

export function Step4Work() {
  const { state, setField } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';

  function toggle(cat: PraxioToolCategory) {
    const next = state.toolCategories.includes(cat)
      ? state.toolCategories.filter((c) => c !== cat)
      : [...state.toolCategories, cat];
    setField('toolCategories', next);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Tell {cos} about your work</h2>
        <p className="mt-2 text-sm text-muted-foreground">Brief. We&rsquo;ll use this to suggest tools to connect next.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-biz">Business or team name</Label>
        <Input
          id="praxio-biz"
          data-testid="step4-biz"
          value={state.businessName}
          onChange={(e) => setField('businessName', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="praxio-biz-line">What it does</Label>
        <Input
          id="praxio-biz-line"
          data-testid="step4-biz-line"
          value={state.businessOneLiner}
          onChange={(e) => setField('businessOneLiner', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Tools you use</Label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
            >
              <input
                type="checkbox"
                data-testid={`step4-cat-${c.value}`}
                checked={state.toolCategories.includes(c.value)}
                onChange={() => toggle(c.value)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
