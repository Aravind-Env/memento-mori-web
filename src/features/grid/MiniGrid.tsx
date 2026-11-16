import { useEffect, useRef } from 'react'

import { getLifeStats } from '../../domain/lifeMath'
import { WEEKS_PER_YEAR } from '../../domain/dates'

export interface MiniGridProps {
  dob: Date | null
  lifeYears: number
  className?: string
  /** Fixed CSS height of the preview; the grid scales inside it. */
  height?: number
}

/**
 * Lightweight canvas preview used during onboarding and in settings.
 *
 * The canvas box never changes size (so surrounding layout cannot jump);
 * instead the grid morphs inside it: when the lifespan changes, the row
 * count eases toward the new value, the cell size rescales continuously and
 * the newest row fades in. Entering a date of birth sweeps the lived weeks in.
 */
export function MiniGrid({ dob, lifeYears, className, height = 150 }: MiniGridProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const target = useRef({ rows: lifeYears, lived: 0 })
  const anim = useRef({ rows: lifeYears, lived: 0, raf: 0 })
  const kickRef = useRef<() => void>(() => {})

  // Targets follow props; the frame loop eases toward them.
  const stats = dob ? getLifeStats(dob, lifeYears) : null
  target.current = { rows: lifeYears, lived: stats?.weeksLived ?? 0 }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const a = anim.current

    const draw = () => {
      const W = canvas.clientWidth
      const H = height
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr)
        canvas.height = Math.round(H * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (W <= 0) return

      const styles = getComputedStyle(document.documentElement)
      const colorLived = styles.getPropertyValue('--lived').trim() || '#2B2B33'
      const colorFuture = styles.getPropertyValue('--future').trim() || '#D9D9E0'
      const colorAccent = styles.getPropertyValue('--accent').trim() || '#E5533D'

      const cols = WEEKS_PER_YEAR
      const rows = Math.max(1, a.rows)
      const fullRows = Math.floor(rows)
      const frac = rows - fullRows
      // Square cells sized to fit the fixed box; the grid is centred.
      const pitch = Math.min(W / cols, H / Math.max(rows, 1))
      const gap = pitch > 3 ? pitch * 0.22 : pitch * 0.12
      const cell = Math.max(0.6, pitch - gap)
      const gridW = cols * pitch - gap
      const gridH = Math.ceil(rows) * pitch - gap
      const ox = (W - gridW) / 2
      const oy = (H - gridH) / 2
      const lived = Math.round(a.lived)
      const nowIdx = target.current.lived
      const round = cell >= 3

      const drawRows = Math.ceil(rows)
      for (let r = 0; r < drawRows; r++) {
        // The incoming/outgoing row fades with the fractional row count.
        const rowAlpha = r < fullRows ? 1 : frac
        if (rowAlpha <= 0.01) continue
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const x = ox + c * pitch
          const y = oy + r * pitch
          ctx.globalAlpha = rowAlpha
          ctx.fillStyle = i < lived ? colorLived : colorFuture
          if (round) {
            ctx.beginPath()
            ctx.roundRect(x, y, cell, cell, cell * 0.3)
            ctx.fill()
          } else {
            ctx.fillRect(x, y, cell, cell)
          }
        }
      }

      // Current week: accent cell with a soft glow, once the sweep reaches it.
      if (dob && nowIdx < drawRows * cols && lived >= nowIdx - 1) {
        const r = Math.floor(nowIdx / cols)
        const c = nowIdx % cols
        const x = ox + c * pitch
        const y = oy + r * pitch
        ctx.globalAlpha = 1
        ctx.shadowColor = colorAccent
        ctx.shadowBlur = 8
        ctx.fillStyle = colorAccent
        const s = Math.max(cell, 2.5)
        ctx.fillRect(x + cell / 2 - s / 2, y + cell / 2 - s / 2, s, s)
        ctx.shadowBlur = 0
      }
      ctx.globalAlpha = 1
    }

    const step = () => {
      a.raf = 0
      const t = target.current
      // Critically-damped-feeling ease: fast start, soft landing.
      a.rows += (t.rows - a.rows) * 0.2
      a.lived += (t.lived - a.lived) * 0.12
      if (Math.abs(t.rows - a.rows) < 0.01) a.rows = t.rows
      if (Math.abs(t.lived - a.lived) < 0.5) a.lived = t.lived
      if (reduced) {
        a.rows = t.rows
        a.lived = t.lived
      }
      draw()
      if (a.rows !== t.rows || a.lived !== t.lived) a.raf = requestAnimationFrame(step)
    }
    const kick = () => {
      if (!a.raf) a.raf = requestAnimationFrame(step)
    }
    kickRef.current = kick

    const ro = new ResizeObserver(kick)
    ro.observe(canvas)
    kick()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(a.raf)
      a.raf = 0
    }
  }, [height, dob])

  useEffect(() => {
    kickRef.current()
  }, [lifeYears, dob])

  return (
    <canvas
      ref={ref}
      className={className ? `mini-grid ${className}` : 'mini-grid'}
      style={{ height, width: '100%', maxWidth: 360, display: 'block' }}
      aria-hidden="true"
    />
  )
}
