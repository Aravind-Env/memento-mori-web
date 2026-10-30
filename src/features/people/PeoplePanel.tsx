import { useEffect, useMemo, useRef, useState } from 'react'

import type { Relationship } from '../../data/model'
import { calculateSharedLife } from '../../domain/sharedLife'
import { useStore } from '../../state/store'
import './people.css'

const KINDS = ['parent', 'partner', 'child', 'sibling', 'friend', 'other'] as const

export interface PeoplePanelProps {
  people: Relationship[]
  /** The user's date of birth as YYYY-MM-DD. */
  userDob: string
  /** The user's expected lifespan in years. */
  userLifeYears: number
  today: Date
  /** Gentle mode hides estimated meeting counts. */
  gentleMode: boolean
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

/** Visits still ahead with the people who make the weeks worth counting. */
export function PeoplePanel({
  people,
  userDob,
  userLifeYears,
  today,
  gentleMode,
  onClose,
  onToast,
}: PeoplePanelProps) {
  const addPerson = useStore((s) => s.addPerson)
  const updatePerson = useStore((s) => s.updatePerson)
  const removePerson = useStore((s) => s.removePerson)
  const restorePerson = useStore((s) => s.restorePerson)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number]>('parent')
  const [visits, setVisits] = useState(12)
  const [dob, setDob] = useState('')
  const [expectedLifespan, setExpectedLifespan] = useState<number | undefined>(userLifeYears)
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  function startEdit(person: Relationship) {
    setEditingId(person.id)
    setName(person.name)
    setKind((KINDS as readonly string[]).includes(person.kind) ? (person.kind as (typeof KINDS)[number]) : 'other')
    setVisits(person.visitsPerYear)
    setDob(person.dob ?? '')
    setExpectedLifespan(person.expectedLifespan ?? undefined)
    setNotes(person.notes ?? '')
    setError('')
    nameRef.current?.focus()
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setKind('parent')
    setVisits(12)
    setDob('')
    setExpectedLifespan(userLifeYears)
    setNotes('')
    setError('')
  }

  function save() {
    if (!name.trim()) {
      setError('A name helps you remember who this is.')
      return
    }
    if (visits < 0 || visits > 366) {
      setError('Visits per year sit between 0 and 366.')
      return
    }
    if (editingId) {
      updatePerson(editingId, {
        name,
        kind,
        visitsPerYear: visits,
        dob: dob || undefined,
        expectedLifespan: expectedLifespan !== undefined ? expectedLifespan : undefined,
        notes: notes || undefined,
      })
      cancelEdit()
      return
    }
    if (addPerson(name, kind, visits, dob || undefined, expectedLifespan, notes || undefined)) {
      cancelEdit()
    }
  }

  function handleDelete(person: Relationship) {
    const removed = removePerson(person.id)
    if (removed) onToast(`Removed ${removed.name}.`, () => restorePerson(removed))
  }

  // Pre-calculate shared life for each person
  const peopleWithShared = useMemo(
    () =>
      people.map((p) => {
        const shared = calculateSharedLife(p, userDob, userLifeYears, today)
        return { person: p, shared }
      }),
    [people, userDob, userLifeYears, today],
  )

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="People and shared time"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">People &amp; shared time</p>
            <h2 className="drawer__title">Who fills your weeks</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close people"
          >
            ×
          </button>
        </header>

        <p className="people__lead">
          {gentleMode
            ? 'List the people you see regularly and how often. Counts stay hidden in gentle mode.'
            : 'Estimated shared time uses the earlier of your two projected end dates — yours and theirs. Each person has their own lifespan estimate; edit it anytime.'}
        </p>

        {people.length === 0 && (
          <p className="people__empty">No one listed yet. A parent, a partner, an old friend.</p>
        )}

        {people.length > 0 && (
          <ul className="people__list">
            {peopleWithShared.map(({ person, shared }) => {
              const visitsLabel =
                person.visitsPerYear === 1 ? 'visit/yr' : `${person.visitsPerYear} visits/yr`
              return (
                <li key={person.id} className="people-row">
                  <div className="people-row__body">
                    <span className="people-row__name">{person.name}</span>
                    <span className="people-row__meta">
                      {person.kind} · {person.visitsPerYear} {visitsLabel}
                      {person.dob ? ` · age ${shared.personAge}` : ''}
                      {person.expectedLifespan !== undefined ? ` · est. lifespan ${person.expectedLifespan} yrs` : ''}
                    </span>
                  </div>
                  {!gentleMode && person.visitsPerYear > 0 ? (
                    <span className="people-row__count">
                      {shared.isSharedTimePassed ? (
                        <>
                          <span className="people-row__passed">
                            Projected shared window has passed
                          </span>
                          <em className="people-row__why">
                            Actual lifespans are unpredictable — this is an estimate, not a deadline.
                          </em>
                        </>
                      ) : shared.estimatedFutureMeetings === null ? (
                        <>
                          count unknown
                          <em className="people-row__why">add a birth date</em>
                        </>
                      ) : (
                        <>
                          ~{shared.estimatedFutureMeetings.toLocaleString()} more {visitsLabel}
                          <br />
                          <span className="people-row__meta">
                            ~{shared.sharedRemainingYears} yrs · {shared.sharedRemainingMonths} mos
                            {' · '}
                            est. shared end: {shared.sharedProjectedEnd}
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="people-row__count" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => startEdit(person)}
                    aria-label={`Edit ${person.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => handleDelete(person)}
                    aria-label={`Remove ${person.name}`}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="people-form">
          <label className="field">
            <span className="field__label">{editingId ? 'Editing — name' : 'Name'}</span>
            <input
              ref={nameRef}
              type="text"
              className="field__input"
              value={name}
              placeholder="e.g. Mum"
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
            />
          </label>

          <div className="people-form__pair">
            <label className="field">
              <span className="field__label">Kind</span>
              <select
                className="field__input"
                value={kind}
                aria-label="Relationship kind"
                onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Visits per year</span>
              <input
                type="number"
                className="field__input"
                min={0}
                max={366}
                step={1}
                value={visits}
                aria-label="Visits per year"
                onChange={(e) => {
                  setVisits(Number(e.target.value) || 0)
                  setError('')
                }}
              />
            </label>
          </div>

          <div className="people-form__pair">
            <label className="field">
              <span className="field__label">Their birth date (optional)</span>
              <input
                type="date"
                className="field__input"
                value={dob}
                aria-label="Their birth date"
                onChange={(e) => {
                  setDob(e.target.value)
                  setError('')
                }}
              />
              <span className="field__hint">Sharpens the shared-time estimate.</span>
            </label>

            <label className="field">
              <span className="field__label">Their est. lifespan (years)</span>
              <input
                type="number"
                className="field__input"
                min={1}
                max={120}
                step={1}
                value={expectedLifespan ?? ''}
                aria-label="Their expected lifespan"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setExpectedLifespan(Number.isFinite(v) && v >= 1 && v <= 120 ? v : undefined)
                  setError('')
                }}
              />
              <span className="field__hint">Independent of your own estimate — editable anytime.</span>
            </label>
          </div>

          <label className="field">
            <span className="field__label">Notes (optional)</span>
            <textarea
              className="field__input field__textarea"
              value={notes}
              placeholder="e.g. lives nearby, see them at holidays"
              rows={2}
              onChange={(e) => {
                setNotes(e.target.value)
                setError('')
              }}
            />
          </label>

          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}

          <p className="people__disclaimer">
            These are estimates based on birth dates and expected lifespans you provide.
            Actual lifespans and future opportunities to meet are unpredictable. Use this as a
            gentle reminder to spend meaningful time together — not as a prediction or deadline.
          </p>

          <footer className="drawer__foot">
            {editingId ? (
              <button type="button" className="btn" onClick={cancelEdit}>
                Cancel
              </button>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={save}>
              {editingId ? 'Save person' : 'Add person'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
