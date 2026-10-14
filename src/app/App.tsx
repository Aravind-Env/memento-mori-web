import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Dashboard } from '../features/dashboard/Dashboard'
import { WeekDrawer } from '../features/notes/WeekDrawer'
import { Settings } from '../features/settings/Settings'
import { Onboarding } from '../features/onboarding/Onboarding'
import { parseISODate } from '../domain/dates'
import { getLifeStats } from '../domain/lifeMath'
import { getDailyQuote } from '../domain/quotes'
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
  const settings = useStore((s) => s.settings)
  const setTheme = useStore((s) => s.setTheme)
  const prefersReduced = usePrefersReducedMotion()

  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated())
  const [today, setToday] = useState(() => new Date())
  const [editingWeek, setEditingWeek] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  const notesByWeek = useMemo(() => {
    const map = new Map<number, Note>()
    if (!profile) return map
    for (const n of notes) if (n.profileId === profile.id) map.set(n.weekIndex, n)
    return map
  }, [notes, profile])

  const quote = useMemo(() => getDailyQuote(today), [today])

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

  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    setTheme(isDark ? 'light' : 'dark')
  }, [setTheme])

  // Global shortcuts: N opens the current week, Escape closes overlays.
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
        return
      }
      if (!typing && (e.key === 'n' || e.key === 'N') && stats) {
        e.preventDefault()
        openWeek(stats.weeksLived)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openWeek, stats])

  if (!hydrated) return <div className="boot" aria-hidden="true" />

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
        reduceMotion={reduced}
        themeKey={resolvedTheme}
        gentleMode={settings.gentleMode}
        quote={quote}
        onSelectWeek={openWeek}
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
