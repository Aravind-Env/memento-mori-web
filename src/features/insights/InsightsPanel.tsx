import { useMemo } from 'react'

import type { Note } from '../../data/model'
import {
  busiestYears,
  insightSummary,
  moodHeatRows,
  topTags,
} from '../../domain/insights'
import './insights.css'

export interface InsightsPanelProps {
  notes: Note[]
  /** Absolute index of the current week — the coverage denominator. */
  weeksLived: number
  onClose: () => void
}

function moodColor(mood: number): string {
  return `var(--mood${Math.min(Math.max(Math.round(mood), 1), 5)})`
}

/**
 * A read-only summary of weekly notes: mood rhythm by year, recurring tags
 * and the busiest chapters of life. No editor here — this panel only reflects
 * what is already on the grid.
 */
export function InsightsPanel({ notes, weeksLived, onClose }: InsightsPanelProps) {
  const summary = useMemo(() => insightSummary(notes), [notes])
  const rows = useMemo(() => moodHeatRows(notes), [notes])
  const tags = useMemo(() => topTags(notes), [notes])
  const busy = useMemo(() => busiestYears(notes), [notes])

  const busiestMax = busy[0]?.count ?? 0
  const coverage =
    summary.totalNotes > 0 && weeksLived > 0
      ? Math.min(Math.round((summary.totalNotes / weeksLived) * 100), 100)
      : 0

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Insights about your notes"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Insights</p>
            <h2 className="drawer__title">Patterns from your notes</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close insights">
            ×
          </button>
        </header>

        {summary.totalNotes === 0 ? (
          <p className="insights__empty">
            Nothing to read yet. As weekly notes gather, your rhythm will surface here — quietest
            seasons, recurring themes, moods over the years.
          </p>
        ) : (
          <>
            <ul className="insights__stats">
              <li>
                <strong>{summary.totalNotes.toLocaleString()}</strong> notes
              </li>
              <li>
                <strong>{coverage}%</strong> of weeks lived
              </li>
              <li>
                <strong>{summary.withMood.toLocaleString()}</strong> with mood
              </li>
            </ul>

            {rows.length > 0 && (
              <section aria-label="Mood heatmap by year">
                <h3 className="insights__heading">Mood by year</h3>
                <ul className="insights__heat">
                  {rows.map((row) => (
                    <li key={row.ageYears} className="insights__heat-row">
                      <span className="insights__heat-age">Age {row.ageYears}</span>
                      <div className="insights__heat-cells">
                        {row.cells.map((cell) => (
                          <i
                            key={cell.weekIndex}
                            title={
                              cell.mood
                                ? `Week ${cell.weekIndex.toLocaleString('en-US')} · age ${row.ageYears} · mood ${cell.mood}`
                                : cell.noted
                                  ? `Week ${cell.weekIndex.toLocaleString('en-US')} · age ${row.ageYears} · noted`
                                  : undefined
                            }
                            style={{
                              background: cell.mood
                                ? moodColor(cell.mood)
                                : cell.noted
                                  ? 'var(--track)'
                                  : undefined,
                            }}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="insights__scale" aria-hidden="true">
                  <i style={{ background: 'var(--track)' }} /> noted&nbsp;&nbsp;
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

            {busy.length > 0 && (
              <section aria-label="Years with the most notes">
                <h3 className="insights__heading">Busiest years</h3>
                <ul className="insights__busy">
                  {busy.map(({ ageYears, count }) => (
                    <li key={ageYears}>
                      <span className="insights__busy-age">Age {ageYears}</span>
                      <i
                        style={{
                          width: busiestMax > 0 ? `${Math.round((count / busiestMax) * 100)}%` : 0,
                        }}
                      />
                      <span className="insights__busy-count">
                        {count} note{count === 1 ? '' : 's'}
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
