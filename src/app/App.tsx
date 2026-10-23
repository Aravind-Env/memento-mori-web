import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Dashboard } from '../features/dashboard/Dashboard'
import { WeekDrawer } from '../features/notes/WeekDrawer'
import { ChaptersPanel } from '../features/chapters/ChaptersPanel'
import { GoalsPanel } from '../features/goals/GoalsPanel'
import { InsightsPanel } from '../features/insights/InsightsPanel'
import { ReviewPanel } from '../features/review/ReviewPanel'
import { PeoplePanel } from '../features/people/PeoplePanel'
import { Settings } from '../features/settings/Settings'
import { AppLock } from '../features/settings/AppLock'
import { Onboarding } from '../features/onboarding/Onboarding'
import { CommandPalette } from '../features/search/CommandPalette'
import { parseISODate, WEEKS_PER_YEAR } from '../domain/dates'
import { getLifeStats } from '../domain/lifeMath'
import { getDailyQuote } from '../domain/quotes'
import { nextZoom } from '../domain/zoom'
import { reviewDue } from '../domain/review'
import { parseSearch, searchNotes, weekJumps } from '../domain/search'
import { verifyLockRecord } from '../domain/crypto'
import { useMidnightRefresh, usePrefersReducedMotion } from '../shared/hooks'
import { THEME_STORAGE_KEY, useStore } from '../state/store'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
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

  // Apply the resolved theme (respecting the system preference).
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved =
        settings.theme === 'system' ? (mql.matches ? 'dark' : 'light') : settings.theme
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

  const yourRemainingYears = useMemo(
    () =>
      stats
        ? Math.max((stats.totalCells - stats.weeksLived) / WEEKS_PER_YEAR, 0)
        : 0,
    [stats],
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
    setEditingWeek(week)
  }, [])

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
        setSettingsOpen(false)
        setChaptersOpen(false)
        setGoalsOpen(false)
        setInsightsOpen(false)
        setReviewOpen(false)
        setPeopleOpen(false)
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
        settingsOpen ||
        chaptersOpen ||
        goalsOpen ||
        insightsOpen ||
        reviewOpen ||
        peopleOpen
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
          openWeek(stats.weeksLived)
        } else if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          setZoom(nextZoom(settings.zoom))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    openWeek,
    stats,
    editingWeek,
    settingsOpen,
    chaptersOpen,
    goalsOpen,
    insightsOpen,
    reviewOpen,
    peopleOpen,
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
      <div className="mm-controls">
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="Toggle light and dark theme"
          title="Toggle theme"
        >
          ◐
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
        >
          Settings
        </button>
      </div>

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
        onOpenChapters={() => setChaptersOpen(true)}
        onOpenGoals={() => setGoalsOpen(true)}
        onOpenInsights={() => setInsightsOpen(true)}
        onOpenReview={() => setReviewOpen(true)}
        onOpenPeople={() => setPeopleOpen(true)}
        peopleCount={people.length}
      />

      {editingWeek !== null && (
        <WeekDrawer
          key={editingWeek}
          weekIndex={editingWeek}
          dob={dob}
          currentWeek={stats.weeksLived}
          onClose={() => setEditingWeek(null)}
          onToast={showToast}
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
          notes={Array.from(notesByWeek.values())}
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
          yourRemainingYears={yourRemainingYears}
          lifeExpectancy={profile.lifeYears}
          today={today}
          gentleMode={settings.gentleMode}
          onClose={() => setPeopleOpen(false)}
          onToast={showToast}
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
