/**
 * Pure date helpers. Everything is normalised to a UTC midnight derived from the
 * *local* calendar date, so subtracting two dates never drifts across DST
 * (where a day can be 23 or 25 hours long).
 */

export type LeapRule = 'mar1' | 'feb28'

export const MS_PER_DAY = 86_400_000
export const WEEKS_PER_YEAR = 52

/** UTC-midnight timestamp of the local calendar day for a given Date. */
export function utcMidnight(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Parse a `YYYY-MM-DD` string as a *local* calendar date (never UTC-shifted). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Serialise a Date to a `YYYY-MM-DD` string using its local calendar fields. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Whole calendar days between two dates (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / MS_PER_DAY)
}

export function addDays(d: Date, days: number): Date {
  const utc = utcMidnight(d) + days * MS_PER_DAY
  const r = new Date(utc)
  return new Date(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate())
}

/** Age in whole years using calendar comparison, not days / 365. */
export function calendarAge(dob: Date, today: Date): number {
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1
  return age
}

/** Whole calendar months lived. */
export function calendarMonths(dob: Date, today: Date): number {
  let months =
    (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth())
  if (today.getDate() < dob.getDate()) months -= 1
  return Math.max(months, 0)
}

/**
 * Next occurrence of the birthday on or after `today`. Feb 29 birthdays are
 * mapped according to `leapRule` in non-leap years.
 */
export function nextBirthday(dob: Date, today: Date, leapRule: LeapRule = 'mar1'): Date {
  const feb29 = dob.getMonth() === 1 && dob.getDate() === 29
  const forYear = (year: number): Date => {
    if (feb29 && !isLeapYear(year)) {
      return leapRule === 'feb28' ? new Date(year, 1, 28) : new Date(year, 2, 1)
    }
    return new Date(year, dob.getMonth(), dob.getDate())
  }
  let candidate = forYear(today.getFullYear())
  if (utcMidnight(candidate) < utcMidnight(today)) candidate = forYear(today.getFullYear() + 1)
  return candidate
}

/** Start date of the 7-day week with the given 0-based index from the DOB. */
export function weekStart(dob: Date, weekIndex: number): Date {
  return addDays(dob, weekIndex * 7)
}

/** Inclusive date range covered by a week index. */
export function weekRange(dob: Date, weekIndex: number): { start: Date; end: Date } {
  const start = weekStart(dob, weekIndex)
  return { start, end: addDays(start, 6) }
}

const DEFAULT_LOCALE: string | undefined = undefined

export function formatDate(d: Date, locale: string = DEFAULT_LOCALE ?? 'en-US'): string {
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const s = start.toLocaleDateString('en-US', {
    year: sameYear ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const e = end.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${s} – ${e}`
}
