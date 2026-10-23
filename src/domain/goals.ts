/**
 * Goal and milestone logic. Pure functions: validation for future-week goals
 * and derived counts for the stats panel. Goals are always week indexes.
 */

import type { Goal } from '../data/model'

export interface GoalDraft {
  text: string
  weekIndex: number
}

/** Sort goals by week so the list and the grid read in the same order. */
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => a.weekIndex - b.weekIndex)
}

/** Total weeks from `weekIndex` until the expected end, hiding bonus rows. */
export function weeksUntilGoal(weekIndex: number, currentWeek: number): number {
  return Math.max(weekIndex - currentWeek, 0)
}

/** Pending (not yet done) goals, for the stats strip. */
export function pendingGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => !g.done)
}

/** The goal already pinned to a week, if any — weeks hold one goal each. */
export function findGoalAt(goals: Goal[], weekIndex: number): Goal | undefined {
  return goals.find((g) => g.weekIndex === weekIndex)
}

/**
 * Validate a goal draft. Returns a calm error message, or null when it is safe
 * to save. A goal must have text and point at a future week inside the grid.
 */
export function validateGoalDraft(
  draft: GoalDraft,
  currentWeek: number,
  totalCells: number,
): string | null {
  const text = draft.text.trim()
  if (!text) return 'Add a short goal.'
  if (!Number.isFinite(draft.weekIndex)) return 'Pick a week for the goal.'
  if (draft.weekIndex < 0 || draft.weekIndex > totalCells - 1)
    return 'Keep the marker inside the grid.'
  if (draft.weekIndex <= currentWeek) return 'Goals live ahead — pick a week that has not begun yet.'
  return null
}
