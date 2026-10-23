import { describe, expect, it } from 'vitest'

import { DAY_NAMES, DAY_SHORT, previousNoteWeek, reviewDue, reviewWeekDay } from './review'
import { parseISODate } from './dates'

describe('previousNoteWeek', () => {
  it('pairs the current week with the one just lived', () => {
    expect(previousNoteWeek(10)).toBe(9)
  })

  it('waits for week zero', () => {
    expect(previousNoteWeek(0)).toBeNull()
  })
})

describe('reviewDue', () => {
  const sunday = parseISODate('2026-10-18') // a Sunday

  it('is never due without a reminder day', () => {
    expect(reviewDue(sunday, undefined, undefined, 100)).toBe(false)
  })

  it('is due on the chosen day when this week is not reviewed', () => {
    expect(reviewDue(sunday, 0, 90, 100)).toBe(true)
  })

  it('waits for the chosen day', () => {
    expect(reviewDue(sunday, 1, 90, 100)).toBe(false)
  })

  it('stands down once the current week is reviewed', () => {
    expect(reviewDue(sunday, 0, 100, 100)).toBe(false)
    expect(reviewDue(sunday, 0, 105, 100)).toBe(false)
  })

  it('skipping a week costs nothing', () => {
    // Last reviewed two weeks ago: due again, no guilt, no penalty.
    expect(reviewDue(sunday, 0, 89, 100)).toBe(true)
    // And next week, still 100 reviews-pending, it simply rings again.
    expect(reviewDue(sunday, 0, 93, 101)).toBe(true)
  })

  it('calls every day of the week equally', () => {
    const thursday = parseISODate('2026-10-22')
    expect(reviewDue(thursday, 4, undefined, 10)).toBe(true)
    expect(DAY_NAMES[4]).toBe('Thursday')
    expect(DAY_SHORT[4]).toBe('Th')
  })
})

describe('reviewWeekDay', () => {
  it('maps a week index to the weekday it starts on', () => {
    // Mon Jan 1, 1990 was a Monday (day 1); the year turns every 52 weeks.
    const dob = parseISODate('1990-01-01')
    expect(reviewWeekDay(dob, 0)).toBe(1)
    // Week 52 lands exactly one calendar year later (1990 is not a leap year starting Monday).
    expect(reviewWeekDay(dob, 52)).toBe(1)
  })
})
