import { describe, expect, it } from 'vitest'

import {
  captionText,
  computeGridGeometry,
  dotCenter,
  geometryDotCenter,
  geometryWeekAt,
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

const geometryInput = (width: number, height: number, years = 61) => ({
  width,
  height,
  years,
  weeksPerYear: 52,
  minPitch: 5,
  maxPitch: 12,
  labelFont: {
    size: 12,
    measure: (text: string) => Array.from(text).reduce((sum, char) => sum + (char === '-' ? 4 : 7), 0),
  },
  footerH: 20,
  padding: 16,
})

describe('computeGridGeometry', () => {
  it.each([
    [1000, 150], [1000, 170], [1000, 200],
    [1100, 150], [1100, 170], [1100, 200],
    [1250, 150], [1250, 170], [1250, 200],
    [1440, 150], [1440, 170], [1440, 200],
  ])('centres labels and content at %sx%s', (width, height) => {
    const geometry = computeGridGeometry(geometryInput(width, height))
    for (const row of geometry.rows) {
      const first = geometry.blocks[row.firstYear]
      expect(row.centerY).toBeCloseTo(first.y + geometry.blockH / 2, 1)
    }
    expect(geometry.contentBox.x).toBeCloseTo((width - geometry.contentBox.w) / 2, 1)
    if (geometry.captionBox.h > 0) {
      const topClearance = geometry.contentBox.y - 16
      const bottomClearance =
        geometry.captionBox.y - 12 - (geometry.contentBox.y + geometry.contentBox.h)
      expect(topClearance).toBeCloseTo(bottomClearance, 1)
    }
    expect(geometry.pitch).toBeGreaterThanOrEqual(5)
  })

  it('keeps row labels separate from each other and every dot box', () => {
    const geometry = computeGridGeometry(geometryInput(1250, 200))
    const measure = geometryInput(1250, 200).labelFont.measure
    const visible = geometry.rows.filter((_, i) => geometry.labelsVisible[i])
    for (let i = 0; i < visible.length; i++) {
      const row = visible[i]
      const label = {
        left: geometry.originX - 12 - measure(row.label) * geometry.labelFontSize / 12,
        right: geometry.originX - 12,
        top: row.centerY - geometry.labelFontSize / 2,
        bottom: row.centerY + geometry.labelFontSize / 2,
      }
      for (const other of visible.slice(i + 1)) {
        expect(label.bottom <= other.centerY - geometry.labelFontSize / 2 ||
          other.centerY + geometry.labelFontSize / 2 <= label.top).toBe(true)
      }
      for (const block of geometry.blocks) {
        expect(label.right <= block.x || label.left >= block.x + geometry.blockW ||
          label.bottom <= block.y || label.top >= block.y + geometry.blockH).toBe(true)
      }
    }
    expect(geometry.labelsVisible.filter(Boolean).length).toBeGreaterThan(0)
  })

  it('centres the content with equal padding and reserves a clear caption footer when possible', () => {
    const geometry = computeGridGeometry(geometryInput(1250, 200))
    expect(geometry.contentBox.x).toBeGreaterThanOrEqual(16)
    expect(1250 - geometry.contentBox.x - geometry.contentBox.w).toBeCloseTo(geometry.contentBox.x, 1)
    expect(geometry.captionBox.h).toBe(20)
    expect(geometry.captionBox.x).toBeGreaterThanOrEqual(16)
    expect(geometry.captionBox.x + geometry.captionBox.w).toBeCloseTo(
      geometry.contentBox.x + geometry.contentBox.w,
      5,
    )
    expect(200 - geometry.captionBox.y - geometry.captionBox.h).toBeGreaterThanOrEqual(12)
    expect(geometry.captionBox.y).toBeGreaterThanOrEqual(12)
    for (const block of geometry.blocks) {
      expect(geometry.captionBox.y - (block.y + geometry.blockH)).toBeGreaterThanOrEqual(12)
      const intersects = geometry.captionBox.x < block.x + geometry.blockW &&
        geometry.captionBox.x + geometry.captionBox.w > block.x &&
        geometry.captionBox.y < block.y + geometry.blockH &&
        geometry.captionBox.y + geometry.captionBox.h > block.y
      expect(intersects).toBe(false)
    }
  })

  it('prefers decade rows when readable and labels packed rows by their full age range', () => {
    const decade = computeGridGeometry(geometryInput(1920, 1080))
    expect(decade.layout).toBe('decade')
    expect(decade.rows.map((row) => row.label)).toEqual(['0', '10', '20', '30', '40', '50', '60'])
    expect(decade.rows.length).toBe(decade.labelsVisible.filter(Boolean).length)

    const packed = computeGridGeometry(geometryInput(1250, 150))
    expect(packed.layout).toBe('packed')
    expect(packed.rows.map((row) => row.label)).toEqual(['0-15', '16-31', '32-47', '48-60'])
    expect(packed.rows.length).toBe(packed.labelsVisible.filter(Boolean).length)
  })

  it.each([61, 80, 30])('round-trips every dot and rejects block gaps for %s years', (years) => {
    const geometry = computeGridGeometry(geometryInput(1920, 1080, years))
    for (let week = 0; week < years * 52; week++) {
      const center = geometryDotCenter(geometry, week)
      expect(center).not.toBeNull()
      expect(geometryWeekAt(geometry, center!.x, center!.y)).toBe(week)
    }
    const block = geometry.blocks[0]
    if (geometry.blocksPerRow > 1) {
      const next = geometry.blocks[1]
      const x = (block.x + geometry.blockW + next.x) / 2
      expect(geometryWeekAt(geometry, x, block.y + geometry.pitch / 2)).toBeNull()
    } else if (geometry.rowCount > 1) {
      const y = block.y + geometry.blockH + geometry.blockGapY / 2
      expect(geometryWeekAt(geometry, block.x + geometry.pitch / 2, y)).toBeNull()
    }
  })

  it('is deterministic for the same input', () => {
    const input = geometryInput(1440, 300)
    expect(computeGridGeometry(input)).toEqual(computeGridGeometry(input))
  })

  it('uses the documented compact floor only when a 5px life grid cannot fit', () => {
    const geometry = computeGridGeometry(geometryInput(706, 193, 81))
    expect(geometry.pitch).toBeCloseTo(4.3, 5)
    expect(geometry.captionBox.h).toBe(0)
    expect(geometry.rows).toHaveLength(9)
    expect(geometry.layout).toBe('decade')
    expect(geometry.rows.map((row) => row.label)).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80'])
    expect(geometry.contentBox.y).toBeGreaterThanOrEqual(16)
    expect(193 - geometry.contentBox.y - geometry.contentBox.h).toBeGreaterThanOrEqual(16)
  })
})
