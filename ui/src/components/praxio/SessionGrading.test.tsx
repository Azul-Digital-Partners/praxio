// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
import { SessionGrading } from './SessionGrading'

expect.extend(matchers)

afterEach(cleanup)

describe('SessionGrading', () => {
  it('renders all four grade options', () => {
    render(<SessionGrading conversationId="abc" onGrade={vi.fn()} />)
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('Minor edits')).toBeInTheDocument()
    expect(screen.getByText('Major rework')).toBeInTheDocument()
    expect(screen.getByText('Scrapped')).toBeInTheDocument()
  })

  it('calls onGrade with the selected grade value', () => {
    const onGrade = vi.fn()
    render(<SessionGrading conversationId="abc" onGrade={onGrade} />)
    fireEvent.click(screen.getByText('Accepted'))
    expect(onGrade).toHaveBeenCalledWith('accepted')
  })
})
