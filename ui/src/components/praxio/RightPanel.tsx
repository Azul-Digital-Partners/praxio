import type { AgentSummary } from './AgentSidebar'

interface RightPanelProps {
  agent: AgentSummary | null
}

export function RightPanel({ agent }: RightPanelProps) {
  if (!agent) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
      Select an agent to see details
    </div>
  )

  return (
    <div className="flex h-full flex-col p-3 gap-4 overflow-y-auto bg-card">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Agent</p>
        <p className="font-semibold">{agent.name}</p>
        <p className="text-sm text-muted-foreground">{agent.role}</p>
      </div>
      {/* Grading and playbook panels slot in here — Tasks 10 and 11 */}
    </div>
  )
}
