// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { BudgetStrip } from './BudgetStrip'

expect.extend(matchers)

describe('BudgetStrip', () => {
  it('renders fill width as percentage of cap', () => {
    const { container } = render(<BudgetStrip remaining={50} cap={100} />)
    const fill = container.querySelector('[data-testid="budget-fill"]')
    expect(fill).toHaveStyle({ width: '50%' })
  })
  it('uses amber color when below 20%', () => {
    const { container } = render(<BudgetStrip remaining={15} cap={100} />)
    const fill = container.querySelector('[data-testid="budget-fill"]')
    expect(fill).toHaveClass('bg-amber-400')
  })
})
