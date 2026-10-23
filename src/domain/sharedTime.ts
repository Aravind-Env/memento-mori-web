/**
 * Shared time: how many visits remain with the people who still write your
 * story — the quiet math behind "you will see your mother ~N more times".
 *
 * The formula is deliberately simple and honest about being an estimate:
 * the shared years are the smaller of the two people's remaining estimates,
 * and meetings are shared years × their visits per year. Pure functions only.
 */

import { WEEKS_PER_YEAR, calendarAge, parseISODate } from './dates'
import type { Relationship } from '../data/model'

export interface SharedTimeInput {
  visitsPerYear: number
  /** Person's birth date, `YYYY-MM-DD`; optional in the data model. */
  personDob?: string
  /** The user's remaining estimated years (from their own DOB and estimate). */
  yourRemainingYears: number
  /** Lifespan yardstick in years used for the other person's estimate. */
  lifeExpectancy: number
}

export interface SharedTimeResult {
  /** Estimated age of the other person; null when no birth date is known. */
  personAge: number | null
  /** Their remaining estimate; falls back to the yardstick without a DOB. */
  theirRemainingYears: number
  /** min(both estimates), the shared window for meetings. */
  sharedYears: number
  /** floor(sharedYears × visitsPerYear); null when no birth date is known.  */
  remainingMeetings: number | null
}

/**
 * Remaining years of life for the other person, clamped decade-style to the
 * yardstick. A future birth date (a child still to come) is handled by
 * treating them as young — the estimate itself does the clamping.
 */
export function theirRemainingYears(
  personDob: string | undefined,
  lifeExpectancy: number,
  today: Date,
): { age: number | null; remaining: number } {
  if (!personDob) return { age: null, remaining: Math.max(lifeExpectancy, 0) }
  const dob = parseISODate(personDob)
  if (Number.isNaN(dob.getTime())) return { age: null, remaining: Math.max(lifeExpectancy, 0) }
  const age = Math.max(calendarAge(dob, today), 0)
  return { age, remaining: Math.max(lifeExpectancy - age, 0) }
}

/**
 * Meetings left with someone. Without their birth date the shared window
 * assumes they last as long as your own estimate — the panel says so, and
 * with a friendly prompt to add the date. Gentle mode never shows the count.
 */
export function sharedTime(input: SharedTimeInput, today: Date): SharedTimeResult {
  const visits = Math.max(input.visitsPerYear, 0)
  const your = Math.max(input.yourRemainingYears, 0)
  const { age, remaining: their } = theirRemainingYears(
    input.personDob,
    input.lifeExpectancy,
    today,
  )
  const sharedYears = Math.min(your, their)
  const remainingMeetings = age === null ? null : Math.floor(Math.max(sharedYears, 0) * visits)
  return { personAge: age, theirRemainingYears: their, sharedYears, remainingMeetings }
}

/** Convenience wrapper over an actual Relationship record. */
export function sharedTimeFor(
  person: Pick<Relationship, 'visitsPerYear' | 'dob'>,
  yourRemainingYears: number,
  lifeExpectancy: number,
  today: Date,
): SharedTimeResult {
  return sharedTime(
    {
      visitsPerYear: person.visitsPerYear,
      personDob: person.dob,
      yourRemainingYears,
      lifeExpectancy,
    },
    today,
  )
}

/** A calm one-line explanation of where the number comes from. */
export function sharedTimeNote(personAge: number | null): string {
  if (personAge === null) {
    return 'No birth date yet — the count assumes they last as long as your own estimate.'
  }
  const visitsNote = `Their estimate is the yardstick minus age ${personAge.toFixed(0)}.`
  return `${visitsNote} The shared window is the shorter of the two remaining estimates — yours and theirs.`
}

/** Age weeks helper for labels elsewhere. */
export function ageWeeks(weekIndex: number): number {
  return Math.floor(weekIndex / WEEKS_PER_YEAR)
}
