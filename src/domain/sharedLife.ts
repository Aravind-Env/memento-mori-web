/**
 * Shared life calculation — psychologically sensitive, mathematically correct.
 *
 * Each person has an independent date of birth and expected lifespan. The
 * shared remaining time is based on the EARLIER of the two projected end
 * dates (user's vs person's), never assuming the other person shares the
 * user's lifespan.
 *
 * All dates use UTC midnight normalisation to avoid DST/timezone off-by-one
 * errors. Results are estimates, clearly labelled as such.
 */

import { calendarAge, parseISODate } from './dates'
import type { Relationship } from '../data/model'

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.2425 // average including leap years

export interface SharedLifeResult {
  /** Person's current age in whole years, null when no DOB. */
  personAge: number | null
  /** Person's individual expected lifespan in years. */
  personExpectedLifespan: number
  /** Person's projected end date (DOB + expectedLifespan), null when no DOB. */
  personProjectedEnd: string | null
  /** User's projected end date (user DOB + user lifeYears). */
  userProjectedEnd: string
  /** The earlier of the two projected end dates. */
  sharedProjectedEnd: string
  /** Estimated remaining shared years (0 if already passed). */
  sharedRemainingYears: number
  /** Estimated remaining shared months (rounded down, 0 if already passed). */
  sharedRemainingMonths: number
  /** Estimated future meetings = sharedRemainingYears × visitsPerYear. */
  estimatedFutureMeetings: number
  /** Whether the shared end date has already passed. */
  isSharedTimePassed: boolean
  /** Human-friendly, non-alarming explanation. */
  explanation: string
}

/**
 * Add whole years to a date using calendar fields (handles leap years correctly:
 * Feb 29 + 1 year → Feb 28 or Mar 1 depending on leap rule, here we keep the
 * same month/day and let the date roll naturally).
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date)
  result.setFullYear(result.getFullYear() + years)
  return result
}

/**
 * Format a date as YYYY-MM-DD using local calendar fields (UTC-normalised).
 */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Calculate the shared life projection for a person relative to the user.
 *
 * @param person - The person record (with optional dob and expectedLifespan)
 * @param userDob - User's date of birth as YYYY-MM-DD
 * @param userLifeYears - User's expected lifespan in years
 * @param today - Reference date (defaults to now)
 */
export function calculateSharedLife(
  person: Pick<Relationship, 'dob' | 'expectedLifespan' | 'visitsPerYear' | 'name' | 'kind'>,
  userDob: string,
  userLifeYears: number,
  today: Date = new Date(),
): SharedLifeResult {
  const userDobDate = parseISODate(userDob)
  const validUserDob = !Number.isNaN(userDobDate.getTime()) ? userDobDate : today
  const userEnd = addYears(validUserDob, userLifeYears)
  const userEndKey = toDateKey(userEnd)

  // Person-specific expected lifespan; fall back to user's estimate if absent.
  const personLifeYears =
    person.expectedLifespan !== undefined && person.expectedLifespan >= 1 && person.expectedLifespan <= 120
      ? person.expectedLifespan
      : userLifeYears

  let personAge: number | null = null
  let personEnd: string | null = null

  if (person.dob) {
    const personDobDate = parseISODate(person.dob)
    if (!Number.isNaN(personDobDate.getTime())) {
      personAge = Math.max(calendarAge(personDobDate, today), 0)
      const personEndDate = addYears(personDobDate, personLifeYears)
      personEnd = toDateKey(personEndDate)
    }
  }

  // Shared projected end = earlier of the two
  const sharedEnd = personEnd
    ? personEnd < userEndKey
      ? personEnd
      : userEndKey
    : userEndKey

  // Calculate remaining shared time
  const todayKey = toDateKey(today)
  const isSharedTimePassed = sharedEnd <= todayKey

  let sharedRemainingYears = 0
  let sharedRemainingMonths = 0
  let estimatedFutureMeetings = 0

  if (!isSharedTimePassed && personEnd) {
    // Use day-based calculation for precision
    const sharedEndDate = parseISODate(sharedEnd)
    const daysRemaining = Math.max(
      Math.ceil((sharedEndDate.getTime() - today.getTime()) / MS_PER_DAY),
      0,
    )
    sharedRemainingYears = daysRemaining / DAYS_PER_YEAR
    sharedRemainingMonths = Math.floor((daysRemaining / DAYS_PER_YEAR) * 12)
    estimatedFutureMeetings = Math.floor(sharedRemainingYears * person.visitsPerYear)
  } else if (!isSharedTimePassed && !personEnd) {
    // No person DOB: use user's remaining time
    const daysRemaining = Math.max(
      Math.ceil((userEnd.getTime() - today.getTime()) / MS_PER_DAY),
      0,
    )
    sharedRemainingYears = daysRemaining / DAYS_PER_YEAR
    sharedRemainingMonths = Math.floor((daysRemaining / DAYS_PER_YEAR) * 12)
    estimatedFutureMeetings = Math.floor(sharedRemainingYears * person.visitsPerYear)
  }

  // Build a gentle, non-alarming explanation
  const visitsLabel =
    person.visitsPerYear === 1 ? 'visit per year' : `${person.visitsPerYear} visits per year`
  let explanation: string
  if (isSharedTimePassed) {
    explanation = `Based on current estimates, the projected shared window with ${person.name} has already passed. Actual lifespans are unpredictable — treat this as a reflection prompt, not a deadline.`
  } else if (!person.dob) {
    explanation = `No birth date recorded for ${person.name}. The estimate assumes their lifespan matches yours (${userLifeYears} years). Add their birth date for a person-specific calculation.`
  } else {
    explanation = `At ${visitsLabel}, you may share approximately ${estimatedFutureMeetings.toLocaleString()} more gatherings with ${person.name}. This is an estimate based on ${personLifeYears}-year expected lifespan for ${person.name} — actual lifespans are unpredictable.`
  }

  return {
    personAge,
    personExpectedLifespan: personLifeYears,
    personProjectedEnd: personEnd,
    userProjectedEnd: userEndKey,
    sharedProjectedEnd: sharedEnd,
    sharedRemainingYears: Math.round(sharedRemainingYears * 10) / 10,
    sharedRemainingMonths,
    estimatedFutureMeetings,
    isSharedTimePassed,
    explanation,
  }
}
