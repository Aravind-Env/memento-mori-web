import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import type { Chapter, Goal, Note } from '../../data/model'
import type { Quote } from '../../domain/quotes'
import { dateKey } from '../../domain/daily'
import { parseISODate } from '../../domain/dates'
import { pendingGoals } from '../../domain/goals'
import {
  clampDecade,
  clampYear,
  decadeOf,
  viewLayout,
  yearOf,
  type ZoomLevel,
} from '../../domain/zoom'
import { useElementSize } from '../../shared/hooks'
import { WeekCanvas } from './WeekCanvas'
import sceneUrl from '../../assets/cosmic-dawn.png'
import type { LifeStats } from '../../domain/lifeMath'
import './dashboard.css'

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Compact editorial date: "22 Jul 2027". */
function compactDate(value: Date | string, short = false): string {
  const d = typeof value === 'string' ? parseISODate(value) : value
  const year = short ? `\u2019${String(d.getFullYear()).slice(2)}` : String(d.getFullYear())
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${year}`
}

/** Small caps eyebrow tile: icon + one-line label. */
function ValueTile({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="mm-tile">
      <span className="mm-tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mm-tile__label">{label}</span>
    </div>
  )
}

/** The right-hand panel: a daily quote, mantra and the values worth living by. */
export function MomentPanel({ quote }: { quote: Quote }) {
  return (
    <aside className="mm-side" aria-label="Daily reflection">
      <div className="mm-side__head">
        <span className="mm-orb" aria-hidden="true" />
        <p className="mm-side__label">This moment</p>
      </div>

      <blockquote className="mm-quote">
        <p>&ldquo;{quote.text}&rdquo;</p>
        <cite>{quote.author}</cite>
      </blockquote>

      <div className="mm-side__break">
        <p className="mm-mantra">One week at a time.</p>
      </div>

      <div className="mm-values">
        <ValueTile
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
            </svg>
          }
          label="Be present"
        />
        <ValueTile
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z" />
            </svg>
          }
          label="Focus on what you can control"
        />
        <ValueTile
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 19l6.5-10 4 6 3-4 5.5 8z" />
            </svg>
          }
          label="Appreciate the journey"
        />
        <ValueTile
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
            </svg>
          }
          label="Make it meaningful"
        />
      </div>
    </aside>
  )
}

/**
 * One stat column. The chip ("272 days") rides on the label row; every cell
 * reserves the same two helper lines so all baselines stay aligned.
 */
function StatCell({
  label,
  value,
  hint,
  chip,
}: {
  label: string
  value: string
  hint?: string
  chip?: boolean
}) {
  return (
    <div className="mm-stat">
      <span className="mm-stat__value">{value}</span>
      <span className="mm-stat__labelrow">
        <span className="mm-stat__label">{label}</span>
        {chip && hint ? <span className="mm-stat__chip">{hint}</span> : null}
      </span>
      <span className="mm-stat__hint">{chip ? '' : (hint ?? '')}</span>
    </div>
  )
}

export interface DashboardProps {
  stats: LifeStats
  lifeYears: number
  name: string
  dob: string
  notesByWeek: Map<number, Note>
  chapters: Chapter[]
  goals: Goal[]
  reduceMotion: boolean
  themeKey: string
  gentleMode: boolean
  quote: Quote
  zoom: ZoomLevel
  onZoomChange: (zoom: ZoomLevel) => void
  reviewDue: boolean
  /** Weeks ringed as search matches while the palette is open. */
  searchHighlight?: Set<number>
  onSelectWeek: (weekIndex: number) => void
  /** Year view: open a specific day's entry. */
  onOpenDay?: (date: string) => void
  /** Weekly roll-ups from the daily journal (days written, last date). */
  weekInfo?: Map<number, { days: number; lastDate: string }>
  /** Day metadata keyed by date for the year heat-map. */
  dayMeta?: Map<string, { mood?: number; words: number; title?: string; excerpt: string; goodThing?: string }>
  /** Writing streak (current, longest) from the daily journal. */
  streak?: { current: number; longest: number }
  onOpenChapters: () => void
  onOpenGoals: () => void
  onOpenInsights: () => void
  onOpenReview: () => void
  onOpenPeople: () => void
  /** People count for the chip; the chip itself hides in gentle mode. */
  peopleCount: number
  onOpenJournal: () => void
}

const ZOOM_LEVELS = ['life', 'decade', 'year'] as const

/** "Your life in weeks" hero card — the main dashboard view. */
export function Dashboard({
  stats,
  lifeYears,
  name,
  dob,
  notesByWeek,
  chapters,
  goals,
  reduceMotion,
  themeKey,
  gentleMode,
  quote,
  zoom,
  onZoomChange,
  reviewDue,
  searchHighlight,
  onSelectWeek,
  onOpenDay,
  weekInfo,
  dayMeta,
  streak,
  onOpenChapters,
  onOpenGoals,
  onOpenInsights,
  onOpenReview,
  onOpenPeople,
  peopleCount,
  onOpenJournal,
}: DashboardProps) {
  const percent = Math.round(stats.percent)

  // Pan state for the zoomed views, snapped to "now" whenever the user
  // switches levels so they always land on the present.
  const [decade, setDecade] = useState(() => decadeOf(stats.weeksLived))
  const [year, setYear] = useState(() => yearOf(stats.weeksLived))
  useEffect(() => {
    setDecade(decadeOf(stats.weeksLived))
    setYear(yearOf(stats.weeksLived))
  }, [zoom, stats.weeksLived])
  const view = useMemo(
    () => viewLayout(zoom, stats.totalRows, decade, year),
    [zoom, stats.totalRows, decade, year],
  )
  const dobDate = useMemo(() => parseISODate(dob), [dob])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(r)
  }, [])

  const [chartRef, chartSize] = useElementSize<HTMLDivElement>()

  // Action-row overflow: pills that no longer fit the row fold into the
  // "···" menu instead of wrapping or shrinking. Order of collapse (least
  // important first): people, insights, goals, journal. Chapters and Review stay.
  const actionsRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [moreOpen, setMoreOpen] = useState(false)

  // Content changes that can alter any pill's width.
  const actionsKey = `${chapters.length}|${goals.length}|${notesByWeek.size}|${peopleCount}|${reviewDue ? 1 : 0}|${gentleMode ? 1 : 0}`

  useLayoutEffect(() => {
    const row = actionsRef.current
    if (!row) return
    const KEBAB = 36
    const measure = () => {
      // Synchronous measure pass: forcing every data-key element visible
      // never paints (the browser only lays out when we read the widths).
      row.dataset.measure = 'on'
      const gap = parseFloat(window.getComputedStyle(row).columnGap) || 8
      const items = Array.from(row.querySelectorAll<HTMLElement>('[data-key]')).map((el) => ({
        key: el.dataset.key ?? '',
        w: el.getBoundingClientRect().width,
        collapsible: el.dataset.collapsible === 'true',
      }))
      delete row.dataset.measure
      return { gap, items }
    }
    const compute = () => {
      row.classList.remove('is-tight')
      let { gap, items } = measure()
      const pinned = items.filter((it) => !it.collapsible)
      const pinW = pinned.reduce((a, it) => a + it.w, 0)
      const totalFor = (hiddenKeys: string[], kebab: boolean) => {
        const kept = items.filter((it) => !hiddenKeys.includes(it.key))
        const n = kept.length + (kebab ? 1 : 0)
        return (
          kept.reduce((a, it) => a + it.w, 0) + (kebab ? KEBAB : 0) + Math.max(0, n - 1) * gap
        )
      }
      const avail = row.clientWidth
      if (avail <= 0) return
      const hideOrder = ['people', 'insights', 'goals', 'journal'].filter((k) =>
        items.some((it) => it.key === k),
      )
      let nextHidden: string[] = []
      if (pinW > avail) {
        // Even the pinned pills cannot fit — drop the pill icons as the last
        // resort and let overflow:hidden clip whatever remains.
        row.classList.add('is-tight')
        ;({ gap, items } = measure())
        const pin2 = items.filter((it) => !it.collapsible).reduce((a, it) => a + it.w, 0)
        if (pin2 > avail) {
          setCollapsed(hideOrder)
          return
        }
      }
      if (totalFor(nextHidden, false) > avail) {
        for (const key of hideOrder) {
          nextHidden.push(key)
          if (totalFor(nextHidden, true) <= avail) break
        }
      }
      if (nextHidden.length === 0) setMoreOpen(false)
      setCollapsed((prev) =>
        prev.length === nextHidden.length && prev.every((k) => nextHidden.includes(k))
          ? prev
          : nextHidden,
      )
    }
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    compute()
    const ro = new ResizeObserver(schedule)
    ro.observe(row)
    document.fonts?.ready.then(schedule)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [actionsKey, gentleMode])

  // Close the "···" menu on outside clicks or Escape.
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.mm-more')) setMoreOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const birthdayHint =
    stats.daysToBirthday === 0
      ? 'Today!'
      : `${stats.daysToBirthday} day${stats.daysToBirthday === 1 ? '' : 's'}`

  // Arrow-key navigation for the segmented zoom control.
  const onZoomKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const idx = ZOOM_LEVELS.indexOf(zoom)
    const next =
      ZOOM_LEVELS[(idx + (e.key === 'ArrowRight' ? 1 : ZOOM_LEVELS.length - 1)) % ZOOM_LEVELS.length]
    onZoomChange(next)
  }

  const yearsAhead = Math.max(lifeYears - stats.ageYears, 0)

  return (
    <>
      <main className="mm-main">
        {/* 1. Headline row: serif headline + segmented zoom control */}
        <div className="mm-headrow">
          <h1 className="mm-headline">
            <span className="mm-headline__num">{stats.ageYears}</span>
            <span className="mm-headline__word">years lived</span>
            <span className="mm-headline__sep" aria-hidden="true">
              ·
            </span>
            <span className="mm-headline__num">{yearsAhead}</span>
            <span className="mm-headline__word">years ahead</span>
          </h1>

          <div className="mm-zoombar">
            <div
              className="mm-seg"
              role="group"
              aria-label="Zoom level"
              onKeyDown={onZoomKeyDown}
            >
              <span
                className="mm-seg__pill"
                aria-hidden="true"
                style={{ transform: `translateX(${ZOOM_LEVELS.indexOf(zoom) * 100}%)` }}
              />
              {ZOOM_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={level === zoom ? 'active' : undefined}
                  aria-pressed={level === zoom}
                  onClick={() => onZoomChange(level)}
                >
                  {level === 'life' ? 'Life' : level === 'decade' ? 'Decade' : 'Year'}
                </button>
              ))}
            </div>
            {zoom !== 'life' && (
              <div className="mm-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={zoom === 'decade' ? 'Previous decade' : 'Previous year'}
                  disabled={zoom === 'decade' ? decade === 0 : year === 0}
                  onClick={() =>
                    zoom === 'decade'
                      ? setDecade((d) => clampDecade(d - 1, stats.totalRows))
                      : setYear((y) => clampYear(y - 1, stats.totalRows))
                  }
                >
                  ‹
                </button>
                <span className="mm-stepper-label" aria-live="polite">
                  {zoom === 'decade'
                    ? `Ages ${Math.floor(view.weekOffset / 52)}–${Math.floor(view.weekOffset / 52) + view.rows - 1}`
                    : `Age ${Math.floor(view.weekOffset / 52)}`}
                </span>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={zoom === 'decade' ? 'Next decade' : 'Next year'}
                  onClick={() =>
                    zoom === 'decade'
                      ? setDecade((d) => clampDecade(d + 1, stats.totalRows))
                      : setYear((y) => clampYear(y + 1, stats.totalRows))
                  }
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Progress: hairline track, coral fill, glowing end dot */}
        {!gentleMode && (
          <div className="mm-progress">
            <div
              className="mm-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <i style={{ width: mounted ? `${stats.percent}%` : '0%' }} />
            </div>
            <span className="mm-pct">
              {percent}
              <span className="mm-pct__sym">%</span>
            </span>
          </div>
        )}

        {/* 3. Hero card: photo + frosted week grid */}
        <figure className="mm-hero">
          <img
            className="mm-hero__photo"
            src={sceneUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <div className="mm-hero__panel">
            <div className="mm-chart" ref={chartRef}>
              <WeekCanvas
                rows={view.rows}
                cols={view.cols}
                weekOffset={view.weekOffset}
                weeksLived={stats.weeksLived}
                baseWeeks={stats.baseWeeks}
                availableHeight={chartSize.height}
                notesByWeek={notesByWeek}
                weekInfo={weekInfo}
                dayMeta={dayMeta}
                chapters={chapters}
                goals={goals}
                dob={dobDate}
                yearView={zoom === 'year'}
                lifeView={zoom === 'life'}
                reduceMotion={reduceMotion}
                themeKey={themeKey}
                highlight={searchHighlight}
                onSelect={onSelectWeek}
                onOpenDay={onOpenDay}
              />
            </div>
          </div>
        </figure>

        {/* 4. Legend */}
        <div className="mm-legend">
          <span>
            <i style={{ background: 'var(--lived)' }} />
            Lived
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            This week
          </span>
          <span>
            <i style={{ background: 'var(--ahead)' }} />
            Ahead
          </span>
          <span>
            <i className="sm" style={{ background: 'var(--accent)' }} />
            Has note
          </span>
          {goals.length > 0 && (
            <>
              <span>
                <i className="mm-legend-ring" style={{ borderColor: 'var(--accent2)' }} />
                Goal
              </span>
              <span>
                <i className="mm-legend-diamond" style={{ borderColor: 'var(--accent2)' }} />
                Done
              </span>
            </>
          )}
        </div>

        {/* 5. Quiet action pills. When the row runs out of room the least
            important pills (goals / insights / people) fold into a "···"
            menu instead of wrapping or shrinking — see the overflow effect. */}
        <div
          className={`mm-actions${collapsed.length > 0 ? ' mm-has-more' : ''}${
            moreOpen ? ' is-open-menu' : ''
          }`}
          ref={actionsRef}
        >
          {chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              className="mm-pill"
              data-key={`chapter-${c.id}`}
              onClick={onOpenChapters}
              aria-label={`Chapter ${c.name}: open the chapters editor`}
              title={`${c.name}`}
            >
              <i style={{ background: `var(--ch-${c.color})` }} />
              {c.name}
            </button>
          ))}
          {chapters.length === 0 ? (
            <button
              type="button"
              className="mm-pill mm-pill--add"
              data-key="chapter-edit"
              onClick={onOpenChapters}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Name a chapter
            </button>
          ) : (
            <button
              type="button"
              className="mm-pill mm-pill--add"
              data-key="chapter-edit"
              onClick={onOpenChapters}
              aria-label="Edit chapters"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 13.5l.5-2.5 7.8-7.8a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L5.5 13l-2.5.5z" />
              </svg>
              Edit chapters
            </button>
          )}
          <button
            type="button"
            data-key="journal"
            data-collapsible="true"
            className={collapsed.includes('journal') ? 'mm-pill mm-pill--add mm-pill--off' : 'mm-pill mm-pill--add'}
            onClick={onOpenJournal}
            aria-label="Your journal — read every note"
            title="Your journal (J)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 3.2c1.8-.9 3.9-.9 6-.2v10c-2.1-.7-4.2-.7-6 .2V3.2zM14 3.2c-1.8-.9-3.9-.9-6-.2v10c2.1-.7 4.2-.7 6 .2V3.2z" />
            </svg>
            {(dayMeta?.size ?? 0) === 0 && notesByWeek.size === 0 ? <>Journal</> : <>Journal · {(dayMeta?.size ?? notesByWeek.size).toLocaleString()}</>}
          </button>
          <button
            type="button"
            data-key="goals"
            data-collapsible="true"
            className={collapsed.includes('goals') ? 'mm-pill mm-pill--add mm-pill--off' : 'mm-pill mm-pill--add'}
            onClick={onOpenGoals}
            aria-label="Goals and milestones"
          >
            {goals.length === 0 ? (
              <>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Set a goal
              </>
            ) : (
              <>Goals · {pendingGoals(goals).length} ahead</>
            )}
          </button>
          <button
            type="button"
            data-key="insights"
            data-collapsible="true"
            className={collapsed.includes('insights') ? 'mm-pill mm-pill--add mm-pill--off' : 'mm-pill mm-pill--add'}
            onClick={onOpenInsights}
            aria-label="Insights about your notes"
          >
            {notesByWeek.size === 0 ? (
              <>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Insights
              </>
            ) : (
              <>Insights · {notesByWeek.size}</>
            )}
          </button>
          {!gentleMode ? (
            <button
              type="button"
              data-key="people"
              data-collapsible="true"
              className={collapsed.includes('people') ? 'mm-pill mm-pill--add mm-pill--off' : 'mm-pill mm-pill--add'}
              onClick={onOpenPeople}
              aria-label="People and shared time"
            >
              {peopleCount === 0 ? (
                <>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  People
                </>
              ) : (
                <>People · {peopleCount}</>
              )}
            </button>
          ) : null}
          <div className="mm-more">
            <button
              type="button"
              className="mm-more__btn"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More actions"
              onClick={() => setMoreOpen((o) => !o)}
            >
              ···
            </button>
            {moreOpen && (
              <div className="mm-more__menu" role="menu" aria-label="More actions">
                {collapsed
                  .filter((k) => k === 'goals' || k === 'insights' || k === 'journal' || (k === 'people' && !gentleMode))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      className="mm-menu-item"
                      onClick={() => {
                        setMoreOpen(false)
                        if (k === 'goals') onOpenGoals()
                        else if (k === 'insights') onOpenInsights()
                        else if (k === 'journal') onOpenJournal()
                        else onOpenPeople()
                      }}
                    >
                      {k === 'goals'
                        ? goals.length === 0
                          ? 'Set a goal'
                          : `Goals · ${pendingGoals(goals).length} ahead`
                        : k === 'insights'
                          ? notesByWeek.size === 0
                            ? 'Insights'
                            : `Insights · ${notesByWeek.size}`
                          : k === 'journal'
                            ? (dayMeta?.size ?? 0) === 0 && notesByWeek.size === 0
                              ? 'Journal'
                              : `Journal · ${(dayMeta?.size ?? notesByWeek.size).toLocaleString()}`
                            : peopleCount === 0
                              ? 'People'
                              : `People · ${peopleCount}`}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`mm-pill mm-pill--review${reviewDue ? ' mm-pill--due' : ''}`}
            data-key="review"
            onClick={onOpenReview}
            aria-label="Weekly review ritual"
            aria-current={reviewDue ? 'true' : undefined}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9M2.5 8V5M2.5 8h3" />
            </svg>
            {reviewDue ? 'Review · ready' : 'Review'}
          </button>
        </div>

        {/* 6. Stats: six aligned columns with hairline dividers */}
        <div className="mm-stats">
          <StatCell label="Years lived" value={stats.ageYears.toLocaleString()} />
          <StatCell label="Weeks lived" value={stats.weeksLived.toLocaleString()} />
          <StatCell label="Days lived" value={stats.daysLived.toLocaleString()} />
          <StatCell
            label="Streak"
            value={
              streak && streak.current > 0
                ? `${streak.current.toLocaleString()} days`
                : '—'
            }
            hint={streak && streak.longest > 0 ? `best ${streak.longest.toLocaleString()}` : undefined}
          />
          {!gentleMode && (
            <StatCell label="Weeks left" value={stats.weeksLeft.toLocaleString()} hint="estimated" />
          )}
          <StatCell
            label="NEXT B-DAY"
            value={compactDate(stats.nextBirthday, true)}
            hint={birthdayHint}
            chip
          />
        </div>

        {/* 7. Primary action + footer */}
        <button
          type="button"
          className="btn btn--primary mm-cta"
          onClick={() =>
            onOpenDay ? onOpenDay(dateKey(new Date())) : onSelectWeek(stats.weeksLived)
          }
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 13.5l.5-2.5 7.8-7.8a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L5.5 13l-2.5.5z" />
          </svg>
          {stats.isBonus ? 'Write today\u2019s entry' : 'Make today count \u2014 write it down'}
        </button>

        <p className="mm-caption">
          <span>{name ? `${name} · born ${compactDate(dob)} · ${lifeYears}-year estimate` : `${compactDate(dob)} · ${lifeYears}-year estimate`}</span>
          <span className="mm-caption__keys" aria-hidden="true">
            <kbd>N</kbd> note
            <kbd>Z</kbd> zoom
          </span>
          <span className="mm-sr">
            Press N for this week&apos;s note, Z to zoom.
          </span>
        </p>
      </main>

      <MomentPanel quote={quote} />
    </>
  )
}
