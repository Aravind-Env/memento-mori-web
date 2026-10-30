import { describe, expect, it } from 'vitest'

import {
  calculateStorageWarning,
  formatBytes,
  frequencyDays,
  getBackupHealthStatus,
  isBackupDue,
} from './storageHealth'

describe('storageHealth domain', () => {
  it('calculates frequency days correctly', () => {
    expect(frequencyDays('weekly')).toBe(7)
    expect(frequencyDays('monthly')).toBe(30)
    expect(frequencyDays('quarterly')).toBe(90)
    expect(frequencyDays('off')).toBe(Infinity)
  })

  it('determines if backup is due correctly', () => {
    const now = 1_700_000_000_000
    const DAY = 86_400_000

    // Off frequency is never due
    expect(isBackupDue(undefined, 'off', now)).toBe(false)

    // Never backed up and weekly frequency IS due
    expect(isBackupDue(undefined, 'weekly', now)).toBe(true)

    // Backed up 5 days ago with weekly frequency IS NOT due
    expect(isBackupDue(now - 5 * DAY, 'weekly', now)).toBe(false)

    // Backed up 8 days ago with weekly frequency IS due
    expect(isBackupDue(now - 8 * DAY, 'weekly', now)).toBe(true)

    // Backed up 8 days ago but dismissed 1 day ago IS NOT due yet (snoozed)
    expect(isBackupDue(now - 8 * DAY, 'weekly', now, now - 1 * DAY)).toBe(false)

    // Backed up 8 days ago and dismissed 4 days ago IS due
    expect(isBackupDue(now - 8 * DAY, 'weekly', now, now - 4 * DAY)).toBe(true)
  })

  it('determines backup health status correctly', () => {
    const now = 1_700_000_000_000
    const DAY = 86_400_000

    expect(getBackupHealthStatus(undefined, 'weekly', now, true)).toBe('failed')
    expect(getBackupHealthStatus(undefined, 'weekly', now)).toBe('never')
    expect(getBackupHealthStatus(now - 2 * DAY, 'weekly', now)).toBe('healthy')
    expect(getBackupHealthStatus(now - 12 * DAY, 'weekly', now)).toBe('overdue')
  })

  it('calculates storage warning threshold correctly', () => {
    expect(calculateStorageWarning(0)).toBe('normal')
    expect(calculateStorageWarning(69.9)).toBe('normal')
    expect(calculateStorageWarning(70)).toBe('info')
    expect(calculateStorageWarning(84.9)).toBe('info')
    expect(calculateStorageWarning(85)).toBe('high')
    expect(calculateStorageWarning(94.9)).toBe('high')
    expect(calculateStorageWarning(95)).toBe('critical')
    expect(calculateStorageWarning(100)).toBe('critical')
  })

  it('formats bytes into readable human strings', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(2_500_000)).toBe('2.4 MB')
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB')
  })
})
