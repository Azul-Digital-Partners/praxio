// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWebSocket } from './useWebSocket'

const mockWs = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1,
}
vi.stubGlobal('WebSocket', vi.fn(() => mockWs))

describe('useWebSocket', () => {
  it('returns a send function', () => {
    const { result } = renderHook(() => useWebSocket('/ws'))
    expect(typeof result.current.send).toBe('function')
  })
})
