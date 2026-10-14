/**
 * Life math. Every function here is pure and takes `today` as a parameter so it
 * is trivially unit-testable and a "time travel" debug mode can inject any date.
 *
 * The core calculation works in whole calendar days, normalised to UTC midnight
 * so daylight-saving transitions can never make a day 23 or 25 hours long. Weeks
 * are then derived from those day counts, which keeps the numbers honest across
 * leap years instead of assuming a flat 52 weeks per year.
 */

import {
  WEEKS_PER_YEAR,
  calendarAge,
  calendarMonths,
  daysBetween,
  nextBirthday,
  type LeapRule,
} from './dates'

export const MIN_LIFE_YEARS = 1
export const MAX_LIFE_YEARS = 120
export const DEFAULT_LIFE_YEARS = 80

export interface LifeStats {
  /** Whole days lived, UTC-normalised. */
  daysLived: number
  /** Whole weeks lived (0-based index of the current week). */
  weeksLived: number
  /** Weeks in the expected lifespan, derived from real (leap-aware) days. */
  baseWeeks: number
  /** Expected weeks ahead + lived; kept as a spec alias of `baseWeeks`. */
  totalWeeks: number
  /** Grid cells actually rendered, always a whole number of 52-week rows. */
  totalCells: number
  /** Expected weeks still ahead (never negative). */
  weeksLeft: number
  /** Percentage of expected life lived, capped at 100. */
  percent: number
  /** Current age in whole years (calendar comparison). */
  ageYears: number
  /** Whole calendar months lived. */
  monthsLived: number
  /** Next birthday on or after today. */
  nextBirthday: Date
  /** Days until the next birthday. */
  daysToBirthday: number
  /** True once the person has passed their expected lifespan. */
  isBonus: boolean
  /** Weeks lived beyond the expected lifespan. */
  bonusWeeks: number
  /** Number of rows in the grid, including bonus rows. */
  totalRows: number
}

export function clampLifeYears(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LIFE_YEARS
  return Math.min(Math.max(Math.round(n), MIN_LIFE_YEARS), MAX_LIFE_YEARS)
}

/** UTC-midnight timestamp derived from a date's *local* calendar fields. */
function toUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getLifeStats(
  dob: Date,
  lifeYears: number,
  today: Date = new Date(),
  leapRule: LeapRule = 'mar1',
): LifeStats {
  const years = clampLifeYears(lifeYears)

  const startDate = toUtc(dob)
  const currentDate = toUtc(today)

  const end = new Date(dob)
  end.setFullYear(dob.getFullYear() + years)
  const endDate = toUtc(end)

  const daysLived = Math.max(Math.floor((currentDate - startDate) / 86_400_000), 0)
  const remainingDays = Math.max(Math.floor((endDate - currentDate) / 86_400_000), 0)
  const totalDays = (endDate - startDate) / 86_400_000

  const weeksLived = Math.floor(daysLived / 7)
  const totalWeeks = Math.ceil(totalDays / 7)
  const weeksLeft = Math.ceil(remainingDays / 7)
  const percent = Math.min((daysLived / totalDays) * 100, 100)

  const bonusWeeks = Math.max(weeksLived - totalWeeks, 0)
  const baseRows = Math.ceil(totalWeeks / WEEKS_PER_YEAR)
  const bonusRows = bonusWeeks > 0 ? Math.ceil(bonusWeeks / WEEKS_PER_YEAR) : 0
  const totalRows = baseRows + bonusRows
  const totalCells = totalRows * WEEKS_PER_YEAR

  const nb = nextBirthday(dob, today, leapRule)

  return {
    daysLived,
    weeksLived,
    baseWeeks: totalWeeks,
    totalWeeks,
    totalCells,
    weeksLeft,
    percent,
    ageYears: Math.max(calendarAge(dob, today), 0),
    monthsLived: calendarMonths(dob, today),
    nextBirthday: nb,
    daysToBirthday: daysBetween(today, nb),
    isBonus: bonusWeeks > 0,
    bonusWeeks,
    totalRows,
  }
}

export type CellState = 'lived' | 'current' | 'future' | 'bonus'

export function cellState(weekIndex: number, stats: LifeStats): CellState {
  if (weekIndex === stats.weeksLived) return 'current'
  if (weekIndex < stats.weeksLived) return weekIndex >= stats.baseWeeks ? 'bonus' : 'lived'
  return 'future'
}

/** Age attained during a given week index (row = year of age). */
export function weekAge(weekIndex: number): number {
  return Math.floor(weekIndex / WEEKS_PER_YEAR)
}

/** True when the week begins a new year-of-age row (used for row labels). */
export function isYearStart(weekIndex: number): boolean {
  return weekIndex % WEEKS_PER_YEAR === 0
}
