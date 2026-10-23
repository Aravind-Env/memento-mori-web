import { useCallback, useEffect, useRef, useState } from 'react'

import type { Chapter, Goal, Note } from '../../data/model'
import { chapterAt, chapterWindowSegments } from '../../domain/chapters'
import { weekStart } from '../../domain/dates'

const PAD_L = 34
const PAD_T = 26
const PAD_R = 4
const LIFE_COL_MARKS = [1, 13, 26, 39, 52]

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
  /** Profile-filtered life chapters, painted as coloured bands. */
  chapters: Chapter[]
  /** Profile-filtered goals, drawn as markers on their weeks. */
  goals: Goal[]
  /** Birth date, used for month labels in the year view. */
  dob: Date | null
  /** True when the view is zoomed (bigger dots, month labels). */
  yearView: boolean
  reduceMotion: boolean
  /** Changes whenever the resolved theme changes, to force a redraw. */
  themeKey: string
  /** Weeks to ring as search matches (command palette open); optional. */
  highlight?: Set<number>
  /** Receives the absolute week index of the clicked cell. */
  onSelect: (weekIndex: number) => void
}

interface Layout {
  padL: number
  padT: number
  cs: number
  rs: number
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

/**
 * Canvas dot-grid of weeks in a life. Knows nothing about decades or years —
 * it renders whatever window it is handed (via rows/cols/weekOffset) and maps
 * clicks back to absolute week indexes.
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
  const [pulse, setPulse] = useState<{ x: number; y: number } | null>(null)
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

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !width) return

    const dpr = window.devicePixelRatio || 1
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

    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    layoutRef.current = { padL: PAD_L, padT: PAD_T, cs, rs }

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
    // a filled diamond once it is done. Both stay quiet, never red.
    const goalByWeek = new Map<number, Goal>()
    for (const g of goals) if (g.weekIndex >= weekOffset && g.weekIndex < weekOffset + cells) goalByWeek.set(g.weekIndex, g)
    if (goalByWeek.size > 0) {
      const marker = cssVar('--accent2') || accent
      ctx.lineWidth = Math.max(1.2, cs * 0.16)
      for (const [wi, goal] of goalByWeek) {
        const j = wi - weekOffset
        if (j < 0 || j >= cells || j === currentRel) continue
        const x = px(j)
        const y = py(j)
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
    themeKey,
    highlight,
    fontsReady,
  ])

  const indexAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const cv = canvasRef.current
      if (!cv) return null
      const b = cv.getBoundingClientRect()
      const { padL, padT, cs, rs } = layoutRef.current
      if (!cs || !rs) return null
      const col = Math.floor((clientX - b.left - padL) / cs)
      const row = Math.floor((clientY - b.top - padT) / rs)
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
      const goal = goals.find((g) => g.weekIndex === wi)
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

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wi = indexAt(e.clientX, e.clientY)
      if (wi != null) onSelect(wi)
    },
    [indexAt, onSelect],
  )

  return (
    <div className="mm-grid" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Grid of weeks in a life: lived weeks filled dark, future weeks light, this week highlighted${chapters.length > 0 ? ', coloured bands mark life chapters' : ''}`}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />
      {pulse && !reduceMotion && (
        <div className="mm-pulse" style={{ left: pulse.x, top: pulse.y, background: 'var(--accent)' }} />
      )}
      <div
        className="mm-tip"
        style={{ left: tip?.x ?? 0, top: tip?.y ?? 0, opacity: tip ? 1 : 0 }}
      >
        {tip?.text}
      </div>
    </div>
  )
}
