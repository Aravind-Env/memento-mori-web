/**
 * Life-grid layout solver.
 *
 * One pure function chooses how ALL weeks of the estimated life fit inside the
 * frosted panel, and the same descriptor drives drawing, hit-testing, tooltips
 * and labels — so they can never disagree. Candidate layouts, in order:
 *
 *   1. CLASSIC — the traditional 52 columns × N year-rows, only when the
 *      height already allows a pitch of at least `minPitch` (6px).
 *   2. YEAR BLOCKS — each year is a block of 13 columns × 4 rows (one row per
 *      quarter: a row inside a block is 13 weeks). Blocks flow left→right and
 *      wrap, with a ~1.3 × pitch gap between blocks and a subtle extra gap on
 *      decade boundaries so the eye can count the years.
 *   3. If nothing fits at `minPitch`, sweep again at the hard pitch (4px) and
 *      shrink the dot radius with it (radius = pitch × 0.34 — dots always keep
 *      68% of the cell, never touching, always circles).
 *   4. Terminal squeeze: below 4px the whole life cannot physically fit even
 *      at the smallest layout, so use the best achievable pitch rather than
 *      ever clipping a week — seeing the whole life wins over the floor.
 *
 * All coordinates are plot-local: the caller adds the label gutter and
 * top/bottom paddings.
 */

export type GridMode = 'classic' | 'blocks'

export interface GridSolution {
  mode: GridMode
  /** Cell pitch: centre-to-centre distance of adjacent dots (px, ≥ hard 0.8). */
  pitch: number
  /** Dot radius = pitch × 0.34 (dots at 68% of pitch, never touching). */
  radius: number
  /** Total week cells to place (the last block/row may be partial). */
  totalWeeks: number
  /** Year-blocks per flow-row (blocks mode only; 1 in classic). */
  blocksPerRow: number
  /** Width of one year block = 13 × pitch (px). */
  blockWidth: number
  /** Height of one year block = 4 × pitch (px). */
  blockHeight: number
  /** Gap between adjacent blocks horizontally (px). */
  gapX: number
  /** Extra gap after every 10th block — the decade boundary (px). */
  decadeGapX: number
  /** Vertical gap between flow-rows of blocks (px). */
  gapY: number
  /** Number of year blocks = ceil(totalWeeks / 52). */
  blocks: number
  /** Weeks per year block: always 52. */
  weeksPerBlock: number
}

export interface SolverOptions {
  /** Width of the plot area (px), excluding the label gutter. */
  width: number
  /** Height of the plot area (px). */
  height: number
  /** Every week that must be visible. */
  totalWeeks: number
  /** Preferred readable pitch (default 6). */
  minPitch?: number
  /** Zoom cap for the whole-life view (default 12). */
  maxPitch?: number
  /** Hard floor pitch before the terminal squeeze (default 4). */
  hardPitch?: number
}

const WEEKS_PER_YEAR = 52
const WEEKS_PER_QUARTER = 13
const BLOCK_ROWS = 4
const DOT_RATIO = 0.34

interface Pt {
  x: number
  y: number
}

/**
 * CLASSIC: 52 cols × N year-rows with a soft extra gap after each completed
 * decade of rows. Returns Infinity when the height cannot host it.
 */
function classicPitch(width: number, height: number, totalWeeks: number, floor: number): number {
  if (totalWeeks <= 0) return Infinity
  const years = Math.ceil(totalWeeks / WEEKS_PER_YEAR)
  const cw = width / WEEKS_PER_YEAR
  const ch = height / (years + 0.6 * Math.floor(years / 10))
  const p = Math.min(cw, ch)
  return p >= floor ? p : Infinity
}

/**
 * YEAR BLOCKS at a fixed blocks-per-row. Blocks flow left→right; the decade
 * extra-gap appears after every 10th block. Returns a pitch when ≥ floor.
 */
function blocksPitchFor(
  width: number,
  height: number,
  years: number,
  perRow: number,
  floor: number,
): number {
  if (perRow < 1 || years < 1) return Infinity
  const gap = 1.3
  const decadeGap = 0.6
  // Widest flow-row width: base gaps + the decade boundaries it can contain.
  const widthFactor =
    perRow * WEEKS_PER_QUARTER + (perRow - 1) * gap + Math.floor(perRow / 10) * decadeGap
  const rowsNeeded = Math.ceil(years / perRow)
  const heightFactor = rowsNeeded * BLOCK_ROWS + (rowsNeeded - 1) * gap
  const p = Math.min(width / widthFactor, height / heightFactor)
  return p >= floor ? p : Infinity
}

/** Shared descriptor builder. */
function describe(mode: GridMode, pitch: number, blocksPerRow: number, totalWeeks: number): GridSolution {
  return {
    mode,
    pitch,
    radius: Math.max(pitch * DOT_RATIO, 0.28),
    totalWeeks,
    blocksPerRow,
    blockWidth: WEEKS_PER_QUARTER * pitch,
    blockHeight: BLOCK_ROWS * pitch,
    gapX: 1.3 * pitch,
    decadeGapX: 0.6 * pitch,
    gapY: 1.3 * pitch,
    blocks: Math.max(Math.ceil(totalWeeks / WEEKS_PER_YEAR), 1),
    weeksPerBlock: WEEKS_PER_YEAR,
  }
}

/**
 * The single entry point. Chooses the layout with the largest pitch that keeps
 * every one of `totalWeeks` dots inside the plot.
 */
export function solveLayout(opts: SolverOptions): GridSolution {
  const { width, height, totalWeeks, minPitch = 6, maxPitch = 12, hardPitch = 4 } = opts
  if (totalWeeks <= 0) return describe('classic', minPitch, 1, totalWeeks)
  const years = Math.ceil(totalWeeks / WEEKS_PER_YEAR)

  // 1. CLASSIC at a readable pitch.
  const pClassic = classicPitch(width, height, totalWeeks, minPitch)
  if (Number.isFinite(pClassic)) return describe('classic', Math.min(pClassic, maxPitch), 1, totalWeeks)

  // 2. YEAR BLOCKS: the pitch along blocks-per-row is unimodal (width tightens
  //    as rows fill; height tightens as they stack), so sweep everything.
  let best = -1
  let bestPerRow = 1
  for (let perRow = 1; perRow <= years; perRow++) {
    const p = blocksPitchFor(width, height, years, perRow, minPitch)
    if (Number.isFinite(p) && p > best) {
      best = p
      bestPerRow = perRow
    }
  }
  if (best >= minPitch) return describe('blocks', Math.min(best, maxPitch), bestPerRow, totalWeeks)

  // 3. Hard floor: same sweep at 4px plus a classic re-check.
  const pClassicHard = classicPitch(width, height, totalWeeks, hardPitch)
  let fallback = pClassicHard
  let fallbackMode: GridMode = 'classic'
  let fallbackPerRow = 1
  for (let perRow = 1; perRow <= years; perRow++) {
    const p = blocksPitchFor(width, height, years, perRow, hardPitch)
    if (Number.isFinite(p) && p > fallback) {
      fallback = p
      fallbackMode = 'blocks'
      fallbackPerRow = perRow
    }
  }
  if (Number.isFinite(fallback)) {
    return describe(fallbackMode, Math.max(fallback, hardPitch), fallbackPerRow, totalWeeks)
  }

  // 4. Terminal squeeze: show all weeks at the best achievable pitch.
  let squeezed = pClassicHard === Infinity ? classicPitch(width, height, totalWeeks, 0) : pClassicHard
  let squeezedPerRow = 0 // 0 marks classic
  for (let perRow = 1; perRow <= years; perRow++) {
    const p = blocksPitchFor(width, height, years, perRow, 0)
    if (p > squeezed) {
      squeezed = p
      squeezedPerRow = perRow
    }
  }
  const tiny = Math.max(squeezed, 0.8)
  if (squeezedPerRow === 0) return describe('classic', tiny, 1, totalWeeks)
  return describe('blocks', tiny, squeezedPerRow, totalWeeks)
}

/* ------------------------------------------------------------------ */
/* Mapping: week index ↔ dot centre (shared by draw + hit test)        */
/* ------------------------------------------------------------------ */

function blockOriginX(sol: GridSolution, block: number): number {
  const perRow = Math.max(sol.blocksPerRow, 1)
  const col = block % perRow
  // Previous blocks take their width; gaps and decade extras sit between.
  return col * (sol.blockWidth + sol.gapX) + Math.floor(col / 10) * sol.decadeGapX
}

function blockOriginY(sol: GridSolution, block: number): number {
  const perRow = Math.max(sol.blocksPerRow, 1)
  const row = Math.floor(block / perRow)
  return row * (sol.blockHeight + sol.gapY)
}

/** Height the layout needs (plot-local). */
export function solutionHeight(sol: GridSolution): number {
  if (sol.mode === 'classic') {
    const years = Math.ceil(sol.totalWeeks / WEEKS_PER_YEAR)
    return years * sol.pitch + Math.floor(years / 10) * sol.decadeGapX
  }
  const rows = Math.ceil(sol.blocks / Math.max(sol.blocksPerRow, 1))
  return rows * sol.blockHeight + Math.max(rows - 1, 0) * sol.gapY
}

/** Width of the widest flow-row (plot-local). */
export function solutionWidth(sol: GridSolution): number {
  if (sol.mode === 'classic') return WEEKS_PER_YEAR * sol.pitch
  const perRow = Math.max(sol.blocksPerRow, 1)
  const widest = Math.min(perRow, sol.blocks)
  return (widest - 1) * sol.gapX + Math.floor((widest - 1) / 10) * sol.decadeGapX + widest * sol.blockWidth
}

/**
 * Dot centre of a week, plot-local. Null when the week is not a real cell
 * (beyond the final partial block).
 */
export function dotCenter(sol: GridSolution, week: number): Pt | null {
  if (week < 0 || week >= sol.totalWeeks) return null
  if (sol.mode === 'classic') {
    const row = Math.floor(week / WEEKS_PER_YEAR)
    const col = week % WEEKS_PER_YEAR
    return {
      x: col * sol.pitch + sol.pitch / 2,
      y: row * sol.pitch + Math.floor(row / 10) * sol.decadeGapX + sol.pitch / 2,
    }
  }
  const year = Math.floor(week / WEEKS_PER_YEAR)
  const local = week - year * WEEKS_PER_YEAR
  const quarter = Math.floor(local / WEEKS_PER_QUARTER)
  const weekInQuarter = local % WEEKS_PER_QUARTER
  return {
    x: blockOriginX(sol, year) + weekInQuarter * sol.pitch + sol.pitch / 2,
    y: blockOriginY(sol, year) + quarter * sol.pitch + sol.pitch / 2,
  }
}

/**
 * Inverse mapping: plot-local point → week index, gap-aware. Hovering in a
 * gap between blocks or block-rows finds nothing. Exact inverse of
 * `dotCenter`: every dot centre maps back to its own week.
 */
export function weekAt(sol: GridSolution, x: number, y: number): number | null {
  if (sol.totalWeeks <= 0) return null
  if (sol.mode === 'classic') {
    const col = Math.floor(x / sol.pitch)
    if (col < 0 || col >= WEEKS_PER_YEAR) return null
    const years = Math.ceil(sol.totalWeeks / WEEKS_PER_YEAR)
    // Rows come in decade bands of 10 with the soft gap between bands only.
    let baseY = 0
    for (let d = 0; d * 10 < years; d++) {
      const rowsInBand = Math.min(10, years - d * 10)
      const bandH = rowsInBand * sol.pitch
      if (y < baseY + bandH) {
        const k = Math.min(Math.floor((y - baseY) / sol.pitch), rowsInBand - 1)
        if (k < 0) return null
        const week = (d * 10 + k) * WEEKS_PER_YEAR + col
        return week < sol.totalWeeks ? week : null
      }
      baseY += bandH + sol.decadeGapX
    }
    return null
  }
  const rowHeight = sol.blockHeight + sol.gapY
  const flowRow = Math.floor(y / rowHeight)
  if (flowRow < 0) return null
  if (y > rowHeight * flowRow + sol.blockHeight) return null // gap between rows
  const innerY = y - rowHeight * flowRow
  if (innerY < 0 || innerY >= sol.blockHeight) return null
  const quarter = Math.floor(innerY / sol.pitch)
  // Walk the flow-row's blocks; the decade gap makes origins non-uniform.
  const perRow = Math.max(sol.blocksPerRow, 1)
  const first = flowRow * perRow
  const last = Math.min(first + perRow - 1, sol.blocks - 1)
  for (let b = first; b <= last; b++) {
    const originX = blockOriginX(sol, b) - blockOriginX(sol, first)
    if (x < originX) return null // in the gap before this block
    if (x < originX + sol.blockWidth) {
      const col = Math.floor((x - originX) / sol.pitch)
      if (col < 0 || col >= WEEKS_PER_QUARTER) return null
      const week = b * WEEKS_PER_YEAR + quarter * WEEKS_PER_QUARTER + col
      return week < sol.totalWeeks ? week : null
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Age labels: every decade, never overlapping another label           */
/* ------------------------------------------------------------------ */

export interface AxisLabel {
  age: number
  text: string
  /** Plot-local y anchor; drawn right-aligned into the label gutter. */
  y: number
  /** Set when the label is drawn centred above its block (plot-local x)
   *  instead of the gutter — happens when two decade-starts share a row. */
  inPlotX?: number
}

export function labelPlan(sol: GridSolution): AxisLabel[] {
  const out: AxisLabel[] = []
  const usedY: number[] = []
  const years = Math.max(Math.ceil(sol.totalWeeks / WEEKS_PER_YEAR), 1)
  for (let decade = 0; decade * 10 < years; decade++) {
    const block = decade * 10
    if (sol.mode === 'blocks' && block >= sol.blocks) break
    if (sol.mode === 'classic') {
      const anchor = dotCenter(sol, Math.min(block * WEEKS_PER_YEAR, sol.totalWeeks - 1))
      if (!anchor) continue
      if (usedY.some((u) => Math.abs(u - anchor.y) < 14)) continue
      usedY.push(anchor.y)
      out.push({ age: block, text: String(block), y: anchor.y })
      continue
    }
    const b = Math.min(block, sol.blocks - 1)
    const gutterY = blockOriginY(sol, b) + (sol.pitch * (BLOCK_ROWS - 1)) / 2
    if (usedY.some((u) => Math.abs(u - gutterY) < 14)) {
      out.push({
        age: block,
        text: String(block),
        y: blockOriginY(sol, b) - 5,
        inPlotX: blockOriginX(sol, b) + sol.blockWidth / 2,
      })
      continue
    }
    usedY.push(gutterY)
    out.push({ age: block, text: String(block), y: gutterY })
  }
  return out
}

/** Caption: "60 years · 3,120 weeks". */
export function captionText(lifeYears: number, totalWeeks: number): string {
  return `${lifeYears} years · ${totalWeeks.toLocaleString('en-US')} weeks`
}

export interface GridGeometryInput {
  width: number
  height: number
  years: number
  weeksPerYear: number
  minPitch: number
  maxPitch: number
  labelFont: { size: number; measure: (text: string) => number }
  footerH: number
  padding: number
  caption?: string
}

export interface GridGeometryBlock {
  year: number
  row: number
  col: number
  x: number
  y: number
}

export interface GridGeometryRow {
  index: number
  firstYear: number
  lastYear: number
  centerY: number
  label: string
}

export interface GridGeometry {
  layout: 'decade' | 'packed'
  pitch: number
  dotRadius: number
  blocksPerRow: number
  rowCount: number
  gutterW: number
  originX: number
  originY: number
  blockW: number
  blockH: number
  blockGapX: number
  blockGapY: number
  decadeGapX: number
  blocks: GridGeometryBlock[]
  rows: GridGeometryRow[]
  captionBox: { x: number; y: number; w: number; h: number; align: 'right' }
  contentBox: { x: number; y: number; w: number; h: number }
  labelFontSize: number
  labelsVisible: boolean[]
  caption: string
  years: number
  weeksPerYear: number
}

interface GeometryCandidate {
  layout: 'decade' | 'packed'
  blocksPerRow: number
  pitch: number
  blockGapY: number
  blockGapX: number
  gutterW: number
  labelFontSize: number
  labels: string[]
  labelsVisible: boolean[]
}

const GEOMETRY_BLOCK_ROWS = 4
const GEOMETRY_BLOCK_GAP = 1.3
const GEOMETRY_DECADE_GAP = 0.6
/** Compact-only floor for fixed desktop panels that cannot fit 5px cells. */
const COMPACT_MIN_PITCH = 4.3

function rowLabels(years: number, blocksPerRow: number, layout: 'decade' | 'packed'): string[] {
  const count = Math.ceil(years / blocksPerRow)
  return Array.from({ length: count }, (_, row) => {
    const first = row * blocksPerRow
    const last = Math.min(first + blocksPerRow - 1, years - 1)
    return layout === 'decade' ? String(first) : `${first}-${last}`
  })
}

function rowWidthUnits(
  years: number,
  blocksPerRow: number,
  row: number,
  weeksPerYear: number,
  blockGapX = GEOMETRY_BLOCK_GAP,
): number {
  const first = row * blocksPerRow
  const count = Math.min(blocksPerRow, years - first)
  if (count <= 0) return 0
  let decadeBoundaries = 0
  for (let year = first + 1; year < first + count; year++) {
    if (year % 10 === 0) decadeBoundaries++
  }
  return (
    count * (weeksPerYear / GEOMETRY_BLOCK_ROWS) +
    Math.max(count - 1, 0) * blockGapX +
    decadeBoundaries * GEOMETRY_DECADE_GAP
  )
}

function geometryCandidate(
  input: GridGeometryInput,
  blocksPerRow: number,
  layout: 'decade' | 'packed',
  footerH: number,
): GeometryCandidate | null {
  const years = Math.max(Math.ceil(input.years), 1)
  const padding = Math.max(input.padding, 16)
  const labels = rowLabels(years, blocksPerRow, layout)
  const captionClearance = footerH > 0 ? 12 : 0
  const measure = (text: string, size = 12) =>
    input.labelFont.measure(text) * (size / Math.max(input.labelFont.size, 1))
  const gutterW = Math.max(...labels.map((text) => measure(text))) + 12
  const rowCount = labels.length
  let blockGapX = GEOMETRY_BLOCK_GAP
  const maxWidthUnits = Math.max(
    ...Array.from({ length: rowCount }, (_, row) =>
      rowWidthUnits(years, blocksPerRow, row, input.weeksPerYear, blockGapX),
    ),
  )
  const availableW = input.width - 2 * padding - gutterW
  const availableH = input.height - footerH - 2 * padding - captionClearance
  if (availableW <= 0 || availableH <= 0) return null

  const heightUnits = rowCount * GEOMETRY_BLOCK_ROWS + Math.max(rowCount - 1, 0) * GEOMETRY_BLOCK_GAP
  const widthPitch = availableW / maxWidthUnits
  const heightPitch = availableH / heightUnits
  let pitch = Math.min(input.maxPitch, widthPitch, heightPitch)
  let blockGapY: number

  if (pitch >= input.minPitch) {
    blockGapY = GEOMETRY_BLOCK_GAP * pitch
  } else {
    pitch = input.minPitch
    const maxCount = Math.min(blocksPerRow, years)
    const maxDecadeBoundaries = Math.max(
      ...Array.from({ length: rowCount }, (_, row) => {
        const first = row * blocksPerRow
        const count = Math.min(blocksPerRow, years - first)
        let boundaries = 0
        for (let year = first + 1; year < first + count; year++) {
          if (year % 10 === 0) boundaries++
        }
        return boundaries
      }),
    )
    const baseUnits = maxCount * (input.weeksPerYear / GEOMETRY_BLOCK_ROWS) + maxDecadeBoundaries * GEOMETRY_DECADE_GAP
    const gaps = Math.max(maxCount - 1, 0)
    if (gaps > 0) blockGapX = Math.min(blockGapX, Math.max(0, (availableW / pitch - baseUnits) / gaps))
    const compactWidth = Math.max(
      ...Array.from({ length: rowCount }, (_, row) =>
        rowWidthUnits(years, blocksPerRow, row, input.weeksPerYear, blockGapX),
      ),
    ) * pitch
    const blockHeight = GEOMETRY_BLOCK_ROWS * pitch
    if (compactWidth > availableW + 1e-6 || rowCount * blockHeight > availableH + 1e-6) return null
    blockGapY = rowCount > 1
      ? Math.min(GEOMETRY_BLOCK_GAP * pitch, (availableH - rowCount * blockHeight) / (rowCount - 1))
      : 0
  }

  const blockHeight = GEOMETRY_BLOCK_ROWS * pitch
  const rowCenters = Array.from({ length: rowCount }, (_, row) =>
    row * (blockHeight + blockGapY) + blockHeight / 2,
  )
  let labelFontSize = 12
  const canShowAll = (size: number) =>
    rowCenters.every((center, i) => i === 0 || center - rowCenters[i - 1] >= size + 2)
  if (!canShowAll(labelFontSize)) labelFontSize = 11
  const labelsVisible = labels.map((_, i) => canShowAll(labelFontSize) || i % 2 === 0)

  return { layout, blocksPerRow, pitch, blockGapY, blockGapX: blockGapX * pitch, gutterW, labelFontSize, labels, labelsVisible }
}

function buildGeometry(
  input: GridGeometryInput,
  candidate: GeometryCandidate,
  footerH: number,
): GridGeometry {
  const years = Math.max(Math.ceil(input.years), 1)
  const weeksPerYear = input.weeksPerYear
  const rowCount = Math.ceil(years / candidate.blocksPerRow)
  const pitch = candidate.pitch
  const blockW = (weeksPerYear / GEOMETRY_BLOCK_ROWS) * pitch
  const blockH = GEOMETRY_BLOCK_ROWS * pitch
  const blockGapX = candidate.blockGapX
  const decadeGapX = GEOMETRY_DECADE_GAP * pitch
  const blockGapY = candidate.blockGapY
  const gridW = Math.max(
    ...Array.from({ length: rowCount }, (_, row) =>
      rowWidthUnits(years, candidate.blocksPerRow, row, weeksPerYear, blockGapX / pitch) * pitch,
    ),
  )
  const gridH = rowCount * blockH + Math.max(rowCount - 1, 0) * blockGapY
  const contentW = candidate.gutterW + gridW
  const padding = Math.max(input.padding, 16)
  const usableH = input.height - footerH - 2 * padding - (footerH > 0 ? 12 : 0)
  const contentX = (input.width - contentW) / 2
  const originX = contentX + candidate.gutterW
  const originY = padding + (usableH - gridH) / 2

  const blocks: GridGeometryBlock[] = []
  const rows: GridGeometryRow[] = []
  for (let row = 0; row < rowCount; row++) {
    const firstYear = row * candidate.blocksPerRow
    const lastYear = Math.min(firstYear + candidate.blocksPerRow - 1, years - 1)
    const y = originY + row * (blockH + blockGapY)
    rows.push({
      index: row,
      firstYear,
      lastYear,
      centerY: y + blockH / 2,
      label: candidate.labels[row],
    })
    let x = originX
    for (let year = firstYear; year <= lastYear; year++) {
      const col = year - firstYear
      blocks.push({ year, row, col, x, y })
      x += blockW
      if (year < lastYear) {
        x += blockGapX
        if ((year + 1) % 10 === 0) x += decadeGapX
      }
    }
  }

  const caption = input.caption ?? captionText(years, years * weeksPerYear)
  const captionW = input.labelFont.measure(caption) * (12 / Math.max(input.labelFont.size, 1))
  const captionBox = footerH > 0
    ? { x: contentX + contentW - captionW, y: input.height - padding - footerH, w: captionW, h: footerH, align: 'right' as const }
    : { x: contentX + contentW, y: input.height, w: 0, h: 0, align: 'right' as const }

  return {
    layout: candidate.layout,
    pitch,
    dotRadius: pitch * DOT_RATIO,
    blocksPerRow: candidate.blocksPerRow,
    rowCount,
    gutterW: candidate.gutterW,
    originX,
    originY,
    blockW,
    blockH,
    blockGapX,
    blockGapY,
    decadeGapX,
    blocks,
    rows,
    captionBox,
    contentBox: { x: contentX, y: originY, w: contentW, h: gridH },
    labelFontSize: candidate.labelFontSize,
    labelsVisible: candidate.labelsVisible,
    caption,
    years,
    weeksPerYear,
  }
}

/** Compute all whole-life grid positions, labels, and footer from one pure input. */
export function computeGridGeometry(input: GridGeometryInput): GridGeometry {
  if (input.weeksPerYear <= 0 || input.weeksPerYear % GEOMETRY_BLOCK_ROWS !== 0) {
    throw new RangeError('weeksPerYear must be a positive multiple of four.')
  }
  const minPitch = Math.max(input.minPitch, 0.1)
  const normalized = { ...input, minPitch, maxPitch: Math.max(input.maxPitch, minPitch) }
  const years = Math.max(Math.ceil(input.years), 1)
  const packed: GeometryCandidate[] = []
  for (let perRow = 1; perRow <= years; perRow++) {
    const candidate = geometryCandidate(normalized, perRow, 'packed', input.footerH)
    if (candidate) packed.push(candidate)
  }
  const bestPacked = packed.reduce<GeometryCandidate | null>(
    (best, candidate) => !best || candidate.pitch > best.pitch ? candidate : best,
    null,
  )
  const decade = geometryCandidate(normalized, 10, 'decade', input.footerH)
  let selected = decade && (!bestPacked || decade.pitch >= bestPacked.pitch * 0.9) ? decade : bestPacked
  let footerH = input.footerH

  if (!selected) {
    footerH = 0
    const noFooterPacked: GeometryCandidate[] = []
    for (let perRow = 1; perRow <= years; perRow++) {
      const candidate = geometryCandidate(normalized, perRow, 'packed', 0)
      if (candidate) noFooterPacked.push(candidate)
    }
    const noFooterBest = noFooterPacked.reduce<GeometryCandidate | null>(
      (best, candidate) => !best || candidate.pitch > best.pitch ? candidate : best,
      null,
    )
    const noFooterDecade = geometryCandidate(normalized, 10, 'decade', 0)
    selected = noFooterDecade && (!noFooterBest || noFooterDecade.pitch >= noFooterBest.pitch * 0.9)
      ? noFooterDecade
      : noFooterBest
  }

  if (!selected) {
    const compactInput = {
      ...normalized,
      minPitch: Math.min(normalized.minPitch, COMPACT_MIN_PITCH),
    }
    const compactPacked: GeometryCandidate[] = []
    for (let perRow = 1; perRow <= years; perRow++) {
      const candidate = geometryCandidate(compactInput, perRow, 'packed', 0)
      if (candidate) compactPacked.push(candidate)
    }
    const compactBest = compactPacked.reduce<GeometryCandidate | null>(
      (best, candidate) => !best || candidate.pitch > best.pitch ? candidate : best,
      null,
    )
    const compactDecade = geometryCandidate(compactInput, 10, 'decade', 0)
    selected = compactDecade && (!compactBest || compactDecade.pitch >= compactBest.pitch * 0.9)
      ? compactDecade
      : compactBest
    footerH = 0
  }

  if (!selected) {
    throw new RangeError('The panel is too small to fit the minimum grid pitch.')
  }
  return buildGeometry(normalized, selected, footerH)
}

/** Centre of a week using the whole-life geometry, in canvas-local pixels. */
export function geometryDotCenter(geometry: GridGeometry, week: number): Pt | null {
  if (week < 0 || week >= geometry.years * geometry.weeksPerYear) return null
  const year = Math.floor(week / geometry.weeksPerYear)
  const block = geometry.blocks[year]
  if (!block) return null
  const weekInYear = week % geometry.weeksPerYear
  const quarter = Math.floor(weekInYear / (geometry.weeksPerYear / GEOMETRY_BLOCK_ROWS))
  const weekInQuarter = weekInYear % (geometry.weeksPerYear / GEOMETRY_BLOCK_ROWS)
  return {
    x: block.x + weekInQuarter * geometry.pitch + geometry.pitch / 2,
    y: block.y + quarter * geometry.pitch + geometry.pitch / 2,
  }
}

/** Gap-aware inverse of `geometryDotCenter`. */
export function geometryWeekAt(geometry: GridGeometry, x: number, y: number): number | null {
  const row = geometry.rows.find(
    (item) => y >= geometry.blocks[item.firstYear].y && y < geometry.blocks[item.firstYear].y + geometry.blockH,
  )
  if (!row) return null
  for (let year = row.firstYear; year <= row.lastYear; year++) {
    const block = geometry.blocks[year]
    if (x < block.x || x >= block.x + geometry.blockW) continue
    const weekColumn = Math.floor((x - block.x) / geometry.pitch)
    const quarter = Math.floor((y - block.y) / geometry.pitch)
    if (weekColumn < 0 || weekColumn >= geometry.weeksPerYear / GEOMETRY_BLOCK_ROWS) return null
    if (quarter < 0 || quarter >= GEOMETRY_BLOCK_ROWS) return null
    const week = year * geometry.weeksPerYear + quarter * (geometry.weeksPerYear / GEOMETRY_BLOCK_ROWS) + weekColumn
    return week < geometry.years * geometry.weeksPerYear ? week : null
  }
  return null
}
