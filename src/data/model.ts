import { DEFAULT_LIFE_YEARS } from '../domain/lifeMath'
import { parseISODate, type LeapRule } from '../domain/dates'
import type { ZoomLevel } from '../domain/zoom'

export type Theme = 'system' | 'light' | 'dark'

export const SCHEMA_VERSION = 7

export interface Profile {
  id: string
  name: string
  /** Date of birth as `YYYY-MM-DD`. */
  dob: string
  lifeYears: number
  leapRule: LeapRule
  createdAt: string
}

export interface Note {
  id: string
  profileId: string
  /** 0-based week index from the DOB. Dates are derived, never stored. */
  weekIndex: number
  text: string
  /** Optional 1-5 rating. */
  mood?: number
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/**
 * A named, coloured range of weeks (school, career, family…). Stored in week
 * indexes so a fixed DOB keeps every band in the same place forever. Ranges are
 * inclusive on both ends and must never overlap.
 */
export interface Chapter {
  id: string
  profileId: string
  name: string
  /** 0-based start week (inclusive). */
  startWeek: number
  /** 0-based end week (inclusive). */
  endWeek: number
  /** Palette key from `domain/chapters.ts` (e.g. 'teal'), resolved to a CSS var. */
  color: string
}

export interface Settings {
  theme: Theme
  /** Hide remaining-weeks figures for a gentler experience. */
  gentleMode: boolean
  /** Force-disable the pulsing current-week animation. */
  reduceMotion: boolean
  /** Grid zoom: whole life, a decade of ages, or a single year. */
  zoom: ZoomLevel
  /** Day of the week (0-6, 0 = Sunday) for the weekly review ritual; unset = off. */
  reminderDay?: number
  /** Week index of the last completed review, so a done ritual does not repeat. */
  reviewLastWeek?: number
  /** Require the vault passphrase when the app opens (record in `vault`). */
  appLock?: boolean
}

export interface AppData {
  schemaVersion: number
  profile: Profile | null
  notes: Note[]
  chapters: Chapter[]
  goals: Goal[]
  settings: Settings
  vault: VaultRecord | null
  people: Relationship[]
}

/** The persistable slice plus chapters and goals, used by exports, imports and migrations. */
export interface PersistedData {
  profile: Profile | null
  notes: Note[]
  chapters: Chapter[]
  goals: Goal[]
  settings: Settings
  vault: VaultRecord | null
  people: Relationship[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  gentleMode: false,
  reduceMotion: false,
  zoom: 'life',
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function makeProfile(
  dob: string,
  lifeYears = DEFAULT_LIFE_YEARS,
  name = '',
  leapRule: LeapRule = 'mar1',
): Profile {
  return {
    id: createId(),
    name,
    dob,
    lifeYears,
    leapRule,
    createdAt: new Date().toISOString(),
  }
}

/** Read back a possibly-untrusted array of chapters and keep only valid rows. */
export function sanitizeChapters(raw: unknown): Chapter[] {
  if (!Array.isArray(raw)) return []
  const out: Chapter[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.name !== 'string') continue
    const start = Math.round(Number(c.startWeek))
    const end = Math.round(Number(c.endWeek))
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start < 0 || end < start) continue
    out.push({
      id: c.id,
      profileId: typeof c.profileId === 'string' ? c.profileId : '',
      name: c.name,
      startWeek: start,
      endWeek: end,
      color: typeof c.color === 'string' ? c.color : 'teal',
    })
  }
  return out
}

/**
 * A milestone pinned to a future week with a one-line goal ("run the 10k").
 * Week indexes again, never dates; when ticked off it stays on the grid as a
 * filled marker instead of disappearing.
 */
export interface Goal {
  id: string
  profileId: string
  /** 0-based week index from the DOB (future weeks only at creation). */
  weekIndex: number
  text: string
  done: boolean
}

/**
 * Proof of the app-lock passphrase: a tiny constant encrypted with the key
 * derived from it. Only this (salt, iv, ciphertext) triple is persisted —
 * never the passphrase, never the derived key, which the device re-derives
 * on unlock.
 */
export interface VaultRecord {
  salt: string
  iv: string
  check: string
  iterations: number
}

/**
 * A person whose time you share — a parent, a partner, a friend. Visits per
 * year turn both remaining lifespans into "about N more times". The birth
 * date is optional; without it the count stays honest and unknown.
 */
export interface Relationship {
  id: string
  profileId: string
  name: string
  kind: string
  visitsPerYear: number
  /** `YYYY-MM-DD`, optional. */
  dob?: string
}

/**
 * Old saves must still load. Schema v1 had no chapters, v2 no goals, v3 no
 * zoom, v4 no review reminder, v5 no vault record, v6 no people; missing
 * settings fields fall back to their defaults. Later schemas are sanitized
 * row by row, and unknown future fields pass through untouched so a newer
 * backup restored by an older app only loses what this version knows.
 */
export function migrateData(raw: unknown, version: number): PersistedData {
  const data = (raw ?? {}) as Record<string, unknown>
  const notes = Array.isArray(data.notes) ? (data.notes as Note[]) : []
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) }
  if (!Number.isInteger(settings.reminderDay) || (settings.reminderDay as number) < 0 || (settings.reminderDay as number) > 6) {
    delete settings.reminderDay
  }
  if (!Number.isInteger(settings.reviewLastWeek) || (settings.reviewLastWeek as number) < 0) {
    delete settings.reviewLastWeek
  }
    return {
      profile: (data.profile as Profile | undefined) ?? null,
      notes,
      chapters: version < 2 ? [] : sanitizeChapters(data.chapters),
      goals: version < 3 ? [] : sanitizeGoals(data.goals),
      settings,
      vault: version < 6 ? null : sanitizeVault(data.vault),
      people: version < 7 ? [] : sanitizePeople(data.people),
    }
  }

/** Read back a possibly-untrusted vault record; anything malformed disables the lock. */
export function sanitizeVault(raw: unknown): VaultRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (
    typeof v.salt !== 'string' ||
    typeof v.iv !== 'string' ||
    typeof v.check !== 'string' ||
    !Number.isFinite(Number(v.iterations)) ||
    Number(v.iterations) < 1
  ) {
    return null
  }
  return { salt: v.salt, iv: v.iv, check: v.check, iterations: Number(v.iterations) }
}

/** Read back a possibly-untrusted list of people and keep only valid rows. */
export function sanitizePeople(raw: unknown): Relationship[] {
  if (!Array.isArray(raw)) return []
  const out: Relationship[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    if (typeof p.id !== 'string' || typeof p.name !== 'string') continue
    const visits = Math.round(Number(p.visitsPerYear))
    if (!Number.isFinite(visits) || visits < 0) continue
    const person: Relationship = {
      id: p.id,
      profileId: typeof p.profileId === 'string' ? p.profileId : '',
      name: p.name,
      kind: typeof p.kind === 'string' ? p.kind : 'other',
      visitsPerYear: Math.min(visits, 366),
    }
    // A birth date must at least look like a date, else it is simply absent.
    if (
      typeof p.dob === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.dob) &&
      !Number.isNaN(parseISODate(p.dob).getTime())
    ) {
      person.dob = p.dob
    }
    out.push(person)
  }
  return out
}

/** Read back a possibly-untrusted array of goals and keep only valid rows. */
export function sanitizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return []
  const out: Goal[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>
    if (typeof g.id !== 'string' || typeof g.text !== 'string') continue
    const weekIndex = Math.round(Number(g.weekIndex))
    if (!Number.isFinite(weekIndex) || weekIndex < 0) continue
    out.push({
      id: g.id,
      profileId: typeof g.profileId === 'string' ? g.profileId : '',
      weekIndex,
      text: g.text,
      done: g.done === true,
    })
  }
  return out
}
