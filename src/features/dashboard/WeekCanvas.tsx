import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import type { Chapter, Goal, Note } from '../../data/model'
import { chapterAt, chapterWindowSegments } from '../../domain/chapters'
import { weekStart } from '../../domain/dates'
import { getNextWeekIndex, formatWeekAriaLabel } from '../../domain/canvasNav'
import {
  captionText,
  computeGridGeometry,
  geometryDotCenter,
  geometryWeekAt,
  type GridGeometry,
} from '../../domain/gridLayout'

const PAD_L = 34
const PAD_T = 26
const PAD_R = 4
/** Caption strip reserved under the life plot ("60 years · 3,120 weeks"). */
const LIFE_COL_MARKS = [1, 13, 26, 39, 52]

interface PulseIndicator {
  x: number
  y: number
  clip?: { x: number; y: number; width: number; height: number; radius: number }
}

export interface WeekCanvasProps {
  /** Rendered rows in the current view (from `domain/zoom` layout). */
  rows: number
  /** Rendered columns: 52 in life/decade views, 13 in the year view. */
  cols: number
  /** Absolute week index of the top-left cell. */
  weekOffset: number
  /** 0-based index of the current week (absolute). */
  weeksLived: number
  /** Weeks in the expected lifespan (used to tint bonus weeks). */
  baseWeeks: number
  /** Height available for the whole chart, so the dots can shrink to fit. */
  availableHeight: number
  notesByWeek: Map<number, Note>
  weekInfo?: Map<number, { days: number; lastDate: string }>
  dayMeta?: Map<string, { mood?: number; words: number; title?: string; excerpt: string; goodThing?: string }>
  /** Profile-filtered life chapters, painted as coloured bands. */
  chapters: Chapter[]
  /** Profile-filtered goals, drawn as markers/brackets on their weeks. */
  goals: CanvasGoal[]
  /** Birth date, used for month labels in the year view. */
  dob: Date | null
  /** True when the view is zoomed (bigger dots, month labels). */
  yearView: boolean
  /** Whole-life view: the layout solver decides the geometry. */
  lifeView: boolean
  /** Estimated lifespan in years, for the caption. */
  lifeYears?: number
  reduceMotion: boolean
  /** Changes whenever the resolved theme changes, to force a redraw. */
  themeKey: string
  /** Weeks to ring as search matches (command palette open); optional. */
  highlight?: Set<number>
  /** Receives the absolute week index of the clicked cell. */
  onSelect: (weekIndex: number) => void
  /** Year view: opens a specific daily journal entry. */
  onOpenDay?: (date: string) => void
}

type CanvasGoal = Goal & { startWeek?: number; endWeek?: number }

interface Layout {
  padL: number
  padT: number
  cs: number
  rs: number
  /** Whole-life geometry; set only in the life view. */
  geometry?: GridGeometry
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Rounded-rect fallback for engines without Path2D.roundRect. */
function bandRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  const hasRoundRect = typeof (ctx as { roundRect?: unknown }).roundRect === 'function'
  if (hasRoundRect) (ctx as CanvasRenderingContext2D).roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.fill()
}

/** True when the goal's covered weeks include this one (range or legacy point). */
function goalTouches(goal: CanvasGoal, wi: number): boolean {
  const from = goal.startWeek ?? goal.weekIndex
  const to = goal.endWeek ?? goal.startWeek ?? goal.weekIndex
  return wi >= from && wi <= to
}

/** Batched dot fill: one Path2D per colour, one fill call each. */
class DotBuckets {
  private map = new Map<string, Path2D>()
  add(color: string, x: number, y: number, r: number): void {
    let p = this.map.get(color)
    if (!p) {
      p = new Path2D()
      this.map.set(color, p)
    }
    p.moveTo(x + r, y)
    p.arc(x, y, r, 0, 6.2832)
  }
  fill(ctx: CanvasRenderingContext2D): void {
    for (const [color, path] of this.map) {
      ctx.fillStyle = color
      ctx.fill(path)
    }
  }
}

/**
 * Canvas dot-grid of weeks in a life. Two renderers share the same hit-test
 * math: the whole-life view is solved by `domain/gridLayout` (classic row grid
 * or year blocks), while decade/year zooms are plain windows from `domain/zoom`.
 */
export function WeekCanvas({
  rows,
  cols,
  weekOffset,
  weeksLived,
  baseWeeks,
  availableHeight,
  notesByWeek,
  chapters,
  goals,
  dob,
  yearView,
  lifeView,
  lifeYears,
  reduceMotion,
  themeKey,
  highlight,
  onSelect,
}: WeekCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<Layout>({ padL: PAD_L, padT: PAD_T, cs: 0, rs: 0 })

  const [width, setWidth] = useState(0)
  const [fontsReady, setFontsReady] = useState(false)
  const [pulse, setPulse] = useState<PulseIndicator | null>(null)
  const [lifeGeometry, setLifeGeometry] = useState<GridGeometry | null>(null)
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  useEffect(() => {
    let active = true
    document.fonts?.ready.then(() => {
      if (active) setFontsReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv || !width) return

    const dpr = window.devicePixelRatio || 1
    const ctx = cv.getContext('2d')
    if (!ctx) return

    if (lifeView) {
      drawLife(ctx, cv, layoutRef, {
        width,
        rows,
        cols,
        weeksLived,
        baseWeeks,
        availableHeight,
        notesByWeek,
        chapters,
        goals,
        highlight,
        lifeYears,
        reduceMotion,
        focusedWeek,
        setPulse,
        setGeometry: setLifeGeometry,
      })
      return
    }
    setLifeGeometry(null)

    // Decade/year zoom: a flat window, one cell right on the old geometry.
    const rsRatio = yearView ? 0.8 : 0.66
    const rFactor = yearView ? 0.3 : 0.2
    const byWidth = (width - PAD_L - PAD_R) / cols
    const byHeight =
      availableHeight > 0 ? (availableHeight - PAD_T - 4) / (rows * rsRatio) : Number.POSITIVE_INFINITY
    const cs = Math.max(2, Math.min(byWidth, byHeight))
    const rs = cs * rsRatio
    const height = PAD_T + rows * rs + 4
    cv.width = Math.round(width * dpr)
    cv.height = Math.round(height * dpr)
    cv.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    layoutRef.current = { padL: PAD_L, padT: PAD_T, cs, rs, geometry: undefined }

    const lived = cssVar('--lived')
    const ahead = cssVar('--ahead')
    const accent = cssVar('--accent')
    const bonus = cssVar('--accent2')
    const muted = cssVar('--muted')
    const r = cs * rFactor
    const px = (j: number) => PAD_L + (j % cols) * cs + cs / 2
    const py = (j: number) => PAD_T + Math.floor(j / cols) * rs + rs / 2

    // Axis labels. Zoomed-out views show light quarter marks and age rows;
    // the year view labels each week's month instead.
    ctx.fillStyle = muted
    ctx.font = '12px Figtree, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if (yearView && dob) {
      let prevMonth = ''
      for (let j = 0; j < cols; j++) {
        const start = weekStart(dob, weekOffset + j)
        const month = start.toLocaleDateString('en-US', { month: 'short' })
        if (month !== prevMonth) {
          ctx.fillText(month, PAD_L + j * cs + cs / 2, 14)
          prevMonth = month
        }
      }
    } else {
      for (const m of LIFE_COL_MARKS) {
        if (m <= cols) ctx.fillText(String(m), PAD_L + (m - 1) * cs + cs / 2, 14)
      }
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    if (!yearView) {
      const yearBase = Math.floor(weekOffset / 52)
      const step = rows > 25 ? 5 : 1
      for (let y = 0; y < rows; y += step) {
        ctx.fillText(String(yearBase + y), PAD_L - 12, PAD_T + y * rs + rs / 2)
      }
    }

    // Current week relative to this window (may be outside of it).
    const cells = cols * rows
    const currentAbs = Math.min(Math.max(weeksLived, 0), weekOffset + cells - 1)
    const currentRel = weeksLived === currentAbs ? weeksLived - weekOffset : -1
    const inView = currentRel >= 0 && currentRel < cells

    // Glow streak through the current row (only when "now" is on screen).
    if (inView) {
      const cx = px(currentRel)
      const cy = py(currentRel)
      const g = ctx.createLinearGradient(PAD_L, 0, PAD_L + cols * cs, 0)
      const p = (cx - PAD_L) / (cols * cs)
      g.addColorStop(0, 'rgba(238,108,77,0)')
      g.addColorStop(Math.max(0, p - 0.25), 'rgba(238,108,77,.10)')
      g.addColorStop(p, 'rgba(238,108,77,.35)')
      g.addColorStop(Math.min(1, p + 0.35), 'rgba(238,108,77,.06)')
      g.addColorStop(1, 'rgba(238,108,77,0)')
      ctx.fillStyle = g
      ctx.fillRect(PAD_L, cy - rs * 1.3, cols * cs, rs * 2.6)
    }

    // Chapter bands behind the dots: one translucent rounded segment per row.
    const chapterColors = new Map<string, string>()
    for (const c of chapters) {
      if (!chapterColors.has(c.color)) {
        const v = cssVar(`--ch-${c.color}`)
        if (v) chapterColors.set(c.color, v)
      }
    }
    for (const chapter of chapters) {
      const color = chapterColors.get(chapter.color)
      if (!color) continue
      ctx.fillStyle = color
      for (const seg of chapterWindowSegments(chapter, cols, weekOffset, cells)) {
        const x = PAD_L + seg.startCol * cs
        const y = PAD_T + seg.row * rs
        const w = (seg.endCol - seg.startCol + 1) * cs
        if (w <= 0 || y + rs < 0) continue
        ctx.globalAlpha = 0.1
        bandRect(ctx, x, y, w, rs, Math.min(4, cs * 0.4))
      }
    }
    ctx.globalAlpha = 1

    // Per-cell chapter index (-1 = none), relative coordinates, one pass up
    // front so the dot loop below stays a single pass. Indexes are absolute.
    const chapterOf = new Int16Array(cells).fill(-1)
    for (let ci = 0; ci < chapters.length; ci++) {
      const c = chapters[ci]
      if (!chapterColors.has(c.color)) continue
      const from = Math.max(c.startWeek, weekOffset)
      const to = Math.min(c.endWeek, weekOffset + cells - 1)
      for (let wi = from; wi <= to; wi++) chapterOf[wi - weekOffset] = ci
    }

    // Dots.
    for (let j = 0; j < cells; j++) {
      const wi = weekOffset + j
      ctx.beginPath()
      if (j === currentRel) {
        ctx.fillStyle = accent
        ctx.arc(px(j), py(j), r * 1.9, 0, 6.2832)
        ctx.fill()
        continue
      }
      const chapterIdx = chapterOf[j]
      const chapterColor =
        chapterIdx >= 0 ? (chapterColors.get(chapters[chapterIdx].color) ?? null) : null
      if (notesByWeek.has(wi)) {
        // Notes and the current week keep the accent so they never blend in.
        ctx.fillStyle = accent
        ctx.arc(px(j), py(j), r * 1.4, 0, 6.2832)
        ctx.fill()
        continue
      }
      const base = wi < weeksLived ? (wi >= baseWeeks ? bonus : lived) : ahead
      if (chapterColor !== null && wi < weeksLived) {
        ctx.fillStyle = chapterColor
      } else {
        ctx.fillStyle = base
      }
      ctx.arc(px(j), py(j), r, 0, 6.2832)
      ctx.fill()
      // Future weeks inside a chapter get a soft wash so bands read on both
      // sides of "now" without shouting.
      if (chapterColor !== null && wi >= weeksLived) {
        ctx.beginPath()
        ctx.globalAlpha = 0.4
        ctx.fillStyle = chapterColor
        ctx.arc(px(j), py(j), r, 0, 6.2832)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // Goal markers on top of the dots: a soft ring while a goal is ahead,
    // a filled diamond once it is done, a thin bracket under its span.
    paintGoalMarkers(
      ctx,
      goals,
      weekOffset,
      cells,
      currentRel,
      r,
      cs,
      (j) => px(j),
      (j) => py(j),
    )

    // Search-match rings on top of everything: quiet outlines in the accent
    // colour that let the palette's findings point back at the grid.
    if (highlight && highlight.size > 0) {
      ctx.lineWidth = Math.max(1.4, cs * 0.14)
      for (const wi of highlight) {
        const j = wi - weekOffset
        if (j < 0 || j >= cells || j === currentRel) continue
        ctx.beginPath()
        ctx.strokeStyle = accent
        ctx.globalAlpha = 0.9
        ctx.arc(px(j), py(j), r * 1.7, 0, 6.2832)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    if (inView) {
      setPulse({ x: px(currentRel), y: py(currentRel) })
    } else {
      setPulse(null)
    }
  }, [
    width,
    rows,
    cols,
    weekOffset,
    weeksLived,
    baseWeeks,
    availableHeight,
    notesByWeek,
    chapters,
    goals,
    dob,
    yearView,
    lifeView,
    lifeYears,
    themeKey,
    highlight,
    fontsReady,
    reduceMotion,
  ])

  const indexAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const cv = canvasRef.current
      if (!cv) return null
      const b = cv.getBoundingClientRect()
      const L = layoutRef.current
      if (L.geometry) {
        return geometryWeekAt(L.geometry, clientX - b.left, clientY - b.top)
      }
      if (!L.cs || !L.rs) return null
      const col = Math.floor((clientX - b.left - L.padL) / L.cs)
      const row = Math.floor((clientY - b.top - L.padT) / L.rs)
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null
      return weekOffset + row * cols + col
    },
    [rows, cols, weekOffset],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current
      const wrap = wrapRef.current
      const wi = indexAt(e.clientX, e.clientY)
      if (wi == null || !cv || !wrap) {
        setTip(null)
        return
      }
      const b = cv.getBoundingClientRect()
      const chapter = chapterAt(chapters, wi)
      const goal = goals.find((g) => goalTouches(g, wi))
      const note = notesByWeek.get(wi)
      let text = `Week ${wi.toLocaleString('en-US')} · age ${Math.floor(wi / 52)}`
      if (chapter) text += ` · ${chapter.name}`
      if (goal) text += ` · ${goal.done ? '\u2713 ' : ''}goal: ${goal.text.trim().slice(0, 24) || 'goal'}`
      if (note) text += ` · ${note.text.trim().slice(0, 24) || 'has note'}`
      else if (wi === weeksLived) text += ' · this week'
      setTip({
        text,
        x: Math.min(e.clientX - b.left + 12, wrap.clientWidth - 170),
        y: e.clientY - b.top - 34,
      })
    },
    [indexAt, notesByWeek, weeksLived, chapters, goals],
  )

  const onPointerLeave = useCallback(() => setTip(null), [])

  const [focusedWeek, setFocusedWeek] = useState(weeksLived)
  const [announcement, setAnnouncement] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalCells = rows * cols + weekOffset
    const next = getNextWeekIndex(focusedWeek, e.key, totalCells, cols)
    if (next !== focusedWeek) {
      e.preventDefault()
      setFocusedWeek(next)
      const absoluteWeek = next + weekOffset
      const hasNote = notesByWeek.has(absoluteWeek)
      const chap = chapterAt(chapters, absoluteWeek)
      setAnnouncement(formatWeekAriaLabel(absoluteWeek, dob, null, hasNote, 0, chap?.name))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(focusedWeek + weekOffset)
    }
  }

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wi = indexAt(e.clientX, e.clientY)
      if (wi != null) onSelect(wi)
    },
    [indexAt, onSelect],
  )

  return (
    <div
      className="mm-grid"
      ref={wrapRef}
      tabIndex={0}
      role="region"
      aria-label="Life in weeks grid. Use arrow keys to navigate weeks, Enter or Space to open week."
      onKeyDown={handleKeyDown}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        {announcement}
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Grid of weeks in a life: lived weeks filled dark, future weeks light, this week highlighted${chapters.length > 0 ? ', coloured bands mark life chapters' : ''}`}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />
      {lifeGeometry?.rows.map((row, index) => lifeGeometry.labelsVisible[index] ? (
        <span
          key={row.index}
          className="mm-grid__age-label"
          style={{
            left: lifeGeometry.contentBox.x,
            top: row.centerY,
            width: lifeGeometry.gutterW - 12,
            fontSize: lifeGeometry.labelFontSize,
          }}
        >
          {row.label}
        </span>
      ) : null)}
      {lifeGeometry && lifeGeometry.captionBox.h > 0 && (
        <span
          className="mm-grid__caption"
          style={{
            left: lifeGeometry.captionBox.x,
            top: lifeGeometry.captionBox.y,
            width: lifeGeometry.captionBox.w,
            height: lifeGeometry.captionBox.h,
          }}
        >
          {lifeGeometry.caption}
        </span>
      )}
      {pulse && !reduceMotion && (() => {
        const clipped = pulse.clip
        const style = clipped
          ? {
              left: clipped.x,
              top: clipped.y,
              width: clipped.width,
              height: clipped.height,
              margin: 0,
              '--pulse-left': `${pulse.x - clipped.x - clipped.radius}px`,
              '--pulse-top': `${pulse.y - clipped.y - clipped.radius}px`,
              '--pulse-size': `${clipped.radius * 2}px`,
            }
          : { left: pulse.x, top: pulse.y, background: 'var(--accent)' }
        return <div className={clipped ? 'mm-pulse mm-pulse--clipped' : 'mm-pulse'} style={style as CSSProperties} />
      })()}
      <div
        className="mm-tip"
        style={{ left: tip?.x ?? 0, top: tip?.y ?? 0, opacity: tip ? 1 : 0 }}
      >
        {tip?.text}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Whole-life renderer — solver geometry                               */
/* ------------------------------------------------------------------ */

interface LifeDraw {
  width: number
  rows: number
  cols: number
  weeksLived: number
  baseWeeks: number
  availableHeight: number
  notesByWeek: Map<number, Note>
  chapters: Chapter[]
  goals: CanvasGoal[]
  highlight?: Set<number>
  lifeYears?: number
  reduceMotion: boolean
  focusedWeek: number
  setPulse: (p: PulseIndicator | null) => void
  setGeometry: (geometry: GridGeometry | null) => void
}

function drawLife(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  layoutRef: React.MutableRefObject<Layout>,
  p: LifeDraw,
): void {
  const dpr = window.devicePixelRatio || 1
  if (p.width <= 0 || p.availableHeight <= 0) return
  const total = p.rows * p.cols
  const years = Math.max(Math.ceil(total / p.cols), 1)
  const lifeYears = p.lifeYears ?? Math.floor(p.baseWeeks / p.cols)
  const caption = captionText(lifeYears, lifeYears * p.cols)
  ctx.font = '12px Figtree, system-ui, sans-serif'
  let geometry: GridGeometry
  try {
    geometry = computeGridGeometry({
      width: p.width,
      height: p.availableHeight,
      years,
      weeksPerYear: p.cols,
      minPitch: 5,
      maxPitch: 12,
      labelFont: { size: 12, measure: (text) => ctx.measureText(text).width },
      footerH: 20,
      padding: 16,
      caption,
    })
  } catch {
    layoutRef.current = { padL: 0, padT: 0, cs: 0, rs: 0, geometry: undefined }
    p.setGeometry(null)
    p.setPulse(null)
    return
  }
  const height = p.availableHeight
  cv.width = Math.round(p.width * dpr)
  cv.height = Math.round(height * dpr)
  cv.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, p.width, height)
  layoutRef.current = { padL: 0, padT: 0, cs: 0, rs: 0, geometry }
  p.setGeometry(geometry)

  const lived = cssVar('--lived')
  const ahead = cssVar('--ahead')
  const accent = cssVar('--accent')
  const bonus = cssVar('--accent2')
  const r = geometry.dotRadius

  // Chapter bands follow the same year blocks as the dot geometry.
  const chapterColors = new Map<string, string>()
  for (const c of p.chapters) {
    if (!chapterColors.has(c.color)) {
      const v = cssVar(`--ch-${c.color}`)
      if (v) chapterColors.set(c.color, v)
    }
  }
  const chapterOf = new Int16Array(total).fill(-1)
  for (let ci = 0; ci < p.chapters.length; ci++) {
    const c = p.chapters[ci]
    const color = chapterColors.get(c.color)
    if (!color) continue
    const from = Math.max(c.startWeek, 0)
    const to = Math.min(c.endWeek, total - 1)
    for (let wi = from; wi <= to; wi++) chapterOf[wi] = ci
    let week = from
    while (week <= to) {
      const year = Math.floor(week / p.cols)
      const block = geometry.blocks[year]
      const weekInYear = week % p.cols
      const quarter = Math.floor(weekInYear / (p.cols / 4))
      const segmentEnd = Math.min(to, year * p.cols + (quarter + 1) * (p.cols / 4) - 1)
      const endCol = segmentEnd % p.cols % (p.cols / 4)
      ctx.globalAlpha = 0.1
      ctx.fillStyle = color
      bandRect(
        ctx,
        block.x + (weekInYear % (p.cols / 4)) * geometry.pitch,
        block.y + quarter * geometry.pitch,
        (endCol - (weekInYear % (p.cols / 4)) + 1) * geometry.pitch,
        geometry.pitch,
        Math.min(4, geometry.pitch * 0.4),
      )
      week = segmentEnd + 1
    }
  }
  ctx.globalAlpha = 1

  const currentYear = Math.floor(p.weeksLived / p.cols)
  const currentBlock = geometry.blocks[currentYear]
  const focusCenter = geometryDotCenter(geometry, p.weeksLived)
  if (focusCenter && currentBlock) {
    const g = ctx.createLinearGradient(currentBlock.x, 0, currentBlock.x + geometry.blockW, 0)
    const pos = (focusCenter.x - currentBlock.x) / geometry.blockW
    g.addColorStop(0, 'rgba(238,108,77,0)')
    g.addColorStop(Math.max(0, pos - 0.25), 'rgba(238,108,77,.10)')
    g.addColorStop(pos, 'rgba(238,108,77,.35)')
    g.addColorStop(Math.min(1, pos + 0.35), 'rgba(238,108,77,.06)')
    g.addColorStop(1, 'rgba(238,108,77,0)')
    ctx.save()
    ctx.beginPath()
    ctx.rect(currentBlock.x, currentBlock.y, geometry.blockW, geometry.blockH)
    ctx.clip()
    ctx.fillStyle = g
    ctx.fillRect(currentBlock.x, currentBlock.y, geometry.blockW, geometry.blockH)
    ctx.restore()
  }

  let focus: { x: number; y: number } | null = null
  const dots = new DotBuckets()
  for (let wi = 0; wi < total; wi++) {
    const c = geometryDotCenter(geometry, wi)
    if (!c) continue
    if (wi === p.weeksLived) {
      focus = { x: c.x, y: c.y }
      dots.add(accent, focus.x, focus.y, r * 1.45)
      continue
    }
    const chapterColor =
      chapterOf[wi] >= 0 ? (chapterColors.get(p.chapters[chapterOf[wi]].color) ?? null) : null
    if (p.notesByWeek.has(wi)) {
      dots.add(accent, c.x, c.y, r * 1.4)
      continue
    }
    const base = wi < p.weeksLived ? (wi >= p.baseWeeks ? bonus : lived) : ahead
    const key = chapterColor !== null && wi < p.weeksLived ? chapterColor : base
    const size = chapterColor !== null && wi >= p.weeksLived ? r * 0.9 : r
    dots.add(key, c.x, c.y, size)
    // Future weeks inside a chapter get a soft wash like the window view.
    if (chapterColor !== null && wi >= p.weeksLived) dots.add(chapterColor, c.x, c.y, r * 0.45)
  }
  dots.fill(ctx)

  // Keep the pulse inside the same year block as the current week.
  if (focus) {
    const block = geometry.blocks[currentYear]
    p.setPulse(block ? {
      ...focus,
      clip: {
        x: block.x,
        y: block.y,
        width: geometry.blockW,
        height: geometry.blockH,
        radius: geometry.dotRadius,
      },
    } : focus)
  } else {
    p.setPulse(null)
  }

  // Goal rings/diamonds at the start week + soft bracket under the span.
  paintGoalMarkers(
    ctx,
    p.goals,
    0,
    total,
    p.weeksLived,
    r,
    geometry.pitch,
    (j) => {
      const c = geometryDotCenter(geometry, j)
      return c ? c.x : NaN
    },
    (j) => {
      const c = geometryDotCenter(geometry, j)
      return c ? c.y : NaN
    },
  )

  // Search-match rings (the life view always has "now" in view).
  if (p.highlight && p.highlight.size > 0) {
    ctx.lineWidth = Math.max(1.4, r * 0.5)
    for (const wi of p.highlight) {
      if (wi < 0 || wi >= total || wi === p.weeksLived) continue
      const c = geometryDotCenter(geometry, wi)
      if (!c) continue
      ctx.beginPath()
      ctx.strokeStyle = accent
      ctx.globalAlpha = 0.9
      ctx.arc(c.x, c.y, r * 1.7, 0, 6.2832)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // Focus ring
  if (p.focusedWeek >= 0 && p.focusedWeek < total) {
    const c = geometryDotCenter(geometry, p.focusedWeek)
    if (c) {
      ctx.beginPath()
      ctx.strokeStyle = cssVar('--accent') || '#3b82f6'
      ctx.lineWidth = Math.max(1.8, r * 0.6)
      ctx.arc(c.x, c.y, r * 1.8, 0, 6.2832)
      ctx.stroke()
    }
  }

}

/**
 * Goal overlay for any geometry: a soft ring while a goal is ahead, a filled
 * diamond once it is done, and a thin bracket under multi-week spans.
 */
function paintGoalMarkers(
  ctx: CanvasRenderingContext2D,
  goals: CanvasGoal[],
  weekOffset: number,
  cells: number,
  currentRel: number,
  r: number,
  pitch: number,
  px: (j: number) => number,
  py: (j: number) => number,
): void {
  const marker = cssVar('--accent2') || cssVar('--accent')
  ctx.lineWidth = Math.max(1.2, pitch * 0.16)
  for (const goal of goals) {
    const start = goal.startWeek ?? goal.weekIndex
    const end = goal.endWeek ?? goal.startWeek ?? goal.weekIndex
    // Bracket: one short rounded segment per covered week; row breaks break
    // the line naturally, so no run tracking is needed.
    if (end > start) {
      ctx.strokeStyle = marker
      ctx.globalAlpha = goal.done ? 0.35 : 0.5
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1.6, r * 0.6)
      for (let wi = Math.max(start, weekOffset); wi <= Math.min(end, weekOffset + cells - 1); wi++) {
        const j = wi - weekOffset
        const c = dotCenterSafe(px, py, j, currentRel)
        if (!c || Number.isNaN(c.x)) continue
        ctx.beginPath()
        ctx.moveTo(c.x - pitch / 2, c.y + r * 1.9)
        ctx.lineTo(c.x + pitch / 2, c.y + r * 1.9)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
      ctx.lineWidth = Math.max(1.2, pitch * 0.16)
      ctx.globalAlpha = 1
    }
    const j = start - weekOffset
    if (j < 0 || j >= cells || j === currentRel) continue
    const x = px(j)
    const y = py(j)
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    if (goal.done) {
      const s = Math.max(r * 1.7, 3)
      ctx.beginPath()
      ctx.fillStyle = marker
      ctx.globalAlpha = 0.9
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s, y)
      ctx.lineTo(x, y + s)
      ctx.lineTo(x - s, y)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.strokeStyle = marker
      ctx.globalAlpha = 0.85
      ctx.arc(x, y, r * 1.9, 0, 6.2832)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}

function dotCenterSafe(
  px: (j: number) => number,
  py: (j: number) => number,
  j: number,
  currentRel: number,
): { x: number; y: number } | null {
  if (j < 0 || j === currentRel) return null
  const x = px(j)
  const y = py(j)
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}
