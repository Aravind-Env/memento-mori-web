import { describe, expect, it } from 'vitest'

import {
  captionText,
  dotCenter,
  labelPlan,
  solutionHeight,
  solutionWidth,
  solveLayout,
  weekAt,
} from './gridLayout'

/** A short plot like the real one: ~990px wide, ~150px tall (1440×900 page). */
const SHORT_PANEL = { width: 960, height: 150, totalWeeks: 60 * 52 }

describe('solveLayout — classic vs blocks', () => {
  it('chooses classic when the height allows a readable pitch', () => {
    // A tall panel: 5 years → 5 rows at a large pitch fit easily.
    const sol = solveLayout({ ...SHORT_PANEL, width: 600, height: 320, totalWeeks: 5 * 52 })
    expect(sol.mode).toBe('classic')
    expect(sol.pitch).toBeGreaterThanOrEqual(6)
  })

  it('picks classic on big screens (1900×420, 60y)', () => {
    const sol = solveLayout({ width: 1900, height: 420, totalWeeks: 60 * 52 })
    expect(sol.mode).toBe('classic')
    expect(sol.pitch).toBeGreaterThanOrEqual(6)
    expect(solutionHeight(sol)).toBeLessThanOrEqual(420.001)
  })

  it('chooses year blocks on a short panel and still reads (pitch ≥ 5)', () => {
    const sol = solveLayout(SHORT_PANEL)
    expect(sol.mode).toBe('blocks')
    expect(sol.pitch).toBeGreaterThanOrEqual(5)
    expect(sol.radius).toBeCloseTo(sol.pitch * 0.34, 10)
    // Dot diameter never exceeds 70% of the pitch.
    expect(sol.radius * 2).toBeLessThanOrEqual(sol.pitch * 0.7 + 1e-9)
  })

  it('fits 3,120 weeks of a 60-year life into the short plot', () => {
    const sol = solveLayout(SHORT_PANEL)
    expect(solutionHeight(sol)).toBeLessThanOrEqual(SHORT_PANEL.height + 0.001)
    expect(solutionWidth(sol)).toBeLessThanOrEqual(SHORT_PANEL.width + 0.001)
  })

  it('falls back to ~4px or below when the panel is tiny — life never clips', () => {
    const sol = solveLayout({ width: 300, height: 60, totalWeeks: 80 * 52 })
    expect(solutionHeight(sol)).toBeLessThanOrEqual(60.001)
    expect(solutionWidth(sol)).toBeLessThanOrEqual(300.001)
    expect(sol.radius).toBeLessThanOrEqual(sol.pitch * 0.34 + 1e-9)
    expect(sol.pitch).toBeGreaterThan(0)
  })

  it('keeps every week visible even under extreme squeeze', () => {
    const sol = solveLayout({ width: 200, height: 40, totalWeeks: 80 * 52 })
    expect(solutionHeight(sol)).toBeLessThanOrEqual(40.001)
    // Dots still circles that never touch: radius ≤ 50% of pitch at 0.34.
    expect(sol.radius).toBeLessThanOrEqual(sol.pitch * 0.5)
  })
})

describe('hit-test — exact inverse of drawing', () => {
  const cases: Array<[string, number, number]> = [
    ['960×150 panel, 60y (blocks)', SHORT_PANEL.width, SHORT_PANEL.height],
    ['600×260 panel, 80y', 600, 260],
    ['300×60 panel, 80y (squeeze)', 300, 60],
    ['1900×420 panel, 60y (classic)', 1900, 420],
  ]

  for (const [name, w, h] of cases) {
    it(`round-trips every week: ${name}`, () => {
      const sol = solveLayout({ width: w, height: h, totalWeeks: 60 * 52 })
      for (let week = 0; week < 60 * 52; week++) {
        const c = dotCenter(sol, week)
        expect(c, `week ${week} has a dot`).not.toBeNull()
        const back = weekAt(sol, c!.x, c!.y)
        expect(back, `week ${week} round-trips in ${sol.mode} mode`).toBe(week)
      }
    })
  }
})

describe('hit-test — gap awareness', () => {
  it('returns null when hovering between blocks and between rows', () => {
    const sol = solveLayout(SHORT_PANEL)
    expect(sol.mode).toBe('blocks')
    let gapX: number | null = null
    for (let b = 1; b < Math.min(sol.blocksPerRow, sol.blocks); b++) {
      const cPrev = dotCenter(sol, (b - 1) * 52 + 12) // last dot of block b-1
      const cNext = dotCenter(sol, b * 52) // first dot of block b
      const mid = (cPrev!.x + cNext!.x) / 2
      if (mid > cPrev!.x + 1 && mid < cNext!.x - 1) {
        gapX = mid
        break
      }
    }
    const gapY = sol.pitch / 2
    if (gapX !== null) expect(weekAt(sol, gapX, gapY)).toBeNull()
    // Vertical gap between flow-rows: below a block, above the next.
    const belowBlock = sol.blockHeight + sol.gapY / 2
    expect(weekAt(sol, sol.pitch / 2, belowBlock)).toBeNull()
    // And past the whole arrangement.
    expect(weekAt(sol, sol.pitch / 2, solutionHeight(sol) + 4)).toBeNull()
  })

  it('rejects weeks past the final partial row/block', () => {
    const sol = solveLayout({ width: 900, height: 130, totalWeeks: 52 * 3 + 5 })
    // The last unit only holds 5 weeks; the cell one step right of the final
    // dot is not a real week and must not resolve.
    const last = sol.totalWeeks - 1
    const c = dotCenter(sol, last)!
    expect(weekAt(sol, c.x + sol.pitch, c.y)).toBeNull()
  })
})

describe('labels and caption', () => {
  it('labels every decade, never overlapping another label', () => {
    const sol = solveLayout(SHORT_PANEL)
    const labels = labelPlan(sol)
    const ages = labels.map((l) => l.age)
    expect(ages).toEqual([0, 10, 20, 30, 40, 50])
    // Gutter labels (no inPlotX) stay ≥14px apart vertically.
    const gutter = labels.filter((l) => l.inPlotX === undefined)
    for (let i = 1; i < gutter.length; i++) {
      expect(Math.abs(gutter[i].y - gutter[i - 1].y)).toBeGreaterThanOrEqual(14)
    }
    // In-plot labels sit above their block's top edge, inside the existing
    // top-label band, never on a dot row.
    for (const l of labels.filter((l) => l.inPlotX !== undefined)) {
      const blockRow = Math.floor(l.age / sol.blocksPerRow)
      expect(l.y).toBeCloseTo(blockRow * (sol.blockHeight + sol.gapY) - 5, 5)
    }
    for (const l of labels) {
      expect(l.y).toBeGreaterThanOrEqual(-5)
      expect(l.y).toBeLessThanOrEqual(solutionHeight(sol) + 0.001)
    }
  })

  it('writes the caption with the estimate and total weeks', () => {
    expect(captionText(60, 3120)).toBe('60 years · 3,120 weeks')
  })
})
