import { useState } from 'react'
import { PraxioLayout } from '@/components/praxio/Layout'
import { NavRail } from '@/components/praxio/NavRail'
import { AgentSidebar, type AgentSummary } from '@/components/praxio/AgentSidebar'
import { RightPanel } from '@/components/praxio/RightPanel'

const MOCK_AGENTS: AgentSummary[] = [
  { id: '1', name: 'Rosalind', role: 'Chief of Staff', status: 'live', budgetRemaining: 180, budgetCap: 200 },
  { id: '2', name: 'Engineering', role: 'Technical Lead', status: 'idle', budgetRemaining: 95, budgetCap: 150 },
  { id: '3', name: 'Marketing', role: 'Creative Lead', status: 'idle', budgetRemaining: 60, budgetCap: 100 },
  { id: '4', name: 'Agent Ops', role: 'Workforce Manager', status: 'idle', budgetRemaining: 40, budgetCap: 75 },
]

export function Conversations() {
  const [selectedId, setSelectedId] = useState<string | null>('1')
  const selectedAgent = MOCK_AGENTS.find((a) => a.id === selectedId) ?? null

  return (
    <PraxioLayout
      navRail={<NavRail />}
      sidebar={
        <AgentSidebar
          agents={MOCK_AGENTS}
          selectedAgentId={selectedId}
          onSelectAgent={setSelectedId}
        />
      }
      main={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Select an agent and send a message — conversation thread coming in Task 9
        </div>
      }
      rightPanel={<RightPanel agent={selectedAgent} />}
    />
  )
}
