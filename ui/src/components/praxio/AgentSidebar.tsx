export interface AgentSummary {
  id: string
  name: string
  role: string
  status: 'live' | 'idle' | 'busy'
  budgetRemaining: number
  budgetCap: number
}

interface AgentSidebarProps {
  agents: AgentSummary[]
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
}

export function AgentSidebar({ agents, selectedAgentId, onSelectAgent }: AgentSidebarProps) {
  const active = agents.filter((a) => a.status !== 'idle')
  const idle = agents.filter((a) => a.status === 'idle')

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-card p-2 gap-1">
      <AgentGroup label="Active" agents={active} selectedId={selectedAgentId} onSelect={onSelectAgent} />
      <AgentGroup label="Idle" agents={idle} selectedId={selectedAgentId} onSelect={onSelectAgent} />
    </div>
  )
}

function AgentGroup({ label, agents, selectedId, onSelect }: {
  label: string
  agents: AgentSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (agents.length === 0) return null
  return (
    <div>
      <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      {agents.map((agent) => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent.id)}
          className={`w-full text-left px-2 py-2 rounded-md flex flex-col gap-1 transition-colors ${
            selectedId === agent.id
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-muted'
          }`}
        >
          <div className="flex items-center gap-2">
            <PresenceDot status={agent.status} />
            <span className="text-sm font-medium truncate">{agent.name}</span>
          </div>
          <BudgetBar remaining={agent.budgetRemaining} cap={agent.budgetCap} />
        </button>
      ))}
    </div>
  )
}

function PresenceDot({ status }: { status: 'live' | 'idle' | 'busy' }) {
  const colors = { live: 'bg-green-400', busy: 'bg-yellow-400', idle: 'bg-gray-400' }
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`} />
}

function BudgetBar({ remaining, cap }: { remaining: number; cap: number }) {
  const pct = Math.min(100, Math.round((remaining / cap) * 100))
  const isLow = pct < 20
  return (
    <div className="w-full h-1 rounded-full bg-border overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-[var(--praxio-primary)]'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
