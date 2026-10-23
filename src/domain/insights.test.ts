import { describe, expect, it } from 'vitest'

import type { Note } from '../data/model'
import { WEEKS_PER_YEAR } from './dates'
import { busiestYears, insightSummary, moodHeatRows, topTags } from './insights'

let id = 0
function mk(weekIndex: number, options: { mood?: number; tags?: string[] } = {}): Note {
  const { mood, tags = [] } = options
  return {
    id: `n${++id}`,
    profileId: 'p1',
    weekIndex,
    text: `note ${weekIndex}`,
    mood,
    tags,
    pinned: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

describe('moodHeatRows', () => {
  it('is empty with no notes', () => {
    expect(moodHeatRows([])).toEqual([])
  })

  it('builds exactly 52 cells per row, mapped low to high', () => {
    const rows = moodHeatRows([mk(0, { mood: 3 })])
    expect(rows).toHaveLength(1)
    expect(rows[0].ageYears).toBe(0)
    expect(rows[0].cells).toHaveLength(WEEKS_PER_YEAR)
    expect(rows[0].cells[0]).toEqual({ weekIndex: 0, mood: 3, noted: true })
    expect(rows[0].cells[1].noted).toBe(false)
    expect(rows[0].cells[1].mood).toBeNull()
  })

  it('spans every age between the first and last noted year', () => {
    const rows = moodHeatRows([mk(0), mk(110, { mood: 4 })])
    expect(rows.map((r) => r.ageYears)).toEqual([0, 1, 2])
    expect(rows[0].notedCount).toBe(1)
    expect(rows[1].cells[0].noted).toBe(false)
    expect(rows[2].cells[6]).toEqual({
      weekIndex: 2 * WEEKS_PER_YEAR + 6,
      mood: 4,
      noted: true,
    })
  })

  it('keeps noted weeks without a mood visible', () => {
    const rows = moodHeatRows([mk(60)])
    expect(rows).toHaveLength(1)
    expect(rows[0].notedCount).toBe(1)
    expect(rows[0].cells[8].mood).toBeNull()
    expect(rows[0].cells[8].noted).toBe(true)
  })
})

describe('topTags', () => {
  it('is empty with no notes', () => {
    expect(topTags([])).toEqual([])
  })

  it('counts case-insensitively and sorts by count then tag', () => {
    const notes = [
      mk(0, { tags: ['work', 'Family'] }),
      mk(1, { tags: ['WORK'] }),
      mk(2, { tags: ['health'] }),
    ]
    expect(topTags(notes)).toEqual([
      { tag: 'work', count: 2 },
      { tag: 'family', count: 1 },
      { tag: 'health', count: 1 },
    ])
  })

  it('respects the limit', () => {
    const notes = [mk(0, { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })]
    expect(topTags(notes, 3)).toHaveLength(3)
    expect(topTags(notes, 0)).toEqual([])
  })
})

describe('busiestYears', () => {
  it('is empty with no notes', () => {
    expect(busiestYears([])).toEqual([])
  })

  it('ranks years by note count, breaking ties by earlier age', () => {
    const notes = [mk(60), mk(65), mk(0), mk(1), mk(120)]
    expect(busiestYears(notes, 2)).toEqual([
      { ageYears: 0, count: 2 },
      { ageYears: 1, count: 2 },
    ])
  })

  it('respects the limit', () => {
    const notes = [mk(0), mk(2), mk(53), mk(106), mk(160)]
    expect(busiestYears(notes, 2)).toEqual([
      { ageYears: 0, count: 2 },
      { ageYears: 1, count: 1 },
    ])
  })
})

describe('insightSummary', () => {
  it('counts notes, moods and tag entries', () => {
    const notes = [
      mk(0, { mood: 4, tags: ['a', 'b'] }),
      mk(1, { tags: ['b'] }),
      mk(2),
    ]
    expect(insightSummary(notes)).toEqual({
      totalNotes: 3,
      withMood: 1,
      tagEntries: 3,
    })
  })
})
