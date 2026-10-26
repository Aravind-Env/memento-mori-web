import { useEffect, useMemo, useRef, useState } from 'react'

import { useJournal } from '../../core/useJournal'
import { dateKey, formatDayLong } from '../../domain/daily'
import { searchDailyMetas, splitOnTerm } from '../../domain/dailySearch'
import type { DailyMetaLike } from '../../domain/dailySearch'
import './journal.css'
export interface JournalPanelProps {
  dob: Date
  onClose: () => void
  /** Open a day entry; the panel closes itself first. */
  onSelectDay: (date: string) => void
  /** Backfill target when the journal is empty. */
  today: Date
}

const MOOD_MAX = 5

/** A day's metadata plus the display-only calendar age. */
interface RowMeta extends DailyMetaLike {
  age: number
}

interface DayRow {
  key: string
  meta: RowMeta
}

function shortDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function yearOf(key: string): string {
  return key.slice(0, 4)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
}

/** One written day in the reading view. */
function EntryRow({
  row,
  onSelect,
  term,
}: {
  row: DayRow
  onSelect: (date: string) => void
  term?: string
}) {
  const { meta } = row
  const mood = meta.mood
  const parts = term ? splitOnTerm(meta.excerpt, term) : null
  return (
    <button
      type="button"
      className="journal-entry"
      onClick={() => onSelect(row.key)}
      aria-label={`${formatDayLong(row.key)} — open this entry`}
    >
      <span className="journal-entry__meta">
        <span className="journal-entry__date">{shortDay(row.key)}</span>
        <span className="journal-entry__age">age {meta.age}</span>
        {mood != null ? (
          <span className="journal-entry__mood" aria-label={`Mood ${mood} of ${MOOD_MAX}`}>
            {Array.from({ length: MOOD_MAX }, (_, i) => (
              <i key={i} className={i < (mood ?? 0) ? 'on' : undefined} />
            ))}
          </span>
        ) : null}
        {meta.tags.length > 0 && (
          <span className="journal-entry__tags">
            {meta.tags.slice(0, 4).map((t) => (
              <span key={t} className="journal-entry__tag">
                #{t}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="journal-entry__text">{parts ?? meta.excerpt}</span>
    </button>
  )
}

/** "Your journal" — every written day in one scrollable, searchable feed. */
export function JournalPanel({
  dob,
  onClose,
  onSelectDay,
  today,
}: JournalPanelProps) {
  const { repo, version } = useJournal()
  const [query, setQuery] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const rows: DayRow[] = useMemo(() => {
    void version
    const out: DayRow[] = []
    for (const key of repo.liveDates()) {
      const meta = repo.getMeta(key)
      if (!meta) continue
      let age = Number(key.slice(0, 4)) - dob.getFullYear()
      const m = Number(key.slice(5, 7))
      const d = Number(key.slice(8, 10))
      if (m < dob.getMonth() + 1 || (m === dob.getMonth() + 1 && d < dob.getDate())) age--
      const rowMeta: RowMeta = { ...meta, age: Math.max(age, 0) }
      out.push({ key, meta: rowMeta })
    }
    out.sort((a, b) => (a.key < b.key ? 1 : -1))
    return out
  }, [version, dob, repo])

  const results: DayRow[] = useMemo(() => {
    if (!query.trim()) return []
    return searchDailyMetas(rows.map((r) => r.meta), query.trim()).map(
      (meta) => ({ key: meta.date, meta: meta as RowMeta }),
    )
  }, [query, rows])

  // Virtualized feed: one flat list of fixed-height items (year header,
  // month label, entry row). Only the items inside the scroll window mount,
  // so 3,650 entries cost ~30 DOM nodes, never a node per entry.
  const feedItems = useMemo(() => {
    const list = query.trim() ? results : rows
    const monthCounts = new Map<string, number>()
    for (const row of list) {
      const mk = row.key.slice(0, 7)
      monthCounts.set(mk, (monthCounts.get(mk) ?? 0) + 1)
    }
    const items: (
      | { kind: 'year'; top: number; height: number; year: string }
      | { kind: 'month'; top: number; height: number; key: string; label: string; n: number }
      | { kind: 'entry'; top: number; height: number; row: DayRow }
    )[] = []
    const H_YEAR = 48
    const H_MONTH = 36
    const H_ENTRY = 96
    let top = 0
    let prevYear = ''
    let prevMonth = ''
    for (const row of list) {
      const y = yearOf(row.key)
      const mk = row.key.slice(0, 7)
      if (y !== prevYear) {
        items.push({ kind: 'year', top, height: H_YEAR, year: y })
        top += H_YEAR
        prevYear = y
        prevMonth = ''
      }
      if (mk !== prevMonth) {
        items.push({
          kind: 'month',
          top,
          height: H_MONTH,
          key: mk,
          label: monthLabel(row.key),
          n: monthCounts.get(mk) ?? 0,
        })
        top += H_MONTH
        prevMonth = mk
      }
      items.push({ kind: 'entry', top, height: H_ENTRY, row })
      top += H_ENTRY
    }
    return { items, total: top }
  }, [rows, results, query])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  useEffect(() => {
    // Reset to the top whenever the result set changes shape.
    scrollRef.current?.scrollTo(0, 0)
    setScrollTop(0)
  }, [query])

  const trashRows = useMemo(() => {
    void version
    return repo.trashDates().map((key) => ({ key, deletedAt: repo.getMeta(key) == null }))
  }, [version, repo])

  const searching = query.trim().length > 0
  const hasEntries = rows.length > 0
  const first = rows[rows.length - 1]?.key
  const last = rows[0]?.key

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer drawer--journal"
        role="dialog"
        aria-modal="true"
        aria-label="Your journal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Your journal</p>
            <h2 className="drawer__title">Everything you've written</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close journal">
            ×
          </button>
        </header>

        {hasEntries ? (
          <p className="journal__summary">
            {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · {shortDay(first)} → {shortDay(last)}
          </p>
        ) : null}

        <div className="journal__searchwrap">
          <input
            ref={searchRef}
            type="text"
            className="field__input"
            value={query}
            placeholder="Search — words, #tag, mood:4, date:2024, has:good-thing"
            aria-label="Search your journal"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && (
            <button
              type="button"
              className="journal__clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              Clear
            </button>
          )}
        </div>

        {!hasEntries ? (
          <div className="journal__empty">
            <p className="journal__empty-title">Nothing written yet.</p>
            <p className="journal__empty-lead">
              One entry per day. Write today's now, and this page becomes the
              book of your life — a page at a time.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onSelectDay(dateKey(today))}
            >
              Make today count
            </button>
          </div>
        ) : searching && results.length === 0 ? (
          <div className="journal__empty">
            <p className="journal__empty-title">No entries match “{query.trim()}”.</p>
            <p className="journal__empty-lead">
              Try fewer words, a #tag, a mood like mood:4, or a range like after:2024-06.
            </p>
          </div>
        ) : (
          <div
            className="journal__scroll journal-feed"
            ref={scrollRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          >
            {searching && (
              <p className="journal__count" aria-live="polite" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                {results.length} match{results.length === 1 ? '' : 'es'}
              </p>
            )}
            <div style={{ position: 'relative', height: feedItems.total }}>
              {feedItems.items.map((item) => {
                const visible =
                  item.top + item.height >= scrollTop - 300 &&
                  item.top <= scrollTop + 900
                if (!visible) return null
                const pad = (h: number) => ({
                  position: 'absolute' as const,
                  top: item.top,
                  left: 0,
                  right: 0,
                  height: h,
                })
                if (item.kind === 'year') {
                  return (
                    <div key={`y${item.year}`} style={pad(item.height)} className="journal-feed__cell">
                      <h3 className="journal-year__title">{item.year}</h3>
                    </div>
                  )
                }
                if (item.kind === 'month') {
                  return (
                    <div key={`m${item.key}`} style={pad(item.height)} className="journal-feed__cell">
                      <p className="journal-month__label">
                        {item.label}
                        <span className="journal-month__n">{item.n}</span>
                      </p>
                    </div>
                  )
                }
                return (
                  <div key={item.row.key} style={pad(item.height)} className="journal-feed__cell">
                    <EntryRow
                      row={item.row}
                      term={query.trim()}
                      onSelect={(d) => {
                        setQuery('')
                        onSelectDay(d)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {hasEntries && (
          <footer className="drawer__foot journal__foot">
            <span className="journal__hint">One entry per day · newest first</span>
            <button type="button" className="btn" onClick={() => onSelectDay(dateKey(today))}>
              Today's entry
            </button>
          </footer>
        )}

        {trashRows.length > 0 && !searching && showTrash && (
          <div className="journal__trash" data-qa="journal-trash">
            <p className="journal__hint">
              Trash — restored automatically within 30 days, or purge leads to a permanent loss.
            </p>
            {trashRows.map((t) => (
              <div key={t.key} className="journal-trash-row">
                <span>{formatDayLong(t.key)}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void repo.restoreDate(t.key)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
        {trashRows.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setShowTrash((s) => !s)}>
            {showTrash ? 'Hide trash' : `Show trash (${trashRows.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
