import { useEffect, useRef } from 'react'
import { Message } from './Message'
import { MessageInput } from './MessageInput'
import type { ChatMessage } from '@/hooks/praxio/useConversation'

interface ConversationThreadProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  streaming?: boolean
  agentName?: string
}

export function ConversationThread({ messages, onSend, streaming, agentName }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      {agentName && (
        <div className="px-4 py-2 border-b border-border">
          <p className="text-sm font-medium">{agentName}</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            Send a message to get started.
          </p>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={onSend} disabled={streaming} />
    </div>
  )
}
