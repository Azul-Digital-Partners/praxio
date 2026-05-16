import { useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export function useConversation(ws: WebSocket | null, conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const streamingRef = useRef<string>('')

  useEffect(() => {
    if (!ws || !conversationId) return

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string
          conversationId?: string
          content?: string
        }
        if (msg.conversationId !== conversationId) return

        if (msg.type === 'chunk' && msg.content) {
          streamingRef.current += msg.content
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.streaming) {
              return [...prev.slice(0, -1), { ...last, content: streamingRef.current }]
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant', content: streamingRef.current, streaming: true }]
          })
        }

        if (msg.type === 'done') {
          streamingRef.current = ''
          setMessages((prev) =>
            prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
          )
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, conversationId])

  function addUserMessage(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content }])
  }

  return { messages, addUserMessage }
}
