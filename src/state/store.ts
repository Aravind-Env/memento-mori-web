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
  sanitizeHabits,
  sanitizeAnnualReviews,
  type AppData,
  type Chapter,
  type Goal,
  type Note,
  type Profile,
  type Relationship,
  type Settings,
  type Theme,
  type VaultRecord,
  type AnnualReviewRecord,
} from '../data/model'
import type { Habit } from '../domain/habits'
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
import { repo } from '../core/useJournal'
import type { BackupFrequency } from '../domain/storageHealth'

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
  habits: Habit[]
  annualReviews: AnnualReviewRecord[]

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
    expectedLifespan?: number,
    notes?: string,
  ) => boolean
  updatePerson: (id: string, patch: Partial<Pick<Relationship, 'name' | 'kind' | 'visitsPerYear' | 'dob' | 'expectedLifespan' | 'notes'>>) => boolean
  removePerson: (id: string) => Relationship | undefined
  restorePerson: (person: Relationship) => void

  addHabit: (name: string, frequency?: 'daily' | 'weekly' | 'custom', description?: string, targetDays?: number[]) => boolean
  toggleHabitCompletion: (id: string, dateKey: string) => void
  archiveHabit: (id: string, archived: boolean) => void
  removeHabit: (id: string) => void
  saveAnnualReview: (year: number, reflection: string) => void

  setTheme: (theme: Theme) => void
  setGentleMode: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
  setZoom: (zoom: ZoomLevel) => void
  setReminderDay: (day: number | undefined) => void
  completeReview: (weekIndex: number) => void
  setBackupFrequency: (frequency: BackupFrequency) => void
  recordBackupSuccess: () => void
  recordBackupFailure: () => void
  dismissBackupReminder: () => void

  exportJSON: () => string
  importJSON: (raw: string) => { ok: boolean; error?: string }
  exportFullBackupAsync: () => Promise<string>
  importFullBackupAsync: (raw: string) => Promise<{ ok: boolean; error?: string; preview?: BackupImportPreview }>
  resetAll: () => void
}

export interface BackupImportPreview {
  entriesToAdd: number
  entriesToUpdate: number
  entriesToSkip: number
  versionsToAdd: number
  reviewsToAdd: number
  warnings: string[]
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
      habits: [],
      annualReviews: [],

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
          habits: s.habits.filter((h) => h.profileId !== s.profile?.id),
          annualReviews: s.annualReviews.filter((r) => r.profileId !== s.profile?.id),
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

      addPerson: (name, kind, visitsPerYear, dob, expectedLifespan, notes) => {
        const { profile } = get()
        if (!profile) return false
        const clean = name.trim()
        if (!clean) return false
        if (visitsPerYear < 0 || visitsPerYear > 366) return false
        const person: Relationship = {
          id: createId(),
          profileId: profile.id,
          name: clean,
          kind: kind || 'other',
          visitsPerYear: Math.round(visitsPerYear),
          ...(dob ? { dob } : {}),
          ...(expectedLifespan !== undefined && expectedLifespan >= 1 && expectedLifespan <= 120
            ? { expectedLifespan }
            : { expectedLifespan: profile.lifeYears }),
          ...(notes ? { notes } : {}),
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
            if (patch.expectedLifespan !== undefined) {
              const life = Math.round(patch.expectedLifespan)
              if (Number.isFinite(life) && life >= 1 && life <= 120) {
                next.expectedLifespan = life
              } else {
                delete next.expectedLifespan
              }
            }
            if (patch.notes !== undefined) {
              if (patch.notes && patch.notes.trim().length > 0) {
                next.notes = patch.notes.trim()
              } else {
                delete next.notes
              }
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

      addHabit: (name, frequency = 'daily', description, targetDays) => {
        const { profile } = get()
        if (!profile) return false
        const clean = name.trim()
        if (!clean) return false
        const habit: Habit = {
          id: createId(),
          profileId: profile.id,
          name: clean,
          description,
          frequency,
          targetDays,
          archived: false,
          createdAt: new Date().toISOString(),
          completions: {},
        }
        set((s) => ({ habits: [...s.habits, habit] }))
        return true
      },

      toggleHabitCompletion: (id, dateKey) => {
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h
            const completions = { ...h.completions }
            if (completions[dateKey]) {
              delete completions[dateKey]
            } else {
              completions[dateKey] = true
            }
            return { ...h, completions }
          }),
        }))
      },

      archiveHabit: (id, archived) => {
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, archived } : h)),
        }))
      },

      removeHabit: (id) => {
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
      },

      saveAnnualReview: (year, reflection) => {
        const { profile, annualReviews } = get()
        if (!profile) return
        const existing = annualReviews.find((r) => r.year === year && r.profileId === profile.id)
        if (existing) {
          set((s) => ({
            annualReviews: s.annualReviews.map((r) =>
              r.year === year && r.profileId === profile.id ? { ...r, reflection, updatedAt: Date.now() } : r,
            ),
          }))
        } else {
          set((s) => ({
            annualReviews: [
              ...s.annualReviews,
              { year, profileId: profile.id, reflection, updatedAt: Date.now() },
            ],
          }))
        }
      },

      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      setGentleMode: (gentleMode) => set((s) => ({ settings: { ...s.settings, gentleMode } })),
      setReduceMotion: (reduceMotion) => set((s) => ({ settings: { ...s.settings, reduceMotion } })),
      setZoom: (zoom) => set((s) => ({ settings: { ...s.settings, zoom } })),
      setReminderDay: (reminderDay) => set((s) => ({ settings: { ...s.settings, reminderDay } })),
      setBackupFrequency: (backupFrequency) => set((s) => ({ settings: { ...s.settings, backupFrequency } })),
      recordBackupSuccess: () => set((s) => ({ settings: { ...s.settings, lastBackupAt: Date.now(), lastBackupFailed: false } })),
      recordBackupFailure: () => set((s) => ({ settings: { ...s.settings, lastBackupFailed: true } })),
      dismissBackupReminder: () => set((s) => ({ settings: { ...s.settings, lastDismissedAt: Date.now() } })),
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
        const { profile, notes, chapters, goals, settings, vault, people, habits, annualReviews } = get()
        const data: AppData & { exportedAt: string } = {
          schemaVersion: SCHEMA_VERSION,
          profile,
          notes,
          chapters,
          goals,
          settings,
          vault,
          people,
          habits,
          annualReviews,
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
            habits: sanitizeHabits(data.habits),
            annualReviews: sanitizeAnnualReviews(data.annualReviews),
          })
          return { ok: true }
        } catch {
          return { ok: false, error: 'Could not read that JSON file.' }
        }
      },

      exportFullBackupAsync: async () => {
        const { profile, notes, chapters, goals, settings, vault, people, habits, annualReviews } = get()
        const localData: AppData & { exportedAt: string } = {
          schemaVersion: SCHEMA_VERSION,
          profile,
          notes,
          chapters,
          goals,
          settings,
          vault,
          people,
          habits,
          annualReviews,
          exportedAt: new Date().toISOString(),
        }

        const journalData = await repo.exportAllEntries()

        const fullBackup = {
          ...localData,
          journal: journalData,
        }
        return JSON.stringify(fullBackup, null, 2)
      },

      importFullBackupAsync: async (raw: string) => {
        const preview: BackupImportPreview = {
          entriesToAdd: 0,
          entriesToUpdate: 0,
          entriesToSkip: 0,
          versionsToAdd: 0,
          reviewsToAdd: 0,
          warnings: [],
        }

        let data: unknown
        try {
          data = JSON.parse(raw)
        } catch {
          return { ok: false, error: 'Could not read that JSON file.' }
        }

        if (!data || typeof data !== 'object') {
          return { ok: false, error: 'Not a valid backup file.' }
        }

        const d = data as Record<string, unknown>
        if (
          typeof d.schemaVersion === 'number' &&
          d.schemaVersion > SCHEMA_VERSION
        ) {
          return { ok: false, error: 'This backup was written by a newer version of the app.' }
        }

        // Parse localStorage portion
        const notes = Array.isArray(d.notes) ? d.notes : []
        const chapters = sanitizeChapters(d.chapters)
        const goals = sanitizeGoals(d.goals)
        const people = sanitizePeople(d.people)
        const habits = sanitizeHabits(d.habits)
        const annualReviews = sanitizeAnnualReviews(d.annualReviews)
        const settings = { ...DEFAULT_SETTINGS, ...(d.settings as Partial<Settings> | undefined) }
        const vault = sanitizeVault(d.vault)
        const profile = d.profile as Profile | undefined ?? null

        // Parse journal portion
        const journalData = d.journal as
          | { entries?: Array<{ meta: unknown; body: unknown }>; versions?: unknown[]; reviews?: unknown[] }
          | undefined

        if (journalData?.entries && Array.isArray(journalData.entries)) {
          const validEntries = journalData.entries.filter(
            (e) =>
              e &&
              typeof e === 'object' &&
              'meta' in e &&
              'body' in e &&
              typeof (e as Record<string, unknown>).meta === 'object' &&
              typeof (e as Record<string, unknown>).body === 'object'
          )
          preview.entriesToAdd = validEntries.length
        }

        if (journalData?.versions && Array.isArray(journalData.versions)) {
          preview.versionsToAdd = journalData.versions.length
        }

        if (journalData?.reviews && Array.isArray(journalData.reviews)) {
          preview.reviewsToAdd = journalData.reviews.length
        }

        // Check for existing data warnings
        const { profile: existingProfile } = get()
        if (existingProfile && profile) {
          preview.warnings.push('A profile already exists. Importing will replace it.')
        }

        // Import localStorage data
        set({
          profile,
          notes,
          chapters,
          goals,
          settings,
          vault,
          people,
          habits,
          annualReviews,
        })

        // Import journal data into IndexedDB
        if (journalData) {
          const typedJournalData: import('../core/journal').JournalExportData = {
            entries: (journalData.entries as Array<{ meta: import('../core/journal').EntryMeta; body: import('../core/journal').EntryBody }> | []).map((e) => ({
              meta: e.meta as import('../core/journal').EntryMeta,
              body: e.body as import('../core/journal').EntryBody,
            })),
            versions: (journalData.versions as import('../core/journal').EntryVersion[] | []),
            reviews: (journalData.reviews as import('../core/journal').ReviewRecord[] | []),
            exportedAt: new Date().toISOString(),
          }
          const result = await repo.importAllEntries(typedJournalData)
          preview.entriesToSkip = result.skipped
        }

        return { ok: true, preview }
      },

      resetAll: () => set({
        profile: null,
        notes: [],
        chapters: [],
        goals: [],
        settings: DEFAULT_SETTINGS,
        vault: null,
        people: [],
        habits: [],
        annualReviews: [],
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
        habits: s.habits,
        annualReviews: s.annualReviews,
      }),
      migrate: (persisted, version) => {
        const { profile, notes, chapters, goals, settings, vault, people } = migrateData(
          persisted,
          version,
        )
        return { profile, notes, chapters, goals, settings, vault, people, habits: [], annualReviews: [] }
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
