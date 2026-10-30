/**
 * Life Timeline domain logic.
 * Groups journal entries chronologically by year and month,
 * supports filtering by chapter, tag, and mood,
 * and provides pagination for large histories.
 */

import type { EntryMeta } from '../core/journal'
import type { Chapter } from '../data/model'

export interface TimelineEntry {
  date: string
  weekIndex: number
  title?: string
  mood?: number
  tags: string[]
  words: number
  excerpt: string
  updatedAt: number
  chapter?: Chapter
}

export interface TimelineMonth {
  year: number
  month: number
  monthLabel: string
  entries: TimelineEntry[]
}

export interface TimelineFilters {
  chapters?: string[]
  tags?: string[]
  moods?: number[]
}

export interface PaginatedTimeline {
  months: TimelineMonth[]
  totalMonths: number
  totalEntries: number
  hasMore: boolean
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Parses a date key (YYYY-MM-DD) into year and month components.
 */
function parseDateKey(key: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1 }
}

/**
 * Groups entries into year → month buckets, sorted newest first.
 * Applies optional filters for chapters, tags, and moods.
 */
export function buildTimeline(
  entries: EntryMeta[],
  filters: TimelineFilters = {},
): TimelineMonth[] {
  const filtered = entries.filter((e) => {
    if (filters.tags && filters.tags.length > 0) {
      const hasTag = filters.tags.some((t) => (e.tags ?? []).includes(t))
      if (!hasTag) return false
    }
    if (filters.moods && filters.moods.length > 0 && e.mood !== undefined) {
      if (!filters.moods.includes(e.mood)) return false
    }
    return true
  })

  const byMonth = new Map<string, TimelineEntry[]>()

  for (const e of filtered) {
    const parsed = parseDateKey(e.date)
    if (!parsed) continue
    const key = `${parsed.year}-${String(parsed.month + 1).padStart(2, '0')}`
    const entry: TimelineEntry = {
      date: e.date,
      weekIndex: e.weekIndex,
      title: e.title,
      mood: e.mood,
      tags: e.tags ?? [],
      words: e.words,
      excerpt: e.excerpt,
      updatedAt: e.updatedAt,
    }
    if (!byMonth.has(key)) {
      byMonth.set(key, [])
    }
    byMonth.get(key)!.push(entry)
  }

  // Sort entries within each month by date ascending
  for (const entries of byMonth.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Build month objects sorted by year/month descending (newest first)
  const months: TimelineMonth[] = []
  for (const [key, entries] of byMonth.entries()) {
    const [yearStr, monthStr] = key.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr) - 1
    months.push({
      year,
      month,
      monthLabel: MONTH_LABELS[month],
      entries,
    })
  }

  months.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return b.month - a.month
  })

  return months
}

/**
 * Paginates timeline months for incremental loading.
 * `page` is 0-based; `pageSize` is number of months per page.
 */
export function paginateTimeline(
  months: TimelineMonth[],
  page: number,
  pageSize = 12,
): PaginatedTimeline {
  const start = page * pageSize
  const pageMonths = months.slice(start, start + pageSize)
  const totalEntries = months.reduce((sum, m) => sum + m.entries.length, 0)
  return {
    months: pageMonths,
    totalMonths: months.length,
    totalEntries,
    hasMore: start + pageSize < months.length,
  }
}

/**
 * Extracts all unique tags used across entries.
 */
export function getUniqueTags(entries: EntryMeta[]): string[] {
  const tags = new Set<string>()
  for (const e of entries) {
    for (const t of e.tags ?? []) {
      tags.add(t)
    }
  }
  return Array.from(tags).sort()
}

/**
 * Extracts all unique moods used across entries (1-5).
 */
export function getUniqueMoods(entries: EntryMeta[]): number[] {
  const moods = new Set<number>()
  for (const e of entries) {
    if (e.mood !== undefined && e.mood >= 1 && e.mood <= 5) {
      moods.add(e.mood)
    }
  }
  return Array.from(moods).sort()
}

/**
 * Formats a date key into a human-readable day label.
 */
export function formatTimelineDate(key: string): string {
  const d = new Date(key + 'T12:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
