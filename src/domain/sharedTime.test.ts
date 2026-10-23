import { describe, expect, it } from 'vitest'

import { parseISODate } from './dates'
import { sharedTime, sharedTimeFor, sharedTimeNote, theirRemainingYears } from './sharedTime'

const TODAY = parseISODate('2026-10-22')

describe('theirRemainingYears', () => {
  it('is the yardstick minus their age, never negative', () => {
    // Born 1966-03-01 → age 60 on 2026-10-22.
    expect(theirRemainingYears('1966-03-01', 80, TODAY)).toEqual({ age: 60, remaining: 20 })
    expect(theirRemainingYears('1900-01-01', 80, TODAY)).toEqual({ age: 126, remaining: 0 })
  })

  it('waits for a missing or invalid date with the full estimate', () => {
    expect(theirRemainingYears(undefined, 80, TODAY)).toEqual({ age: null, remaining: 80 })
    expect(theirRemainingYears('not-a-date', 80, TODAY)).toEqual({ age: null, remaining: 80 })
  })

  it('treats a future birthday as a young person, not negative age', () => {
    expect(theirRemainingYears('2035-06-01', 80, TODAY).age).toBe(0)
  })
})

describe('sharedTime', () => {
  it('multiplies the shared window by visits per year', () => {
    const result = sharedTime(
      {
        visitsPerYear: 4,
        personDob: '1966-03-01',
        yourRemainingYears: 50,
        lifeExpectancy: 80,
      },
      TODAY,
    )
    expect(result.sharedYears).toBe(20)
    expect(result.remainingMeetings).toBe(80)
  })

  it('your estimate can be the limit instead of theirs', () => {
    const result = sharedTime(
      { visitsPerYear: 52, personDob: '1970-01-01', yourRemainingYears: 10, lifeExpectancy: 80 },
      TODAY,
    )
    expect(result.theirRemainingYears).toBe(24)
    expect(result.sharedYears).toBe(10)
    expect(result.remainingMeetings).toBe(520)
  })

  it('stays honest without their birth date: count unknown', () => {
    const result = sharedTime(
      { visitsPerYear: 12, yourRemainingYears: 30, lifeExpectancy: 80 },
      TODAY,
    )
    expect(result.personAge).toBeNull()
    expect(result.remainingMeetings).toBeNull()
    expect(result.sharedYears).toBe(30)
  })

  it('stops counting when visits stop', () => {
    expect(
      sharedTime(
        { visitsPerYear: 0, personDob: '1966-03-01', yourRemainingYears: 20, lifeExpectancy: 80 },
        TODAY,
      ).remainingMeetings,
    ).toBe(0)
  })

  it('caps at zero once they pass the yardstick', () => {
    const result = sharedTime(
      { visitsPerYear: 6, personDob: '1938-01-01', yourRemainingYears: 20, lifeExpectancy: 80 },
      TODAY,
    )
    expect(result.remainingMeetings).toBe(0)
  })
})

describe('sharedTimeFor', () => {
  it('reads straight from a Relationship-shaped record', () => {
    const result = sharedTimeFor(
      { visitsPerYear: 2, dob: '1990-01-01' },
      40,
      80,
      parseISODate('2026-10-22'),
    )
    expect(result.personAge).toBe(36)
    expect(result.remainingMeetings).toBe(80)
  })
})

describe('sharedTimeNote', () => {
  it('explains the assumption when no birth date exists', () => {
    expect(sharedTimeNote(null)).toContain('No birth date yet')
  })
  it('explains the yardstick when the age is known', () => {
    expect(sharedTimeNote(60)).toContain('age 60')
  })
})
