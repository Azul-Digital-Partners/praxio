import ReactMarkdown from 'react-markdown'

interface PlaybookPanelProps {
  content: string | null
}

export function PlaybookPanel({ content }: PlaybookPanelProps) {
  if (!content) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No playbook linked. Add a SKILL.md to this agent's config.
      </p>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground overflow-y-auto max-h-64">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
