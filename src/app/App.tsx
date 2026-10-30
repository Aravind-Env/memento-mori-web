import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Dashboard } from '../features/dashboard/Dashboard'
import { DailyDrawer } from '../features/notes/DailyDrawer'
import { MigrationGate } from '../features/journal/MigrationGate'
import { ChaptersPanel } from '../features/chapters/ChaptersPanel'
import { GoalsPanel } from '../features/goals/GoalsPanel'
import { InsightsPanel } from '../features/insights/InsightsPanel'
import { ReviewPanel } from '../features/review/ReviewPanel'
import { PeoplePanel } from '../features/people/PeoplePanel'
import { JournalPanel } from '../features/journal/JournalPanel'
import { TimelinePanel } from '../features/timeline/TimelinePanel'
import { HabitsPanel } from '../features/habits/HabitsPanel'
import { AnnualReviewPanel } from '../features/annual-review/AnnualReviewPanel'
import { Settings } from '../features/settings/Settings'
import { AppLock } from '../features/settings/AppLock'
import { Onboarding } from '../features/onboarding/Onboarding'
import { CommandPalette } from '../features/search/CommandPalette'
import { parseISODate } from '../domain/dates'
import { getLifeStats } from '../domain/lifeMath'
import { getDailyQuote } from '../domain/quotes'
import { nextZoom } from '../domain/zoom'
import { reviewDue } from '../domain/review'
import { parseSearch, searchNotes, weekJumps } from '../domain/search'
import { verifyLockRecord } from '../domain/crypto'
import { useMidnightRefresh, usePrefersReducedMotion } from '../shared/hooks'
import { THEME_STORAGE_KEY, useStore } from '../state/store'
import { repo, useJournal, useJournalBoot } from '../core/useJournal'
import { migrateWeeklyNotes } from '../core/migrate'
import { dateKey } from '../domain/daily'
import type { Note } from '../data/model'

interface Toast {
  id: number
  message: string
  undo?: () => void
}

let toastId = 0

export function App() {
  const profile = useStore((s) => s.profile)
  const notes = useStore((s) => s.notes)
  const chapters = useStore((s) => s.chapters)
  const goals = useStore((s) => s.goals)
  const settings = useStore((s) => s.settings)
  const vault = useStore((s) => s.vault)
  const people = useStore((s) => s.people)
  const setTheme = useStore((s) => s.setTheme)
  const setZoom = useStore((s) => s.setZoom)
  const prefersReduced = usePrefersReducedMotion()

  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated())
  const [today, setToday] = useState(() => new Date())
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [migrationDone, setMigrationDone] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [habitsOpen, setHabitsOpen] = useState(false)
  const [annualReviewOpen, setAnnualReviewOpen] = useState(false)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useMidnightRefresh(() => setToday(new Date()))

  // Wait for persisted data before rendering so note editors initialise correctly.
  useEffect(() => {
    if (hydrated) return
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true))
    return unsub
  }, [hydrated])

  // QA seeding: ?dob=2000-07-22&name=Aravind&years=80 fills a demo profile
  // when storage is empty, for screenshots and quick review only. ?zoom=
  // checks a specific grid level the same way.
  useEffect(() => {
    if (!hydrated) return
    const sp = new URLSearchParams(window.location.search)
    if (!useStore.getState().profile) {
      const dobSeed = sp.get('dob')
      if (dobSeed) {
        const years = Number(sp.get('years') ?? 80)
        useStore
          .getState()
          .createProfile(
            dobSeed,
            Number.isFinite(years) && years > 0 ? years : 80,
            sp.get('name') ?? '',
          )
      }
    }
    const zoomSeed = sp.get('zoom')
    if (zoomSeed === 'life' || zoomSeed === 'decade' || zoomSeed === 'year') {
      useStore.getState().setZoom(zoomSeed)
    }
  }, [hydrated])

  // Apply the resolved theme (respecting the system preference). A one-shot
  // ?theme= query param wins for quick QA of both appearances.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const override = new URLSearchParams(window.location.search).get('theme')
      const resolved =
        override === 'dark' || override === 'light'
          ? override
          : settings.theme === 'system'
            ? mql.matches
              ? 'dark'
              : 'light'
            : settings.theme
      document.documentElement.dataset.theme = resolved
      setResolvedTheme(resolved)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, settings.theme)
      } catch {
        /* storage may be unavailable */
      }
    }
    apply()
    if (settings.theme === 'system') {
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
  }, [settings.theme])

  const dob = useMemo(() => {
    if (!profile) return null
    const d = parseISODate(profile.dob)
    return Number.isNaN(d.getTime()) ? null : d
  }, [profile])

  // Daily-journal repository: open IndexedDB, decide whether the one-time
  // weekly→daily migration is still pending.
  const boot = useJournalBoot(dob)

  // Live journal views for the dashboard paint — weekID roll-ups and day
  // metadata feed the grid dots and the year heat-map.
  const { version: journalVersion } = useJournal()
  const weekInfo = useMemo(() => {
    void journalVersion
    const out = new Map<number, { days: number; lastDate: string }>()
    for (const [weekIndex, w] of repo.getWeekMap()) {
      if (w.daysWritten > 0) out.set(weekIndex, { days: w.daysWritten, lastDate: w.lastDate })
    }
    return out
  }, [journalVersion])
  const dayMeta = useMemo(() => {
    void journalVersion
    const out = new Map<string, { mood?: number; words: number; title?: string; excerpt: string; goodThing?: string }>()
    for (const [key, m] of repo.getMetaMap()) {
      if (m.words > 0 || m.title) {
        out.set(key, {
          mood: m.mood,
          words: m.words,
          title: m.title,
          excerpt: m.excerpt,
          goodThing: m.goodThing,
        })
      }
    }
    return out
  }, [journalVersion])

  const stats = useMemo(
    () => (dob && profile ? getLifeStats(dob, profile.lifeYears, today, profile.leapRule) : null),
    [dob, profile, today],
  )

  const due = useMemo(
    () =>
      !!stats &&
      reviewDue(today, settings.reminderDay, settings.reviewLastWeek, stats.weeksLived),
    [stats, today, settings.reminderDay, settings.reviewLastWeek],
  )

  // App lock: engaged once per session after hydration, so toggling it in
  // settings locks only on the next load; unlocking lasts for the session.
  const [locked, setLocked] = useState(false)
  const lockCheckedRef = useRef(false)
  useEffect(() => {
    if (!hydrated || lockCheckedRef.current) return
    lockCheckedRef.current = true
    setLocked(!!(profile && settings.appLock && vault))
  }, [hydrated, profile, settings.appLock, vault])

  // Optional local nudge: only fires when the user has granted notification
  // permission (never asked for in the background), once per session.
  const notifiedRef = useRef(false)
  useEffect(() => {
    if (!due || notifiedRef.current) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    notifiedRef.current = true
    try {
      new Notification('Memento Mori', {
        body: 'Your weekly review is ready if you are — last week beside a fresh intention.',
      })
    } catch {
      /* some engines reject constructed notifications; the chip still shows */
    }
  }, [due])

  const notesByWeek = useMemo(() => {
    const map = new Map<number, Note>()
    if (!profile) return map
    for (const n of notes) if (n.profileId === profile.id) map.set(n.weekIndex, n)
    return map
  }, [notes, profile])

  const profileChapters = useMemo(() => {
    if (!profile) return []
    return chapters
      .filter((c) => c.profileId === profile.id)
      .sort((a, b) => a.startWeek - b.startWeek || b.endWeek - a.endWeek)
  }, [chapters, profile])

  const profileGoals = useMemo(
    () => (profile ? goals.filter((g) => g.profileId === profile.id) : []),
    [goals, profile],
  )

  const quote = useMemo(() => getDailyQuote(today), [today])

  // With nothing to carry over the migration runs silently; with notes the
  // gate UI offers the backup download first.
  useEffect(() => {
    if (!dob || !boot.ready || migrationDone || !boot.needsMigration) return
    if (notesByWeek.size === 0) {
      void migrateWeeklyNotes(repo, dob, []).then(() => setMigrationDone(true))
    }
  }, [dob, boot.ready, boot.needsMigration, migrationDone, notesByWeek])

  // Command palette search: computed in one linear pass, kept out of the way
  // entirely while the palette is closed.
  const search = useMemo(() => {
    if (!searchOpen) return { results: [], jumps: [] }
    const parsed = parseSearch(searchQuery)
    return {
      results: searchNotes(Array.from(notesByWeek.values()), parsed),
      jumps: weekJumps(searchQuery, stats?.totalCells ?? 0, stats?.weeksLived ?? 0),
    }
  }, [searchOpen, searchQuery, notesByWeek, stats])

  const searchHighlight = useMemo(() => {
    if (!searchOpen || search.results.length === 0) return undefined
    const set = new Set<number>()
    for (const r of search.results.slice(0, 400)) set.add(r.note.weekIndex)
    return set
  }, [searchOpen, search])

  const journalStreak = useMemo(
    () => repo.streak(new Date()),
    // recompute when the journal bumps or the clock rolls over midnight
    [journalVersion, today],
  )

  const showToast = useCallback((message: string, undo?: () => void) => {
    const id = ++toastId
    setToast({ id, message, undo })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t))
    }, 5000)
  }, [])

  const openWeek = useCallback((week: number) => {
    setEditingDay(null)
    setEditingWeek(week)
  }, [])

  const openDay = useCallback((date: string) => {
    setEditingWeek(null)
    setEditingDay(date)
  }, [])

  const todayKey = useMemo(() => dateKey(today), [today])

  const openFromSearch = useCallback(
    (week: number) => {
      setSearchQuery('')
      setSearchOpen(false)
      openWeek(week)
    },
    [openWeek],
  )

  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    setTheme(isDark ? 'light' : 'dark')
  }, [setTheme])

  // Global shortcuts: Ctrl/Cmd+K toggles search, N opens the current week,
  // Z cycles the zoom level, Escape closes any overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (e.key === 'Escape') {
        setEditingWeek(null)
        setEditingDay(null)
        setSettingsOpen(false)
        setChaptersOpen(false)
        setGoalsOpen(false)
        setInsightsOpen(false)
        setReviewOpen(false)
        setPeopleOpen(false)
        setJournalOpen(false)
        setSearchOpen(false)
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen((open) => !open)
        return
      }
      const overlayOpen =
        editingWeek !== null ||
        editingDay !== null ||
        settingsOpen ||
        chaptersOpen ||
        goalsOpen ||
        insightsOpen ||
        reviewOpen ||
        peopleOpen ||
        journalOpen
      if (
        !typing &&
        !overlayOpen &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        stats
      ) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault()
          openDay(dateKey(today))
        } else if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          setZoom(nextZoom(settings.zoom))
        } else if (e.key === 'j' || e.key === 'J') {
          e.preventDefault()
          setJournalOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    openWeek,
    openDay,
    today,
    stats,
    editingWeek,
    settingsOpen,
    chaptersOpen,
    goalsOpen,
    insightsOpen,
    reviewOpen,
    peopleOpen,
    journalOpen,
    settings.zoom,
    setZoom,
  ])

  if (!hydrated) return <div className="boot" aria-hidden="true" />

  if (locked) {
    return (
      <AppLock
        verify={(pass) => (vault ? verifyLockRecord(vault, pass) : Promise.resolve(false))}
        onUnlock={() => setLocked(false)}
      />
    )
  }

  if (!profile || !stats || !dob) {
    return (
      <>
        <Onboarding />
        <ToastView toast={toast} onDismiss={() => setToast(null)} />
      </>
    )
  }

  const reduced = settings.reduceMotion || prefersReduced

  return (
    <div className="mm-page">
      <div className="mm-shell">
        <header className="mm-topbar">
          <p className="mm-eyebrow">Your life in weeks</p>
          <div className="mm-topbar__cluster">
            <button
              type="button"
              className="mm-theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle light and dark theme"
              title="Toggle theme"
            >
              <svg className="mm-theme-toggle__sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7" />
              </svg>
              <svg className="mm-theme-toggle__moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.6 13.4A8.5 8.5 0 1 1 10.6 3.4a7 7 0 0 0 10 10z" />
              </svg>
            </button>
            <button
              type="button"
              className="mm-settings-pill"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.64V21a2 2 0 1 1-4 0v-.09a1.8 1.8 0 0 0-1.16-1.64 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.64-1.09H3a2 2 0 1 1 0-4h.09a1.8 1.8 0 0 0 1.64-1.16 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.8 1.8 0 0 0 1.98.36h.09a1.8 1.8 0 0 0 1.09-1.64V3a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1.09 1.64 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98v.09a1.8 1.8 0 0 0 1.64 1.09H21a2 2 0 1 1 0 4h-.09a1.8 1.8 0 0 0-1.51 1.67z" />
              </svg>
              Settings
            </button>
            <button
              type="button"
              className="mm-settings-pill"
              onClick={() => setTimelineOpen(true)}
              aria-label="Open life timeline"
            >
              📜 Timeline
            </button>
            <button
              type="button"
              className="mm-settings-pill"
              onClick={() => setHabitsOpen(true)}
              aria-label="Open habits & rituals"
            >
              ♻ Habits
            </button>
            <button
              type="button"
              className="mm-settings-pill"
              onClick={() => setAnnualReviewOpen(true)}
              aria-label="Open annual life review"
            >
              📅 Annual Review
            </button>
          </div>
        </header>

        <Dashboard
          stats={stats}
          lifeYears={profile.lifeYears}
          name={profile.name}
          dob={profile.dob}
          notesByWeek={notesByWeek}
          chapters={profileChapters}
          goals={profileGoals}
          reduceMotion={reduced}
          themeKey={resolvedTheme}
          gentleMode={settings.gentleMode}
          quote={quote}
          zoom={settings.zoom}
          onZoomChange={setZoom}
          reviewDue={due}
          searchHighlight={searchHighlight}
          onSelectWeek={openWeek}
          onOpenDay={openDay}
          weekInfo={weekInfo}
          dayMeta={dayMeta}
          streak={journalStreak}
          onOpenChapters={() => setChaptersOpen(true)}
          onOpenGoals={() => setGoalsOpen(true)}
          onOpenInsights={() => setInsightsOpen(true)}
          onOpenReview={() => setReviewOpen(true)}
          onOpenPeople={() => setPeopleOpen(true)}
          onOpenJournal={() => setJournalOpen(true)}
          peopleCount={people.length}
        />
      </div>

      {boot.ready && boot.needsMigration && !migrationDone && dob && (
        <MigrationGate
          dob={dob}
          notes={notes}
          onDone={() => {
            setMigrationDone(true)
            openDay(todayKey)
          }}
        />
      )}

      {editingDay !== null && dob && (
        <DailyDrawer
          key={editingDay}
          view="day"
          date={editingDay}
          dob={dob}
          today={today}
          onClose={() => setEditingDay(null)}
          onToast={showToast}
          onOpenDay={openDay}
          onOpenWeek={openWeek}
        />
      )}

      {editingWeek !== null && dob && editingDay === null && (
        <DailyDrawer
          view="week"
          date={todayKey}
          dob={dob}
          today={today}
          onClose={() => setEditingWeek(null)}
          onToast={showToast}
          onOpenDay={openDay}
          onOpenWeek={openWeek}
        />
      )}

      {chaptersOpen && (
        <ChaptersPanel
          dob={dob}
          chapters={profileChapters}
          totalCells={stats.totalCells}
          defaultStart={stats.weeksLived}
          onClose={() => setChaptersOpen(false)}
          onToast={showToast}
        />
      )}

      {goalsOpen && (
        <GoalsPanel
          dob={dob}
          goals={profileGoals}
          currentWeek={stats.weeksLived}
          totalCells={stats.totalCells}
          onClose={() => setGoalsOpen(false)}
          onToast={showToast}
        />
      )}

      {insightsOpen && (
        <InsightsPanel
          weeksLived={stats.weeksLived}
          onClose={() => setInsightsOpen(false)}
        />
      )}

      {reviewOpen && (
        <ReviewPanel
          currentWeek={stats.weeksLived}
          dob={dob}
          onClose={() => setReviewOpen(false)}
          onToast={showToast}
        />
      )}

      {peopleOpen && (
        <PeoplePanel
          people={people}
          userDob={profile.dob}
          userLifeYears={profile.lifeYears}
          today={today}
          gentleMode={settings.gentleMode}
          onClose={() => setPeopleOpen(false)}
          onToast={showToast}
        />
      )}

      {journalOpen && dob && (
        <JournalPanel
          dob={dob}
          today={today}
          onClose={() => setJournalOpen(false)}
          onSelectDay={(d) => {
            setJournalOpen(false)
            openDay(d)
          }}
        />
      )}

      {searchOpen && (
        <CommandPalette
          query={searchQuery}
          onQueryChange={setSearchQuery}
          jumps={search.jumps}
          results={search.results}
          totalResults={search.results.length}
          onSelectWeek={openFromSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} onToast={showToast} />
      )}

      {timelineOpen && (
        <TimelinePanel onClose={() => setTimelineOpen(false)} />
      )}

      {habitsOpen && (
        <HabitsPanel onClose={() => setHabitsOpen(false)} />
      )}

      {annualReviewOpen && (
        <AnnualReviewPanel onClose={() => setAnnualReviewOpen(false)} />
      )}

      <ToastView toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

function ToastView({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.undo ? (
        <button
          type="button"
          className="toast__undo"
          onClick={() => {
            toast.undo?.()
            onDismiss()
          }}
        >
          Undo
        </button>
      ) : (
        <button type="button" className="toast__close" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  )
}
