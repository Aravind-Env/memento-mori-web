/**
 * Canvas accessibility & keyboard navigation domain logic.
 * Computes grid navigation moves and screen-reader announcements.
 */

import { weekStart } from './dates'
import { weekAge } from './lifeMath'
import type { LifeStats } from './lifeMath'

export function getNextWeekIndex(
  currentIndex: number,
  key: string,
  totalCells: number,
  cols = 52,
): number {
  if (totalCells <= 0) return 0
  const current = Math.max(0, Math.min(currentIndex, totalCells - 1))

  switch (key) {
    case 'ArrowRight':
      return Math.min(current + 1, totalCells - 1)
    case 'ArrowLeft':
      return Math.max(current - 1, 0)
    case 'ArrowDown':
      return Math.min(current + cols, totalCells - 1)
    case 'ArrowUp':
      return Math.max(current - cols, 0)
    case 'Home': {
      const row = Math.floor(current / cols)
      return row * cols
    }
    case 'End': {
      const row = Math.floor(current / cols)
      return Math.min((row + 1) * cols - 1, totalCells - 1)
    }
    case 'PageUp':
      return Math.max(current - cols * 10, 0)
    case 'PageDown':
      return Math.min(current + cols * 10, totalCells - 1)
    default:
      return current
  }
}

export function formatWeekAriaLabel(
  weekIndex: number,
  dob: Date | null,
  stats: LifeStats | null,
  hasNote: boolean,
  daysWritten = 0,
  chapterName?: string,
): string {
  const age = weekAge(weekIndex)
  let stateLabel = 'Future week'

  if (stats) {
    if (weekIndex === stats.weeksLived) {
      stateLabel = 'This week (Current)'
    } else if (weekIndex < stats.weeksLived) {
      stateLabel = weekIndex >= stats.baseWeeks ? 'Bonus week lived' : 'Week lived'
    }
  }

  let startDateStr = ''
  if (dob) {
    const startDate = weekStart(dob, weekIndex)
    startDateStr = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const parts = [
    `Week ${weekIndex + 1}`,
    `Age ${age}`,
    startDateStr ? `Starting ${startDateStr}` : null,
    stateLabel,
    chapterName ? `Chapter: ${chapterName}` : null,
    hasNote ? 'Has weekly note' : null,
    daysWritten > 0 ? `${daysWritten} day ${daysWritten === 1 ? 'entry' : 'entries'}` : null,
  ].filter(Boolean)

  return parts.join('. ')
}
