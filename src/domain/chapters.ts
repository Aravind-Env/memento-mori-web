/**
 * Life-chapter logic. Pure functions only: validation, lookup and the geometric
 * split used to paint bands on the canvas. Chapters are week-index ranges
 * (inclusive on both ends) that must never overlap.
 */

import type { Chapter } from '../data/model'
import { weekAge } from './lifeMath'

/** Named palette keys, resolved as `--ch-<key>` design tokens in CSS. */
export const CHAPTER_PALETTE = [
  'teal',
  'blue',
  'violet',
  'amber',
  'leaf',
  'rose',
  'slate',
  'sea',
] as const

export type ChapterColorId = (typeof CHAPTER_PALETTE)[number]

export const DEFAULT_CHAPTER_COLOR: ChapterColorId = 'teal'

export interface ChapterDraft {
  name: string
  startWeek: number
  endWeek: number
  color: string
}

interface ChapterDraftRange {
  startWeek: number
  endWeek: number
}

/** Clamp a (start, end) pair into the grid, preserving relative order. */
export function clampRange(start: number, end: number, totalCells: number): ChapterDraftRange {
  const max = Math.max(totalCells - 1, 0)
  let a = Math.round(start)
  let b = Math.round(end)
  if (!Number.isFinite(a)) a = 0
  if (!Number.isFinite(b)) b = a
  if (a > b) [a, b] = [b, a]
  const s = Math.min(Math.max(a, 0), max)
  const e = Math.min(Math.max(b, 0), max)
  return { startWeek: s, endWeek: Math.max(e, s) }
}

/**
 * Returns true when two inclusive ranges share at least one week. Touching
 * ranges (one ends at 99, the next starts at 100) do not overlap.
 */
function rangesOverlap(a: ChapterDraftRange, b: ChapterDraftRange): boolean {
  return a.startWeek <= b.endWeek && a.endWeek >= b.startWeek
}

/** First chapter that overlaps the given range, ignoring one id (self while editing). */
export function findOverlap(
  chapters: Chapter[],
  startWeek: number,
  endWeek: number,
  ignoreId?: string,
): Chapter | undefined {
  return chapters.find(
    (c) => c.id !== ignoreId && rangesOverlap(c, { startWeek, endWeek }),
  )
}

/**
 * Validate a chapter draft. Returns a calm error message, or null when it is
 * safe to save. `totalCells` is the current grid size; `ignoreId` excludes the
 * chapter being edited from its own overlap check.
 */
export function validateChapterDraft(
  draft: ChapterDraft,
  others: Chapter[],
  totalCells: number,
  ignoreId?: string,
): string | null {
  const name = draft.name.trim()
  if (!name) return 'Add a short name.'
  if (!Number.isFinite(draft.startWeek) || !Number.isFinite(draft.endWeek))
    return 'Set a valid range.'
  if (draft.endWeek < draft.startWeek) return 'The end must come after the start.'
  if (draft.startWeek < 0 || draft.endWeek > totalCells - 1)
    return 'Keep the range inside the grid.'
  const { startWeek, endWeek } = clampRange(draft.startWeek, draft.endWeek, totalCells)
  if (findOverlap(others, startWeek, endWeek, ignoreId))
    return 'Chapters cannot overlap. Adjust the range.'
  return null
}

/** The chapter painting a given week, if any. */
export function chapterAt(chapters: Chapter[], weekIndex: number): Chapter | undefined {
  return chapters.find((c) => weekIndex >= c.startWeek && weekIndex <= c.endWeek)
}

/** "Ages 10–19" style label for a range. */
export function formatChapterAges(startWeek: number, endWeek: number): string {
  const a1 = weekAge(startWeek)
  const a2 = weekAge(endWeek)
  return a1 === a2 ? `Age ${a1}` : `Ages ${a1}\u2013${a2}`
}

export interface BandSegment {
  row: number
  startCol: number
  endCol: number
}

/**
 * Split a chapter into the row segments the canvas paints inside a view
 * window: one entry per rendered row the chapter touches, with columns given
 * in window coordinates. Works for every zoom view (52-wide life grids and
 * 13-wide year windows alike); rows past the window are dropped.
 */
export function chapterWindowSegments(
  chapter: Chapter,
  cols: number,
  weekOffset: number,
  cells: number,
): BandSegment[] {
  if (cells <= 0) return []
  const fromWeek = Math.max(chapter.startWeek, weekOffset)
  const toWeek = Math.min(chapter.endWeek, weekOffset + cells - 1)
  if (toWeek < fromWeek) return []
  const firstRow = Math.floor((fromWeek - weekOffset) / cols)
  const lastRow = Math.floor((toWeek - weekOffset) / cols)
  const segments: BandSegment[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    const windowStart = row * cols + weekOffset
    const windowEnd = windowStart + cols - 1
    // When the window stops before the chapter's true end, the visible band
    // runs to the end of that row instead of wrapping mid-air.
    segments.push({
      row,
      startCol: row === firstRow ? fromWeek - windowStart : 0,
      endCol: toWeek < windowEnd ? toWeek - windowStart : cols - 1,
    })
  }
  return segments
}
