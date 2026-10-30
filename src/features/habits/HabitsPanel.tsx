import { useCallback, useMemo, useState } from 'react'

import './habits.css'
import { useStore } from '../../state/store'
import { calculateHabitStreaks, habitConsistencyForYear, type Habit } from '../../domain/habits'

export interface HabitsPanelProps {
  onClose: () => void
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekly: 'Weekly',
  custom: 'Selected days',
}

export function HabitsPanel({ onClose }: HabitsPanelProps) {
  const profile = useStore((s) => s.profile)
  const habits = useStore((s) => s.habits)
  const addHabit = useStore((s) => s.addHabit)
  const toggleHabitCompletion = useStore((s) => s.toggleHabitCompletion)
  const archiveHabit = useStore((s) => s.archiveHabit)
  const removeHabit = useStore((s) => s.removeHabit)

  const [newHabitName, setNewHabitName] = useState('')
  const [newHabitFrequency, setNewHabitFrequency] = useState<'daily' | 'weekly' | 'custom'>('daily')
  const [today] = useState(() => new Date())

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits])
  const archivedHabits = useMemo(() => habits.filter((h) => h.archived), [habits])

  const todayKey = today.toISOString().slice(0, 10)

  const addHabitHandler = useCallback(() => {
    const name = newHabitName.trim()
    if (!name) return
    addHabit(name, newHabitFrequency)
    setNewHabitName('')
  }, [newHabitName, newHabitFrequency, addHabit])

  const toggleHabit = useCallback((id: string) => {
    toggleHabitCompletion(id, todayKey)
  }, [todayKey, toggleHabitCompletion])

  const getStreakStats = useCallback((habit: Habit) => {
    return calculateHabitStreaks(habit, today)
  }, [today])

  const getYearConsistency = useCallback((habit: Habit, year: number) => {
    return habitConsistencyForYear(habit, year)
  }, [])

  if (!profile) return null

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer drawer-habits"
        role="dialog"
        aria-modal="true"
        aria-label="Habits & Rituals"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Habits & Rituals</p>
            <h2 className="drawer__title">Gentle consistency</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close habits" data-qa="habits-close">✕</button>
        </header>

        <div className="drawer-body" data-qa="habits-body">
          {/* Add habit */}
          <section className="habits__add">
            <input
              type="text"
              className="habits__input"
              placeholder="New habit (e.g. morning walk, gratitude)"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHabitHandler()}
            />
            <select
              className="habits__freq"
              value={newHabitFrequency}
              onChange={(e) => setNewHabitFrequency(e.target.value as any)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom days</option>
            </select>
            <button type="button" className="btn btn--primary" onClick={addHabitHandler} disabled={!newHabitName.trim()}>
              Add
            </button>
          </section>

          {/* Active habits */}
          <section className="habits__section">
            <h3 className="habits__heading">Active</h3>
            {activeHabits.length === 0 ? (
              <p className="habits__empty">No active habits yet. Add one above.</p>
            ) : (
              <ul className="habits__list" role="list">
                {activeHabits.map((habit) => {
                  const stats = getStreakStats(habit)
                  const isDone = Boolean(habit.completions[todayKey])
                  return (
                    <li key={habit.id} className="habit__row">
                      <div className="habit__info">
                        <div className="habit__name">{habit.name}</div>
                        <div className="habit__meta">
                          <span>{FREQUENCY_LABELS[habit.frequency]}</span>
                          <span>·</span>
                          <span>{stats.totalCompleted} completions</span>
                          <span>·</span>
                          <span>Current streak: {stats.current}</span>
                          <span>·</span>
                          <span>Best streak: {stats.longest}</span>
                          <span>·</span>
                          <span>This year: {getYearConsistency(habit, today.getFullYear())}%</span>
                        </div>
                      </div>
                      <div className="habit__actions">
                        <button
                          type="button"
                          className={`habit__done ${isDone ? 'is-done' : ''}`}
                          onClick={() => toggleHabit(habit.id)}
                          aria-label={isDone ? 'Mark incomplete' : 'Mark complete for today'}
                          aria-pressed={isDone}
                        >
                          {isDone ? '✓' : '○'}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => archiveHabit(habit.id, true)}
                          aria-label="Archive habit"
                        >
                          ⟳
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Archived habits */}
          {archivedHabits.length > 0 && (
            <section className="habits__section habits__section--archived">
              <h3 className="habits__heading">Archived</h3>
              <ul className="habits__list" role="list">
                {archivedHabits.map((habit) => (
                  <li key={habit.id} className="habit__row habit__row--archived">
                    <div className="habit__info">
                      <div className="habit__name">{habit.name}</div>
                    </div>
                    <div className="habit__actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => archiveHabit(habit.id, false)}
                        aria-label="Restore habit"
                      >
                        ↩
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeHabit(habit.id)}
                        aria-label="Delete habit"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
