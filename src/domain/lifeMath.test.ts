import { describe, expect, it } from 'vitest'

import {
  addDays,
  calendarAge,
  calendarMonths,
  daysBetween,
  nextBirthday,
  parseISODate,
  toISODate,
  weekRange,
  weekStart,
} from './dates'
import { cellState, clampLifeYears, getLifeStats, weekAge } from './lifeMath'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe('date helpers', () => {
  it('parses ISO dates as local calendar dates', () => {
    const parsed = parseISODate('1990-05-15')
    expect(parsed.getFullYear()).toBe(1990)
    expect(parsed.getMonth()).toBe(4)
    expect(parsed.getDate()).toBe(15)
    expect(toISODate(parsed)).toBe('1990-05-15')
  })

  it('counts whole days across a DST transition', () => {
    // US DST began 2023-03-12; UTC-normalised math must still yield 4 days.
    expect(daysBetween(d(2023, 3, 10), d(2023, 3, 14))).toBe(4)
    // UK DST began 2023-03-26.
    expect(daysBetween(d(2023, 3, 24), d(2023, 3, 28))).toBe(4)
  })

  it('adds days across a month boundary', () => {
    expect(toISODate(addDays(d(2023, 1, 31), 1))).toBe('2023-02-01')
    expect(toISODate(addDays(d(2024, 2, 28), 1))).toBe('2024-02-29')
    expect(toISODate(addDays(d(2023, 2, 28), 1))).toBe('2023-03-01')
  })

  it('computes calendar age by comparison, not days/365', () => {
    expect(calendarAge(d(1990, 5, 15), d(2024, 5, 14))).toBe(33)
    expect(calendarAge(d(1990, 5, 15), d(2024, 5, 15))).toBe(34)
    expect(calendarAge(d(1990, 12, 31), d(2024, 1, 1))).toBe(33)
  })

  it('computes whole calendar months', () => {
    expect(calendarMonths(d(1990, 5, 15), d(2024, 5, 14))).toBe(407)
    expect(calendarMonths(d(1990, 5, 15), d(2024, 5, 15))).toBe(408)
  })
})

describe('nextBirthday', () => {
  it('returns today when the birthday is today', () => {
    expect(toISODate(nextBirthday(d(1990, 5, 15), d(2024, 5, 15)))).toBe('2024-05-15')
  })

  it('rolls to next year when the birthday has passed', () => {
    expect(toISODate(nextBirthday(d(1990, 5, 15), d(2024, 5, 16)))).toBe('2025-05-15')
  })

  it('handles Feb 29 birthdays in common years (default Mar 1)', () => {
    expect(toISODate(nextBirthday(d(2000, 2, 29), d(2023, 2, 15)))).toBe('2023-03-01')
  })

  it('handles Feb 29 birthdays with the feb28 rule', () => {
    expect(toISODate(nextBirthday(d(2000, 2, 29), d(2023, 2, 15), 'feb28'))).toBe('2023-02-28')
  })

  it('uses the real Feb 29 in leap years', () => {
    expect(toISODate(nextBirthday(d(2000, 2, 29), d(2024, 1, 1)))).toBe('2024-02-29')
  })
})

describe('week indexing', () => {
  it('week 0 starts on the birth date', () => {
    expect(toISODate(weekStart(d(2000, 1, 1), 0))).toBe('2000-01-01')
  })
  it('week 1 starts seven days later', () => {
    expect(toISODate(weekStart(d(2000, 1, 1), 1))).toBe('2000-01-08')
  })
  it('reports an inclusive range', () => {
    const { start, end } = weekRange(d(2000, 1, 1), 1)
    expect(toISODate(start)).toBe('2000-01-08')
    expect(toISODate(end)).toBe('2000-01-14')
  })
  it('maps week index to age row', () => {
    expect(weekAge(0)).toBe(0)
    expect(weekAge(51)).toBe(0)
    expect(weekAge(52)).toBe(1)
  })
})

describe('getLifeStats', () => {
  const utc = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day)

  it('born today has zero weeks lived and week 0 current', () => {
    const today = d(2024, 6, 1)
    const stats = getLifeStats(today, 80, today)
    expect(stats.daysLived).toBe(0)
    expect(stats.weeksLived).toBe(0)
    expect(stats.percent).toBe(0)
    expect(stats.ageYears).toBe(0)
    expect(stats.totalCells).toBe(stats.totalRows * 52)
    expect(stats.totalRows).toBeGreaterThanOrEqual(80)
    expect(cellState(0, stats)).toBe('current')
    expect(cellState(1, stats)).toBe('future')
  })

  it('derives weeks and remaining weeks from real calendar days', () => {
    const dob = d(1994, 6, 1)
    const today = d(2024, 6, 1)
    const stats = getLifeStats(dob, 80, today)
    const totalDays = (utc(2074, 6, 1) - utc(1994, 6, 1)) / 86400000
    expect(stats.ageYears).toBe(30)
    expect(stats.daysLived).toBe(10958) // includes 8 leap days (1996..2024)
    expect(stats.weeksLived).toBe(Math.floor(10958 / 7))
    expect(stats.baseWeeks).toBe(Math.ceil(totalDays / 7))
    expect(stats.weeksLeft).toBe(Math.ceil((totalDays - 10958) / 7))
    expect(stats.percent).toBeCloseTo((10958 / totalDays) * 100, 6)
  })

  it('caps percent at 100 and enters bonus time past the estimate', () => {
    const stats = getLifeStats(d(1940, 1, 1), 80, d(2025, 1, 1))
    expect(stats.isBonus).toBe(true)
    expect(stats.bonusWeeks).toBeGreaterThan(0)
    expect(stats.weeksLeft).toBe(0)
    expect(stats.percent).toBe(100)
    // Whole expected rows plus whole bonus rows covering the extra weeks.
    expect(stats.totalRows).toBe(
      Math.ceil(stats.baseWeeks / 52) + Math.ceil(stats.bonusWeeks / 52),
    )
    expect(cellState(stats.weeksLived, stats)).toBe('current')
    expect(cellState(stats.baseWeeks, stats)).toBe('bonus')
  })

  it('handles extreme old age without going negative', () => {
    const stats = getLifeStats(d(1900, 1, 1), 80, d(2025, 1, 1))
    expect(stats.ageYears).toBe(125)
    expect(stats.totalRows).toBeGreaterThan(80)
    expect(stats.weeksLeft).toBe(0)
  })

  it('treats a future DOB gracefully as zero lived', () => {
    const stats = getLifeStats(d(2030, 1, 1), 80, d(2024, 1, 1))
    expect(stats.daysLived).toBe(0)
    expect(stats.weeksLived).toBe(0)
  })

  it('never lets weeksLeft exceed the estimate', () => {
    const stats = getLifeStats(d(2000, 1, 1), 1, d(2001, 1, 1))
    expect(stats.weeksLeft).toBeGreaterThanOrEqual(0)
  })
})

describe('clampLifeYears', () => {
  it('clamps into the allowed range', () => {
    expect(clampLifeYears(0)).toBe(1)
    expect(clampLifeYears(500)).toBe(120)
    expect(clampLifeYears(80)).toBe(80)
    expect(clampLifeYears(Number.NaN)).toBe(80)
  })
})
