import { useEffect, useRef, useState } from 'react'

import type { Note } from '../../data/model'
import { formatRange, weekRange } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { previousNoteWeek } from '../../domain/review'
import { useStore } from '../../state/store'
import './review.css'

export interface ReviewPanelProps {
  /** Absolute index of the current week — the one the intention is for. */
  currentWeek: number
  dob: Date
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

/**
 * The weekly ritual: last week's note sits beside a fresh intention for the
 * week ahead. Autosaves like the note drawer, no nagging, no streaks.
 */
export function ReviewPanel({ currentWeek, dob, onClose, onToast }: ReviewPanelProps) {
  const upsertNote = useStore((s) => s.upsertNote)
  const completeReview = useStore((s) => s.completeReview)

  const prevWeek = previousNoteWeek(currentWeek)
  const prevNote: Note | undefined =
    prevWeek === null ? undefined : useStore.getState().getNote(prevWeek)
  const initial: Note | undefined = useStore.getState().getNote(currentWeek)

  const [text, setText] = useState(initial?.text ?? '')
  const firstRun = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Autosave (debounced) — consistent with the note drawer.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = window.setTimeout(() => {
      // Text only — mood and tags of an existing note stay untouched.
      upsertNote(currentWeek, { text })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [text, currentWeek, upsertNote])

  function markDone() {
    completeReview(currentWeek)
    onClose()
    onToast('Weekly review saved. See you next week.')
  }

  const prevRange = prevWeek !== null ? weekRange(dob, prevWeek) : null

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Weekly review"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Weekly review</p>
            <h2 className="drawer__title">What mattered, and what matters?</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close review">
            ×
          </button>
        </header>

        {prevWeek !== null ? (
          <section className="review__past" aria-label="Last week's note">
            <p className="review__heading">
              Age {weekAge(prevWeek)} · {formatRange(prevRange!.start, prevRange!.end)}
            </p>
            {prevNote ? (
              <blockquote className="review__quote">
                {prevNote.text.trim() || <em>No words that week.</em>}
                {prevNote.mood ? <span className="review__mood">mood {prevNote.mood}/5</span> : null}
              </blockquote>
            ) : (
              <p className="review__empty">No note from last week. A quiet week counts too.</p>
            )}
          </section>
        ) : (
          <p className="review__empty">
            This is the very first week — nothing behind you yet. Write one line for the week
            ahead.
          </p>
        )}

        <label className="field">
          <span className="field__label">
            Intention for this week (age {weekAge(currentWeek)})
            <span className="review__range">{formatRange(weekRange(dob, currentWeek).start, weekRange(dob, currentWeek).end)}</span>
          </span>
          <textarea
            ref={textareaRef}
            className="field__textarea"
            value={text}
            placeholder="One honest line about what matters…"
            rows={6}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <footer className="drawer__foot">
          <button type="button" className="btn" onClick={onClose}>
            Not now — maybe later
          </button>
          <button type="button" className="btn btn--primary" onClick={markDone}>
            Save intention
          </button>
        </footer>
      </div>
    </div>
  )
}
