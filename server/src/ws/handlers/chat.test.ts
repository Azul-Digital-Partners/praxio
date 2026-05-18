import { describe, it, expect } from 'vitest'
import { buildChatHandler } from './chat.js'

describe('chat handler', () => {
  it('sends a streaming chunk message', async () => {
    const sent: string[] = []
    const mockWs = { send: (msg: string) => sent.push(msg), readyState: 1 }
    const handler = buildChatHandler(mockWs as any)

    await handler({ type: 'chunk', content: 'hello' })

    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('chunk')
    expect(parsed.content).toBe('hello')
  })

  it('sends a done message when stream ends', async () => {
    const sent: string[] = []
    const mockWs = { send: (msg: string) => sent.push(msg), readyState: 1 }
    const handler = buildChatHandler(mockWs as any)

    await handler({ type: 'done', conversationId: 'abc' })

    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('done')
    expect(parsed.conversationId).toBe('abc')
  })
})
