import { PresenceIndicator } from './PresenceIndicator'
import type { AgentSummary } from './AgentSidebar'

export function AgentCard({ agent }: { agent: AgentSummary }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <PresenceIndicator status={agent.status} />
        <div>
          <p className="font-semibold text-sm">{agent.name}</p>
          <p className="text-xs text-muted-foreground">{agent.role}</p>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Budget: ${agent.budgetRemaining} / ${agent.budgetCap}
      </div>
    </div>
  )
}
