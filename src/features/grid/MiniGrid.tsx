import { useEffect, useRef } from 'react'

import { getLifeStats } from '../../domain/lifeMath'
import { WEEKS_PER_YEAR } from '../../domain/dates'

export interface MiniGridProps {
  dob: Date | null
  lifeYears: number
  className?: string
}

/** Lightweight canvas preview used during onboarding and in settings. */
export function MiniGrid({ dob, lifeYears, className }: MiniGridProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const cols = WEEKS_PER_YEAR
    const rows = lifeYears
    const gap = 1
    const targetHeight = 170
    const cell = Math.max(1, Math.min(4, Math.floor(targetHeight / rows)))
    const w = cols * (cell + gap) - gap
    const h = rows * (cell + gap) - gap

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const styles = getComputedStyle(document.documentElement)
    const colorLived = styles.getPropertyValue('--lived').trim() || '#2B2B33'
    const colorFuture = styles.getPropertyValue('--future').trim() || '#D9D9E0'
    const colorAccent = styles.getPropertyValue('--accent').trim() || '#E5533D'

    const stats = dob ? getLifeStats(dob, lifeYears) : null
    const weeksLived = stats?.weeksLived ?? 0

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const x = c * (cell + gap)
        const y = r * (cell + gap)
        ctx.fillStyle = i === weeksLived ? colorAccent : i < weeksLived ? colorLived : colorFuture
        ctx.fillRect(x, y, cell, cell)
      }
    }
  }, [dob, lifeYears])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
