import { describe, expect, it } from 'vitest'

import { parseISODate } from './dates'
import {
  countWords,
  dateKey,
  dayInWeek,
  dayIndex,
  excerptOf,
  formatDayLong,
  isValidKey,
  keyFromIndex,
  onThisDay,
  parseKey,
  promptFor,
  PROMPTS,
  shiftKey,
  streaks,
  weekOfDate,
} from './daily'

const DOB = parseISODate('1994-05-04')
const T = (s: string) => parseISODate(s)

describe('keys', () => {
  it('round-trips a local date', () => {
    const d = new Date(2026, 9, 23)
    expect(dateKey(d)).toBe('2026-10-23')
    expect(parseKey('2026-10-23').getFullYear()).toBe(2026)
    expect(parseKey('2026-10-23').getMonth()).toBe(9)
    expect(parseKey('2026-10-23').getDate()).toBe(23)
  })

  it('validates keys strictly', () => {
    expect(isValidKey('2026-02-29')).toBe(false) // not a leap year
    expect(isValidKey('2024-02-29')).toBe(true)
    expect(isValidKey('2026-1-3')).toBe(false)
    expect(isValidKey('junk')).toBe(false)
  })

  it('shifts across month ends', () => {
    expect(shiftKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftKey('2024-02-28', 1)).toBe('2024-02-29')
  })
})

describe('day/week mapping', () => {
  it('maps day index and week consistently', () => {
    expect(dayIndex(DOB, DOB)).toBe(0)
    expect(keyFromIndex(DOB, 0)).toBe('1994-05-04')
    expect(weekOfDate(DOB, DOB)).toBe(0)
    expect(dayInWeek(DOB, DOB)).toBe(0)
    // day 7 = first day of week 1
    expect(dayIndex(DOB, parseKey('1994-05-11'))).toBe(7)
    expect(weekOfDate(DOB, parseKey('1994-05-11'))).toBe(1)
    expect(dayInWeek(DOB, parseKey('1994-05-11'))).toBe(0)
    // mid-week
    expect(dayInWeek(DOB, parseKey('1994-05-13'))).toBe(2)
    // before birth: week -1
    expect(weekOfDate(DOB, parseKey('1994-05-01'))).toBe(-1)
  })
})

describe('streaks with one grace day per 7-day bucket', () => {
  it('simple run', () => {
    const s = streaks(['2026-10-20', '2026-10-21', '2026-10-22'], T('2026-10-22'))
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
  })

  it('one missing day per bucket stays bridged', () => {
    // Write Mon–Fri, skip Sat (same bucket), resume Sun+Mon.
    const s = streaks(
      ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25', '2026-10-26'],
      T('2026-10-26'),
    )
    expect(s.current).toBe(7) // six written + one bridged
    expect(s.longest).toBe(7)
  })

  it('two missing days in a bucket break the run', () => {
    const s = streaks(
      ['2026-10-19', '2026-10-20', '2026-10-23', '2026-10-26'],
      T('2026-10-26'),
    )
    // Sat 24th and Sun 25th both missing between 23 and 26 → cannot bridge.
    expect(s.current).toBe(1)
    expect(s.longest).toBeGreaterThanOrEqual(2)
  })

  it('today unwritten does not erase the current streak', () => {
    const s = streaks(['2026-10-20', '2026-10-21', '2026-10-22'], T('2026-10-23'))
    expect(s.current).toBe(3)
  })

  it('empty history', () => {
    expect(streaks([], T('2026-10-23'))).toEqual({ current: 0, longest: 0 })
  })
})

describe('writing helpers', () => {
  it('counts words and clamps the excerpt to 120 chars', () => {
    expect(countWords('one two three')).toBe(3)
    expect(countWords('   ')).toBe(0)
    const long = 'a'.repeat(300)
    const ex = excerptOf(long)
    expect(ex.length).toBe(120)
    expect(ex.endsWith('…')).toBe(true)
    expect(excerptOf('short note')).toBe('short note')
  })
})

describe('prompts', () => {
  it('bundles under 2KB and is deterministic per date', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(PROMPTS)).length
    expect(bytes).toBeLessThan(2048)
    expect(promptFor('2026-10-23')).toBe(promptFor('2026-10-23'))
    expect(new Set(PROMPTS).size).toBe(PROMPTS.length)
  })
})

describe('onThisDay', () => {
  it('picks same month/day from earlier years, newest first, capped', () => {
    const metas = [
      { date: '2025-10-23', excerpt: 'five years', mood: 4 },
      { date: '2024-10-23', excerpt: 'two years' },
      { date: '2023-10-22', excerpt: 'wrong day' },
      { date: '2023-10-23', excerpt: 'three years' },
      { date: '2026-10-23', excerpt: 'today does not count' },
    ]
    const got = onThisDay(metas, T('2026-10-23'))
    expect(got.map((g) => g.date)).toEqual(['2025-10-23', '2024-10-23', '2023-10-23'])
    expect(got[0].yearsAgo).toBe(1)
    expect(got[2].yearsAgo).toBe(3)
  })
})

describe('formatDayLong', () => {
  it('uses the serif-short weekday format', () => {
    expect(formatDayLong('2026-10-23')).toContain('Fri')
    expect(formatDayLong('2026-10-23')).toContain('Oct')
    expect(formatDayLong('2026-10-23')).toContain('23')
  })
})
