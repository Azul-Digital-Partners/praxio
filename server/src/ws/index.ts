import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { Server } from 'http'
import type { Db } from '@paperclipai/db'
import { agents as agentsTable } from '@paperclipai/db'
import { eq } from 'drizzle-orm'
import { buildChatHandler } from './handlers/chat.js'
import { broadcastPresence } from './handlers/presence.js'
import { heartbeatService, issueService } from '../services/index.js'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])
const POLL_INTERVAL_MS = 500
const MAX_POLLS = 720 // 6 min ceiling

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse a batch of raw heartbeat log bytes, extracting assistant text from
 * Claude Code stream-json events. Handles partial lines via lineBuffer.
 *
 * Log line format: {"ts":"...","stream":"stdout","chunk":"<claude-code-json>"}
 * Claude Code event format (assistant): {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 */
function extractText(rawContent: string, lineBuffer: { pending: string }): string {
  const combined = lineBuffer.pending + rawContent
  const parts = combined.split('\n')
  // Keep the last (potentially incomplete) line for next call
  lineBuffer.pending = parts.pop() ?? ''

  const texts: string[] = []
  for (const line of parts) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let logEntry: Record<string, unknown>
    try {
      logEntry = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }

    if (logEntry.stream !== 'stdout' || typeof logEntry.chunk !== 'string') continue

    let event: Record<string, unknown>
    try {
      event = JSON.parse(logEntry.chunk) as Record<string, unknown>
    } catch {
      continue
    }

    if (event.type !== 'assistant') continue

    const message = typeof event.message === 'object' && event.message !== null
      ? (event.message as Record<string, unknown>)
      : null
    if (!message) continue

    const content = Array.isArray(message.content) ? message.content : []
    for (const block of content) {
      if (
        typeof block === 'object' &&
        block !== null &&
        (block as Record<string, unknown>).type === 'text'
      ) {
        const text = (block as Record<string, unknown>).text
        if (typeof text === 'string' && text) texts.push(text)
      }
    }
  }

  return texts.join('')
}

export function attachWebSocketServer(httpServer: Server, db: Db): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  const clients = new Set<WebSocket>()
  const heartbeat = heartbeatService(db)
  const issueSvc = issueService(db)

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
        return
      }

      if (
        msg.type === 'message' &&
        typeof msg.content === 'string' &&
        typeof msg.agentId === 'string'
      ) {
        const agentId = msg.agentId
        const content = msg.content

        const agent = await db
          .select({ id: agentsTable.id, companyId: agentsTable.companyId })
          .from(agentsTable)
          .where(eq(agentsTable.id, agentId))
          .then((rows) => rows[0] ?? null)

        if (!agent) {
          await sendChat({ type: 'chunk', content: 'Agent not found.' })
          await sendChat({ type: 'done', conversationId: agentId })
          return
        }

        let issueId: string
        try {
          const issue = await issueSvc.create(agent.companyId, {
            title: content.slice(0, 120),
            description: content,
            status: 'todo',
            priority: 'medium',
            assigneeAgentId: agentId,
          })
          issueId = issue.id
        } catch (err) {
          await sendChat({ type: 'chunk', content: `Failed to create task: ${String(err)}` })
          await sendChat({ type: 'done', conversationId: agentId })
          return
        }

        let runId: string
        try {
          const run = await heartbeat.wakeup(agentId, {
            source: 'on_demand',
            triggerDetail: 'manual',
            reason: 'user_message',
            contextSnapshot: { taskId: issueId, triggeredBy: 'user' },
          })
          if (!run) {
            await sendChat({
              type: 'chunk',
              content: 'Agent is already running. Your task was queued and will be picked up on the next heartbeat.',
            })
            await sendChat({ type: 'done', conversationId: agentId })
            return
          }
          runId = run.id
        } catch (err) {
          await sendChat({ type: 'chunk', content: `Failed to invoke agent: ${String(err)}` })
          await sendChat({ type: 'done', conversationId: agentId })
          return
        }

        // Stream parsed text back until the run reaches a terminal state
        let offset = 0
        const lineBuffer = { pending: '' }

        for (let poll = 0; poll < MAX_POLLS; poll++) {
          await sleep(POLL_INTERVAL_MS)

          if ((ws as { readyState?: number }).readyState !== 1) break

          const run = await heartbeat.getRun(runId).catch(() => null)
          if (!run) break

          if (run.logStore && run.logRef) {
            const result = await heartbeat
              .readLog(run as Parameters<typeof heartbeat.readLog>[0], { offset })
              .catch(() => null)
            if (result?.content) {
              const text = extractText(result.content, lineBuffer)
              if (text) await sendChat({ type: 'chunk', content: text })
              offset = result.nextOffset ?? offset + Buffer.byteLength(result.content, 'utf8')
            }
          }

          if (TERMINAL_STATUSES.has(run.status)) break
        }

        await sendChat({ type: 'done', conversationId: agentId })
        return
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
