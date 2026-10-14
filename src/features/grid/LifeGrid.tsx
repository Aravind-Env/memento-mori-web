import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Cell } from './Cell'
import { useElementSize } from '../../shared/hooks'
import { addDays, weekStart } from '../../domain/dates'
import { WEEKS_PER_YEAR } from '../../domain/dates'
import { cellState, weekAge, type LifeStats } from '../../domain/lifeMath'
import type { Note } from '../../data/model'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Height of the week-number header row (label height + its margin). */
const TOP_ROW_H = 16
const ROW_LABEL_W = 34

function fmt(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export interface LifeGridProps {
  dob: Date
  stats: LifeStats
  notesByWeek: Map<number, Note>
  selectedWeek: number | null
  reduceMotion: boolean
  onSelect: (weekIndex: number) => void
}

export function LifeGrid({
  dob,
  stats,
  notesByWeek,
  selectedWeek,
  reduceMotion,
  onSelect,
}: LifeGridProps) {
  const [scrollRef, { width, height }] = useElementSize<HTMLDivElement>()
  const gridRef = useRef<HTMLDivElement>(null)
  const shouldFocus = useRef(false)

  const [focusIndex, setFocusIndex] = useState(() => stats.weeksLived)

  const gap = width < 640 ? 1.5 : 2
  const cellSize = useMemo(() => {
    if (!width || !height) return 12
    const byWidth = (width - ROW_LABEL_W - gap * (WEEKS_PER_YEAR - 1)) / WEEKS_PER_YEAR
    const byHeight =
      (height - TOP_ROW_H - gap * (stats.totalRows - 1)) / stats.totalRows
    return Math.max(3, Math.min(16, Math.floor(Math.min(byWidth, byHeight))))
  }, [width, height, gap, stats.totalRows])

  const labels = useMemo(() => {
    const out: string[] = new Array(stats.totalCells)
    for (let i = 0; i < stats.totalCells; i++) {
      const start = weekStart(dob, i)
      const end = addDays(start, 6)
      out[i] = `Week ${i + 1}, ${fmt(start)} to ${fmt(end)}, age ${weekAge(i)}`
    }
    return out
  }, [dob, stats.totalCells])

  // Keep the focused cell within bounds if the lifespan shrinks.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, stats.totalCells - 1))
  }, [stats.totalCells])

  useEffect(() => {
    if (!shouldFocus.current) return
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)
    el?.focus()
    shouldFocus.current = false
  }, [focusIndex])

  const move = useCallback(
    (delta: number) => {
      shouldFocus.current = true
      setFocusIndex((i) => Math.max(0, Math.min(stats.totalCells - 1, i + delta)))
    },
    [stats.totalCells],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          move(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          move(-1)
          break
        case 'ArrowDown':
          e.preventDefault()
          move(WEEKS_PER_YEAR)
          break
        case 'ArrowUp':
          e.preventDefault()
          move(-WEEKS_PER_YEAR)
          break
        case 'Home':
          e.preventDefault()
          shouldFocus.current = true
          setFocusIndex(0)
          break
        case 'End':
          e.preventDefault()
          shouldFocus.current = true
          setFocusIndex(stats.totalCells - 1)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          onSelect(focusIndex)
          break
      }
    },
    [focusIndex, move, onSelect, stats.totalCells],
  )

  const onCellFocus = useCallback((index: number) => setFocusIndex(index), [])

  const quarterLabels = [0, 13, 26, 39]

  return (
    <div className={`life-grid${reduceMotion ? ' reduce-motion' : ''}`}>
      <div className="life-grid__aura" aria-hidden="true">
        <span className="life-grid__glow" />
        <GeometryBackdrop />
      </div>
      <div className="life-grid__scroll" ref={scrollRef}>
        <div className="life-grid__inner">
          <div className="life-grid__toprow" style={{ paddingLeft: ROW_LABEL_W }}>
            <div
              className="life-grid__collabels"
              style={{ gridTemplateColumns: `repeat(${WEEKS_PER_YEAR}, ${cellSize}px)`, gap }}
              aria-hidden="true"
            >
              {Array.from({ length: WEEKS_PER_YEAR }, (_, c) => (
                <span key={c}>{quarterLabels.includes(c) ? c + 1 : ''}</span>
              ))}
            </div>
          </div>

          <div className="life-grid__body">
            <div
              className="life-grid__rowlabels"
              style={{ gridTemplateRows: `repeat(${stats.totalRows}, ${cellSize}px)`, gap }}
              aria-hidden="true"
            >
              {Array.from({ length: stats.totalRows }, (_, r) => (
                <span key={r}>{r % 5 === 0 ? r : ''}</span>
              ))}
            </div>

            <div
              className="life-grid__cells"
              role="grid"
              ref={gridRef}
              aria-label="Your life in weeks"
              aria-rowcount={stats.totalRows}
              aria-colcount={WEEKS_PER_YEAR}
              style={{ gap }}
              onKeyDown={onKeyDown}
            >
              {Array.from({ length: stats.totalRows }, (_, row) => (
                <div
                  className="life-grid__row"
                  role="row"
                  key={row}
                  style={{
                    gridTemplateColumns: `repeat(${WEEKS_PER_YEAR}, ${cellSize}px)`,
                    gridTemplateRows: `${cellSize}px`,
                    gap,
                    animationDelay: `${Math.min(row, 45) * 22}ms`,
                  }}
                >
                  {Array.from({ length: WEEKS_PER_YEAR }, (_, col) => {
                    const index = row * WEEKS_PER_YEAR + col
                    const note = notesByWeek.get(index)
                    const state = cellState(index, stats)
                    const label = `${labels[index]}${note ? ', has note' : ''}`
                    return (
                      <Cell
                        key={index}
                        index={index}
                        state={state}
                        hasNote={!!note}
                        pinned={!!note?.pinned}
                        label={label}
                        focusable={index === focusIndex}
                        isSelected={selectedWeek === index}
                        onSelect={onSelect}
                        onFocus={onCellFocus}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ul className="life-grid__legend" aria-hidden="true">
        <li><span className="swatch swatch--lived" /> Lived</li>
        <li><span className="swatch swatch--current" /> This week</li>
        <li><span className="swatch swatch--future" /> Ahead</li>
        <li><span className="swatch swatch--note" /> Has note</li>
      </ul>
    </div>
  )
}

/** Sacred-geometry backdrop: slowly counter-rotating rings, polygons and spokes. */
function GeometryBackdrop() {
  const spokes = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180
    return (
      <line
        key={i}
        x1={200 + Math.cos(a) * 50}
        y1={200 + Math.sin(a) * 50}
        x2={200 + Math.cos(a) * 190}
        y2={200 + Math.sin(a) * 190}
      />
    )
  })

  return (
    <div className="life-grid__geometry-layer">
      <svg
        className="life-grid__geometry"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g className="geo geo--a">
          <circle cx="200" cy="200" r="190" />
          <circle cx="200" cy="200" r="142" />
          <circle cx="200" cy="200" r="94" />
          <circle cx="200" cy="200" r="50" />
          {spokes}
        </g>
        <g className="geo geo--b">
          <polygon points="200,20 356,290 44,290" />
          <polygon points="200,380 44,110 356,110" />
        </g>
        <g className="geo geo--c">
          <polygon points="200,58 322,200 200,342 78,200" />
          <rect x="112" y="112" width="176" height="176" />
        </g>
      </svg>

      <span className="geo-shape geo-shape--ring" />
      <span className="geo-shape geo-shape--tri" />
      <span className="geo-shape geo-shape--sq" />
      <span className="geo-shape geo-shape--ring geo-shape--sm" />
      <span className="geo-shape geo-shape--tri geo-shape--flip" />
    </div>
  )
}
