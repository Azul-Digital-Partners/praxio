import { useEffect, useState } from 'react'

type Status = 'live' | 'idle' | 'busy'

export function useAgentPresence(ws: WebSocket | null, agentId: string, initial: Status) {
  const [status, setStatus] = useState<Status>(initial)

  useEffect(() => {
    if (!ws) return
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; agentId: string; status: string }
        if (msg.type === 'presence' && msg.agentId === agentId) {
          setStatus(msg.status as Status)
        }
      } catch {
        // ignore malformed messages
      }
    }
    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [ws, agentId])

  return status
}
