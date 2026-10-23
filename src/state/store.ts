import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  createId,
  makeProfile,
  migrateData,
  sanitizeChapters,
  sanitizeGoals,
  sanitizePeople,
  sanitizeVault,
  type AppData,
  type Chapter,
  type Goal,
  type Note,
  type Profile,
  type Relationship,
  type Settings,
  type Theme,
  type VaultRecord,
} from '../data/model'
import {
  CHAPTER_PALETTE,
  DEFAULT_CHAPTER_COLOR,
  clampRange,
  validateChapterDraft,
} from '../domain/chapters'
import { findGoalAt, validateGoalDraft } from '../domain/goals'
import { parseISODate, type LeapRule } from '../domain/dates'
import type { ZoomLevel } from '../domain/zoom'
import { clampLifeYears, getLifeStats } from '../domain/lifeMath'

export const THEME_STORAGE_KEY = 'memento-mori-theme'

type NotePatch = Partial<Pick<Note, 'text' | 'mood' | 'tags' | 'pinned'>>
type ChapterPatch = { name?: string; color?: string; startWeek?: number; endWeek?: number }

interface StoreState {
  profile: Profile | null
  notes: Note[]
  chapters: Chapter[]
  goals: Goal[]
  settings: Settings
  /** App-lock record; null = no lock. The passphrase itself is never stored. */
  vault: VaultRecord | null
  /** People whose shared time is counted; optional feature, hidden in gentle mode. */
  people: Relationship[]

  setVault: (record: VaultRecord | null, appLock: boolean) => void

  createProfile: (dob: string, lifeYears: number, name?: string, leapRule?: LeapRule) => void
  updateProfile: (patch: Partial<Pick<Profile, 'name' | 'dob' | 'lifeYears' | 'leapRule'>>) => void
  clearProfile: () => void

  getNote: (weekIndex: number) => Note | undefined
  upsertNote: (weekIndex: number, patch: NotePatch) => void
  deleteNote: (weekIndex: number) => Note | undefined
  restoreNote: (note: Note) => void

  addChapter: (name: string, startWeek: number, endWeek: number, color: string) => boolean
  updateChapter: (id: string, patch: ChapterPatch) => boolean
  removeChapter: (id: string) => Chapter | undefined
  restoreChapter: (chapter: Chapter) => void

  addGoal: (text: string, weekIndex: number) => boolean
  setGoalDone: (id: string, done: boolean) => void
  removeGoal: (id: string) => Goal | undefined
  restoreGoal: (goal: Goal) => void

  addPerson: (
    name: string,
    kind: string,
    visitsPerYear: number,
    dob?: string,
  ) => boolean
  updatePerson: (id: string, patch: Partial<Pick<Relationship, 'name' | 'kind' | 'visitsPerYear' | 'dob'>>) => boolean
  removePerson: (id: string) => Relationship | undefined
  restorePerson: (person: Relationship) => void

  setTheme: (theme: Theme) => void
  setGentleMode: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
  setZoom: (zoom: ZoomLevel) => void
  setReminderDay: (day: number | undefined) => void
  completeReview: (weekIndex: number) => void

  exportJSON: () => string
  importJSON: (raw: string) => { ok: boolean; error?: string }
  resetAll: () => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      profile: null,
      notes: [],
      chapters: [],
      goals: [],
      settings: DEFAULT_SETTINGS,
      vault: null,
      people: [],

      setVault: (vault, appLock) =>
        set((s) => ({ vault, settings: { ...s.settings, appLock: appLock && vault != null } })),

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
        set((s) => ({
          profile: null,
          notes: s.notes.filter((n) => n.profileId !== s.profile?.id),
          chapters: s.chapters.filter((c) => c.profileId !== s.profile?.id),
          goals: s.goals.filter((g) => g.profileId !== s.profile?.id),
          people: s.people.filter((p) => p.profileId !== s.profile?.id),
          vault: null,
          settings: { ...s.settings, appLock: false },
        })),

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

      /* ---------- Chapters ---------- */

      addChapter: (name, startWeek, endWeek, color) => {
        const { profile, chapters } = get()
        if (!profile) return false
        const cells = totalCellsFor(profile)
        // Calm rejection: invalid drafts are declined before ever reaching state.
        const clamped = clampRange(startWeek, endWeek, cells)
        const error = validateChapterDraft(
          { name, ...clamped, color: normalizeColor(color) },
          chapters,
          cells,
        )
        if (error) return false
        const chapter: Chapter = {
          id: createId(),
          profileId: profile.id,
          name: name.trim(),
          startWeek: clamped.startWeek,
          endWeek: clamped.endWeek,
          color: normalizeColor(color),
        }
        set((s) => ({ chapters: [...s.chapters, chapter] }))
        return true
      },

      updateChapter: (id, patch) => {
        const { profile, chapters } = get()
        if (!profile) return false
        const existing = chapters.find((c) => c.id === id)
        if (!existing || existing.profileId !== profile.id) return false
        const cells = totalCellsFor(profile)
        const draft = {
          name: patch.name ?? existing.name,
          color: patch.color ?? existing.color,
          ...clampRange(patch.startWeek ?? existing.startWeek, patch.endWeek ?? existing.endWeek, cells),
        }
        if (validateChapterDraft(draft, chapters, cells, id) !== null) return false
        set((s) => ({
          chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...draft, id, profileId: existing.profileId } : c)),
        }))
        return true
      },

      removeChapter: (id) => {
        const chapter = get().chapters.find((c) => c.id === id)
        if (!chapter) return undefined
        set((s) => ({ chapters: s.chapters.filter((c) => c.id !== id) }))
        return chapter
      },

      restoreChapter: (chapter) =>
        set((s) => (s.chapters.some((c) => c.id === chapter.id) ? {} : { chapters: [...s.chapters, chapter] })),

      /* ---------- Goals ---------- */

      addGoal: (text, weekIndex) => {
        const { profile, goals } = get()
        if (!profile) return false
        const cells = totalCellsFor(profile)
        const stats = lifeStatsFor(profile)
        // Calm rejection: invalid drafts are declined before ever reaching state.
        if (
          findGoalAt(goals, weekIndex) ||
          validateGoalDraft({ text, weekIndex }, stats.weeksLived, cells) !== null
        )
          return false
        const goal: Goal = {
          id: createId(),
          profileId: profile.id,
          weekIndex,
          text: text.trim(),
          done: false,
        }
        set((s) => ({ goals: [...s.goals, goal] }))
        return true
      },

      setGoalDone: (id, done) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, done } : g)),
        })),

      removeGoal: (id) => {
        const goal = get().goals.find((g) => g.id === id)
        if (!goal) return undefined
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }))
        return goal
      },

      restoreGoal: (goal) =>
        set((s) => (s.goals.some((g) => g.id === goal.id) ? {} : { goals: [...s.goals, goal] })),

      addPerson: (name, kind, visitsPerYear, dob) => {
        const { profile } = get()
        if (!profile) return false
        const clean = name.trim()
        if (!clean) return false
        const person: Relationship = {
          id: createId(),
          profileId: profile.id,
          name: clean,
          kind: kind || 'other',
          visitsPerYear: Math.min(Math.max(Math.round(visitsPerYear), 0), 366),
          ...(dob ? { dob } : {}),
        }
        set((s) => ({ people: [...s.people, person] }))
        return true
      },

      updatePerson: (id, patch) => {
        const { profile } = get()
        if (!profile) return false
        let updated = false
        set((s) => ({
          people: s.people.map((p) => {
            if (p.id !== id || p.profileId !== profile.id) return p
            updated = true
            const next: Relationship = { ...p }
            if (patch.name !== undefined) {
              const clean = patch.name.trim()
              if (!clean) return p // an empty name is a declined edit, not a wipe
              next.name = clean
            }
            if (patch.kind !== undefined) next.kind = patch.kind
            if (patch.visitsPerYear !== undefined) {
              next.visitsPerYear = Math.min(
                Math.max(Math.round(patch.visitsPerYear), 0),
                366,
              )
            }
            if (patch.dob !== undefined) {
              if (patch.dob) next.dob = patch.dob
              else delete next.dob
            }
            return next
          }),
        }))
        return updated
      },

      removePerson: (id) => {
        const person = get().people.find((p) => p.id === id)
        if (!person) return undefined
        set((s) => ({ people: s.people.filter((p) => p.id !== id) }))
        return person
      },

      restorePerson: (person) =>
        set((s) => (s.people.some((p) => p.id === person.id) ? {} : { people: [...s.people, person] })),

      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      setGentleMode: (gentleMode) => set((s) => ({ settings: { ...s.settings, gentleMode } })),
      setReduceMotion: (reduceMotion) => set((s) => ({ settings: { ...s.settings, reduceMotion } })),
      setZoom: (zoom) => set((s) => ({ settings: { ...s.settings, zoom } })),
      setReminderDay: (reminderDay) => set((s) => ({ settings: { ...s.settings, reminderDay } })),
      // Marking a ritual done never moves backwards, so an old device copy
      // cannot reopen a week you have already sat with.
      completeReview: (weekIndex) =>
        set((s) => ({
          settings: {
            ...s.settings,
            reviewLastWeek: Math.max(s.settings.reviewLastWeek ?? -1, weekIndex),
          },
        })),

      exportJSON: () => {
        const { profile, notes, chapters, goals, settings, vault, people } = get()
        const data: AppData & { exportedAt: string } = {
          schemaVersion: SCHEMA_VERSION,
          profile,
          notes,
          chapters,
          goals,
          settings,
          vault,
          people,
          exportedAt: new Date().toISOString(),
        }
        return JSON.stringify(data, null, 2)
      },

      importJSON: (raw) => {
        try {
          const data = JSON.parse(raw) as Partial<AppData> & { schemaVersion?: number }
          if (!data || typeof data !== 'object') return { ok: false, error: 'Not a valid file.' }
          if (
            typeof data.schemaVersion === 'number' &&
            data.schemaVersion > SCHEMA_VERSION
          ) {
            return { ok: false, error: 'This backup was written by a newer version of the app.' }
          }
          const notes = Array.isArray(data.notes) ? data.notes : []
          set({
            profile: data.profile ?? null,
            notes,
            chapters: sanitizeChapters(data.chapters),
            goals: sanitizeGoals(data.goals),
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
            vault: sanitizeVault(data.vault),
            people: sanitizePeople(data.people),
          })
          return { ok: true }
        } catch {
          return { ok: false, error: 'Could not read that JSON file.' }
        }
      },

      resetAll: () => set({
        profile: null,
        notes: [],
        chapters: [],
        goals: [],
        settings: DEFAULT_SETTINGS,
        vault: null,
        people: [],
      }),
    }),
    {
      name: 'memento-mori',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        profile: s.profile,
        notes: s.notes,
        chapters: s.chapters,
        goals: s.goals,
        settings: s.settings,
        vault: s.vault,
        people: s.people,
      }),
      migrate: (persisted, version) => {
        const { profile, notes, chapters, goals, settings, vault, people } = migrateData(
          persisted,
          version,
        )
        return { profile, notes, chapters, goals, settings, vault, people }
      },
    },
  ),
)

/** Grid size (cells, incl. bonus rows) for the given profile; used for clamping. */
function totalCellsFor(profile: Profile): number {
  return lifeStatsFor(profile).totalCells
}

/** Live stats for the given profile, computed from today's clock. */
function lifeStatsFor(profile: Profile) {
  const dob = parseISODate(profile.dob)
  if (Number.isNaN(dob.getTime()))
    return getLifeStats(new Date(2000, 0, 1), profile.lifeYears, new Date(2000, 0, 1))
  return getLifeStats(dob, profile.lifeYears)
}

/** Unknown colour keys fall back to the default instead of vanishing on canvas. */
function normalizeColor(color: string): string {
  return (CHAPTER_PALETTE as readonly string[]).includes(color)
    ? color
    : DEFAULT_CHAPTER_COLOR
}
