import { describe, expect, it } from 'vitest'
import { generateAnnualSummary } from './annualReview'
import type { EntryMeta } from '../core/journal'

describe('annualReview domain', () => {
  it('generates summary stats correctly', () => {
    const dob = new Date(2000, 0, 1)
    const entries: EntryMeta[] = [
      {
        date: '2026-05-01',
        weekIndex: 1350,
        words: 150,
        mood: 4,
        tags: ['reflection', 'work'],
        excerpt: 'Great day',
        updatedAt: 1700000000000,
      },
      {
        date: '2026-05-02',
        weekIndex: 1350,
        words: 200,
        mood: 5,
        tags: ['reflection', 'family'],
        excerpt: 'Wonderful day',
        updatedAt: 1700000000000,
      },
    ]

    const summary = generateAnnualSummary(2026, entries, [], [], dob)
    expect(summary.totalEntries).toBe(2)
    expect(summary.totalWords).toBe(350)
    expect(summary.averageMood).toBe(4.5)
    expect(summary.topTags[0][0]).toBe('reflection')
  })
})
