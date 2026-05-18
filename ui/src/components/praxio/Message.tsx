import type { ChatMessage } from '@/hooks/praxio/useConversation'

export function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--praxio-primary)] text-white rounded-br-sm'
            : 'bg-card text-foreground rounded-bl-sm border border-border'
        } ${message.streaming ? 'opacity-80' : ''}`}
      >
        {message.content}
        {message.streaming && <span className="ml-1 opacity-50">▍</span>}
      </div>
    </div>
  )
}
