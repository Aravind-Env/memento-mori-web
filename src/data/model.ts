import { DEFAULT_LIFE_YEARS } from '../domain/lifeMath'
import type { LeapRule } from '../domain/dates'

export type Theme = 'system' | 'light' | 'dark'

export const SCHEMA_VERSION = 1

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

export interface Settings {
  theme: Theme
  /** Hide remaining-weeks figures for a gentler experience. */
  gentleMode: boolean
  /** Force-disable the pulsing current-week animation. */
  reduceMotion: boolean
}

export interface AppData {
  schemaVersion: number
  profile: Profile | null
  notes: Note[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  gentleMode: false,
  reduceMotion: false,
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
