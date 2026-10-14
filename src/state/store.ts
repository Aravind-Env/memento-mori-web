import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  createId,
  makeProfile,
  type AppData,
  type Note,
  type Profile,
  type Settings,
  type Theme,
} from '../data/model'
import { clampLifeYears } from '../domain/lifeMath'
import type { LeapRule } from '../domain/dates'

export const THEME_STORAGE_KEY = 'memento-mori-theme'

type NotePatch = Partial<Pick<Note, 'text' | 'mood' | 'tags' | 'pinned'>>

interface StoreState {
  profile: Profile | null
  notes: Note[]
  settings: Settings

  createProfile: (dob: string, lifeYears: number, name?: string, leapRule?: LeapRule) => void
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'dob' | 'lifeYears' | 'leapRule'>>) => void
  clearProfile: () => void

  getNote: (weekIndex: number) => Note | undefined
  upsertNote: (weekIndex: number, patch: NotePatch) => void
  deleteNote: (weekIndex: number) => Note | undefined
  restoreNote: (note: Note) => void

  setTheme: (theme: Theme) => void
  setGentleMode: (on: boolean) => void
  setReduceMotion: (on: boolean) => void

  exportJSON: () => string
  importJSON: (raw: string) => { ok: boolean; error?: string }
  resetAll: () => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      profile: null,
      notes: [],
      settings: DEFAULT_SETTINGS,

      createProfile: (dob, lifeYears, name = '', leapRule = 'mar1') =>
        set({ profile: makeProfile(dob, clampLifeYears(lifeYears), name, leapRule) }),

      updateProfile: (patch) =>
        set((s) =>
          s.profile
            ? {
                profile: {
                  ...s.profile,
                  ...patch,
                  lifeYears:
                    patch.lifeYears !== undefined
                      ? clampLifeYears(patch.lifeYears)
                      : s.profile.lifeYears,
                },
              }
            : {},
        ),

      clearProfile: () =>
        set((s) => ({ profile: null, notes: s.notes.filter((n) => n.profileId !== s.profile?.id) })),

      getNote: (weekIndex) => {
        const { notes, profile } = get()
        if (!profile) return undefined
        return notes.find((n) => n.profileId === profile.id && n.weekIndex === weekIndex)
      },

      upsertNote: (weekIndex, patch) =>
        set((s) => {
          if (!s.profile) return {}
          const now = new Date().toISOString()
          const existing = s.notes.find(
            (n) => n.profileId === s.profile!.id && n.weekIndex === weekIndex,
          )
          if (existing) {
            return {
              notes: s.notes.map((n) =>
                n.id === existing.id ? { ...n, ...patch, updatedAt: now } : n,
              ),
            }
          }
          const note: Note = {
            id: createId(),
            profileId: s.profile.id,
            weekIndex,
            text: patch.text ?? '',
            mood: patch.mood,
            tags: patch.tags ?? [],
            pinned: patch.pinned ?? false,
            createdAt: now,
            updatedAt: now,
          }
          return { notes: [...s.notes, note] }
        }),

      deleteNote: (weekIndex) => {
        const note = get().getNote(weekIndex)
        if (!note) return undefined
        set((s) => ({ notes: s.notes.filter((n) => n.id !== note.id) }))
        return note
      },

      restoreNote: (note) =>
        set((s) =>
          s.notes.some((n) => n.id === note.id) ? {} : { notes: [...s.notes, note] },
        ),

      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      setGentleMode: (gentleMode) => set((s) => ({ settings: { ...s.settings, gentleMode } })),
      setReduceMotion: (reduceMotion) => set((s) => ({ settings: { ...s.settings, reduceMotion } })),

      exportJSON: () => {
        const { profile, notes, settings } = get()
        const data: AppData & { exportedAt: string } = {
          schemaVersion: SCHEMA_VERSION,
          profile,
          notes,
          settings,
          exportedAt: new Date().toISOString(),
        }
        return JSON.stringify(data, null, 2)
      },

      importJSON: (raw) => {
        try {
          const data = JSON.parse(raw) as Partial<AppData>
          if (!data || typeof data !== 'object') return { ok: false, error: 'Not a valid file.' }
          const notes = Array.isArray(data.notes) ? data.notes : []
          set({
            profile: data.profile ?? null,
            notes,
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
          })
          return { ok: true }
        } catch {
          return { ok: false, error: 'Could not read that JSON file.' }
        }
      },

      resetAll: () => set({ profile: null, notes: [], settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'memento-mori',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ profile: s.profile, notes: s.notes, settings: s.settings }),
      migrate: (persisted) => persisted as Partial<StoreState>,
    },
  ),
)
