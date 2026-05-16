import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { Server } from 'http'
import { buildChatHandler } from './handlers/chat.js'
import { broadcastPresence } from './handlers/presence.js'

export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws) => {
    clients.add(ws)
    const sendChat = buildChatHandler(ws)

    ws.on('message', async (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }

      if (msg.type === 'message' && typeof msg.content === 'string') {
        const conversationId = typeof msg.agentId === 'string' ? msg.agentId : 'unknown'
        // Phase 1 stub: echo content back as a streaming response
        const words = msg.content.split(' ')
        for (const word of words) {
          await sendChat({ type: 'chunk', content: word + ' ' })
          await new Promise((r) => setTimeout(r, 60))
        }
        await sendChat({ type: 'done', conversationId })
      }

      if (
        msg.type === 'presence_update' &&
        typeof msg.agentId === 'string' &&
        typeof msg.status === 'string'
      ) {
        broadcastPresence(clients, msg.agentId, msg.status as 'live' | 'idle' | 'busy')
      }
    })

    ws.on('close', () => clients.delete(ws))
  })

  return wss
}
