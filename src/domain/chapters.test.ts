import { describe, expect, it } from 'vitest'

import type { Chapter } from '../data/model'
import {
  chapterAt,
  chapterWindowSegments,
  clampRange,
  findOverlap,
  formatChapterAges,
  validateChapterDraft,
} from './chapters'

const mk = (id: string, startWeek: number, endWeek: number): Chapter => ({
  id,
  profileId: 'p1',
  name: id,
  startWeek,
  endWeek,
  color: 'teal',
})

describe('formatChapterAges', () => {
  it('collapses a single-year range', () => {
    expect(formatChapterAges(0, 51)).toBe('Age 0')
    expect(formatChapterAges(52, 103)).toBe('Age 1')
  })

  it('spans multiple ages', () => {
    expect(formatChapterAges(520, 1039)).toBe('Ages 10\u201319')
  })
})

describe('findOverlap', () => {
  const chapters = [mk('a', 100, 199), mk('b', 260, 519)]

  it('finds a chapter that shares weeks', () => {
    expect(findOverlap(chapters, 150, 300)?.id).toBe('a')
    expect(findOverlap(chapters, 500, 600)?.id).toBe('b')
  })

  it('treats touching ranges as non-overlapping', () => {
    expect(findOverlap(chapters, 200, 259)).toBeUndefined()
  })

  it('ignores a chapter by id (while editing)', () => {
    expect(findOverlap(chapters, 150, 180, 'a')).toBeUndefined()
  })

  it('returns nothing for an empty range', () => {
    expect(findOverlap(chapters, 0, 50)).toBeUndefined()
  })
})

describe('clampRange', () => {
  it('pulls values inside the grid', () => {
    expect(clampRange(-10, 99999, 4160)).toEqual({ startWeek: 0, endWeek: 4159 })
  })

  it('keeps start before end when both flip outside', () => {
    expect(clampRange(5000, 4000, 4160)).toEqual({ startWeek: 4000, endWeek: 4159 })
  })

  it('handles an empty grid', () => {
    expect(clampRange(0, 10, 0)).toEqual({ startWeek: 0, endWeek: 0 })
  })
})

describe('validateChapterDraft', () => {
  const totalCells = 4160
  const others = [mk('career', 936, 3379)]

  it('accepts a valid draft', () => {
    const draft = { name: 'School', startWeek: 0, endWeek: 935, color: 'teal' }
    expect(validateChapterDraft(draft, others, totalCells)).toBeNull()
  })

  it('rejects a blank name calmly', () => {
    expect(validateChapterDraft({ name: '   ', ...{ startWeek: 0, endWeek: 9 }, color: 'teal' }, [], totalCells)).toBe(
      'Add a short name.',
    )
  })

  it('rejects an inverted range', () => {
    expect(
      validateChapterDraft({ name: 'X', startWeek: 500, endWeek: 100, color: 'teal' }, [], totalCells),
    ).toBe('The end must come after the start.')
  })

  it('rejects ranges outside the grid', () => {
    expect(
      validateChapterDraft({ name: 'X', startWeek: 0, endWeek: totalCells, color: 'teal' }, [], totalCells),
    ).toBe('Keep the range inside the grid.')
  })

  it('rejects overlaps with existing chapters', () => {
    expect(
      validateChapterDraft({ name: 'X', startWeek: 900, endWeek: 1000, color: 'teal' }, others, totalCells),
    ).toBe('Chapters cannot overlap. Adjust the range.')
    // Fitting exactly between neighbours is fine.
    expect(
      validateChapterDraft({ name: 'X', startWeek: 0, endWeek: 935, color: 'teal' }, others, totalCells),
    ).toBeNull()
  })
})

describe('chapterAt', () => {
  const chapters = [mk('a', 0, 51), mk('b', 100, 151)]

  it('matches inclusive endpoints', () => {
    expect(chapterAt(chapters, 0)?.id).toBe('a')
    expect(chapterAt(chapters, 51)?.id).toBe('a')
  })

  it('returns undefined between and after chapters', () => {
    expect(chapterAt(chapters, 80)).toBeUndefined()
    expect(chapterAt(chapters, 200)).toBeUndefined()
  })
})

describe('chapterWindowSegments', () => {
  it('splits a single row into one segment (full-life window)', () => {
    expect(chapterWindowSegments(mk('a', 4, 20), 52, 0, 52 * 80)).toEqual([
      { row: 0, startCol: 4, endCol: 20 },
    ])
  })

  it('clamps middle and final rows of a multi-row band', () => {
    const segs = chapterWindowSegments(mk('a', 40, 120), 52, 0, 52 * 5)
    expect(segs).toEqual([
      { row: 0, startCol: 40, endCol: 51 },
      { row: 1, startCol: 0, endCol: 51 },
      { row: 2, startCol: 0, endCol: 16 },
    ])
  })

  it('drops chapters fully outside the window', () => {
    // A two-row window covers weeks 0-103; chapter 200-300 is past it.
    expect(chapterWindowSegments(mk('a', 200, 300), 52, 0, 104)).toEqual([])
  })

  it('clamps a chapter that continues past the window', () => {
    const segs = chapterWindowSegments(mk('a', 90, 120), 52, 0, 104)
    expect(segs).toEqual([{ row: 1, startCol: 38, endCol: 51 }])
  })

  it('paints a 13-column year window with window-relative columns', () => {
    // Window covers weeks 156-207; chapter 160-175 starts mid-row 0, wraps.
    const segs = chapterWindowSegments(mk('a', 160, 175), 13, 156, 52)
    expect(segs).toEqual([
      { row: 0, startCol: 4, endCol: 12 },
      { row: 1, startCol: 0, endCol: 6 },
    ])
  })
})
