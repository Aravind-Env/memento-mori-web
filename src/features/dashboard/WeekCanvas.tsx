import { useCallback, useEffect, useRef, useState } from 'react'

import type { Note } from '../../data/model'

const COLS = 52
const PAD_L = 34
const PAD_T = 26
const PAD_R = 4
const ROW_LABEL_STEP = 5
const COL_MARKS = [1, 13, 26, 39, 52]

export interface WeekCanvasProps {
  rows: number
  /** 0-based index of the current week. */
  weeksLived: number
  /** Weeks in the expected lifespan (used to tint bonus weeks). */
  baseWeeks: number
  /** Height available for the whole chart, so the dots can shrink to fit. */
  availableHeight: number
  notesByWeek: Map<number, Note>
  reduceMotion: boolean
  /** Changes whenever the resolved theme changes, to force a redraw. */
  themeKey: string
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

/** Canvas dot-grid of every week in a life, ported from the reference design. */
export function WeekCanvas({
  rows,
  weeksLived,
  baseWeeks,
  availableHeight,
  notesByWeek,
  reduceMotion,
  themeKey,
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
    const rsRatio = 0.66
    const byWidth = (width - PAD_L - PAD_R) / COLS
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
    const r = cs * 0.2
    const px = (i: number) => PAD_L + (i % COLS) * cs + cs / 2
    const py = (i: number) => PAD_T + Math.floor(i / COLS) * rs + rs / 2

    // Axis labels.
    ctx.fillStyle = muted
    ctx.font = '12px Figtree, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    for (const m of COL_MARKS) ctx.fillText(String(m), PAD_L + (m - 1) * cs + cs / 2, 14)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = 0; y < rows; y += ROW_LABEL_STEP) {
      ctx.fillText(String(y), PAD_L - 12, PAD_T + y * rs + rs / 2)
    }

    const current = Math.min(Math.max(weeksLived, 0), rows * COLS - 1)
    const cx = px(current)
    const cy = py(current)

    // Glow streak through the current row.
    const g = ctx.createLinearGradient(PAD_L, 0, PAD_L + COLS * cs, 0)
    const p = (cx - PAD_L) / (COLS * cs)
    g.addColorStop(0, 'rgba(238,108,77,0)')
    g.addColorStop(Math.max(0, p - 0.25), 'rgba(238,108,77,.10)')
    g.addColorStop(p, 'rgba(238,108,77,.35)')
    g.addColorStop(Math.min(1, p + 0.35), 'rgba(238,108,77,.06)')
    g.addColorStop(1, 'rgba(238,108,77,0)')
    ctx.fillStyle = g
    ctx.fillRect(PAD_L, cy - rs * 1.3, COLS * cs, rs * 2.6)

    // Dots.
    for (let i = 0; i < COLS * rows; i++) {
      ctx.beginPath()
      if (i === current) {
        ctx.fillStyle = accent
        ctx.arc(px(i), py(i), r * 1.9, 0, 6.2832)
      } else if (notesByWeek.has(i)) {
        ctx.fillStyle = accent
        ctx.arc(px(i), py(i), r * 1.4, 0, 6.2832)
      } else {
        ctx.fillStyle = i < weeksLived ? (i >= baseWeeks ? bonus : lived) : ahead
        ctx.arc(px(i), py(i), r, 0, 6.2832)
      }
      ctx.fill()
    }

    setPulse({ x: cx, y: cy })
  }, [width, rows, weeksLived, baseWeeks, availableHeight, notesByWeek, themeKey, fontsReady])

  const indexAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const cv = canvasRef.current
      if (!cv) return null
      const b = cv.getBoundingClientRect()
      const { padL, padT, cs, rs } = layoutRef.current
      if (!cs || !rs) return null
      const col = Math.floor((clientX - b.left - padL) / cs)
      const row = Math.floor((clientY - b.top - padT) / rs)
      if (col < 0 || col >= COLS || row < 0 || row >= rows) return null
      return row * COLS + col
    },
    [rows],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current
      const wrap = wrapRef.current
      const i = indexAt(e.clientX, e.clientY)
      if (i == null || !cv || !wrap) {
        setTip(null)
        return
      }
      const b = cv.getBoundingClientRect()
      const row = Math.floor(i / COLS)
      const note = notesByWeek.get(i)
      let text = `Week ${i.toLocaleString('en-US')} · age ${row}`
      if (note) text += ` · ${note.text.trim().slice(0, 24) || 'has note'}`
      else if (i === weeksLived) text += ' · this week'
      setTip({
        text,
        x: Math.min(e.clientX - b.left + 12, wrap.clientWidth - 170),
        y: e.clientY - b.top - 34,
      })
    },
    [indexAt, notesByWeek, weeksLived],
  )

  const onPointerLeave = useCallback(() => setTip(null), [])

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const i = indexAt(e.clientX, e.clientY)
      if (i != null) onSelect(i)
    },
    [indexAt, onSelect],
  )

  return (
    <div className="mm-grid" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Grid of weeks in a life: lived weeks filled dark, future weeks light, this week highlighted"
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
