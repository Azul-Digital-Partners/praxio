import { usePraxioOnboardingContext } from '../PraxioOnboardingContext';

export function Step7Meet() {
  const { state } = usePraxioOnboardingContext();
  const firstName = state.userName.split(/\s+/)[0] || 'there';
  const cos = state.cosName || 'Rosalind';
  const connectedTools = state.toolConnections
    .filter((c) => c.status === 'connected')
    .map((c) => c.tool);
  const hasTools = connectedTools.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Meet {cos}</h2>
      </div>
      <div className="rounded-md border border-border bg-card p-4 text-sm">
        {hasTools ? (
          <p>
            Hi {firstName}. I&rsquo;ve read your brief. You&rsquo;re a{' '}
            {state.userRole === 'other' ? state.userRoleOther : state.userRole || 'leader'} focused
            on {state.topPriority || 'your top priority'}. I&rsquo;ll be watching{' '}
            {connectedTools.join(', ')} and will check in daily.
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
