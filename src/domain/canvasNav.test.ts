import { describe, expect, it } from 'vitest'

import { formatWeekAriaLabel, getNextWeekIndex } from './canvasNav'
import { getLifeStats } from './lifeMath'

describe('canvasNav domain', () => {
  it('navigates with arrow keys correctly', () => {
    const totalCells = 4160 // 80 years * 52 cols
    const cols = 52

    expect(getNextWeekIndex(10, 'ArrowRight', totalCells, cols)).toBe(11)
    expect(getNextWeekIndex(10, 'ArrowLeft', totalCells, cols)).toBe(9)
    expect(getNextWeekIndex(10, 'ArrowDown', totalCells, cols)).toBe(62)
    expect(getNextWeekIndex(62, 'ArrowUp', totalCells, cols)).toBe(10)

    // Clamping boundaries
    expect(getNextWeekIndex(0, 'ArrowLeft', totalCells, cols)).toBe(0)
    expect(getNextWeekIndex(0, 'ArrowUp', totalCells, cols)).toBe(0)
    expect(getNextWeekIndex(totalCells - 1, 'ArrowRight', totalCells, cols)).toBe(totalCells - 1)
    expect(getNextWeekIndex(totalCells - 1, 'ArrowDown', totalCells, cols)).toBe(totalCells - 1)
  })

  it('navigates with Home, End, PageUp, PageDown correctly', () => {
    const totalCells = 520
    const cols = 52

    // Home goes to start of row
    expect(getNextWeekIndex(15, 'Home', totalCells, cols)).toBe(0)
    expect(getNextWeekIndex(58, 'Home', totalCells, cols)).toBe(52)

    // End goes to end of row
    expect(getNextWeekIndex(15, 'End', totalCells, cols)).toBe(51)

    // PageUp jumps 10 rows up
    expect(getNextWeekIndex(260, 'PageUp', totalCells, cols)).toBe(0)

    // PageDown jumps 10 rows down
    expect(getNextWeekIndex(0, 'PageDown', totalCells, cols)).toBe(519)
  })

  it('formats aria label accurately', () => {
    const dob = new Date(2000, 0, 1) // Jan 1, 2000
    const today = new Date(2023, 0, 1) // Jan 1, 2023 (~1200 weeks)
    const stats = getLifeStats(dob, 80, today)

    const currentWeekIndex = stats.weeksLived
    const label = formatWeekAriaLabel(
      currentWeekIndex,
      dob,
      stats,
      true,
      3,
      'University',
    )

    expect(label).toContain(`Week ${currentWeekIndex + 1}`)
    expect(label).toContain('This week (Current)')
    expect(label).toContain('Chapter: University')
    expect(label).toContain('Has weekly note')
    expect(label).toContain('3 day entries')
  })
})
