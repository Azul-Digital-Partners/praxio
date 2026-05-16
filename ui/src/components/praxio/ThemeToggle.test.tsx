// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { ThemeToggle } from './ThemeToggle'

expect.extend(matchers)
afterEach(cleanup)

describe('ThemeToggle', () => {
  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<ThemeToggle isDark={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('shows Sun icon when dark mode is active', () => {
    render(<ThemeToggle isDark={true} onToggle={vi.fn()} />)
    expect(screen.getByTitle('Switch to light mode')).toBeInTheDocument()
  })

  it('shows Moon icon when light mode is active', () => {
    render(<ThemeToggle isDark={false} onToggle={vi.fn()} />)
    expect(screen.getByTitle('Switch to dark mode')).toBeInTheDocument()
  })
})
