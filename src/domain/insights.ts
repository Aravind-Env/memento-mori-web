/**
 * Insights over weekly notes: mood heatmap by year, top tags, busiest years
 * and coverage. Pure functions over week indexes only — no dates, no clock —
 * so they stay trivially testable.
 */

import type { Note } from '../data/model'
import { WEEKS_PER_YEAR } from './dates'

export interface HeatCell {
  /** Absolute week index. */
  weekIndex: number
  /** 1-5, or null when the note carries no mood. */
  mood: number | null
  noted: boolean
}

export interface HeatRow {
  /** Age year this row covers (row = the 52 weeks of age N). */
  ageYears: number
  /** Exactly 52 cells, week grouped low → high inside the age year. */
  cells: HeatCell[]
  notedCount: number
}

/**
 * Build the heatmap rows, from the first to the last year that holds a note.
 * Noted years in between are kept even when they only hold mood-less notes,
 * and gap years stay in the timeline so rows read chronologically.
 */
export function moodHeatRows(notes: Note[]): HeatRow[] {
  if (notes.length === 0) return []
  const byWeek = new Map<number, Note>()
  for (const note of notes) byWeek.set(note.weekIndex, note)

  let firstAge = Number.POSITIVE_INFINITY
  let lastAge = -1
  for (const note of notes) {
    const age = Math.floor(note.weekIndex / WEEKS_PER_YEAR)
    firstAge = Math.min(firstAge, age)
    lastAge = Math.max(lastAge, age)
  }

  const rows: HeatRow[] = []
  for (let age = firstAge; age <= lastAge; age++) {
    const cells: HeatCell[] = []
    let notedCount = 0
    for (let w = 0; w < WEEKS_PER_YEAR; w++) {
      const weekIndex = age * WEEKS_PER_YEAR + w
      const note = byWeek.get(weekIndex)
      cells.push({
        weekIndex,
        mood: note?.mood ?? null,
        noted: note !== undefined,
      })
      if (note) notedCount++
    }
    rows.push({ ageYears: age, cells, notedCount })
  }
  return rows
}

/**
 * Most-used tags across all notes. Counts are case-insensitive, sorted by
 * count desc then tag asc; `limit` (default 6) keeps the list calm.
 */
export function topTags(notes: Note[], limit = 6): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    for (const raw of note.tags ?? []) {
      const tag = raw.trim().toLowerCase()
      if (!tag) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(limit, 0))
}

/**
 * Years with the most notes, sorted by count desc then age asc
 * (so the earliest busy life wins a tie).
 */
export function busiestYears(
  notes: Note[],
  limit = 3,
): { ageYears: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const note of notes) {
    const age = Math.floor(note.weekIndex / WEEKS_PER_YEAR)
    counts.set(age, (counts.get(age) ?? 0) + 1)
  }
  return Array.from(counts, ([ageYears, count]) => ({ ageYears, count }))
    .sort((a, b) => b.count - a.count || a.ageYears - b.ageYears)
    .slice(0, Math.max(limit, 0))
}

export interface InsightSummary {
  /** Number of notes (one per week). */
  totalNotes: number
  /** Notes carrying a mood 1-5. */
  withMood: number
  /** Number of tagged entries across all notes. */
  tagEntries: number
}

export function insightSummary(notes: Note[]): InsightSummary {
  let withMood = 0
  let tagEntries = 0
  for (const note of notes) {
    if (note.mood !== undefined) withMood++
    tagEntries += (note.tags ?? []).length
  }
  return { totalNotes: notes.length, withMood, tagEntries }
}
