// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { PlaybookPanel } from './PlaybookPanel'

expect.extend(matchers)

afterEach(cleanup)

describe('PlaybookPanel', () => {
  it('renders playbook content', () => {
    render(<PlaybookPanel content="# My Skill\nDoes things." />)
    expect(screen.getByText(/My Skill/)).toBeInTheDocument()
  })

  it('shows empty state when no content', () => {
    render(<PlaybookPanel content={null} />)
    expect(screen.getByText(/No playbook/)).toBeInTheDocument()
  })
})
