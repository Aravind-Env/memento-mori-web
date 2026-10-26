import { describe, expect, it } from 'vitest'

import { matchesDaily, parseDailySearch, searchDailyMetas, splitOnTerm, type DailyMetaLike } from './dailySearch'

const row = (over: Partial<DailyMetaLike>): DailyMetaLike => ({
  date: '2026-10-23',
  tags: [],
  excerpt: 'played the piano badly',
  ...over,
})

describe('parseDailySearch', () => {
  it('splits words, tags, mood and flags', () => {
    const q = parseDailySearch(' piano #work mood:4 has:good-thing ')
    expect(q.terms).toEqual(['piano'])
    expect(q.tags).toEqual(['work'])
    expect(q.mood).toBe(4)
    expect(q.hasGoodThing).toBe(true)
  })

  it('understands date, before and after bounds', () => {
    expect(parseDailySearch('date:2026-10').date).toEqual({ y: 2026, m: 10, d: undefined })
    expect(parseDailySearch('date:2023').date).toEqual({ y: 2023, m: undefined, d: undefined })
    expect(parseDailySearch('before:2024-06')).toMatchObject({ before: '2024-06-31' })
    expect(parseDailySearch('after:2023-09-01')).toMatchObject({ after: '2023-09-01' })
    // malformed tokens are dropped, not fatal
    expect(parseDailySearch('date:99').date).toBeUndefined()
    expect(parseDailySearch('before:abc').before).toBeUndefined()
  })

  it('keeps unknown words as plain terms', () => {
    expect(parseDailySearch('hard odd:day day:of-days').terms).toEqual([
      'hard',
      'odd:day',
      'day:of-days',
    ])
  })
})

describe('matchesDaily', () => {
  const q = (raw: string) => parseDailySearch(raw)

  it('term AND semantics over title + excerpt + tags + good thing', () => {
    expect(matchesDaily(row({ title: 'Sunday' }), q('piano'))).toBe(true)
    expect(matchesDaily(row({}), q('piano badly'))).toBe(true)
    expect(matchesDaily(row({}), q('piano terrible'))).toBe(false)
    expect(matchesDaily(row({ tags: ['music'] }), q('#music'))).toBe(true)
    expect(matchesDaily(row({ goodThing: 'coffee in the sun' }), q('has:good-thing'))).toBe(true)
    expect(matchesDaily(row({}), q('has:good-thing'))).toBe(false)
  })

  it('filters by mood and date bounds', () => {
    expect(matchesDaily(row({ mood: 2 }), q('mood:2'))).toBe(true)
    expect(matchesDaily(row({ mood: 2 }), q('mood:3'))).toBe(false)
    expect(matchesDaily(row({ date: '2025-02-11' }), q('date:2025-02'))).toBe(true)
    expect(matchesDaily(row({ date: '2026-05-11' }), q('date:2025'))).toBe(false)
    expect(
      matchesDaily(row({ date: '2024-12-31' }), q('before:2025-01-01')),
    ).toBe(true)
    expect(
      matchesDaily(row({ date: '2025-01-01' }), q('before:2025-01-01')),
    ).toBe(false)
    expect(matchesDaily(row({ date: '2025-01-02' }), q('after:2025-01-01'))).toBe(true)
  })

  it('combines filters with AND', () => {
    expect(matchesDaily(row({ mood: 4, tags: ['work'] }), q('#work mood:4'))).toBe(true)
    expect(matchesDaily(row({ mood: 3, tags: ['work'] }), q('#work mood:4'))).toBe(false)
  })
})

describe('searchDailyMetas', () => {
  const rows = [
    row({ excerpt: 'a quiet walk', date: '2026-01-02' }),
    row({ excerpt: 'walk the dogs', date: '2026-03-04' }),
    row({ excerpt: 'walked uphill', date: '2025-06-07', mood: 2 }),
  ]
  it('sorts newest first within equal score', () => {
    expect(searchDailyMetas(rows, 'walk').map((r) => r.date)).toEqual([
      '2026-03-04',
      '2026-01-02',
      '2025-06-07',
    ])
  })
  it('searches title words too', () => {
    expect(searchDailyMetas(rows, 'uphill').map((r) => r.date)).toEqual(['2025-06-07'])
  })
  it('returns nothing for a hopeless query', () => {
    expect(searchDailyMetas(rows, 'zeppelin')).toEqual([])
  })
  it('handles the full-house filter chain', () => {
    expect(
      searchDailyMetas(rows, 'walk #meh after:2025-01-01').map((r) => r.date),
    ).toEqual([])
  })
})

describe('splitOnTerm', () => {
  it('splits on the first case-insensitive hit', () => {
    expect(splitOnTerm('Called Anna today', 'anna')).toEqual([
      'Called ',
      'Anna',
      ' today',
    ])
  })
  it('returns null when absent', () => {
    expect(splitOnTerm('Nothing here', 'anna')).toBeNull()
    expect(splitOnTerm('Nothing here', '')).toBeNull()
  })
})
