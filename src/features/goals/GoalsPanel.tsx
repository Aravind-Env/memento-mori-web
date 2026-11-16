import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../shared/Icon'

import type { Goal } from '../../data/model'
import './goals.css'
import { findGoalAt, sortGoals, validateGoalDraft, weeksUntilGoal } from '../../domain/goals'
import { daysBetween, formatDate, toISODate, parseISODate, weekRange } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { useStore } from '../../state/store'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

interface GlassCalendarPickerProps {
  dob: Date
  currentWeek: number
  totalCells: number
  selectedWeek: number
  onSelectWeek: (week: number) => void
  goals: Goal[]
}

/**
 * Smooth, sleek glass calendar picker with dropdowns to jump from date to date.
 * Allows visual selection of future weeks with "from date to date" range display.
 */
function GlassCalendarPicker({
  dob,
  currentWeek,
  totalCells,
  selectedWeek,
  onSelectWeek,
  goals,
}: GlassCalendarPickerProps) {
  const minWeek = currentWeek + 1
  const maxWeek = totalCells - 1
  const minDate = useMemo(() => weekRange(dob, minWeek).start, [dob, minWeek])
  const maxDate = useMemo(() => weekRange(dob, maxWeek).end, [dob, maxWeek])
  const minYear = minDate.getFullYear()
  const maxYear = maxDate.getFullYear()

  const selectedRange = useMemo(() => weekRange(dob, selectedWeek), [dob, selectedWeek])
  const [viewYear, setViewYear] = useState(() => selectedRange.start.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => selectedRange.start.getMonth())
  const [animKey, setAnimKey] = useState(0)

  // Sync calendar view when selected week changes externally
  useEffect(() => {
    const start = weekRange(dob, selectedWeek).start
    setViewYear(start.getFullYear())
    setViewMonth(start.getMonth())
  }, [dob, selectedWeek])

  const canPrev = viewYear > minYear || (viewYear === minYear && viewMonth > minDate.getMonth())
  const canNext = viewYear < maxYear || (viewYear === maxYear && viewMonth < maxDate.getMonth())

  const prevMonth = () => {
    if (!canPrev) return
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
    setAnimKey((k) => k + 1)
  }

  const nextMonth = () => {
    if (!canNext) return
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
    setAnimKey((k) => k + 1)
  }

  const onMonthSelect = (m: number) => {
    setViewMonth(m)
    setAnimKey((k) => k + 1)
  }

  const onYearSelect = (y: number) => {
    setViewYear(y)
    if (y === minYear && viewMonth < minDate.getMonth()) {
      setViewMonth(minDate.getMonth())
    } else if (y === maxYear && viewMonth > maxDate.getMonth()) {
      setViewMonth(maxDate.getMonth())
    }
    setAnimKey((k) => k + 1)
  }

  const onPresetSelect = (weeksOffset: number) => {
    if (weeksOffset <= 0) return
    const target = Math.min(Math.max(currentWeek + weeksOffset, minWeek), maxWeek)
    onSelectWeek(target)
    const targetStart = weekRange(dob, target).start
    setViewYear(targetStart.getFullYear())
    setViewMonth(targetStart.getMonth())
    setAnimKey((k) => k + 1)
  }

  const onDirectDateChange = (iso: string) => {
    if (!iso) return
    try {
      const picked = parseISODate(iso)
      const days = daysBetween(dob, picked)
      const targetWeek = Math.floor(days / 7)
      if (targetWeek >= minWeek && targetWeek <= maxWeek) {
        onSelectWeek(targetWeek)
        setViewYear(picked.getFullYear())
        setViewMonth(picked.getMonth())
        setAnimKey((k) => k + 1)
      }
    } catch {
      // ignore invalid input
    }
  }

  // Generate calendar grid
  const daysGrid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

    // Monday is index 0
    const startDayOffset = (firstDay.getDay() + 6) % 7

    const cells: Array<{
      date: Date
      dayNum: number
      isCurrentMonth: boolean
      weekIndex: number
      disabled: boolean
      isSelectedWeek: boolean
      isWeekStart: boolean
      hasGoal: boolean
    }> = []

    // Leading days from previous month
    for (let i = startDayOffset - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, daysInPrevMonth - i)
      const w = Math.floor(daysBetween(dob, d) / 7)
      cells.push({
        date: d,
        dayNum: daysInPrevMonth - i,
        isCurrentMonth: false,
        weekIndex: w,
        disabled: w < minWeek || w > maxWeek,
        isSelectedWeek: w === selectedWeek,
        isWeekStart: w === selectedWeek && daysBetween(weekRange(dob, w).start, d) === 0,
        hasGoal: goals.some((g) => g.weekIndex === w),
      })
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d)
      const w = Math.floor(daysBetween(dob, date) / 7)
      cells.push({
        date,
        dayNum: d,
        isCurrentMonth: true,
        weekIndex: w,
        disabled: w < minWeek || w > maxWeek,
        isSelectedWeek: w === selectedWeek,
        isWeekStart: w === selectedWeek && daysBetween(weekRange(dob, w).start, date) === 0,
        hasGoal: goals.some((g) => g.weekIndex === w),
      })
    }

    // Trailing days from next month to complete rows
    const totalSlots = cells.length > 35 ? 42 : 35
    const remaining = totalSlots - cells.length
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(viewYear, viewMonth + 1, d)
      const w = Math.floor(daysBetween(dob, date) / 7)
      cells.push({
        date,
        dayNum: d,
        isCurrentMonth: false,
        weekIndex: w,
        disabled: w < minWeek || w > maxWeek,
        isSelectedWeek: w === selectedWeek,
        isWeekStart: w === selectedWeek && daysBetween(weekRange(dob, w).start, date) === 0,
        hasGoal: goals.some((g) => g.weekIndex === w),
      })
    }

    return cells
  }, [viewYear, viewMonth, dob, minWeek, maxWeek, selectedWeek, goals])

  // Years array for dropdown
  const yearOptions = useMemo(() => {
    const list: number[] = []
    for (let y = minYear; y <= maxYear; y++) {
      list.push(y)
    }
    return list
  }, [minYear, maxYear])

  const ahead = weeksUntilGoal(selectedWeek, currentWeek)
  const isSelectedGoalOccupied = goals.some((g) => g.weekIndex === selectedWeek)

  return (
    <div className="cal-picker">
      {/* Selected Range Display: "From date to date" */}
      <div className="cal-range-card">
        <div className="cal-range-header">
          <span className="cal-range-badge">
            <Icon name="calendar" size={13} />
            <span>Target Milestone</span>
          </span>
          <span className="cal-range-counter">
            {ahead > 0 ? `${ahead.toLocaleString()} weeks ahead` : 'Current week'}
          </span>
        </div>

        <div className="cal-range-dates">
          <div className="cal-date-block">
            <span className="cal-date-lbl">From</span>
            <strong className="cal-date-val">{formatDate(selectedRange.start)}</strong>
          </div>
          <span className="cal-date-arrow" aria-hidden="true">
            →
          </span>
          <div className="cal-date-block">
            <span className="cal-date-lbl">To</span>
            <strong className="cal-date-val">{formatDate(selectedRange.end)}</strong>
          </div>
        </div>

        <div className="cal-range-meta">
          <span className="cal-chip">Age {weekAge(selectedWeek)}</span>
          <span className="cal-chip">Week #{selectedWeek + 1}</span>
          {isSelectedGoalOccupied && (
            <span className="cal-chip cal-chip--warn">Existing goal pinned</span>
          )}
        </div>
      </div>

      {/* Dropdown controls & Quick Jump bar */}
      <div className="cal-controls">
        <div className="cal-dropdown-group">
          {/* Month Dropdown */}
          <select
            className="cal-select cal-select--month"
            value={viewMonth}
            aria-label="Select month"
            onChange={(e) => onMonthSelect(Number(e.target.value))}
          >
            {MONTH_NAMES.map((name, idx) => {
              const disabled =
                (viewYear === minYear && idx < minDate.getMonth()) ||
                (viewYear === maxYear && idx > maxDate.getMonth())
              return (
                <option key={name} value={idx} disabled={disabled}>
                  {name}
                </option>
              )
            })}
          </select>

          {/* Year Dropdown */}
          <select
            className="cal-select cal-select--year"
            value={viewYear}
            aria-label="Select year"
            onChange={(e) => onYearSelect(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Quick jump preset dropdown */}
        <div className="cal-quick-group">
          <select
            className="cal-select cal-select--preset"
            defaultValue=""
            aria-label="Quick jump from date to date"
            onChange={(e) => {
              onPresetSelect(Number(e.target.value))
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              ⚡ Quick jump…
            </option>
            <option value="4">+1 Month (~4 weeks)</option>
            <option value="13">+3 Months (~13 weeks)</option>
            <option value="26">+6 Months (~26 weeks)</option>
            <option value="52">+1 Year (52 weeks)</option>
            <option value="104">+2 Years (104 weeks)</option>
            <option value="260">+5 Years (260 weeks)</option>
            <option value="520">+10 Years (520 weeks)</option>
          </select>
        </div>
      </div>

      {/* Calendar Header with Prev/Next buttons */}
      <div className="cal-header">
        <button
          type="button"
          className="cal-nav-btn"
          onClick={prevMonth}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          <Icon name="chevronLeft" size={15} />
        </button>

        <span className="cal-month-title">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          className="cal-nav-btn"
          onClick={nextMonth}
          disabled={!canNext}
          aria-label="Next month"
        >
          <Icon name="chevronRight" size={15} />
        </button>
      </div>

      {/* Weekday column headers */}
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-weekday">
            {w}
          </span>
        ))}
      </div>

      {/* Animated Day Grid */}
      <div key={animKey} className="cal-days-grid" role="grid" aria-label="Month days">
        {daysGrid.map((cell, idx) => {
          let cellClass = 'cal-day'
          if (!cell.isCurrentMonth) cellClass += ' cal-day--outside'
          if (cell.disabled) cellClass += ' cal-day--disabled'
          if (cell.isSelectedWeek) cellClass += ' cal-day--selected-week'
          if (cell.isWeekStart) cellClass += ' cal-day--week-start'
          if (cell.hasGoal) cellClass += ' cal-day--has-goal'

          return (
            <button
              key={`${cell.date.toISOString()}-${idx}`}
              type="button"
              className={cellClass}
              disabled={cell.disabled}
              onClick={() => {
                if (!cell.disabled) onSelectWeek(cell.weekIndex)
              }}
              title={
                cell.disabled
                  ? 'Past or bonus weeks are not available for future goals'
                  : `Week starting ${formatDate(weekRange(dob, cell.weekIndex).start)}${
                      cell.hasGoal ? ' · Goal already pinned' : ''
                    }`
              }
              aria-label={`${formatDate(cell.date)}${cell.isSelectedWeek ? ', selected week' : ''}`}
              aria-selected={cell.isSelectedWeek}
            >
              <span className="cal-day__num">{cell.dayNum}</span>
              {cell.hasGoal && <span className="cal-day__dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {/* Direct date picker option */}
      <div className="cal-direct-date">
        <label className="cal-direct-label">
          <Icon name="search" size={12} />
          <span>Pick exact date:</span>
          <input
            type="date"
            className="cal-direct-input"
            min={toISODate(minDate)}
            max={toISODate(maxDate)}
            value={toISODate(selectedRange.start)}
            onChange={(e) => onDirectDateChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

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
            <Icon name="close" size={16} />
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
                    <Icon name="trash" size={14} />
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

            <div className="field">
              <span className="field__label">Milestone timeline</span>
              <GlassCalendarPicker
                dob={dob}
                currentWeek={currentWeek}
                totalCells={totalCells}
                selectedWeek={week}
                onSelectWeek={(w) => {
                  setWeek(w)
                  setError('')
                }}
                goals={goals}
              />
            </div>

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
