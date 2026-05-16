import type WebSocket from 'ws'

type PresenceStatus = 'live' | 'idle' | 'busy'

export function broadcastPresence(
  clients: Set<WebSocket>,
  agentId: string,
  status: PresenceStatus
): void {
  const msg = JSON.stringify({ type: 'presence', agentId, status })
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg)
  }
}
