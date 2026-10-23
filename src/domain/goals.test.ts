import { describe, expect, it } from 'vitest'

import type { Goal } from '../data/model'
import { findGoalAt, pendingGoals, sortGoals, validateGoalDraft, weeksUntilGoal } from './goals'

const mk = (id: string, weekIndex: number, done = false): Goal => ({
  id,
  profileId: 'p1',
  weekIndex,
  text: `goal ${id}`,
  done,
})

describe('sortGoals', () => {
  it('orders by week regardless of insertion order', () => {
    const sorted = sortGoals([mk('b', 300), mk('a', 60), mk('c', 150)])
    expect(sorted.map((g) => g.id)).toEqual(['a', 'c', 'b'])
  })

  it('keeps equal weeks stable and the original array untouched', () => {
    const input = [mk('a', 5), mk('b', 5)]
    const sorted = sortGoals(input)
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b'])
    expect(input.map((g) => g.weekIndex)).toEqual([5, 5])
  })
})

describe('weeksUntilGoal', () => {
  it('counts the weeks ahead', () => {
    expect(weeksUntilGoal(1500, 1400)).toBe(100)
  })

  it('never goes negative', () => {
    expect(weeksUntilGoal(10, 20)).toBe(0)
  })
})

describe('pendingGoals', () => {
  it('keeps only unfinished goals', () => {
    const goals = [mk('a', 100, true), mk('b', 200, false)]
    expect(pendingGoals(goals).map((g) => g.id)).toEqual(['b'])
  })
})

describe('findGoalAt', () => {
  it('finds the goal pinned to a week', () => {
    const goals = [mk('a', 100), mk('b', 300)]
    expect(findGoalAt(goals, 300)?.id).toBe('b')
  })

  it('returns undefined for unclaimed weeks', () => {
    const goals = [mk('a', 100)]
    expect(findGoalAt(goals, 101)).toBeUndefined()
  })
})

describe('validateGoalDraft', () => {
  const currentWeek = 1560
  const totalCells = 4160

  it('accepts a future goal', () => {
    const draft = { text: 'Run the 10k', weekIndex: 2080 }
    expect(validateGoalDraft(draft, currentWeek, totalCells)).toBeNull()
  })

  it('rejects a blank goal calmly', () => {
    expect(validateGoalDraft({ text: '   ', weekIndex: 2080 }, currentWeek, totalCells)).toBe(
      'Add a short goal.',
    )
  })

  it('rejects the current week and the past', () => {
    expect(
      validateGoalDraft({ text: 'X', weekIndex: currentWeek }, currentWeek, totalCells),
    ).toBe('Goals live ahead — pick a week that has not begun yet.')
    expect(validateGoalDraft({ text: 'X', weekIndex: 0 }, currentWeek, totalCells)).toBe(
      'Goals live ahead — pick a week that has not begun yet.',
    )
  })

  it('rejects markers outside the grid', () => {
    expect(validateGoalDraft({ text: 'X', weekIndex: totalCells }, currentWeek, totalCells)).toBe(
      'Keep the marker inside the grid.',
    )
  })
})
