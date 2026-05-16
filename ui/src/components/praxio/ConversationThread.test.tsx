// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { ConversationThread } from './ConversationThread'

expect.extend(matchers)

afterEach(() => {
  cleanup()
})

describe('ConversationThread', () => {
  it('renders all messages', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'Hello', streaming: false },
      { id: '2', role: 'assistant' as const, content: 'Hi there', streaming: false },
    ]
    render(<ConversationThread messages={msgs} onSend={vi.fn()} />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there')).toBeInTheDocument()
  })

  it('calls onSend when message is submitted via Enter', async () => {
    const onSend = vi.fn()
    render(<ConversationThread messages={[]} onSend={onSend} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'test message')
    await userEvent.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('test message')
  })
})
