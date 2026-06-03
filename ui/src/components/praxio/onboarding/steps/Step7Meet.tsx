// Step 7 — Meet [CoS name] (first conversation scripted greeting).
//
// AZU-742 scope:
//   - Screen title: "Meet [CoS name]"
//   - Branch on whether ≥1 primary-tier tool was connected (slack / gmail /
//     outlook / teams). Primary-tier "skipped" entries do NOT count.
//   - Interpolate cosName, first name (from userName), human role label,
//     #1 priority, and connected tool labels from onboarding state.
//   - The Start button in the wizard footer triggers `complete()` and
//     hands off to the live conversation UI (rendered by
//     PraxioOnboardingGate's `children`).

import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';
import type {
  PraxioPrimaryTool,
  PraxioRole,
  PraxioSecondaryTool,
} from '../types';

const ROLE_LABELS: Record<Exclude<PraxioRole, 'other'>, string> = {
  'fractional-executive': 'Fractional Executive',
  ceo: 'CEO',
  coo: 'COO',
  cmo: 'CMO',
  cfo: 'CFO',
  cro: 'CRO',
  consultant: 'Consultant',
  advisor: 'Advisor',
};

const TOOL_LABELS: Record<PraxioPrimaryTool | PraxioSecondaryTool, string> = {
  slack: 'Slack',
  gmail: 'Gmail',
  outlook: 'Outlook',
  teams: 'Microsoft Teams',
  'google-calendar': 'Google Calendar',
  'outlook-calendar': 'Outlook Calendar',
  notion: 'Notion',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
};

const PRIMARY_TOOLS = new Set<PraxioPrimaryTool>(['slack', 'gmail', 'outlook', 'teams']);

/** Format a list of strings as English with the Oxford comma. */
function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function Step7Meet() {
  const { state } = usePraxioOnboardingContext();

  // First name = first whitespace-delimited token of userName, falling back
  // to "there" so the greeting still reads if Step 3 was bypassed somehow.
  const firstName = state.userName.trim().split(/\s+/)[0] || 'there';
  const cos = state.cosName.trim() || 'Rosalind';

  // Human-readable role label. 'other' falls back to the user's free text,
  // and any unset / unrecognized state falls back to "leader" so the
  // sentence reads cleanly.
  const roleLabel: string =
    state.userRole === 'other'
      ? state.userRoleOther.trim() || 'leader'
      : state.userRole
        ? ROLE_LABELS[state.userRole]
        : 'leader';

  const priority = state.topPriority.trim() || 'your top priority';

  // Connected tools (any tier). For the branch we look at primary-tier
  // status==='connected' only, but the "I'll be watching" list shows
  // everything the user actually connected.
  const connectedTools = state.toolConnections.filter((c) => c.status === 'connected');
  const hasPrimary = connectedTools.some((c) =>
    PRIMARY_TOOLS.has(c.tool as PraxioPrimaryTool),
  );
  const watchingList = formatList(connectedTools.map((c) => TOOL_LABELS[c.tool] ?? c.tool));

  return (
    <div className="space-y-4" data-testid="step7-meet">
      <div>
        <h2 className="text-2xl font-semibold" data-testid="step7-title">
          Meet {cos}
        </h2>
      </div>
      <div
        className="rounded-md border border-border bg-card p-4 text-sm leading-relaxed"
        data-testid="step7-greeting"
        data-variant={hasPrimary ? 'tools' : 'no-tools'}
      >
        {hasPrimary ? (
          <p>
            Hi {firstName}. I&rsquo;ve read your brief. You&rsquo;re a {roleLabel} focused on{' '}
            {priority}. I&rsquo;ll be watching {watchingList} and will check in daily.
            <br />
            <br />
            What would you like to start with — reviewing what&rsquo;s on your plate, or talking
            through your priorities for the week?
          </p>
        ) : (
          <p>
            Hi {firstName}. I&rsquo;m ready to help. I notice you haven&rsquo;t connected Slack or
            email yet — I can still help you think through your work, but I won&rsquo;t be able to
            reach you proactively.
            <br />
            <br />
            Want to set that up now, or shall we get started?
          </p>
        )}
      </div>
    </div>
  );
}
