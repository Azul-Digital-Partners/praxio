import { describe, it, expect } from 'vitest'
import { colors, gradients } from './theme'

describe('i7n theme', () => {
  it('exports primary teal color', () => {
    expect(colors.primary).toBe('#0D9488')
  })
  it('exports secondary indigo color', () => {
    expect(colors.secondary).toBe('#4338CA')
  })
  it('exports nav gradient', () => {
    expect(gradients.nav).toBe('linear-gradient(135deg, #0D9488, #4338CA)')
  })
})
