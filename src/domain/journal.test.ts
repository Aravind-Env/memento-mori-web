import { describe, expect, it } from 'vitest'

import type { Note } from '../data/model'
import { addDays, parseISODate, weekStart } from './dates'
import { groupJournal, journalSummary, toEntry } from './journal'

const DOB = parseISODate('1990-01-01')

function makeNote(weekIndex: number, text = 'a note'): Note {
  return {
    id: `n${weekIndex}`,
    profileId: 'p1',
    weekIndex,
    text,
    tags: [],
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('groupJournal', () => {
  it('groups spans of week indexes newest-first into year and month buckets', () => {
    const years = groupJournal([makeNote(0), makeNote(53), makeNote(500)], DOB)

    // 500 weeks (oldest here is week 0)... newest first means the highest
    // weekIndex leads every bucket.
    const flat = years.flatMap((y) => y.months.flatMap((m) => m.entries))
    expect(flat.map((e) => e.note.weekIndex)).toEqual([500, 53, 0])

    for (const entry of flat) {
      const start = weekStart(DOB, entry.note.weekIndex)
      expect(entry.start.getFullYear()).toBe(start.getFullYear())
      expect(entry.start.getMonth()).toBe(start.getMonth())
      expect(entry.age).toBe(Math.floor(entry.note.weekIndex / 52))
    }

    // Every week sits in the year/month its week begins in; bucket labels are
    // consistent with the entries inside them.
    for (const y of years) {
      expect(y.year).toBe(y.months[0].year)
      for (const m of y.months) {
        expect(m.year).toBe(y.year)
        for (const e of m.entries) {
          expect(e.start.getFullYear()).toBe(y.year)
        }
      }
    }
  })

  it('keeps the input order irrelevant — always newest first', () => {
    const a = groupJournal([makeNote(10), makeNote(2), makeNote(7)], DOB)
    const b = groupJournal([makeNote(2), makeNote(10), makeNote(7)], DOB)
    const pick = (g: typeof a) =>
      g.flatMap((y) => y.months.flatMap((m) => m.entries.map((e) => e.note.weekIndex)))
    expect(pick(a)).toEqual(pick(b))
    expect(pick(a)).toEqual([10, 7, 2])
  })

  it('cross-month and cross-year boundaries start new buckets', () => {
    const years = groupJournal([makeNote(0), makeNote(52), makeNote(53)], DOB)
    const totalBuckets = years.reduce((a, y) => a + y.months.length, 0)
    // Week 0 = Jan 1990; week 52 = Dec 1990; week 53 = Jan 1991.
    expect(totalBuckets).toBe(3)
    expect(years.map((y) => y.year)).toEqual([1991, 1990])
  })

  it('returns an empty list for no notes', () => {
    expect(groupJournal([], DOB)).toEqual([])
  })
})

describe('toEntry', () => {
  it('derives the start date and grid age from the DOB', () => {
    const entry = toEntry(makeNote(104), DOB)
    expect(entry.start.getTime()).toBe(addDays(parseISODate('1990-01-01'), 104 * 7).getTime())
    expect(entry.age).toBe(2)
  })
})

describe('journalSummary', () => {
  it('summarises count and span of written weeks', () => {
    const s = journalSummary([makeNote(100), makeNote(0), makeNote(52)], DOB)
    expect(s.count).toBe(3)
    expect(s.first?.getTime()).toBe(parseISODate('1990-01-01').getTime())
    expect(s.last?.getTime()).toBe(addDays(parseISODate('1990-01-01'), 700).getTime())
  })

  it('is empty with no notes', () => {
    expect(journalSummary([], DOB)).toEqual({ count: 0, first: null, last: null })
  })
})
