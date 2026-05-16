import { useState } from 'react'
import { PraxioLayout } from '@/components/praxio/Layout'
import { NavRail } from '@/components/praxio/NavRail'
import { AgentSidebar, type AgentSummary } from '@/components/praxio/AgentSidebar'
import { RightPanel } from '@/components/praxio/RightPanel'
import { ConversationThread } from '@/components/praxio/ConversationThread'
import { useWebSocket } from '@/hooks/praxio/useWebSocket'
import { useConversation } from '@/hooks/praxio/useConversation'
import { useTheme } from '@/context/ThemeContext'

const MOCK_AGENTS: AgentSummary[] = [
  { id: '1', name: 'Rosalind', role: 'Chief of Staff', status: 'live', budgetRemaining: 180, budgetCap: 200 },
  { id: '2', name: 'Engineering', role: 'Technical Lead', status: 'idle', budgetRemaining: 95, budgetCap: 150 },
  { id: '3', name: 'Marketing', role: 'Creative Lead', status: 'idle', budgetRemaining: 60, budgetCap: 100 },
  { id: '4', name: 'Agent Ops', role: 'Workforce Manager', status: 'idle', budgetRemaining: 40, budgetCap: 75 },
]

export function Conversations() {
  const [selectedId, setSelectedId] = useState<string | null>('1')
  const selectedAgent = MOCK_AGENTS.find((a) => a.id === selectedId) ?? null
  const { ws, send } = useWebSocket('/ws')
  const { messages, addUserMessage } = useConversation(ws, selectedId)

  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  function handleSend(content: string) {
    addUserMessage(content)
    send({ type: 'message', agentId: selectedId, content })
  }

  return (
    <PraxioLayout
      navRail={<NavRail isDark={isDark} onToggle={toggleTheme} />}
      sidebar={
        <AgentSidebar
          agents={MOCK_AGENTS}
          selectedAgentId={selectedId}
          onSelectAgent={setSelectedId}
        />
      }
      main={
        <ConversationThread
          messages={messages}
          onSend={handleSend}
          streaming={messages.some((m) => m.streaming)}
          agentName={selectedAgent?.name}
        />
      }
      rightPanel={<RightPanel agent={selectedAgent} />}
    />
  )
}
