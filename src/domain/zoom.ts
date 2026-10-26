/**
 * Zoom views: the full life, a decade of ages, or a single year.
 * Pure helpers for the layout math so the canvas never derives views itself.
 */

import { WEEKS_PER_YEAR } from './dates'

export type ZoomLevel = 'life' | 'decade' | 'year'

/** Ages per row band in the decade view. */
export const DECADE_ROWS = 10
/** Rows in the year view: one per weekday — 52 weeks × 7 days of dots. */
export const YEAR_ROWS = 7
/** Columns of weeks in the year view. */
export const YEAR_COLS = 52

/** Cycles life → decade → year → life, for the Z key. */
export function nextZoom(zoom: ZoomLevel): ZoomLevel {
  if (zoom === 'life') return 'decade'
  if (zoom === 'decade') return 'year'
  return 'life'
}

export function decadeCount(totalRows: number): number {
  return Math.max(Math.ceil(totalRows / DECADE_ROWS), 1)
}

/** Decade band that contains the current week. */
export function decadeOf(weeksLived: number): number {
  const ageRows = Math.floor(Math.max(weeksLived, 0) / WEEKS_PER_YEAR)
  return Math.floor(ageRows / DECADE_ROWS)
}

export function clampDecade(decade: number, totalRows: number): number {
  return Math.min(Math.max(Math.round(decade), 0), decadeCount(totalRows) - 1)
}

/** Age year that contains the current week. */
export function yearOf(weeksLived: number): number {
  return Math.floor(Math.max(weeksLived, 0) / WEEKS_PER_YEAR)
}

export function clampYear(year: number, totalRows: number): number {
  return Math.min(Math.max(Math.round(year), 0), Math.max(totalRows - 1, 0))
}

export interface ViewLayout {
  /** Grid rows in this view. */
  rows: number
  /** Grid columns: 52 everywhere except the year view (13). */
  cols: number
  /** Absolute week index of the top-left cell. */
  weekOffset: number
}

/** Resolve the canvas geometry for a zoom level, clamped to the real grid. */
export function viewLayout(
  zoom: ZoomLevel,
  totalRows: number,
  decade: number,
  year: number,
): ViewLayout {
  const rows = Math.max(totalRows, 1)
  if (zoom === 'year' && totalRows > 0) {
    const y = clampYear(year, totalRows)
    // The year view is day-granular: 52 columns × 7 weekday rows, one dot
    // per day of the age-year. weekOffset anchors the leftmost column's
    // week; the canvas translates (col,row) → absolute day index.
    return { rows: YEAR_ROWS, cols: YEAR_COLS, weekOffset: y * WEEKS_PER_YEAR }
  }
  if (zoom === 'decade') {
    const d = clampDecade(decade, totalRows)
    const bandRows = Math.max(Math.min(DECADE_ROWS, rows - d * DECADE_ROWS), 0)
    return {
      rows: Math.max(bandRows, 1),
      cols: WEEKS_PER_YEAR,
      weekOffset: d * DECADE_ROWS * WEEKS_PER_YEAR,
    }
  }
  return { rows, cols: WEEKS_PER_YEAR, weekOffset: 0 }
}
