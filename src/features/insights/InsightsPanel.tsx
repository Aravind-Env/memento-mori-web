import { useMemo } from 'react'

import { useJournal } from '../../core/useJournal'
import './insights.css'

export interface InsightsPanelProps {
  /** Weeks lived — used for the coverage figure. */
  weeksLived: number
  onClose: () => void
}

interface DayPoint {
  date: string
  mood?: number
  words: number
  tags: string[]
}

const moodColor = (m: number): string => `var(--mood${m})`

/**
 * Patterns from your journal, computed from METADATA only — no entry bodies
 * are loaded. Mood rhythm by month of the last year, recurring tags, busiest
 * months.
 */
export function InsightsPanel({ weeksLived, onClose }: InsightsPanelProps) {
  const { repo, version } = useJournal()

  const points = useMemo(() => {
    void version
    const out: DayPoint[] = []
    for (const date of repo.liveDates()) {
      const m = repo.getMeta(date)
      if (m) out.push({ date, mood: m.mood, words: m.words, tags: m.tags })
    }
    return out
  }, [version, repo])

  const stats = useMemo(() => {
    const withMood = points.filter((p) => p.mood !== undefined).length
    const words = points.reduce((a, p) => a + p.words, 0)
    const avg = withMood > 0 ? points.reduce((a, p) => a + (p.mood ?? 0), 0) / withMood : undefined
    return { total: points.length, withMood, words, avg }
  }, [points])

  // Last 12 months: bucket key 'YYYY-MM' → {days, moodSum}.
  const months = useMemo(() => {
    const map = new Map<string, { days: number; moodSum: number; moods: number; words: number }>()
    const now = new Date()
    for (const p of points) {
      const key = p.date.slice(0, 7)
      let cur = map.get(key)
      if (!cur) {
        cur = { days: 0, moodSum: 0, moods: 0, words: 0 }
        map.set(key, cur)
      }
      cur.days++
      if (p.mood) {
        cur.moodSum += p.mood
        cur.moods++
      }
      cur.words += p.words
    }
    void now
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 12)
      .map(([key, v]) => ({
        key,
        label: new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1).toLocaleDateString(
          'en-US',
          { month: 'short', year: '2-digit' },
        ),
        avgMood: v.moods > 0 ? v.moodSum / v.moods : undefined,
        days: v.days,
        words: v.words,
      }))
  }, [points])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of points) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [points])

  const busiest = useMemo(() => {
    const max = Math.max(...months.map((m) => m.days), 1)
    return months.map((m) => ({ ...m, width: Math.round((m.days / max) * 100) }))
  }, [months])

  const coverage = weeksLived > 0 ? Math.min(Math.round((stats.total / (weeksLived * 7)) * 100), 100) : 0

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer drawer--journal"
        role="dialog"
        aria-modal="true"
        aria-label="Insights about your journal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Insights</p>
            <h2 className="drawer__title">Patterns from your journal</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close insights">
            ×
          </button>
        </header>

        {stats.total === 0 ? (
          <p className="insights__empty">
            Nothing to read yet. As daily entries gather, your rhythm will surface here —
            quiet seasons, recurring themes, moods over the months.
          </p>
        ) : (
          <>
            <ul className="insights__stats">
              <li>
                <strong>{stats.total.toLocaleString()}</strong> entries
              </li>
              <li>
                <strong>{coverage}%</strong> of days lived
              </li>
              <li>
                <strong>{stats.withMood.toLocaleString()}</strong> with mood
              </li>
              <li>
                <strong>{stats.words.toLocaleString()}</strong> words
              </li>
            </ul>

            {months.length > 0 && (
              <section aria-label="Mood rhythm by month">
                <h3 className="insights__heading">Mood by month</h3>
                <ul className="insights__heat">
                  {months.map((m) => (
                    <li key={m.key} className="insights__heat-row">
                      <span className="insights__heat-age">{m.label}</span>
                      <div className="insights__heat-cells">
                        <i
                          title={m.avgMood ? `${m.days} entries · avg mood ${m.avgMood.toFixed(1)}` : `${m.days} entries · no mood recorded`}
                          style={{
                            background:
                              m.avgMood !== undefined ? moodColor(Math.round(m.avgMood)) : 'var(--track)',
                          }}
                        />
                      </div>
                      <span className="insights__busy-count">
                        {m.days} d · {m.words.toLocaleString()} w
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="insights__scale" aria-hidden="true">
                  <i style={{ background: 'var(--track)' }} /> no mood&nbsp;&nbsp;
                  <i style={{ background: moodColor(1) }} />
                  <i style={{ background: moodColor(2) }} />
                  <i style={{ background: moodColor(3) }} />
                  <i style={{ background: moodColor(4) }} />
                  <i style={{ background: moodColor(5) }} /> mood 1 → 5
                </p>
              </section>
            )}

            {tags.length > 0 && (
              <section aria-label="Most used tags">
                <h3 className="insights__heading">Top tags</h3>
                <ul className="insights__tags">
                  {tags.map(({ tag, count }) => (
                    <li key={tag}>
                      {tag} <em>{count.toLocaleString()}</em>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {busiest.length > 0 && (
              <section aria-label="Months with the most entries">
                <h3 className="insights__heading">Busiest months</h3>
                <ul className="insights__busy">
                  {busiest.map((m) => (
                    <li key={m.key}>
                      <span className="insights__busy-age">{m.label}</span>
                      <i style={{ width: `${m.width}%` }} />
                      <span className="insights__busy-count">
                        {m.days} days · avg mood {m.avgMood ? m.avgMood.toFixed(1) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
