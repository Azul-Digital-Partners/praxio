import { useEffect, useState } from 'react'
import type { AgentSummary } from './AgentSidebar'
import { SessionGrading } from './SessionGrading'
import { PlaybookPanel } from './PlaybookPanel'

interface RightPanelProps {
  agent: AgentSummary | null
  conversationId?: string
}

export function RightPanel({ agent, conversationId }: RightPanelProps) {
  const [playbookContent, setPlaybookContent] = useState<string | null>(null)

  useEffect(() => {
    if (!agent) return
    fetch(`/api/playbook/${agent.id}`)
      .then((r) => (r.ok ? r.text() : null))
      .then(setPlaybookContent)
      .catch(() => setPlaybookContent(null))
  }, [agent?.id])

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

      {conversationId && (
        <SessionGrading
          conversationId={conversationId}
          onGrade={(grade) => console.log('Graded:', grade)}
        />
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Playbook</p>
        <PlaybookPanel content={playbookContent} />
      </div>
    </div>
  )
}
