import { Button } from '@/components/ui/button';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type {
  PraxioPrimaryTool,
  PraxioSecondaryTool,
  PraxioToolConnection,
} from '../types';

const PRIMARY: { value: PraxioPrimaryTool; label: string }[] = [
  { value: 'slack', label: 'Slack' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'teams', label: 'Microsoft Teams' },
];

const SECONDARY: { value: PraxioSecondaryTool; label: string }[] = [
  { value: 'google-calendar', label: 'Google Calendar' },
  { value: 'outlook-calendar', label: 'Outlook Calendar' },
  { value: 'notion', label: 'Notion' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'salesforce', label: 'Salesforce' },
];

export function Step5Tools() {
  const { state, setField } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';

  function setConnection(tool: PraxioPrimaryTool | PraxioSecondaryTool, status: PraxioToolConnection['status']) {
    const others = state.toolConnections.filter((c) => c.tool !== tool);
    const entry: PraxioToolConnection = {
      tool,
      status,
      connectedAt: status === 'connected' ? new Date().toISOString() : undefined,
    };
    setField('toolConnections', [...others, entry]);
  }

  function statusOf(tool: PraxioPrimaryTool | PraxioSecondaryTool): PraxioToolConnection['status'] | null {
    return state.toolConnections.find((c) => c.tool === tool)?.status ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">How should {cos} reach you?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {cos} can send you a morning brief, flag action items, and reach you where you already
          work — but only if you connect a channel now.
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">Push delivery</h3>
        {PRIMARY.map((tool) => {
          const s = statusOf(tool.value);
          return (
            <div
              key={tool.value}
              data-testid={`step5-row-${tool.value}`}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <span className="text-sm">{tool.label}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={s === 'connected' ? 'default' : 'outline'}
                  data-testid={`step5-connect-${tool.value}`}
                  onClick={() => setConnection(tool.value, 'connected')}
                >
                  {s === 'connected' ? 'Connected' : 'Connect'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`step5-skip-${tool.value}`}
                  onClick={() => setConnection(tool.value, 'skipped')}
                >
                  {s === 'skipped' ? 'Skipped' : 'Skip'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">Context &amp; read</h3>
        {SECONDARY.map((tool) => {
          const s = statusOf(tool.value);
          return (
            <div
              key={tool.value}
              data-testid={`step5-row-${tool.value}`}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <span className="text-sm">{tool.label}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={s === 'connected' ? 'default' : 'outline'}
                  data-testid={`step5-connect-${tool.value}`}
                  onClick={() => setConnection(tool.value, 'connected')}
                >
                  {s === 'connected' ? 'Connected' : 'Connect'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`step5-skip-${tool.value}`}
                  onClick={() => setConnection(tool.value, 'skipped')}
                >
                  {s === 'skipped' ? 'Skipped' : 'Skip'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        You can connect tools anytime in Settings → Connected Tools.
      </p>
    </div>
  );
}
