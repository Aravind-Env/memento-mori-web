import { describe, expect, it } from 'vitest'

import {
  YEAR_COLS,
  clampDecade,
  clampYear,
  decadeCount,
  decadeOf,
  nextZoom,
  viewLayout,
  yearOf,
} from './zoom'
import { WEEKS_PER_YEAR } from './dates'

describe('nextZoom', () => {
  it('cycles life → decade → year → life', () => {
    expect(nextZoom('life')).toBe('decade')
    expect(nextZoom('decade')).toBe('year')
    expect(nextZoom('year')).toBe('life')
  })
})

describe('decades', () => {
  it('counts decade bands, at least one', () => {
    expect(decadeCount(80)).toBe(8)
    expect(decadeCount(85)).toBe(9)
    expect(decadeCount(0)).toBe(1)
  })

  it('locates the band holding the current week', () => {
    expect(decadeOf(0)).toBe(0)
    expect(decadeOf(WEEKS_PER_YEAR * 35)).toBe(3)
    expect(decadeOf(-10)).toBe(0)
  })

  it('clamps decade indices into range', () => {
    expect(clampDecade(-3, 80)).toBe(0)
    expect(clampDecade(50, 80)).toBe(7)
    expect(clampDecade(2, 80)).toBe(2)
  })
})

describe('years', () => {
  it('locates the age year holding the current week', () => {
    expect(yearOf(0)).toBe(0)
    expect(yearOf(WEEKS_PER_YEAR + 5)).toBe(1)
  })

  it('clamps year indices into range', () => {
    expect(clampYear(-5, 80)).toBe(0)
    expect(clampYear(150, 80)).toBe(79)
  })
})

describe('viewLayout', () => {
  it('life view shows every row from week 0', () => {
    expect(viewLayout('life', 80, 3, 30)).toEqual({
      rows: 80,
      cols: WEEKS_PER_YEAR,
      weekOffset: 0,
    })
  })

  it('decade view shows ten rows starting at the band, clamped at the end of life', () => {
    expect(viewLayout('decade', 80, 3, 30)).toEqual({
      rows: 10,
      cols: WEEKS_PER_YEAR,
      weekOffset: 30 * WEEKS_PER_YEAR,
    })
    // Last band is short when the estimate is not a multiple of ten.
    expect(viewLayout('decade', 85, 8, 0).rows).toBe(5)
    // Out-of-range decades fall back inside the grid.
    const clamped = viewLayout('decade', 80, 40, 0)
    expect(clamped.weekOffset).toBe(7 * 10 * WEEKS_PER_YEAR)
    expect(clamped.rows).toBe(10)
  })

  it('year view is a 13×4 window for the chosen age', () => {
    const layout = viewLayout('year', 80, 0, 34)
    expect(layout.rows).toBe(4)
    expect(layout.cols).toBe(YEAR_COLS)
    expect(layout.weekOffset).toBe(34 * WEEKS_PER_YEAR)
  })
})
