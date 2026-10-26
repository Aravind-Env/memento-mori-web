/**
 * The journal reading view: pure helpers that turn a flat list of week notes
 * into a chronological, human-readable archive. Newest first, grouped by the
 * calendar month the week begins in — the same dates the drawer shows.
 */

import type { Note } from '../data/model'
import { WEEKS_PER_YEAR, weekStart } from './dates'

export interface JournalEntry {
  note: Note
  /** Start of the note's week, from the DOB. Dates are derived, never stored. */
  start: Date
  /** Age on the day the week starts (grid-age: weeks / 52). */
  age: number
}

export interface JournalMonth {
  /** `year-month` key for rendering. */
  key: string
  /** Year number of the group. */
  year: number
  /** Long month name, English (follows existing en-US date labels). */
  month: string
  entries: JournalEntry[]
}

export interface JournalYear {
  year: number
  months: JournalMonth[]
}

/** "12 notes · Apr 2023 → Oct 2026", or null with no notes. */
export interface JournalSummary {
  count: number
  first: Date | null
  last: Date | null
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function toEntry(note: Note, dob: Date): JournalEntry {
  return {
    note,
    start: weekStart(dob, note.weekIndex),
    age: Math.floor(note.weekIndex / WEEKS_PER_YEAR),
  }
}

/**
 * Group profile-scoped notes newest-first into year → month buckets. A week
 * that straddles two months belongs to the month it starts in; notes within a
 * bucket stay newest-first.
 */
export function groupJournal(notes: Note[], dob: Date): JournalYear[] {
  const sorted = [...notes].sort((a, b) => b.weekIndex - a.weekIndex)
  const years: JournalYear[] = []
  let currentYear: JournalYear | null = null
  let currentMonth: JournalMonth | null = null

  for (const note of sorted) {
    const { start, age } = toEntry(note, dob)
    const year = start.getFullYear()
    const month = start.getMonth()
    const monthLabel = MONTHS[month]

    if (!currentYear || currentYear.year !== year) {
      currentYear = { year, months: [] }
      years.push(currentYear)
      currentMonth = null
    }
    if (!currentMonth || currentMonth.month !== monthLabel) {
      currentMonth = { key: `${year}-${month}`, year, month: monthLabel, entries: [] }
      currentYear.months.push(currentMonth)
    }
    currentMonth.entries.push({ note, start, age })
  }
  return years
}

/** Count and span of the written weeks, for the panel's one-line summary. */
export function journalSummary(notes: Note[], dob: Date): JournalSummary {
  if (notes.length === 0) return { count: 0, first: null, last: null }
  const sorted = [...notes].sort((a, b) => a.weekIndex - b.weekIndex)
  return {
    count: sorted.length,
    first: weekStart(dob, sorted[0].weekIndex),
    last: weekStart(dob, sorted[sorted.length - 1].weekIndex),
  }
}
