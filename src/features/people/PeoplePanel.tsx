import { useEffect, useRef, useState } from 'react'

import type { Relationship } from '../../data/model'
import { sharedTimeFor, sharedTimeNote } from '../../domain/sharedTime'
import { useStore } from '../../state/store'
import './people.css'

const KINDS = ['parent', 'partner', 'child', 'sibling', 'friend', 'other'] as const

export interface PeoplePanelProps {
  people: Relationship[]
  /** The user's remaining estimated years, from their own grid. */
  yourRemainingYears: number
  /** Lifespan yardstick in years applied to the other person's estimate. */
  lifeExpectancy: number
  today: Date
  /** Gentle mode counts nothing — only visits per year. */
  gentleMode: boolean
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

/** Visits still ahead with the people who make the weeks worth counting. */
export function PeoplePanel({
  people,
  yourRemainingYears,
  lifeExpectancy,
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
    setError('')
    nameRef.current?.focus()
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setKind('parent')
    setVisits(12)
    setDob('')
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
      updatePerson(editingId, { name, kind, visitsPerYear: visits, dob: dob || undefined })
      cancelEdit()
      return
    }
    if (addPerson(name, kind, visits, dob || undefined)) {
      cancelEdit()
    }
  }

  function handleDelete(person: Relationship) {
    const removed = removePerson(person.id)
    if (removed) onToast(`Removed ${removed.name}.`, () => restorePerson(removed))
  }

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
            ? 'List the people you see regularly and how often. Counts stay in the quiet of other modes.'
            : 'How often you see someone, and how many of those visits are likely left — the shorter of your two remaining estimates.'}
        </p>

        {people.length === 0 && (
          <p className="people__empty">No one listed yet. A parent, a partner, an old friend.</p>
        )}

        {people.length > 0 && (
          <ul className="people__list">
            {people.map((p) => {
              const shared =
                gentleMode && p.dob
                  ? { personAge: null, remainingMeetings: null, sharedYears: 0, theirRemainingYears: 0 }
                  : sharedTimeFor(p, yourRemainingYears, lifeExpectancy, today)
              return (
                <li key={p.id} className="people-row">
                  <div className="people-row__body">
                    <span className="people-row__name">{p.name}</span>
                    <span className="people-row__meta">
                      {p.kind} · {p.visitsPerYear} visit{p.visitsPerYear === 1 ? '' : 's'} per year
                      {p.dob && shared.personAge !== null ? ` · age ${shared.personAge}` : ''}
                    </span>
                  </div>
                  {!gentleMode && p.visitsPerYear > 0 ? (
                    <span className="people-row__count">
                      {shared.remainingMeetings === null ? (
                        <>
                          count unknown
                          <em className="people-row__why">add a birth date</em>
                        </>
                      ) : (
                        <>
                          ~{shared.remainingMeetings.toLocaleString()} visits left
                          <em className="people-row__why">{sharedTimeNote(shared.personAge)}</em>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="people-row__count" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => startEdit(p)}
                    aria-label={`Edit ${p.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => handleDelete(p)}
                    aria-label={`Remove ${p.name}`}
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

          <label className="field">
            <span className="field__label">Their birth date (optional — sharpens the count)</span>
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
          </label>

          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}

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
