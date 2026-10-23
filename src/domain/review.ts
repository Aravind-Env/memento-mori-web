/**
 * Weekly review ritual helpers. Pure functions over plain dates and week
 * indexes, so "when is the review due" stays testable and guilt-free.
 */

import { weekStart } from './dates'

/** 0 = Sunday, as in Date.prototype.getDay. */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Short two-letter labels for the settings picker, indexed by day number. */
export const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

/**
 * The week the ritual pairs with the new intention: the one just lived.
 * Returns null for a life still waiting on week zero.
 */
export function previousNoteWeek(currentWeek: number): number | null {
  return currentWeek > 0 ? currentWeek - 1 : null
}

/**
 * Only due when a reminder day is set, today is that day, and this week's
 * ritual has not been completed (`reviewLastWeek` is behind `currentWeek`).
 * Skipping a week has no penalty: nothing accumulates, waiting just resumes
 * on the next matching weekday.
 */
export function reviewDue(
  today: Date,
  reminderDay: number | undefined,
  reviewLastWeek: number | undefined,
  currentWeek: number,
): boolean {
  if (reminderDay === undefined) return false
  if (currentWeek < 0) return false
  if (today.getDay() !== reminderDay) return false
  return (reviewLastWeek ?? -1) < currentWeek
}

/** Calendar day index (0-6) of the day a given week index starts on. */
export function reviewWeekDay(dob: Date, weekIndex: number): number {
  return weekStart(dob, weekIndex).getDay()
}
