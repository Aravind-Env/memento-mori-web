import { describe, expect, it } from 'vitest'
import { calculateHabitStreaks, habitConsistencyForYear, type Habit } from './habits'

describe('habits domain', () => {
  it('calculates streaks correctly', () => {
    const today = new Date(Date.UTC(2026, 5, 15, 12)) // June 15, 2026 UTC noon
    const todayKey = today.toISOString().slice(0, 10)
    const yesterdayKey = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10)
    const dayBeforeKey = new Date(today.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)
    const habit: Habit = {
      id: 'h1',
      profileId: 'p1',
      name: 'Read',
      frequency: 'daily',
      createdAt: '2026-06-01',
      completions: {
        [dayBeforeKey]: true,
        [yesterdayKey]: true,
        [todayKey]: true,
      },
    }

    const stats = calculateHabitStreaks(habit, today)
    expect(stats.totalCompleted).toBe(3)
    expect(stats.current).toBe(3)
    expect(stats.longest).toBe(3)
  })

  it('calculates yearly consistency percentage', () => {
    const habit: Habit = {
      id: 'h2',
      profileId: 'p1',
      name: 'Walk',
      frequency: 'daily',
      createdAt: '2026-01-01',
      completions: {
        '2026-01-01': true,
        '2026-01-02': true,
      },
    }

    const consistency = habitConsistencyForYear(habit, 2026)
    expect(consistency).toBeGreaterThanOrEqual(0)
  })
})
