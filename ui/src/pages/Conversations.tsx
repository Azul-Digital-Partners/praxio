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
  { id: '7e8e691b-25d5-4d9e-b01e-1b4455270abf', name: 'Rosalind', role: 'Chief of Staff', status: 'idle', budgetRemaining: 180, budgetCap: 200 },
  { id: 'cc94286b-75b2-438a-bc7d-2dd00826ce43', name: 'Engineering', role: 'Technical Lead', status: 'idle', budgetRemaining: 95, budgetCap: 150 },
  { id: 'f3101599-c0bc-49ff-916a-63e3356cd2a4', name: 'Marketing', role: 'Creative Lead', status: 'idle', budgetRemaining: 60, budgetCap: 100 },
  { id: '4cbab473-d2da-4e4b-8eb1-9a80018b2861', name: 'Agent Ops', role: 'Workforce Manager', status: 'idle', budgetRemaining: 40, budgetCap: 75 },
]

export function Conversations() {
  const [selectedId, setSelectedId] = useState<string | null>('7e8e691b-25d5-4d9e-b01e-1b4455270abf')
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
      rightPanel={<RightPanel agent={selectedAgent} conversationId={selectedId ?? undefined} />}
    />
  )
}
