import { useEffect, useMemo, useRef, useState } from 'react'

import type { Goal } from '../../data/model'
import './goals.css'
import { findGoalAt, sortGoals, validateGoalDraft, weeksUntilGoal } from '../../domain/goals'
import { formatDate, weekRange } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { useStore } from '../../state/store'

export interface GoalsPanelProps {
  dob: Date
  goals: Goal[]
  /** 0-based index of the current week; goals live past this. */
  currentWeek: number
  totalCells: number
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

/** Create future milestones and tick them off when they become real. */
export function GoalsPanel({
  dob,
  goals,
  currentWeek,
  totalCells,
  onClose,
  onToast,
}: GoalsPanelProps) {
  const addGoal = useStore((s) => s.addGoal)
  const setGoalDone = useStore((s) => s.setGoalDone)
  const removeGoal = useStore((s) => s.removeGoal)
  const restoreGoal = useStore((s) => s.restoreGoal)

  const sorted = useMemo(() => sortGoals(goals), [goals])

  const hasFuture = totalCells - 1 > currentWeek
  const [text, setText] = useState('')
  const [week, setWeek] = useState(() =>
    Math.min(Math.max(currentWeek + 13, currentWeek + 1), totalCells - 1),
  )
  const [error, setError] = useState('')
  const textRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    textRef.current?.focus()
  }, [])

  /** "Age 30 — Oct 5, 2020 · 40 weeks ahead" label for the week slider. */
  const describeWeek = (idx: number) => {
    const { start } = weekRange(dob, idx)
    const ahead = weeksUntilGoal(idx, currentWeek)
    return `Age ${weekAge(idx)} — ${formatDate(start)}${ahead > 0 ? ` · ${ahead.toLocaleString()} weeks ahead` : ''}`
  }

  function save() {
    const message = validateGoalDraft({ text, weekIndex: week }, currentWeek, totalCells)
    if (message) {
      setError(message)
      return
    }
    if (findGoalAt(goals, week)) {
      setError('There is already a goal pinned to that week.')
      return
    }
    if (addGoal(text, week)) {
      setText('')
      textRef.current?.focus()
    }
  }

  function handleDelete(goal: Goal) {
    const removed = removeGoal(goal.id)
    if (removed) onToast(`Removed ${removed.text.trim() || 'goal'}`, () => restoreGoal(removed))
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Goals"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Goals &amp; milestones</p>
            <h2 className="drawer__title">Points on the road ahead</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close goals">
            ×
          </button>
        </header>

        <p className="goals__lead">
          Pin a goal to a future week — a race, a move, a book. It becomes a soft ring on the grid
          until you tick it off, then a quiet diamond.
        </p>

        {sorted.length === 0 && (
          <p className="goals__empty">Nothing pinned yet. Any future week will hold a goal.</p>
        )}

        {sorted.length > 0 && (
          <ul className="goals__list">
            {sorted.map((g) => {
              const { start } = weekRange(dob, g.weekIndex)
              const ahead = weeksUntilGoal(g.weekIndex, currentWeek)
              return (
                <li key={g.id} className={g.done ? 'goal-row is-done' : 'goal-row'}>
                  <i className="goal-row__marker" />
                  <div className="goal-row__body">
                    <span className="goal-row__text">{g.text.trim() || 'Goal'}</span>
                    <span className="goal-row__meta">
                      {formatDate(start)} · age {weekAge(g.weekIndex)}
                      {ahead > 0 ? ` · ${ahead.toLocaleString()} weeks ahead` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn--sm${g.done ? '' : ' goal-row__tick'}`}
                    onClick={() => setGoalDone(g.id, !g.done)}
                    aria-pressed={g.done}
                    aria-label={g.done ? `Mark goal ${g.text} as not done` : `Mark goal ${g.text} as done`}
                  >
                    {g.done ? 'Not done' : 'Done'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => handleDelete(g)}
                    aria-label={`Delete goal ${g.text}`}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {hasFuture ? (
          <div className="goal-form">
            <label className="field">
              <span className="field__label">Goal</span>
              <input
                ref={textRef}
                type="text"
                className="field__input"
                value={text}
                placeholder="e.g. Run the 10k"
                maxLength={60}
                onChange={(e) => {
                  setText(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                }}
              />
            </label>

            <label className="field">
              <span className="field__label">Week · {describeWeek(week)}</span>
              <input
                type="range"
                className="field__range"
                min={currentWeek + 1}
                max={totalCells - 1}
                value={week}
                aria-label="Goal week"
                onChange={(e) => {
                  setWeek(Number(e.target.value))
                  setError('')
                }}
              />
            </label>

            {error ? (
              <p className="field__error" role="alert">
                {error}
              </p>
            ) : null}

            <button type="button" className="btn btn--primary" onClick={save}>
              Pin the goal
            </button>
          </div>
        ) : (
          <p className="goals__empty">You are past your estimate — bonus time. Goals wait on the road.</p>
        )}
      </div>
    </div>
  )
}
