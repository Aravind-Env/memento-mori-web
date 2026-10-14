import { useEffect, useState } from 'react'

import type { Quote } from '../../domain/quotes'
import { formatDate } from '../../domain/dates'
import { useElementSize } from '../../shared/hooks'
import { LandscapeScene } from './LandscapeScene'
import { WeekCanvas } from './WeekCanvas'
import type { Note } from '../../data/model'
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
  reduceMotion: boolean
  themeKey: string
  gentleMode: boolean
  quote: Quote
  onSelectWeek: (weekIndex: number) => void
}

/** "Your life in weeks" hero card — the main dashboard view. */
export function Dashboard({
  stats,
  lifeYears,
  name,
  dob,
  notesByWeek,
  reduceMotion,
  themeKey,
  gentleMode,
  quote,
  onSelectWeek,
}: DashboardProps) {
  const percent = Math.round(stats.percent)

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
            rows={stats.totalRows}
            weeksLived={stats.weeksLived}
            baseWeeks={stats.baseWeeks}
            availableHeight={chartSize.height}
            notesByWeek={notesByWeek}
            reduceMotion={reduceMotion}
            themeKey={themeKey}
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
        </div>

        <div className="mm-stats">
          <StatCell label="Years lived" value={stats.ageYears.toLocaleString()} />
          <StatCell label="Months lived" value={stats.monthsLived.toLocaleString()} />
          <StatCell label="Weeks lived" value={stats.weeksLived.toLocaleString()} />
          <StatCell label="Days lived" value={stats.daysLived.toLocaleString()} />
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
          this week&apos;s note
        </p>
      </section>

      <MomentPanel quote={quote} />
    </main>
  )
}
