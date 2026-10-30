import { describe, expect, it } from 'vitest'

import { calculateSharedLife } from './sharedLife'

const makePerson = (overrides: Partial<{
  dob: string
  expectedLifespan: number
  visitsPerYear: number
  name: string
  kind: string
}> = {}) => ({
  dob: '1975-06-15',
  expectedLifespan: 75,
  visitsPerYear: 12,
  name: 'Mother',
  kind: 'parent',
  ...overrides,
})

const TODAY = new Date(2026, 5, 15) // June 15, 2026

describe('sharedLife domain', () => {
  it('calculates shared time when user lifespan is shorter', () => {
    // User: DOB 1990, lifespan 60 → end 2050 (24 years remaining)
    // Mother: DOB 1975, lifespan 75 → end 2050 (24 years remaining)
    // Shared end: 2050, same
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.personProjectedEnd).toBe('2050-06-15')
    expect(result.userProjectedEnd).toBe('2050-06-15')
    expect(result.sharedProjectedEnd).toBe('2050-06-15')
    expect(result.isSharedTimePassed).toBe(false)
    expect(result.sharedRemainingYears).toBeGreaterThan(0)
    expect(result.estimatedFutureMeetings).toBeGreaterThan(0)
  })

  it('uses earlier projected end date', () => {
    // User: DOB 1990, lifespan 60 → end 2050
    // Mother: DOB 1950, lifespan 75 → end 2025 (already passed)
    // Shared end: 2025 (mother's, earlier)
    const result = calculateSharedLife(
      makePerson({ dob: '1950-06-15', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.personProjectedEnd).toBe('2025-06-15')
    expect(result.userProjectedEnd).toBe('2050-06-15')
    expect(result.sharedProjectedEnd).toBe('2025-06-15')
    expect(result.isSharedTimePassed).toBe(true)
    expect(result.sharedRemainingYears).toBe(0)
    expect(result.estimatedFutureMeetings).toBe(0)
  })

  it('handles person without DOB (falls back to user estimate)', () => {
    const result = calculateSharedLife(
      makePerson({ dob: undefined, expectedLifespan: undefined, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.personAge).toBeNull()
    expect(result.personExpectedLifespan).toBe(60) // falls back to user's
    expect(result.personProjectedEnd).toBeNull()
    expect(result.sharedProjectedEnd).toBe(result.userProjectedEnd)
  })

  it('calculates estimated future meetings correctly', () => {
    // User: DOB 1990, lifespan 80 → end 2070 (~44 years remaining)
    // Mother: DOB 1975, lifespan 75 → end 2050 (~24 years remaining)
    // Shared end: 2050 (mother's)
    // 24 years × 12 visits/year = ~288 meetings
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      80,
      TODAY,
    )
    expect(result.estimatedFutureMeetings).toBeGreaterThan(200)
    expect(result.estimatedFutureMeetings).toBeLessThan(400)
  })

  it('handles weekly meeting frequency', () => {
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: 75, visitsPerYear: 52 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.estimatedFutureMeetings).toBeGreaterThan(0)
  })

  it('handles custom meeting frequency', () => {
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: 75, visitsPerYear: 4 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.estimatedFutureMeetings).toBeGreaterThan(0)
    expect(result.estimatedFutureMeetings).toBeLessThan(200) // 4/year × ~24 years ≈ 96
  })

  it('returns zero when shared time already passed', () => {
    // Person born 1940, lifespan 75 → end 2015, well in the past
    const result = calculateSharedLife(
      makePerson({ dob: '1940-06-15', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.isSharedTimePassed).toBe(true)
    expect(result.sharedRemainingYears).toBe(0)
    expect(result.sharedRemainingMonths).toBe(0)
    expect(result.estimatedFutureMeetings).toBe(0)
  })

  it('handles leap year DOB (Feb 29)', () => {
    const result = calculateSharedLife(
      makePerson({ dob: '1976-02-29', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.personAge).toBeGreaterThanOrEqual(0)
    expect(result.personProjectedEnd).toBeTruthy()
  })

  it('handles person whose birthday has not occurred yet this year', () => {
    // Person born Dec 20, 1975. Today is June 15, 2026. Birthday not yet reached.
    const result = calculateSharedLife(
      makePerson({ dob: '1975-12-20', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    // Age should be 50 (not 51) because birthday hasn't occurred yet in 2026
    expect(result.personAge).toBe(50)
  })

  it('uses sensible default lifespan when person has none specified', () => {
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: undefined, visitsPerYear: 12 }),
      '1990-06-15',
      80,
      TODAY,
    )
    expect(result.personExpectedLifespan).toBe(80) // user's lifespan as default
  })

  it('explanation is non-alarming', () => {
    const result = calculateSharedLife(
      makePerson({ dob: '1975-06-15', expectedLifespan: 75, visitsPerYear: 12 }),
      '1990-06-15',
      60,
      TODAY,
    )
    expect(result.explanation).not.toContain('death')
    expect(result.explanation).not.toContain('dead')
    expect(result.explanation).toContain('estimate')
  })
})
