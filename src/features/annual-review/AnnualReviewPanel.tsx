import { useCallback, useMemo, useState } from 'react'

import './annualReview.css'
import { useStore } from '../../state/store'
import { generateAnnualSummary, type AnnualSummary } from '../../domain/annualReview'
import { repo } from '../../core/useJournal'

export interface AnnualReviewPanelProps {
  onClose: () => void
}

export function AnnualReviewPanel({ onClose }: AnnualReviewPanelProps) {
  const profile = useStore((s) => s.profile)
  const annualReviews = useStore((s) => s.annualReviews)
  const goals = useStore((s) => s.goals)
  const chapters = useStore((s) => s.chapters)
  const saveAnnualReview = useStore((s) => s.saveAnnualReview)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [reflection, setReflection] = useState('')
  const [summary, setSummary] = useState<AnnualSummary | null>(null)
  const [savedYears, setSavedYears] = useState<number[]>([])

  const entries = repo
    .liveDates()
    .map((d) => repo.getMeta(d))
    .filter((m): m is import('../../core/journal').EntryMeta => Boolean(m))

  useMemo(() => {
    if (!profile) return
    const s = generateAnnualSummary(year, entries, chapters || [], goals || [], new Date(profile.dob))
    setSummary(s)

    const saved = annualReviews
      .filter((r) => r.profileId === profile.id)
      .map((r) => r.year)
    setSavedYears(saved)

    const existing = annualReviews.find((r) => r.profileId === profile.id && r.year === year)
    setReflection(existing?.reflection ?? '')
  }, [year, entries, chapters, goals, profile, annualReviews])

  const saveReview = useCallback(() => {
    if (!profile) return
    saveAnnualReview(year, reflection.trim())
  }, [profile, year, reflection, saveAnnualReview])

  const isSaved = savedYears.includes(year)

  if (!profile || !summary) return null

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer drawer-annual-review"
        role="dialog"
        aria-modal="true"
        aria-label="Annual Life Review"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Annual Life Review</p>
            <h2 className="drawer__title">{summary.year}</h2>
          </div>
          <div className="drawer__year-nav">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setYear((y) => y - 1)}
              disabled={summary.year <= 1900}
              aria-label="Previous year"
            >
              ‹
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close review" data-qa="annual-review-close">✕</button>
        </header>

        <div className="drawer-body" data-qa="annual-review-body">
          {/* Stats */}
          <section className="review__stats">
            <div className="review__stat">
              <div className="review__stat__value">{summary.totalEntries}</div>
              <div className="review__stat__label">entries</div>
            </div>
            <div className="review__stat">
              <div className="review__stat__value">{summary.totalWords}</div>
              <div className="review__stat__label">words written</div>
            </div>
            <div className="review__stat">
              <div className="review__stat__value">
                {summary.averageMood > 0 ? summary.averageMood.toFixed(1) : '—'}
              </div>
              <div className="review__stat__label">average mood</div>
            </div>
            <div className="review__stat">
              <div className="review__stat__value">{summary.completedGoals.length}</div>
              <div className="review__stat__label">goals completed</div>
            </div>
          </section>

          {/* Completed goals */}
          {summary.completedGoals.length > 0 && (
            <section className="review__section">
              <h3 className="review__heading">Completed goals</h3>
              <ul className="review__list">
                {summary.completedGoals.map((g) => (
                  <li key={g.id} className="review__list__item">
                    {g.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Active chapters */}
          {summary.activeChapters.length > 0 && (
            <section className="review__section">
              <h3 className="review__heading">Life chapters this year</h3>
              <ul className="review__list">
                {summary.activeChapters.map((c) => (
                  <li key={c.id} className="review__list__item">
                    {c.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Mood distribution */}
          <section className="review__section">
            <h3 className="review__heading">Mood distribution</h3>
            <div className="review__mood-grid">
              {Object.entries(summary.moodDistribution).map(([mood, count]) => {
                const labels = ['', 'Awful', 'Low', 'Okay', 'Good', 'Great']
                const label = labels[Number(mood)]
                if (!label || count === 0) return null
                const max = Math.max(...Object.values(summary.moodDistribution))
                const width = max > 0 ? (count / max) * 100 : 0
                return (
                  <div key={mood} className="review__mood-bar">
                    <span className="review__mood__label">{label}</span>
                    <div className="review__mood__track">
                      <div
                        className="review__mood__fill"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="review__mood__count">{count}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Top tags */}
          {summary.topTags.length > 0 && (
            <section className="review__section">
              <h3 className="review__heading">Frequent tags</h3>
              <div className="review__tags">
                {summary.topTags.map(([tag, count]) => (
                  <span key={tag} className="review__tag">
                    #{tag} <span className="review__tag__count">({count})</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Reflection */}
          <section className="review__section review__section--reflection">
            <h3 className="review__heading">Your reflection</h3>
            <textarea
              className="review__reflection"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What mattered most this year? What would you like to remember?"
              rows={6}
            />
            <div className="review__actions">
              <button
                type="button"
                className="btn"
                onClick={saveReview}
                disabled={!reflection.trim()}
              >
                {isSaved ? 'Update review' : 'Save review'}
              </button>
              {isSaved && <span className="review__saved">Saved</span>}
            </div>
          </section>

          {/* Past reviews */}
          {savedYears.length > 1 && (
            <section className="review__section">
              <h3 className="review__heading">Previous reviews</h3>
              <div className="review__year-list">
                {savedYears
                  .filter((y) => y !== year)
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <button
                      key={y}
                      type="button"
                      className="review__year-btn"
                      onClick={() => setYear(y)}
                    >
                      {y}
                    </button>
                  ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
