/**
 * Habit & Ritual Tracker domain logic.
 * Pure functions for streak calculations, completion tracking, and consistency.
 */

export interface Habit {
  id: string
  profileId: string
  name: string
  description?: string
  frequency: 'daily' | 'weekly' | 'custom'
  targetDays?: number[] // 0-6 (Sun-Sat)
  archived?: boolean
  createdAt: string
  completions: Record<string, boolean> // 'YYYY-MM-DD' -> true
}

const MS_PER_DAY = 86_400_000

export function isHabitCompletedOn(habit: Habit, dateKey: string): boolean {
  return Boolean(habit.completions[dateKey])
}

/**
 * Calculates current and longest streaks for a habit based on completion history.
 */
export function calculateHabitStreaks(
  habit: Habit,
  today: Date = new Date(),
): { current: number; longest: number; totalCompleted: number } {
  const completions = habit.completions || {}
  const dates = Object.keys(completions)
    .filter((d) => completions[d])
    .sort()

  const totalCompleted = dates.length
  if (totalCompleted === 0) return { current: 0, longest: 0, totalCompleted: 0 }

  const completedSet = new Set(dates)
  let longest = 0
  let current = 0

  // Longest streak calculation
  let run = 0
  if (dates.length > 0) {
    const start = new Date(dates[0] + 'T12:00:00')
    const end = new Date(dates[dates.length - 1] + 'T12:00:00')
    for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
      const key = t.toISOString().slice(0, 10)
      if (completedSet.has(key)) {
        run++
        if (run > longest) longest = run
      } else {
        run = 0
      }
    }
  }

  // Current streak (working backwards from today or yesterday)
  const todayKey = today.toISOString().slice(0, 10)
  const yesterdayDate = new Date(today.getTime() - MS_PER_DAY)
  const yesterdayKey = yesterdayDate.toISOString().slice(0, 10)

  let checkDate = new Date(today)
  if (!completedSet.has(todayKey) && completedSet.has(yesterdayKey)) {
    checkDate = yesterdayDate
  }

  let tempCurrent = 0
  for (let i = 0; i < 365 * 10; i++) {
    const key = checkDate.toISOString().slice(0, 10)
    if (completedSet.has(key)) {
      tempCurrent++
      checkDate = new Date(checkDate.getTime() - MS_PER_DAY)
    } else {
      break
    }
  }
  current = tempCurrent

  return {
    current,
    longest: Math.max(longest, current),
    totalCompleted,
  }
}

export function habitConsistencyForYear(habit: Habit, year: number): number {
  const completions = habit.completions || {}
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  const now = new Date()
  const actualEnd = end > now ? now : end

  let totalDays = 0
  let completedDays = 0

  for (let t = new Date(start); t <= actualEnd; t.setDate(t.getDate() + 1)) {
    totalDays++
    const key = t.toISOString().slice(0, 10)
    if (completions[key]) {
      completedDays++
    }
  }

  if (totalDays === 0) return 0
  return Math.round((completedDays / totalDays) * 100)
}
