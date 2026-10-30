/**
 * Search and jump logic for the command palette. Pure functions over notes and
 * week indexes: parsing query tokens, filtering/ranking, computing "jump to
 * week/age" candidates and building short text snippets. Stays well under the
 * 100 ms budget for spreadsheet-sized note collections (linear passes only).
 */

import type { Note } from '../data/model'
import type { EntryMeta } from '../core/journal'
import { WEEKS_PER_YEAR } from './dates'

export interface ParsedQuery {
  /** Plain lowercase words (AND semantics). Empty when only filters were given. */
  terms: string[]
  /** Lowercase tag names written as `#tag`. */
  tags: string[]
  /** Exact mood filter written as `mood:4` (or `m:4`). */
  mood?: number
}

export interface JumpItem {
  kind: 'week' | 'age' | 'now'
  label: string
  weekIndex: number
}

export interface SearchResult {
  note: Note
  /** Higher matches first: text term hits + tag/mood filter bonuses. */
  score: number
  /** Short excerpt centered on the first term hit (plain text, may carry …). */
  snippet: string
}

const MOOD_TOKEN = /^(?:mood:|m:)([1-5])(?:\/5)?$/i

/** Split a palette query into text terms, `#tag` filters and a mood filter. */
export function parseSearch(raw: string): ParsedQuery {
  const terms: string[] = []
  const tags: string[] = []
  let mood: number | undefined

  for (const token of raw.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('#')) {
      const tag = token.slice(1).replace(/^#+/, '').trim().toLowerCase()
      if (tag && !tags.includes(tag)) tags.push(tag)
      continue
    }
    const moodMatch = MOOD_TOKEN.exec(token)
    if (moodMatch) {
      mood = Number(moodMatch[1])
      continue
    }
    terms.push(token.toLowerCase())
  }
  return { terms, tags, mood }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack.includes(needle)) return 0
  return haystack.split(needle).length - 1
}

function hasAllTags(noteTags: string[], wanted: string[]): boolean {
  const lowered = noteTags.map((t) => t.toLowerCase())
  return wanted.every((tag) => lowered.includes(tag))
}

/**
 * Filter and rank notes. Text terms all have to appear (in text or as part of
 * a tag), tag filters narrow further, mood has to match exactly. Results are
 * sorted by score desc, then by week index so earlier weeks win ties.
 */
export function searchNotes(notes: Note[], parsed: ParsedQuery): SearchResult[] {
  if (parsed.terms.length === 0 && parsed.tags.length === 0 && parsed.mood === undefined) {
    return []
  }
  const results: SearchResult[] = []

  for (const note of notes) {
    if (parsed.mood !== undefined && note.mood !== parsed.mood) continue
    if (!hasAllTags(note.tags ?? [], parsed.tags)) continue

    const text = note.text.toLowerCase()
    const tags = (note.tags ?? []).map((t) => t.toLowerCase())
    let score = 0
    let ok = true

    for (const term of parsed.terms) {
      const hits = countOccurrences(text, term)
      const inTags = tags.some((t) => t.includes(term))
      if (hits === 0 && !inTags) {
        ok = false
        break
      }
      score += hits + (inTags ? 2 : 0)
    }
    if (!ok) continue

    if (parsed.tags.length > 0) score += 2
    if (parsed.mood !== undefined) score += 2

    results.push({ note, score, snippet: previewText(note.text, parsed.terms) })
  }

  return results.sort((a, b) => b.score - a.score || a.note.weekIndex - b.note.weekIndex)
}

/**
 * Calm excerpt for a result row: centered on the earliest term hit, roughly
 * `max` characters, ellipses where text is cut. Without hits it just clips.
 */
export function previewText(text: string, terms: string[], max = 72): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const lower = clean.toLowerCase()
  let first = Number.POSITIVE_INFINITY
  for (const term of terms) {
    const at = lower.indexOf(term)
    if (at >= 0) first = Math.min(first, at)
  }
  if (!Number.isFinite(first)) first = 0
  let start = Math.max(first - 12, 0)
  let end = start + max
  if (end > clean.length) {
    end = clean.length
    start = Math.max(end - max, 0)
  }
  const prefix = start > 0 ? '…' : ''
  const suffix = end < clean.length ? '…' : ''
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`
}

/**
 * "Jump to any week" candidates typed directly into the palette: a bare
 * number (or "week N") goes to that week; small numbers may also mean an age;
 * "now" returns to the current week. Invalid targets produce no candidate.
 */
export function weekJumps(raw: string, totalCells: number, currentWeek: number): JumpItem[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (/^now$/i.test(trimmed)) {
    return currentWeek >= 0 && currentWeek < totalCells
      ? [{ kind: 'now', label: `This week · week ${(currentWeek + 1).toLocaleString('en-US')}`, weekIndex: currentWeek }]
      : []
  }

  const match = /^(?:week\s+|w\s*)?(\d+)$/i.exec(trimmed)
  if (!match) return []
  const n = Number(match[1])
  const jumps: JumpItem[] = []

  if (n >= 0 && n < totalCells) {
    jumps.push({
      kind: 'week',
      label: `Week ${(n + 1).toLocaleString('en-US')} · age ${Math.floor(n / WEEKS_PER_YEAR)}`,
      weekIndex: n,
    })
  }
  if (n >= 1 && n <= 150) {
    const weekIndex = n * WEEKS_PER_YEAR
    if (weekIndex < totalCells) {
      jumps.push({
        kind: 'age',
        label: `Age ${n.toLocaleString('en-US')} · week ${(weekIndex + 1).toLocaleString('en-US')}`,
        weekIndex,
      })
    }
  }
  return jumps
}

/* ------------------------------------------------------------------ */
/* Extended search: journal entries (daily)                           */
/* ------------------------------------------------------------------ */

export interface EntrySearchFilters {
  /** Plain lowercase words (AND semantics). */
  terms: string[]
  /** Lowercase tag names. */
  tags: string[]
  /** Exact mood filter (1-5). */
  mood?: number
  /** Inclusive start date (YYYY-MM-DD). */
  from?: string
  /** Inclusive end date (YYYY-MM-DD). */
  to?: string
  /** Chapter name substring to match against entry titles/excerpts. */
  chapter?: string
}

export interface EntrySearchResult {
  date: string
  weekIndex: number
  title?: string
  mood?: number
  tags: string[]
  words: number
  excerpt: string
  score: number
  snippet: string
}

function entryMatchesFilters(
  entry: EntryMeta,
  bodyText: string,
  filters: EntrySearchFilters,
): { matched: boolean; score: number } {
  // Date range filter
  if (filters.from && entry.date < filters.from) return { matched: false, score: 0 }
  if (filters.to && entry.date > filters.to) return { matched: false, score: 0 }

  // Mood filter
  if (filters.mood !== undefined && entry.mood !== filters.mood) return { matched: false, score: 0 }

  // Tag filter (AND semantics)
  const loweredTags = (entry.tags ?? []).map((t) => t.toLowerCase())
  for (const tag of filters.tags) {
    if (!loweredTags.includes(tag)) return { matched: false, score: 0 }
  }

  // Chapter filter: match against title or excerpt
  let chapterBonus = 0
  if (filters.chapter) {
    const ch = filters.chapter.toLowerCase()
    const haystack = `${entry.title ?? ''} ${entry.excerpt}`.toLowerCase()
    if (!haystack.includes(ch)) return { matched: false, score: 0 }
    chapterBonus = 3
  }

  // Text term search (AND semantics across title + excerpt + body)
  let score = chapterBonus
  let allTermsMatched = true

  const searchableText = `${entry.title ?? ''} ${entry.excerpt} ${bodyText}`.toLowerCase()

  for (const term of filters.terms) {
    const hits = countOccurrences(searchableText, term)
    const inTags = loweredTags.some((t) => t.includes(term))
    if (hits === 0 && !inTags) {
      allTermsMatched = false
      break
    }
    score += hits + (inTags ? 2 : 0)
  }

  if (!allTermsMatched && filters.terms.length > 0) {
    return { matched: false, score: 0 }
  }

  // Bonus for filters applied
  if (filters.tags.length > 0) score += 2
  if (filters.mood !== undefined) score += 2

  return { matched: true, score }
}

/**
 * Search journal entries (daily) with filters for date range, tags, mood,
 * chapter, and text terms. Returns results sorted by score desc, then date.
 */
export function searchEntries(
  entries: Array<{ meta: EntryMeta; body: string }>,
  filters: EntrySearchFilters,
): EntrySearchResult[] {
  const results: EntrySearchResult[] = []

  // If no filters at all, return empty
  if (
    filters.terms.length === 0 &&
    filters.tags.length === 0 &&
    filters.mood === undefined &&
    !filters.from &&
    !filters.to &&
    !filters.chapter
  ) {
    return []
  }

  for (const { meta, body } of entries) {
    const match = entryMatchesFilters(meta, body, filters)
    if (!match.matched) continue

    results.push({
      date: meta.date,
      weekIndex: meta.weekIndex,
      title: meta.title,
      mood: meta.mood,
      tags: meta.tags ?? [],
      words: meta.words,
      excerpt: meta.excerpt,
      score: match.score,
      snippet: previewText(`${meta.title ?? ''} ${meta.excerpt} ${body}`, filters.terms),
    })
  }

  return results.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
}

/**
 * Search across both weekly notes and daily entries, returning unified results.
 * Weekly notes are converted to entry-shaped results for consistent display.
 */
export function searchAllMemories(
  notes: Note[],
  entryPairs: Array<{ meta: EntryMeta; body: string }>,
  filters: EntrySearchFilters,
): { notes: SearchResult[]; entries: EntrySearchResult[] } {
  const parsed: ParsedQuery = {
    terms: filters.terms,
    tags: filters.tags,
    ...(filters.mood !== undefined ? { mood: filters.mood } : {}),
  }
  const noteResults = searchNotes(notes, parsed)
  const entryResults = searchEntries(entryPairs, filters)
  return { notes: noteResults, entries: entryResults }
}

