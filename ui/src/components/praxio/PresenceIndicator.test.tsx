// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { PresenceIndicator } from './PresenceIndicator'

expect.extend(matchers)

describe('PresenceIndicator', () => {
  it('shows green dot for live status', () => {
    render(<PresenceIndicator status="live" />)
    expect(screen.getByTitle('Live')).toHaveClass('bg-green-400')
  })
  it('shows yellow dot for busy status', () => {
    render(<PresenceIndicator status="busy" />)
    expect(screen.getByTitle('Busy')).toHaveClass('bg-yellow-400')
  })
  it('shows grey dot for idle status', () => {
    render(<PresenceIndicator status="idle" />)
    expect(screen.getByTitle('Idle')).toHaveClass('bg-gray-400')
  })
})
