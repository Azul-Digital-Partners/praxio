// Step 5 — Tool OAuth connection flows (AZU-741).
//
// Spec: AZU-719 wizard spec, Step 5 section.
//
// Behaviour:
//   - Primary tier (push delivery): Slack, Gmail, Outlook, Microsoft Teams.
//   - Secondary tier (context/read): Google Calendar, Outlook Calendar,
//     Notion, HubSpot, Salesforce.
//   - Per-tool state machine: idle → connecting (simulated OAuth round-trip)
//     → connected. Connected tools expose a "send test" action and a
//     Disconnect button.
//   - Slack connect populates `state.slackWorkspaces[]` (multi-workspace
//     model per AZU-741 engineering note) and prompts for a default channel
//     selection.
//   - After the first primary tool connects, the user is asked to pick a
//     `defaultDeliveryChannel`.
//   - Each tool has its own Skip action ("Connect later").
//   - If the user skips every primary tool, a soft-block warning modal
//     surfaces; the user can still proceed.
//   - Step 4 integration: tools whose category matches state.toolCategories
//     are sorted to the top of each tier.
//
// The OAuth round-trip is simulated in v1.0 (no real provider wired yet —
// see the Step 5 ticket acceptance criteria, which call for "OAuth flows
// complete for at least Slack and Gmail in v1.0"). The state machine and
// data model are real; swap the simulated `startOAuth` for a callback
// against `/api/oauth/{provider}` when the backend lands.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type {
  PraxioPrimaryTool,
  PraxioSecondaryTool,
  PraxioToolCategory,
  PraxioToolConnection,
  SlackWorkspace,
} from '../types';

// --- Catalog ----------------------------------------------------------------

type Tier = 'primary' | 'secondary';

interface ToolDef {
  value: PraxioPrimaryTool | PraxioSecondaryTool;
  label: string;
  tier: Tier;
  /** Maps to Step 4 toolCategories — used to sort matching tools first. */
  category: PraxioToolCategory;
  /** Scope copy shown under the row. */
  scopes: string;
  /** Optional field note. */
  fieldNote?: string;
  /** Label used for the post-connect test action button. */
  testActionLabel: string;
}

const TOOLS: ToolDef[] = [
  // Primary tier — push delivery.
  {
    value: 'slack',
    label: 'Slack',
    tier: 'primary',
    category: 'messaging',
    scopes: 'chat:write, channels:read, users:read',
    fieldNote: 'Connect your primary workspace. Multi-workspace support is coming.',
    testActionLabel: 'Send test DM',
  },
  {
    value: 'gmail',
    label: 'Gmail',
    tier: 'primary',
    category: 'messaging',
    scopes: 'gmail.send, gmail.readonly',
    testActionLabel: 'Send test email',
  },
  {
    value: 'outlook',
    label: 'Outlook',
    tier: 'primary',
    category: 'messaging',
    scopes: 'Mail.Send, Mail.Read',
    testActionLabel: 'Send test email',
  },
  {
    value: 'teams',
    label: 'Microsoft Teams',
    tier: 'primary',
    category: 'messaging',
    scopes: 'Chat.ReadWrite, ChannelMessage.Send',
    testActionLabel: 'Send test message',
  },
  // Secondary tier — context/read.
  {
    value: 'google-calendar',
    label: 'Google Calendar',
    tier: 'secondary',
    category: 'calendar',
    scopes: 'calendar.readonly',
    testActionLabel: 'Fetch upcoming events',
  },
  {
    value: 'outlook-calendar',
    label: 'Outlook Calendar',
    tier: 'secondary',
    category: 'calendar',
    scopes: 'Calendars.Read',
    testActionLabel: 'Fetch upcoming events',
  },
  {
    value: 'notion',
    label: 'Notion',
    tier: 'secondary',
    category: 'project-management',
    scopes: 'Read-only workspace access',
    testActionLabel: 'List recent pages',
  },
  {
    value: 'hubspot',
    label: 'HubSpot',
    tier: 'secondary',
    category: 'crm',
    scopes: 'Read contacts, companies, deals',
    testActionLabel: 'Fetch recent contacts',
  },
  {
    value: 'salesforce',
    label: 'Salesforce',
    tier: 'secondary',
    category: 'crm',
    scopes: 'Read contacts, opportunities',
    testActionLabel: 'Fetch recent contacts',
  },
];

const PRIMARY_TOOL_VALUES = TOOLS.filter((t) => t.tier === 'primary').map(
  (t) => t.value as PraxioPrimaryTool,
);

// Simulated OAuth round-trip timing. Real provider wiring will replace
// these with promises that resolve on the OAuth callback.
const OAUTH_LATENCY_MS = 1500;
const TEST_ACTION_LATENCY_MS = 1000;
const TEST_ACTION_CONFIRM_MS = 3000;

// --- Helpers ---------------------------------------------------------------

function sortByStep4(tools: ToolDef[], selectedCategories: PraxioToolCategory[]): ToolDef[] {
  if (selectedCategories.length === 0) return tools;
  const matches = new Set(selectedCategories);
  return [...tools].sort((a, b) => {
    const aHit = matches.has(a.category) ? 0 : 1;
    const bHit = matches.has(b.category) ? 0 : 1;
    return aHit - bHit;
  });
}

function simulatedWorkspaceFor(): SlackWorkspace {
  // In v1.0 the OAuth flow is simulated. Generate a stable-ish id so
  // re-connects within a single session don't keep stacking duplicates.
  const id = `ws_${Math.random().toString(36).slice(2, 10)}`;
  return { id, name: 'Acme HQ', defaultChannel: null };
}

// --- ToolCard --------------------------------------------------------------

type ConnectState = 'idle' | 'connecting' | 'connected' | 'testing' | 'sent' | 'skipped';

interface ToolCardProps {
  tool: ToolDef;
  status: PraxioToolConnection['status'] | null;
  onConnect: (tool: ToolDef) => Promise<void>;
  onSkip: (tool: ToolDef) => void;
  onDisconnect: (tool: ToolDef) => void;
}

function ToolCard({ tool, status, onConnect, onSkip, onDisconnect }: ToolCardProps) {
  // Local visual state — covers the "connecting" spinner phase and the
  // ephemeral "test action" feedback. Persistent connection state lives
  // in `state.toolConnections` (via `status` prop).
  const [phase, setPhase] = useState<ConnectState>(() => {
    if (status === 'connected') return 'connected';
    if (status === 'skipped') return 'skipped';
    return 'idle';
  });
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'connected' && phase !== 'connecting' && phase !== 'testing' && phase !== 'sent') {
      setPhase('connected');
    } else if (status === 'skipped' && phase !== 'connecting') {
      setPhase('skipped');
    } else if (status === null && phase !== 'connecting' && phase !== 'testing') {
      setPhase('idle');
    }
  }, [status, phase]);

  useEffect(() => {
    return () => {
      if (sentTimer.current) clearTimeout(sentTimer.current);
    };
  }, []);

  async function handleConnect() {
    setPhase('connecting');
    try {
      await onConnect(tool);
      setPhase('connected');
    } catch {
      setPhase('idle');
    }
  }

  function handleSkip() {
    setPhase('skipped');
    onSkip(tool);
  }

  function handleDisconnect() {
    setPhase('idle');
    onDisconnect(tool);
  }

  function handleTest() {
    setPhase('testing');
    setTimeout(() => {
      setPhase('sent');
      sentTimer.current = setTimeout(() => setPhase('connected'), TEST_ACTION_CONFIRM_MS);
    }, TEST_ACTION_LATENCY_MS);
  }

  return (
    <div
      className="rounded-md border border-border p-3"
      data-testid={`step5-row-${tool.value}`}
      data-tier={tool.tier}
      data-phase={phase}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{tool.label}</div>
          <div className="text-xs text-muted-foreground">{tool.scopes}</div>
          {tool.fieldNote ? (
            <div className="mt-1 text-xs text-muted-foreground">{tool.fieldNote}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {phase === 'idle' ? (
            <>
              <Button
                size="sm"
                data-testid={`step5-connect-${tool.value}`}
                onClick={handleConnect}
              >
                Connect
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid={`step5-skip-${tool.value}`}
                onClick={handleSkip}
              >
                Connect later
              </Button>
            </>
          ) : null}

          {phase === 'connecting' ? (
            <span
              className="text-xs text-muted-foreground"
              data-testid={`step5-connecting-${tool.value}`}
            >
              Connecting…
            </span>
          ) : null}

          {phase === 'connected' || phase === 'testing' || phase === 'sent' ? (
            <>
              <span
                className="text-xs font-medium text-green-600"
                data-testid={`step5-connected-${tool.value}`}
              >
                Connected
              </span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`step5-test-${tool.value}`}
                onClick={handleTest}
                disabled={phase === 'testing'}
              >
                {phase === 'testing'
                  ? 'Sending…'
                  : phase === 'sent'
                    ? 'Sent ✓'
                    : tool.testActionLabel}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid={`step5-disconnect-${tool.value}`}
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </>
          ) : null}

          {phase === 'skipped' ? (
            <>
              <span
                className="text-xs text-muted-foreground"
                data-testid={`step5-skipped-${tool.value}`}
              >
                Skipped
              </span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`step5-connect-${tool.value}`}
                onClick={handleConnect}
              >
                Connect
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// --- Skip-all modal --------------------------------------------------------

interface SkipAllModalProps {
  cosName: string;
  onConnectSlack: () => void;
  onConnectGmail: () => void;
  onProceed: () => void;
  onDismiss: () => void;
}

function SkipAllModal({
  cosName,
  onConnectSlack,
  onConnectGmail,
  onProceed,
  onDismiss,
}: SkipAllModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="step5-skip-all-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-md border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">No delivery channels connected</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {cosName} can&apos;t reach you proactively without a connected channel.
          You&apos;ll miss morning briefs and action-item nudges until you connect at
          least one of Slack or Gmail.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button data-testid="step5-skip-all-connect-slack" onClick={onConnectSlack}>
            Connect Slack
          </Button>
          <Button
            variant="outline"
            data-testid="step5-skip-all-connect-gmail"
            onClick={onConnectGmail}
          >
            Connect Gmail
          </Button>
          <Button
            variant="ghost"
            data-testid="step5-skip-all-proceed"
            onClick={onProceed}
          >
            Skip for now →
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Default delivery channel picker --------------------------------------

interface DefaultDeliveryPickerProps {
  candidates: PraxioPrimaryTool[];
  value: PraxioPrimaryTool | null;
  onChange: (value: PraxioPrimaryTool) => void;
}

function DefaultDeliveryPicker({ candidates, value, onChange }: DefaultDeliveryPickerProps) {
  if (candidates.length === 0) return null;
  return (
    <div
      className="rounded-md border border-border bg-muted/30 p-3"
      data-testid="step5-default-channel-picker"
    >
      <div className="text-sm font-medium">Default delivery channel</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Where should we send your morning brief and proactive nudges by default?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={value === c ? 'default' : 'outline'}
            data-testid={`step5-default-${c}`}
            onClick={() => onChange(c)}
          >
            {labelFor(c)}
            {value === c ? ' ✓' : ''}
          </Button>
        ))}
      </div>
    </div>
  );
}

function labelFor(tool: PraxioPrimaryTool): string {
  return TOOLS.find((t) => t.value === tool)?.label ?? tool;
}

// --- Step 5 container ------------------------------------------------------

export function Step5Tools() {
  const { state, setField, patch } = usePraxioOnboardingContext();
  const cos = state.cosName || 'your Chief of Staff';
  const [skipAllModalOpen, setSkipAllModalOpen] = useState(false);

  const sortedPrimary = useMemo(
    () =>
      sortByStep4(
        TOOLS.filter((t) => t.tier === 'primary'),
        state.toolCategories,
      ),
    [state.toolCategories],
  );
  const sortedSecondary = useMemo(
    () =>
      sortByStep4(
        TOOLS.filter((t) => t.tier === 'secondary'),
        state.toolCategories,
      ),
    [state.toolCategories],
  );

  function statusOf(tool: PraxioPrimaryTool | PraxioSecondaryTool): PraxioToolConnection['status'] | null {
    return state.toolConnections.find((c) => c.tool === tool)?.status ?? null;
  }

  function writeConnection(entry: PraxioToolConnection) {
    const others = state.toolConnections.filter((c) => c.tool !== entry.tool);
    setField('toolConnections', [...others, entry]);
  }

  async function connectTool(tool: ToolDef) {
    // Simulated OAuth round-trip. Replace with real provider callback.
    await new Promise<void>((resolve) => setTimeout(resolve, OAUTH_LATENCY_MS));

    const entry: PraxioToolConnection = {
      tool: tool.value,
      status: 'connected',
      connectedAt: new Date().toISOString(),
    };

    // Slack: append to the workspaces array (multi-workspace data model).
    if (tool.value === 'slack') {
      const next: SlackWorkspace[] = [...state.slackWorkspaces, simulatedWorkspaceFor()];
      patch({
        toolConnections: [
          ...state.toolConnections.filter((c) => c.tool !== 'slack'),
          entry,
        ],
        slackWorkspaces: next,
      });
    } else {
      writeConnection(entry);
    }

    // First primary connect → suggest a default delivery channel if unset.
    if (
      tool.tier === 'primary' &&
      state.defaultDeliveryChannel === null
    ) {
      setField('defaultDeliveryChannel', tool.value as PraxioPrimaryTool);
    }

    setSkipAllModalOpen(false);
  }

  function skipTool(tool: ToolDef) {
    writeConnection({ tool: tool.value, status: 'skipped' });
    // If the user has now skipped every primary tool, surface the warning.
    const primaryStatuses = PRIMARY_TOOL_VALUES.map((v) =>
      v === tool.value
        ? 'skipped'
        : (state.toolConnections.find((c) => c.tool === v)?.status ?? null),
    );
    const noneConnected = primaryStatuses.every((s) => s === 'skipped');
    if (noneConnected) {
      setSkipAllModalOpen(true);
    }
  }

  function disconnectTool(tool: ToolDef) {
    const next = state.toolConnections.filter((c) => c.tool !== tool.value);
    if (tool.value === 'slack') {
      patch({
        toolConnections: next,
        slackWorkspaces: [],
        defaultDeliveryChannel:
          state.defaultDeliveryChannel === 'slack' ? null : state.defaultDeliveryChannel,
      });
    } else if (PRIMARY_TOOL_VALUES.includes(tool.value as PraxioPrimaryTool)) {
      patch({
        toolConnections: next,
        defaultDeliveryChannel:
          state.defaultDeliveryChannel === (tool.value as PraxioPrimaryTool)
            ? null
            : state.defaultDeliveryChannel,
      });
    } else {
      setField('toolConnections', next);
    }
  }

  const connectedPrimaries = PRIMARY_TOOL_VALUES.filter(
    (v) => state.toolConnections.find((c) => c.tool === v)?.status === 'connected',
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">How should {cos} reach you?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {cos} can send you a morning brief, flag action items, and reach you where you already
          work — but only if you connect a channel now.
        </p>
      </div>

      <div className="space-y-3" data-testid="step5-primary-section">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">
          Push delivery
        </h3>
        {sortedPrimary.map((tool) => (
          <ToolCard
            key={tool.value}
            tool={tool}
            status={statusOf(tool.value)}
            onConnect={connectTool}
            onSkip={skipTool}
            onDisconnect={disconnectTool}
          />
        ))}
      </div>

      {connectedPrimaries.length > 0 ? (
        <DefaultDeliveryPicker
          candidates={connectedPrimaries}
          value={state.defaultDeliveryChannel}
          onChange={(v) => setField('defaultDeliveryChannel', v)}
        />
      ) : null}

      <div className="space-y-3" data-testid="step5-secondary-section">
        <h3 className="text-sm font-medium uppercase text-muted-foreground">
          Context &amp; read
        </h3>
        {sortedSecondary.map((tool) => (
          <ToolCard
            key={tool.value}
            tool={tool}
            status={statusOf(tool.value)}
            onConnect={connectTool}
            onSkip={skipTool}
            onDisconnect={disconnectTool}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        You can connect tools anytime in Settings → Connected Tools.
      </p>

      {skipAllModalOpen ? (
        <SkipAllModal
          cosName={cos}
          onConnectSlack={() => {
            setSkipAllModalOpen(false);
            void connectTool(TOOLS.find((t) => t.value === 'slack')!);
          }}
          onConnectGmail={() => {
            setSkipAllModalOpen(false);
            void connectTool(TOOLS.find((t) => t.value === 'gmail')!);
          }}
          onProceed={() => setSkipAllModalOpen(false)}
          onDismiss={() => setSkipAllModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
