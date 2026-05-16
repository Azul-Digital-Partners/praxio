// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { PraxioLayout } from './Layout'

expect.extend(matchers)

describe('PraxioLayout', () => {
  it('renders nav rail, sidebar, main, and right panel slots', () => {
    render(
      <PraxioLayout
        navRail={<div data-testid="nav" />}
        sidebar={<div data-testid="sidebar" />}
        main={<div data-testid="main" />}
        rightPanel={<div data-testid="right" />}
      />
    )
    expect(screen.getByTestId('nav')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('right')).toBeInTheDocument()
  })
})
