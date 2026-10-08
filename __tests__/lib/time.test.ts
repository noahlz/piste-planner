import { describe, it, expect } from 'vitest'
import { formatMinutes, formatClock } from '../../src/lib/time.ts'

describe('formatMinutes', () => {
  it('renders H:MM with no leading zero on the hour', () => {
    expect(formatMinutes(480)).toBe('8:00')
  })

  it('renders — for null', () => {
    expect(formatMinutes(null)).toBe('—')
  })
})

describe('formatClock', () => {
  it('zero-pads the hour for a morning time', () => {
    expect(formatClock(480)).toBe('08:00')
  })

  it('renders an afternoon time with both parts', () => {
    expect(formatClock(847)).toBe('14:07')
  })

  it.each([
    [1440, '00:00'],
    [1510, '01:10'],
    [1439, '23:59'],
  ])('wraps %i minutes into the next morning as %s', (minutes, expected) => {
    expect(formatClock(minutes)).toBe(expected)
  })
})
