import { describe, expect, it } from 'vitest'

import type { Note } from '../data/model'
import {
  parseSearch,
  previewText,
  searchNotes,
  weekJumps,
} from './search'

let id = 0
function mk(
  weekIndex: number,
  options: { text?: string; mood?: number; tags?: string[] } = {},
): Note {
  const { text, mood, tags = [] } = options
  return {
    id: `n${++id}`,
    profileId: 'p1',
    weekIndex,
    text: text ?? `note ${weekIndex}`,
    mood,
    tags,
    pinned: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

describe('parseSearch', () => {
  it('separates terms, tags and mood tokens', () => {
    expect(parseSearch('do that #Family mood:4')).toEqual({
      terms: ['do', 'that'],
      tags: ['family'],
      mood: 4,
    })
  })

  it('understands m:2 and mood:3/5 spellings', () => {
    expect(parseSearch('m:2')).toEqual({ terms: [], tags: [], mood: 2 })
    expect(parseSearch('mood:3/5')).toEqual({ terms: [], tags: [], mood: 3 })
  })

  it('leaves invalid mood-like tokens as plain terms', () => {
    expect(parseSearch('mood:9 soda')).toEqual({ terms: ['mood:9', 'soda'], tags: [], mood: undefined })
  })

  it('dedupes tags and ignores lone hashes', () => {
    expect(parseSearch('#work #work ##done #')).toEqual({ terms: [], tags: ['work', 'done'], mood: undefined })
  })
})

describe('searchNotes', () => {
  it('is empty for an empty query', () => {
    expect(searchNotes([mk(0)], parseSearch(''))).toEqual([])
  })

  it('matches text case-insensitively (AND across terms)', () => {
    const notes = [
      mk(10, { text: 'Long walk with the dog' }),
      mk(20, { text: 'LONG MEETING DAY' }),
      mk(30, { text: 'Walked rain-long paths' }),
    ]
    const results = searchNotes(notes, parseSearch('long walk'))
    expect(results.map((r) => r.note.weekIndex)).toEqual([10, 30])
    // A note with at least as many hits never ranks behind.
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
  })

  it('accepts a term that only lives inside a tag', () => {
    const results = searchNotes([mk(5, { text: 'quiet day', tags: ['Work'] })], parseSearch('work'))
    expect(results).toHaveLength(1)
  })

  it('filters by tag and by mood', () => {
    const notes = [
      mk(1, { text: 'a', tags: ['work'], mood: 4 }),
      mk(2, { text: 'b', tags: ['work'], mood: 2 }),
      mk(3, { text: 'c', tags: ['family'], mood: 4 }),
      mk(4, { text: 'd' }),
    ]
    expect(searchNotes(notes, parseSearch('#work')).map((r) => r.note.weekIndex)).toEqual([1, 2])
    expect(searchNotes(notes, parseSearch('#work mood:4')).map((r) => r.note.weekIndex)).toEqual([1])
    expect(searchNotes(notes, parseSearch('m:2')).map((r) => r.note.weekIndex)).toEqual([2])
  })

  it('requires every queried tag', () => {
    const notes = [mk(1, { tags: ['a', 'b'] }), mk(2, { tags: ['a'] })]
    expect(searchNotes(notes, parseSearch('#a #b')).map((r) => r.note.weekIndex)).toEqual([1])
  })

  it('ranks score desc then week asc and carries a snippet', () => {
    const results = searchNotes([mk(9, { text: 'tea' }), mk(2, { text: 'tea tea' })], parseSearch('tea'))
    expect(results.map((r) => r.note.weekIndex)).toEqual([2, 9])
    expect(results[1].snippet.length).toBeGreaterThan(0)
  })
})

describe('previewText', () => {
  it('returns short text untouched', () => {
    expect(previewText('short and calm', ['calm'])).toBe('short and calm')
  })

  it('centers long text on the first hit and trims neatly', () => {
    const text = `${'lorem ipsum dorem '.repeat(10)}needle near the end ${'filler filler '.repeat(10)}`
    const snippet = previewText(text, ['needle'])
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet).toContain('needle')
    expect(snippet.length).toBeLessThanOrEqual('…'.length + 72 + '…'.length)
  })

  it('clips from the start when there is no hit', () => {
    const snippet = previewText(`${'a'.repeat(90)} end`, ['nothing'])
    expect(snippet.startsWith('aaa')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })
})

describe('weekJumps', () => {
  it('needs a query', () => {
    expect(weekJumps('', 4000, 100)).toEqual([])
    expect(weekJumps('dog', 4000, 100)).toEqual([])
  })

  it('returns to the current life on "now"', () => {
    expect(weekJumps('NOW', 4000, 123)[0]).toMatchObject({
      kind: 'now',
      weekIndex: 123,
    })
  })

  it('offers both week and age readings for small numbers', () => {
    const jumps = weekJumps('34', 4000, 100)
    expect(jumps).toEqual([
      { kind: 'week', label: expect.stringContaining('age 0'), weekIndex: 34 },
      { kind: 'age', label: expect.stringContaining('Age 34'), weekIndex: 34 * 52 },
    ])
  })

  it('understands week and w prefixes and rejects out-of-range targets', () => {
    expect(weekJumps('week 1200', 4000, 100)).toEqual([
      { kind: 'week', label: expect.stringContaining('age 23'), weekIndex: 1200 },
    ])
    expect(weekJumps('w 1200', 4000, 100)).toHaveLength(1)
    expect(weekJumps('8999', 4000, 100)).toEqual([])
    expect(weekJumps('week -1', 4000, 100)).toEqual([])
  })
})

describe('performance', () => {
  it('searches 1,000 notes far under the 100 ms budget', () => {
    const notes = Array.from({ length: 1000 }, (_, i) =>
      mk(i, { text: `week note about family and work number ${i}`, tags: ['work'], mood: i % 4 === 0 ? 4 : 2 }),
    )
    const t0 = performance.now()
    const results = searchNotes(notes, parseSearch('family #work mood:4'))
    const elapsed = performance.now() - t0
    expect(results.length).toBe(250)
    expect(elapsed).toBeLessThan(100)
  })
})
