/**
 * Annual Life Review domain logic.
 * Aggregates statistics, milestones, goals, chapters, and mood patterns for a given year.
 */

import type { Chapter, Goal } from '../data/model'
import type { EntryMeta } from '../core/journal'

export interface AnnualSummary {
  year: number
  totalEntries: number
  totalWords: number
  averageMood: number
  completedGoals: Goal[]
  activeChapters: Chapter[]
  moodDistribution: Record<number, number> // 1-5 -> count
  topTags: [string, number][]
}

export function generateAnnualSummary(
  year: number,
  entries: EntryMeta[],
  chapters: Chapter[],
  goals: Goal[],
  dob: Date,
): AnnualSummary {
  const startStr = `${year}-01-01`
  const endStr = `${year}-12-31`

  const yearEntries = entries.filter((e) => e.date >= startStr && e.date <= endStr)
  const totalEntries = yearEntries.length
  const totalWords = yearEntries.reduce((sum, e) => sum + e.words, 0)

  const moodSum = yearEntries.reduce((sum, e) => sum + (e.mood ?? 0), 0)
  const moodCount = yearEntries.filter((e) => e.mood !== undefined).length
  const averageMood = moodCount > 0 ? Number((moodSum / moodCount).toFixed(1)) : 0

  const moodDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const e of yearEntries) {
    if (e.mood && e.mood >= 1 && e.mood <= 5) {
      moodDistribution[e.mood] = (moodDistribution[e.mood] ?? 0) + 1
    }
  }

  const tagCounts = new Map<string, number>()
  for (const e of yearEntries) {
    for (const tag of e.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Chapters active during this year
  // Week index calculation approximately from DOB
  const dobTime = dob.getTime()
  const yearStartTime = new Date(year, 0, 1).getTime()
  const yearEndTime = new Date(year, 11, 31).getTime()
  const startWeekApprox = Math.max(0, Math.floor((yearStartTime - dobTime) / (7 * 86_400_000)))
  const endWeekApprox = Math.max(0, Math.ceil((yearEndTime - dobTime) / (7 * 86_400_000)))

  const activeChapters = chapters.filter(
    (c) => c.startWeek <= endWeekApprox && c.endWeek >= startWeekApprox,
  )

  // Goals completed in this year (or targeted to weeks in this year)
  const completedGoals = goals.filter((g) => {
    if (!g.done) return false
    const goalDate = new Date(dobTime + g.weekIndex * 7 * 86_400_000)
    return goalDate.getFullYear() === year
  })

  return {
    year,
    totalEntries,
    totalWords,
    averageMood,
    completedGoals,
    activeChapters,
    moodDistribution,
    topTags,
  }
}
