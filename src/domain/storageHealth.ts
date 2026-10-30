/**
 * Storage health, monitoring, backup reminder and database integrity domain logic.
 * Pure functions for testing and UI display calculations.
 */

export type BackupFrequency = 'off' | 'weekly' | 'monthly' | 'quarterly'
export type BackupHealthStatus = 'healthy' | 'overdue' | 'never' | 'failed'
export type StorageWarningLevel = 'normal' | 'info' | 'high' | 'critical'

export interface StorageStats {
  usageBytes: number
  quotaBytes: number
  percentUsed: number
  warningLevel: StorageWarningLevel
  isEstimateAvailable: boolean
}

export interface IntegrityCheckResult {
  ok: boolean
  storesChecked: string[]
  entryCount: number
  versionCount: number
  orphanedBodies: number
  orphanedMetas: number
  errors: string[]
}

const MS_PER_DAY = 86_400_000

export function frequencyDays(frequency: BackupFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 7
    case 'monthly':
      return 30
    case 'quarterly':
      return 90
    case 'off':
    default:
      return Infinity
  }
}

/**
 * Calculates whether a backup reminder is due.
 * Snooze/dismiss postpones reminder for 3 days or until next frequency window.
 */
export function isBackupDue(
  lastBackupAt: number | undefined,
  frequency: BackupFrequency = 'off',
  now: number = Date.now(),
  lastDismissedAt: number | undefined = undefined,
): boolean {
  if (frequency === 'off') return false

  const daysInterval = frequencyDays(frequency)
  if (!Number.isFinite(daysInterval)) return false

  // If user dismissed/snoozed within last 3 days, do not remind yet
  if (lastDismissedAt && now - lastDismissedAt < 3 * MS_PER_DAY) {
    return false
  }

  if (!lastBackupAt) return true

  const daysSinceBackup = (now - lastBackupAt) / MS_PER_DAY
  return daysSinceBackup >= daysInterval
}

/**
 * Determines overall backup health status.
 */
export function getBackupHealthStatus(
  lastBackupAt: number | undefined,
  frequency: BackupFrequency = 'off',
  now: number = Date.now(),
  lastBackupFailed = false,
): BackupHealthStatus {
  if (lastBackupFailed) return 'failed'
  if (!lastBackupAt) return 'never'

  if (frequency === 'off') return 'healthy'

  const daysInterval = frequencyDays(frequency)
  const daysSince = (now - lastBackupAt) / MS_PER_DAY

  if (daysSince > daysInterval * 1.5) {
    return 'overdue'
  }

  return 'healthy'
}

/**
 * Calculates storage warning level based on percentage of quota used.
 * Thresholds:
 * < 70%: normal
 * >= 70%: info
 * >= 85%: high
 * >= 95%: critical
 */
export function calculateStorageWarning(percentUsed: number): StorageWarningLevel {
  if (!Number.isFinite(percentUsed) || percentUsed < 70) return 'normal'
  if (percentUsed >= 95) return 'critical'
  if (percentUsed >= 85) return 'high'
  return 'info'
}

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`
}

/**
 * Estimates localStorage byte size by measuring stringified keys/values.
 */
export function getLocalStorageSize(): number {
  if (typeof localStorage === 'undefined') return 0
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        total += key.length + (localStorage.getItem(key)?.length ?? 0)
      }
    }
    return total * 2 // UTF-16 character byte size approx
  } catch {
    return 0
  }
}
