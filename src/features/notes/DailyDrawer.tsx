import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './dailyDrawer.css'
import { useJournal } from '../../core/useJournal'
import type { EntryVersion } from '../../core/journal'
import {
  dateKey,
  countWords,
  promptFor,
  shiftKey,
  dayInWeek,
  weekOfDate,
} from '../../domain/daily'
import { calendarAge } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { renderMarkdownLite } from '../../domain/markdownLite'

export type DrawerView = 'day' | 'week'

export interface DailyDrawerProps {
  view: DrawerView
  /** Day view: entry date. Week view: anchor date within that week. */
  date: string
  dob: Date
  today: Date
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
  onOpenDay: (date: string) => void
  onOpenWeek: (weekIndex: number) => void
}

const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Great']
const ENERGY_LABELS = ['Drained', 'Low', 'Balanced', 'Charged', 'Wired']

function fmtDate(key: string): string {
  return new Date(key + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'narrow', day: 'numeric' })
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function DailyDrawer({
  view,
  date,
  dob,
  today,
  onClose,
  onToast,
  onOpenDay,
  onOpenWeek,
}: DailyDrawerProps) {
  const { repo, version } = useJournal()
  const todayKey = useMemo(() => dateKey(today), [today])
  const [tab, setTab] = useState<DrawerView>(view)
  const [cursor, setCursor] = useState(date)
  useEffect(() => {
    setCursor(date)
  }, [date])
  useEffect(() => {
    setTab(view)
  }, [view])

  // ---- Day entry state -------------------------------------------------
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mood, setMood] = useState<number | undefined>(undefined)
  const [energy, setEnergy] = useState<number | undefined>(undefined)
  const [tags, setTags] = useState('')
  const [goodThing, setGoodThing] = useState('')
  const [preview, setPreview] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [locked, setLocked] = useState(false)
  const [thisDay, setThisDay] = useState<{ date: string; yearsAgo: number; excerpt: string; mood?: number }[]>([])
  const [otdOpen, setOtdOpen] = useState(false)
  const [versions, setVersions] = useState<EntryVersion[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (tab !== 'day') return
    let stale = false
    void (async () => {
      const vList = await repo.getEntryVersions(cursor)
      if (!stale) setVersions(vList)
    })()
    return () => {
      stale = true
    }
  }, [cursor, tab, version, repo])

  async function handleRestoreVersion(versionId: string) {
    const ok = await repo.restoreEntryVersion(cursor, versionId)
    if (ok) {
      onToast('Version restored')
      setHistoryOpen(false)
      const meta = repo.getMeta(cursor)
      setTitle(meta?.title ?? '')
      setMood(meta?.mood)
      setEnergy(meta?.energy)
      setTags((meta?.tags ?? []).join(', '))
      setGoodThing(meta?.goodThing ?? '')
      const text = await repo.body(cursor)
      setBody(text)
    } else {
      onToast('Could not restore version')
    }
  }

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<number | null>(null)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const prevCursor = useRef('')

  const weekIndex = useMemo(() => {
    const [y, m, d] = cursor.split('-').map(Number)
    return weekOfDate(dob, new Date(y, m - 1, d))
  }, [dob, cursor])
  const weekAnchor = useMemo(() => new Date(cursor + 'T12:00:00'), [cursor])
  const age = useMemo(
    () => calendarAge(dob, new Date(cursor + 'T12:00:00')),
    [dob, cursor],
  )
  const prompt = useMemo(() => promptFor(cursor), [cursor])
  const rendered = useMemo(
    () => (preview ? renderMarkdownLite(body) : null),
    [preview, body],
  )

  // Load body for the cursor date. A version bump (autosave, cross-tab)
  // re-reads content but does NOT clobber the "Saved" indicator.
  useEffect(() => {
    if (tab !== 'day') return
    let stale = false
    void (async () => {
      const meta = repo.getMeta(cursor)
      setTitle(meta?.title ?? '')
      setMood(meta?.mood)
      setEnergy(meta?.energy)
      setTags((meta?.tags ?? []).join(', '))
      setGoodThing(meta?.goodThing ?? '')
      setLocked(false)
      if (prevCursor.current !== cursor) {
        setStatus('idle')
        if (compareKeys(cursor, todayKey) >= 0) {
          window.setTimeout(() => bodyRef.current?.focus(), 30)
        }
      }
      prevCursor.current = cursor
      try {
        const text = await repo.body(cursor)
        if (stale) return
        setBody(text)
      } catch {
        if (!stale) {
          setLocked(true)
          setBody('')
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [cursor, tab, version, repo, todayKey])

  // ---- Autosave ---------------------------------------------------------
  const hasContent = useMemo(
    () => Boolean(title.trim() || body.trim() || mood !== undefined || energy !== undefined || tags.trim() || goodThing.trim()),
    [title, body, mood, energy, tags, goodThing],
  )

  const saveNow = useCallback(() => {
    const date = cursorRef.current
    const text = body.trim() ? body : ''
    if (!text && !hasContent) return
    const tagsList = tags
      .split(/[,\n]/)
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
      .slice(0, 8)
    void repo
      .saveEntry(date, {
        title: title.trim() || undefined,
        body: text,
        mood,
        energy,
        tags: tagsList,
        goodThing: goodThing.trim() || undefined,
      })
      .then((res) => {
        if (res) setStatus('saved')
      })
      .catch(() => onToast('Could not save — storage is full', undefined))
  }, [body, title, mood, energy, tags, goodThing, hasContent, repo, onToast])

  // Debounced 800ms autosave.
  useEffect(() => {
    if (tab !== 'day') return
    setStatus((s) => (s === 'saving' ? s : hasContent ? 'saving' : 'idle'))
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (!hasContent) return
    saveTimer.current = window.setTimeout(saveNow, 800)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [title, body, mood, energy, tags, goodThing, tab, hasContent, saveNow])

  // Flush-on-blur / hide (spec: blur, visibilitychange, pagehide).
  useEffect(() => {
    const flush = () => saveNow()
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
      flush()
    }
  }, [saveNow])

  // ---- On this day ------------------------------------------------------
  useEffect(() => {
    if (!otdOpen) return
    setThisDay(repo.onThisDay(today, 3))
  }, [otdOpen, today, version, repo])

  // ---- Week data --------------------------------------------------------
  const weekData = useMemo(() => {
    if (tab !== 'week') return null
    const days = repo.daysInWeek(weekIndex, dob).map(({ key, meta }) => ({
      key,
      meta,
    }))
    const w = repo.weekOf(weekIndex)
    return { days, avgMood: w.avgMood, words: w.words, written: w.days }
  }, [tab, weekIndex, dob, repo, version])

  // ---- 7-day strip ------------------------------------------------------
  const strip = useMemo((() => {
    if (tab !== 'day') return null
    return repo.daysInWeek(weekIndex, dob).map(({ key, meta }) => ({
      key,
      label: new Date(key + 'T12:00:00'),
      written: Boolean(meta),
    }))
  }), [tab, weekIndex, dob, repo, version])

  const close = useCallback(() => {
    saveNow()
    onClose()
  }, [saveNow, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const switchDay = useCallback(
    (next: string) => {
      saveNow()
      setTab('day')
      setCursor(next)
      onOpenDay(next)
    },
    [saveNow, onOpenDay],
  )

  const switchTab = useCallback(
    (next: DrawerView) => {
      saveNow()
      setTab(next)
      if (next === 'week') onOpenWeek(weekIndex)
      else onOpenDay(cursorRef.current)
    },
    [saveNow, onOpenWeek, onOpenDay, weekIndex],
  )

  const deleteDay = useCallback(() => {
    const date = cursorRef.current
    void repo.deleteEntry(date).then(() => {
      onToast('Entry moved to trash — 30 days to restore', () => void repo.restoreDate(date))
    })
  }, [repo, onToast])

  const dot = (mood: number | undefined, i: number, pick: (v?: number) => void, label: string) => (
    <button
      key={i}
      type="button"
      className={`dot${mood !== undefined && mood >= i + 1 ? ' on' : ''}`}
      title={`${label} — ${MOOD_LABELS[i]}`}
      aria-label={`${label}: ${MOOD_LABELS[i]}`}
      aria-pressed={mood !== undefined && mood >= i + 1}
      onClick={() => pick(mood === i + 1 ? undefined : i + 1)}
    />
  )

  return (
    <div className="drawer-scrim" onClick={close}>
      <aside
        className="drawer drawer-daily"
        role="dialog"
        aria-modal="true"
        aria-label={tab === 'day' ? fmtDate(cursor) : `Week ${weekIndex + 1}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow" data-qa="journal-eyebrow">
              {tab === 'day'
                ? `Age ${age} · Week ${(weekIndex + 1).toLocaleString()} · day ${dayInWeek(dob, weekAnchor) + 1} of 7`
                : `Week ${(weekIndex + 1).toLocaleString()} · Age ${weekAge(weekIndex)}`}
            </p>
            <h2 className="drawer__title" data-qa="journal-title">
              {tab === 'day' ? fmtDate(cursor) : `Week ${(weekIndex + 1).toLocaleString()}`}
            </h2>
          </div>
          <div className="drawer-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'day'} className={`drawer-tab${tab === 'day' ? ' on' : ''}`} onClick={() => switchTab('day')} data-qa="tab-day">Day</button>
            <button role="tab" aria-selected={tab === 'week'} className={`drawer-tab${tab === 'week' ? ' on' : ''}`} onClick={() => switchTab('week')} data-qa="tab-week">Week</button>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close journal" data-qa="drawer-close">✕</button>
        </header>

        {tab === 'day' ? (
          <div className="drawer-body" data-qa="drawer-day">
            {versions.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: '12px', padding: '4px 10px' }}
                  onClick={() => setHistoryOpen(!historyOpen)}
                >
                  📜 Version History ({versions.length})
                </button>
                {historyOpen && (
                  <div style={{ marginTop: '8px', padding: '10px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                    {versions.map((v) => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '12px' }}>
                        <div>
                          <strong>{new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                          <span style={{ opacity: 0.7, marginLeft: '8px' }}>{v.meta.words} words</span>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '11px', padding: '2px 8px' }}
                          onClick={() => void handleRestoreVersion(v.id)}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="day-strip" role="navigation" aria-label="Days of this week">
              <button
                className="icon-btn"
                aria-label="Previous day"
                onClick={() => switchDay(shiftKey(cursor, -1))}
              >
                ‹
              </button>
              {strip?.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`day-strip__day${d.key === cursor ? ' on' : ''}${d.key === todayKey ? ' today' : ''}${d.key > todayKey ? ' future' : ''}`}
                  title={fmtShort(d.label)}
                  onClick={() => switchDay(d.key)}
                  data-qa={`day-strip-${d.key}`}
                >
                  <span className="day-strip__num">{d.label.getDate()}</span>
                  <span className={`mini-dot${d.written ? ' on' : ''}`} />
                </button>
              ))}
              <button
                className="icon-btn"
                aria-label="Next day"
                disabled={compareKeys(cursor, todayKey) >= 0}
                onClick={() => switchDay(shiftKey(cursor, 1))}
              >
                ›
              </button>
              <input
                type="date"
                className="field__input day-strip__picker"
                aria-label="Pick a date"
                value={cursor}
                max={todayKey}
                onChange={(e) => e.target.value && switchDay(e.target.value)}
              />
            </div>

            {locked && repo.isEncrypted ? (
              <div className="drawer-locked__note">
                This entry is locked. Unlock the privacy lock in Settings to read it.
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="daily-title">Title <span className="muted">(optional)</span></label>
                  <input
                    id="daily-title"
                    className="field__input"
                    value={title}
                    placeholder="A headline for the day"
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={saveNow}
                    data-qa="daily-title"
                  />
                </div>
                <div className="field">
                  <div className="field__label-row">
                    <label className="field__label" htmlFor="daily-body">The day</label>
                    <button type="button" className="link-btn" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
                      {preview ? 'Write' : 'Preview'}
                    </button>
                  </div>
                  {preview ? (
                    <div className="mini-scroll daily-preview" data-qa="daily-preview">
                      {rendered?.root && <div ref={(el) => { if (el && rendered.root) el.appendChild(rendered.root) }} />}
                      {!body.trim() && <p className="muted">Nothing written yet.</p>}
                    </div>
                  ) : (
                    <textarea
                      id="daily-body"
                      ref={bodyRef}
                      className="field__input journal-body"
                      rows={9}
                      value={body}
                      placeholder={prompt}
                      spellCheck
                      onChange={(e) => setBody(e.target.value)}
                      onBlur={saveNow}
                      data-qa="daily-body"
                    />
                  )}
                </div>
                <div className="field field--row" role="group" aria-label="Mood">
                  <span className="field__label">Mood</span>
                  <span className="dots">
                    {[0, 1, 2, 3, 4].map((i) => dot(mood, i, setMood, 'Mood'))}
                  </span>
                  <span className="muted">{mood ? MOOD_LABELS[mood - 1] : ''}</span>
                </div>
                <div className="field field--row" role="group" aria-label="Energy">
                  <span className="field__label">Energy</span>
                  <span className="dots">
                    {[0, 1, 2, 3, 4].map((i) => dot(energy, i, setEnergy, 'Energy'))}
                  </span>
                  <span className="muted">{energy ? ENERGY_LABELS[energy - 1] : ''}</span>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="daily-tags">Tags <span className="muted">(comma-separated, max 8)</span></label>
                  <input
                    id="daily-tags"
                    className="field__input"
                    value={tags}
                    placeholder="#work, #family"
                    onChange={(e) => setTags(e.target.value)}
                    onBlur={saveNow}
                    data-qa="daily-tags"
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="daily-good">One good thing</label>
                  <input
                    id="daily-good"
                    className="field__input"
                    value={goodThing}
                    placeholder="…"
                    onChange={(e) => setGoodThing(e.target.value)}
                    onBlur={saveNow}
                    data-qa="daily-good"
                  />
                </div>
                <div className="day-foot">
                  <span aria-live="polite" className="save-status" data-qa="save-status">
                    {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
                  </span>
                  <span className="muted">{countWords(body)} words</span>
                  {repo.getMeta(cursor) && (
                    <button className="link-btn danger" onClick={deleteDay} data-qa="daily-delete">Delete</button>
                  )}
                </div>

                <div className="on-this-day">
                  <button
                    className="link-btn"
                    onClick={() => setOtdOpen((o) => !o)}
                    aria-expanded={otdOpen}
                    data-qa="otd-toggle"
                  >
                    {otdOpen ? 'Hide' : 'Show'} on this day
                  </button>
                  {otdOpen && (
                    <div className="otd-cards">
                      {thisDay.length === 0 && <p className="muted">Nothing from previous years… yet.</p>}
                      {thisDay.map((r) => (
                        <button key={r.date} type="button" className="otd-card" onClick={() => switchDay(r.date)} data-qa="otd-card">
                          <span className="otd-year">{r.date.slice(0, 4)}</span>
                          <span>{r.excerpt ?? 'An entry'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="drawer-body" data-qa="drawer-week">
            <div className="week-summary">
              <span>{weekData?.written ?? 0}/7 days written</span>
              <span>{weekData?.words ?? 0} words</span>
              <span>{weekData?.avgMood ? MOOD_LABELS[Math.round(weekData.avgMood) - 1] : 'No mood yet'}</span>
            </div>
            <div className="week-days">
              {weekData?.days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`week-card${d.meta ? ' has' : ''}${d.key > todayKey ? ' future' : ''}`}
                  onClick={() => switchDay(d.key)}
                  data-qa={`week-card-${d.key}`}
                >
                  <span className="week-card__date">{fmtShort(new Date(d.key + 'T12:00:00'))}</span>
                  <span className="week-card__title">{d.meta?.title || (d.meta ? d.meta.excerpt || 'Entry' : '')}</span>
                  <span className="week-card__meta">
                    {d.meta?.mood ? `${MOOD_LABELS[d.meta.mood - 1]} · ` : ''}
                    {d.meta ? `${d.meta.words} words` : '—'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="drawer__foot">
          <span className="muted">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</span>
          <span className="muted">Everything stays on this device.</span>
        </footer>
      </aside>
    </div>
  )
}
