import { useEffect, useMemo, useState } from 'react'

import type { Chapter, Goal, Note } from '../../data/model'
import type { Quote } from '../../domain/quotes'
import { formatDate, parseISODate } from '../../domain/dates'
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
import { LandscapeScene } from './LandscapeScene'
import { WeekCanvas } from './WeekCanvas'
import type { LifeStats } from '../../domain/lifeMath'
import './dashboard.css'

/** The right-hand panel: a daily quote, mantra and the values worth living by. */
export function MomentPanel({ quote }: { quote: Quote }) {
  return (
    <aside className="mm-panel">
      <blockquote className="mm-quote">
        &ldquo;{quote.text}&rdquo;
        <cite>{quote.author}</cite>
      </blockquote>
      <p className="mm-mantra">One week at a time.</p>
      <hr />
      <div className="mm-values">
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
          </svg>
          Be present
        </div>
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z" />
          </svg>
          Focus on what you can control
        </div>
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 19l6.5-10 4 6 3-4 5.5 8z" />
          </svg>
          Appreciate the journey
        </div>
        <div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
          </svg>
          Make it meaningful
        </div>
      </div>
    </aside>
  )
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="mm-stat">
      <span className="mm-stat__value">{value}</span>
      <span className="mm-stat__label">{label}</span>
      {hint ? <span className="mm-stat__hint">{hint}</span> : null}
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
  onOpenChapters: () => void
  onOpenGoals: () => void
  onOpenInsights: () => void
  onOpenReview: () => void
  onOpenPeople: () => void
  /** People count for the chip; the chip itself hides in gentle mode. */
  peopleCount: number
}

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
  onOpenChapters,
  onOpenGoals,
  onOpenInsights,
  onOpenReview,
  onOpenPeople,
  peopleCount,
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

  const birthdayHint =
    stats.daysToBirthday === 0
      ? 'Today!'
      : `${stats.daysToBirthday} day${stats.daysToBirthday === 1 ? '' : 's'}`

  return (
    <main className="mm-card">
      <section className="mm-left">
        <p className="mm-eyebrow">Your life in weeks</p>

        <div className="mm-zoombar">
          <div className="segmented" role="group" aria-label="Zoom level">
            {(['life', 'decade', 'year'] as const).map((level) => (
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
            <span className="mm-pct">{percent}%</span>
          </div>
        )}

        <div className="mm-chart" ref={chartRef}>
          <LandscapeScene />
          <WeekCanvas
            rows={view.rows}
            cols={view.cols}
            weekOffset={view.weekOffset}
            weeksLived={stats.weeksLived}
            baseWeeks={stats.baseWeeks}
            availableHeight={chartSize.height}
            notesByWeek={notesByWeek}
            chapters={chapters}
            goals={goals}
            dob={dobDate}
            yearView={zoom === 'year'}
            reduceMotion={reduceMotion}
            themeKey={themeKey}
            highlight={searchHighlight}
            onSelect={onSelectWeek}
          />
        </div>

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

        <div className="mm-chapterbar">
          {chapters.map((c) => (
            <button
              key={c.id}
              type="button"
              className="mm-chchip"
              onClick={onOpenChapters}
              aria-label={`Chapter ${c.name}: open the chapters editor`}
              title={`${c.name}`}
            >
              <i style={{ background: `var(--ch-${c.color})` }} />
              {c.name}
            </button>
          ))}
          {chapters.length === 0 ? (
            <button type="button" className="mm-chadd" onClick={onOpenChapters}>
              + Name a chapter
            </button>
          ) : (
            <button type="button" className="mm-chadd" onClick={onOpenChapters} aria-label="Edit chapters">
              Edit chapters
            </button>
          )}
          <button
            type="button"
            className="mm-chadd"
            onClick={onOpenGoals}
            aria-label="Goals and milestones"
          >
            {goals.length === 0
              ? '+ Set a goal'
              : `Goals · ${pendingGoals(goals).length} ahead`}
          </button>
          <span className="mm-chbarsep" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="mm-chadd"
            onClick={onOpenInsights}
            aria-label="Insights about your notes"
          >
            {notesByWeek.size === 0 ? '+ Insights' : `Insights · ${notesByWeek.size}`}
          </button>
          {!gentleMode ? (
            <>
              <span className="mm-chbarsep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="mm-chadd"
                onClick={onOpenPeople}
                aria-label="People and shared time"
              >
                {peopleCount === 0 ? '+ People' : `People · ${peopleCount}`}
              </button>
            </>
          ) : null}
          <span className="mm-chbarsep" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className={`mm-chadd${reviewDue ? ' mm-chadd--due' : ''}`}
            onClick={onOpenReview}
            aria-label="Weekly review ritual"
            aria-current={reviewDue ? 'true' : undefined}
          >
            {reviewDue ? 'Weekly review · ready' : 'Review'}
          </button>
        </div>

        <div className={`mm-stats${gentleMode ? ' mm-stats--6' : ' mm-stats--7'}`}>
          <StatCell label="Years lived" value={stats.ageYears.toLocaleString()} />
          <StatCell label="Months lived" value={stats.monthsLived.toLocaleString()} />
          <StatCell label="Weeks lived" value={stats.weeksLived.toLocaleString()} />
          <StatCell label="Days lived" value={stats.daysLived.toLocaleString()} />
          <StatCell
            label="Goals"
            value={pendingGoals(goals).length.toLocaleString()}
            hint={
              goals.length === 0
                ? 'pin a milestone'
                : `${(goals.length - pendingGoals(goals).length).toLocaleString()} done`
            }
          />
          {!gentleMode && (
            <StatCell label="Weeks left" value={stats.weeksLeft.toLocaleString()} hint="estimated" />
          )}
          <StatCell label="Next birthday" value={formatDate(stats.nextBirthday)} hint={birthdayHint} />
        </div>

        <button
          type="button"
          className="btn btn--primary mm-cta"
          onClick={() => onSelectWeek(stats.weeksLived)}
        >
          {stats.isBonus ? 'Write this week\u2019s note' : 'Make this week count \u2014 write a note'}
        </button>

        <p className="mm-caption">
          {name ? `${name} · ` : ''}born {dob} · {lifeYears}-year estimate · Press <kbd>N</kbd> for
          this week&apos;s note, <kbd>Z</kbd> to zoom
        </p>
      </section>

      <MomentPanel quote={quote} />
    </main>
  )
}
