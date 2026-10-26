/**
 * Daily journal domain: date keys, day↔week mapping, streaks with one tolerance
 * day per week, rotating prompts and "on this day". Pure functions that take
 * `today` (or accept `Date`) so everything stays unit-testable.
 */

import { toISODate, parseISODate, MS_PER_DAY } from './dates'

/** `YYYY-MM-DD` in local calendar fields — the key everywhere. */
export function dateKey(d: Date): string {
  return toISODate(d)
}

export function parseKey(key: string): Date {
  const d = parseISODate(key)
  return Number.isNaN(d.getTime()) ? new Date(NaN) : d
}

export function isValidKey(key: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseISODate(key)) === key
  )
}

/** 0-based whole days from the DOB to `d` (UTC-midnight normalised). */
export function dayIndex(dob: Date, d: Date): number {
  const a = Date.UTC(dob.getFullYear(), dob.getMonth(), dob.getDate())
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((b - a) / MS_PER_DAY)
}

/** The key `n` days after the DOB. */
export function keyFromIndex(dob: Date, n: number): string {
  return dateKey(new Date(dob.getFullYear(), dob.getMonth(), dob.getDate() + n))
}

/** Week (0-based from the DOB) that owns a date: floor(daysSinceBirth / 7). */
export function weekOfDate(dob: Date, d: Date): number {
  const i = dayIndex(dob, d)
  return i < 0 ? -1 : Math.floor(i / 7)
}

/** 0-6 day offset inside its week (the birth week starts day 0). */
export function dayInWeek(dob: Date, d: Date): number {
  const i = dayIndex(dob, d)
  return i < 0 ? 0 : i % 7
}

export function shiftKey(key: string, days: number): string {
  const d = parseISODate(key)
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

export function formatDayLong(key: string): string {
  return parseISODate(key).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/* ------------------------------------------------------------------ */
/* Streaks                                                            */
/* ------------------------------------------------------------------ */

const K = 86_400_000

/**
 * Current and longest streaks over written dates. At most one missing day per
 * 7-day bucket is bridged (the "grace day"); missing days are never punished —
 * the chain simply ends there when no grace remains. The current streak ends at
 * the most recently written day (today unwritten does not erase it).
 */
export function streaks(written: string[], today: Date): { current: number; longest: number } {
  const sorted = [...written].sort()
  if (sorted.length === 0) return { current: 0, longest: 0 }
  const has = new Set(sorted)
  const first = sorted[0]

  // Longest: full walk from the earliest written date; runs end when a gap
  // can no longer be bridged.
  const longest = runLongest(has, first, sorted[sorted.length - 1], today)

  // Current: walk backwards from the most recent written day.
  const last = sorted[sorted.length - 1]
  let current = 1
  {
    const lastT = utcOf(parseKey(last))
    const graced = new Set<number>()
    for (let t = lastT - K; t >= utcOf(parseKey(first)); t -= K) {
      const key = keyFromMs(t)
      if (has.has(key)) current++
      else if (!graced.has(Math.floor(t / K / 7)) && has.has(keyFromMs(t - K))) {
        graced.add(Math.floor(t / K / 7))
      } else break
    }
  }
  return { current, longest: Math.max(longest, current) }
}

function utcOf(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

function keyFromMs(t: number): string {
  const d = new Date(t)
  return dateKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function runLongest(has: Set<string>, first: string, last: string, today: Date): number {
  const startT = utcOf(parseKey(first))
  const endT = Math.min(utcOf(today), utcOf(parseKey(last)))
  let best = 0
  let run = 0
  const graced = new Map<number, number>()
  for (let t = startT; t <= endT; t += K) {
    const key = keyFromMs(t)
    if (has.has(key)) run++
    else {
      const bucket = Math.floor(t / K / 7)
      const used = graced.get(bucket) ?? 0
      const next = has.has(keyFromMs(t + K))
      if (used < 1 && run > 0 && next) graced.set(bucket, used + 1)
      else {
        best = Math.max(best, run)
        run = 0
      }
    }
  }
  return Math.max(best, run)
}

/* ------------------------------------------------------------------ */
/* Writing helpers                                                    */
/* ------------------------------------------------------------------ */

/** Word count aligned with the excerpt budget: whitespace-split tokens. */
export function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** First ~120 characters on one line, ellipsis when cut. */
export function excerptOf(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1)}…`
}

/**
 * Rotating reflective prompt, deterministic per date so the same day always
 * asks the same question. Bundled, offline, tiny (<2KB), never a title.
 */
export const PROMPTS: string[] = [
  'What went well today, even a small thing?',
  'What drained you — and was it worth it?',
  'Who crossed your mind today? Why them?',
  'What did you make, however small?',
  'What would have made today better?',
  'What are you postponing, and since when?',
  'What did you learn about yourself?',
  'What is a sound or smell you remember from today?',
  'What did you say yes to? Would you again?',
  'Who deserves thanks that you have not sent?',
  'What felt honest today? What felt like a mask?',
  'If a stranger watched today, what would they see?',
  'What, tomorrow, would make today worth remembering?',
  'What do you want more of next week?',
]

export function promptFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return PROMPTS[Math.abs(h) % PROMPTS.length]
}

/* ------------------------------------------------------------------ */
/* On this day                                                        */
/* ------------------------------------------------------------------ */

/**
 * Same calendar month+day in earlier years, newest first, `limit` (3) cards.
 * Meta-only: takes `{date, excerpt, mood}` rows already sorted or unsorted.
 */
export function onThisDay(
  metas: { date: string; excerpt: string; mood?: number }[],
  today: Date,
  limit = 3,
): { date: string; yearsAgo: number; excerpt: string; mood?: number }[] {
  const m = today.getMonth()
  const d = today.getDate()
  const thisYear = today.getFullYear()
  const out = metas
    .filter((x) => {
      const y = Number(x.date.slice(0, 4))
      return (
        Number(x.date.slice(5, 7)) === m + 1 &&
        Number(x.date.slice(8, 10)) === d &&
        y < thisYear
      )
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((x) => ({
      date: x.date,
      yearsAgo: thisYear - Number(x.date.slice(0, 4)),
      excerpt: x.excerpt,
      mood: x.mood,
    }))
  return out
}
