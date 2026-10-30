import { describe, expect, it } from 'vitest'

import {
  buildTimeline,
  paginateTimeline,
  getUniqueTags,
  getUniqueMoods,
  formatTimelineDate,
  type TimelineEntry,
} from './timeline'

const makeMeta = (overrides: Partial<{
  date: string
  weekIndex: number
  title?: string
  mood?: number
  tags: string[]
  words: number
  excerpt: string
  updatedAt: number
}> = {}) => ({
  date: '2026-01-15',
  weekIndex: 0,
  title: undefined,
  mood: undefined,
  tags: [],
  words: 0,
  excerpt: '',
  updatedAt: 0,
  ...overrides,
})

describe('timeline domain', () => {
  it('groups entries by year and month, newest first', () => {
    const entries = [
      makeMeta({ date: '2026-03-10', title: 'Mar entry' }),
      makeMeta({ date: '2026-01-05', title: 'Jan entry' }),
      makeMeta({ date: '2025-12-20', title: 'Dec 2025 entry' }),
    ]

    const months = buildTimeline(entries)
    expect(months.length).toBe(3)
    expect(months[0].year).toBe(2026)
    expect(months[0].monthLabel).toBe('March')
    expect(months[1].year).toBe(2026)
    expect(months[1].monthLabel).toBe('January')
    expect(months[2].year).toBe(2025)
    expect(months[2].monthLabel).toBe('December')
  })

  it('sorts entries within a month by date ascending', () => {
    const entries = [
      makeMeta({ date: '2026-01-20', title: 'Later' }),
      makeMeta({ date: '2026-01-05', title: 'Earlier' }),
    ]
    const months = buildTimeline(entries)
    expect(months[0].entries[0].title).toBe('Earlier')
    expect(months[0].entries[1].title).toBe('Later')
  })

  it('filters by tags', () => {
    const entries = [
      makeMeta({ date: '2026-01-05', tags: ['work', 'reflection'] }),
      makeMeta({ date: '2026-01-06', tags: ['family'] }),
    ]
    const months = buildTimeline(entries, { tags: ['work'] })
    expect(months[0].entries.length).toBe(1)
    expect(months[0].entries[0].tags).toContain('work')
  })

  it('filters by moods', () => {
    const entries = [
      makeMeta({ date: '2026-01-05', mood: 5 }),
      makeMeta({ date: '2026-01-06', mood: 2 }),
    ]
    const months = buildTimeline(entries, { moods: [5] })
    expect(months[0].entries.length).toBe(1)
    expect(months[0].entries[0].mood).toBe(5)
  })

  it('paginates timeline months', () => {
    const months: Array<{ year: number; month: number; monthLabel: string; entries: TimelineEntry[] }> = []
    for (let i = 0; i < 25; i++) {
      months.push({ year: 2026, month: i % 12, monthLabel: 'Jan', entries: [] })
    }

    const page1 = paginateTimeline(months as any, 0, 12)
    expect(page1.months.length).toBe(12)
    expect(page1.hasMore).toBe(true)

    const page2 = paginateTimeline(months as any, 1, 12)
    expect(page2.months.length).toBe(12)
    expect(page2.hasMore).toBe(true)

    const page3 = paginateTimeline(months as any, 2, 12)
    expect(page3.months.length).toBe(1)
    expect(page3.hasMore).toBe(false)
  })

  it('extracts unique tags', () => {
    const entries = [
      makeMeta({ date: '2026-01-05', tags: ['work', 'family'] }),
      makeMeta({ date: '2026-01-06', tags: ['work', 'reflection'] }),
    ]
    expect(getUniqueTags(entries)).toEqual(['family', 'reflection', 'work'])
  })

  it('extracts unique moods', () => {
    const entries = [
      makeMeta({ date: '2026-01-05', mood: 5 }),
      makeMeta({ date: '2026-01-06', mood: 5 }),
      makeMeta({ date: '2026-01-07', mood: 2 }),
    ]
    expect(getUniqueMoods(entries)).toEqual([2, 5])
  })

  it('formats timeline date', () => {
    const formatted = formatTimelineDate('2026-01-15')
    expect(formatted).toContain('15')
    expect(formatted).toContain('2026')
  })

  it('handles empty entries', () => {
    const months = buildTimeline([])
    expect(months).toEqual([])
  })
})
