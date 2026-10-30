import { useCallback, useMemo, useState } from 'react'

import './timeline.css'
import { useJournal } from '../../core/useJournal'
import { buildTimeline, paginateTimeline, formatTimelineDate, type TimelineFilters } from '../../domain/timeline'
import { useStore } from '../../state/store'

export interface TimelinePanelProps {
  onClose: () => void
}

export function TimelinePanel({ onClose }: TimelinePanelProps) {
  const { repo, version } = useJournal()
  const profile = useStore((s) => s.profile)

  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<TimelineFilters>({})

  const entries = repo.liveDates().map((d) => repo.getMeta(d)).filter(Boolean) as import('../../core/journal').EntryMeta[]

  const allMonths = useMemo(() => buildTimeline(entries, filters), [entries, filters, version])
  const { months: pageMonths, totalMonths, totalEntries, hasMore } = useMemo(
    () => paginateTimeline(allMonths, page, 12),
    [allMonths, page],
  )

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of entries) {
      for (const t of e.tags ?? []) tags.add(t)
    }
    return Array.from(tags).sort()
  }, [entries])

  const allMoods = useMemo(() => {
    const moods = new Set<number>()
    for (const e of entries) {
      if (e.mood !== undefined && e.mood >= 1 && e.mood <= 5) moods.add(e.mood)
    }
    return Array.from(moods).sort()
  }, [entries])

  const toggleTagFilter = useCallback((tag: string) => {
    setFilters((f) => {
      const tags = f.tags ? new Set(f.tags) : new Set<string>()
      if (tags.has(tag)) tags.delete(tag)
      else tags.add(tag)
      return { ...f, tags: tags.size > 0 ? Array.from(tags) : undefined }
    })
    setPage(0)
  }, [])

  const toggleMoodFilter = useCallback((mood: number) => {
    setFilters((f) => {
      const moods = f.moods ? new Set(f.moods) : new Set<number>()
      if (moods.has(mood)) moods.delete(mood)
      else moods.add(mood)
      return { ...f, moods: moods.size > 0 ? Array.from(moods) : undefined }
    })
    setPage(0)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({})
    setPage(0)
  }, [])

  if (!profile) return null

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer drawer-timeline"
        role="dialog"
        aria-modal="true"
        aria-label="Life Timeline"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Life Timeline</p>
            <h2 className="drawer__title">Your memories in order</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close timeline" data-qa="timeline-close">✕</button>
        </header>

        <div className="drawer-body" data-qa="timeline-body">
          {/* Filters */}
          <section className="timeline__filters">
            <h3 className="timeline__filter-heading">Filter</h3>
            <div className="timeline__filter-group">
              <span className="timeline__filter-label">Tags:</span>
              {allTags.map((tag) => {
                const active = Boolean(filters.tags?.includes(tag))
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`timeline__filter-chip${active ? ' is-active' : ''}`}
                    onClick={() => toggleTagFilter(tag)}
                    aria-pressed={active}
                  >
                    #{tag}
                  </button>
                )
              })}
            </div>
            <div className="timeline__filter-group">
              <span className="timeline__filter-label">Mood:</span>
              {allMoods.map((mood) => {
                const active = Boolean(filters.moods?.includes(mood))
                const labels = ['', 'Awful', 'Low', 'Okay', 'Good', 'Great']
                return (
                  <button
                    key={mood}
                    type="button"
                    className={`timeline__filter-chip${active ? ' is-active' : ''}`}
                    onClick={() => toggleMoodFilter(mood)}
                    aria-pressed={active}
                  >
                    {labels[mood]}
                  </button>
                )
              })}
              {filters.tags || filters.moods ? (
                <button type="button" className="timeline__filter-chip timeline__filter-chip--clear" onClick={clearFilters}>
                  Clear
                </button>
              ) : null}
            </div>
          </section>

          {/* Stats */}
          <div className="timeline__stats">
            <span className="timeline__stat">{totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'}</span>
            <span className="timeline__stat">{totalMonths} month{totalMonths === 1 ? '' : 's'}</span>
          </div>

          {/* Timeline months */}
          <ul className="timeline__list" role="list">
            {pageMonths.map((month) => {
              const monthKey = `${month.year}-${String(month.month + 1).padStart(2, '0')}`
              return (
                <li key={monthKey} className="timeline__month">
                  <h4 className="timeline__month-label">
                    {month.monthLabel} {month.year}
                  </h4>
                  <ul className="timeline__entry-list" role="list">
                    {month.entries.map((entry) => {
                      const chapterName = entry.chapter ? entry.chapter.name : undefined
                      return (
                        <li key={entry.date} className="timeline__entry">
                          <time className="timeline__entry__date">{formatTimelineDate(entry.date)}</time>
                          <div className="timeline__entry__body">
                            {entry.title ? (
                              <strong className="timeline__entry__title">{entry.title}</strong>
                            ) : (
                              <span className="timeline__entry__excerpt">{entry.excerpt}</span>
                            )}
                            <div className="timeline__entry__meta">
                              {entry.mood !== undefined && (
                                <span className="timeline__entry__mood" aria-label={`Mood: ${['', 'Awful', 'Low', 'Okay', 'Good', 'Great'][entry.mood]}`}>
                                  ●
                                </span>
                              )}
                              {entry.tags.length > 0 && (
                                <span className="timeline__entry__tags">
                                  {entry.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                                </span>
                              )}
                              {chapterName && <span className="timeline__entry__chapter">{chapterName}</span>}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
            {hasMore && (
              <li className="timeline__load-more">
                <button type="button" className="btn" onClick={() => setPage((p) => p + 1)}>
                  Load more months
                </button>
              </li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  )
}
