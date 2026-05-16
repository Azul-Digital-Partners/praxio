import type WebSocket from 'ws'

type ChatEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done'; conversationId: string }
  | { type: 'error'; message: string }

export function buildChatHandler(ws: WebSocket) {
  return async function sendChatEvent(event: ChatEvent) {
    if (ws.readyState !== 1) return
    ws.send(JSON.stringify(event))
  }
}
