import { useEffect, useRef, useState } from 'react'

import { formatRange, weekRange } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { useStore } from '../../state/store'
import type { Note } from '../../data/model'

export interface WeekDrawerProps {
  weekIndex: number
  dob: Date
  currentWeek: number
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

function parseTags(raw: string): string[] {
  const parts = raw
    .split(/[,\n]/)
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
  return Array.from(new Set(parts))
}

export function WeekDrawer({ weekIndex, dob, currentWeek, onClose, onToast }: WeekDrawerProps) {
  const upsertNote = useStore((s) => s.upsertNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const restoreNote = useStore((s) => s.restoreNote)

  const initial: Note | undefined = useStore.getState().getNote(weekIndex)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [text, setText] = useState(initial?.text ?? '')
  const [mood, setMood] = useState<number | undefined>(initial?.mood)
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [saved, setSaved] = useState(true)
  const firstRun = useRef(true)

  const { start, end } = weekRange(dob, weekIndex)
  const age = weekAge(weekIndex)
  const phase =
    weekIndex < currentWeek ? 'reflection' : weekIndex === currentWeek ? 'this week' : 'intention'

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Autosave (debounced) — no save button.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setSaved(false)
    const timer = window.setTimeout(() => {
      upsertNote(weekIndex, { text, mood, tags: parseTags(tags) })
      setSaved(true)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [text, mood, tags, weekIndex, upsertNote])

  function handleDelete() {
    const removed = deleteNote(weekIndex)
    onClose()
    if (removed) onToast('Note deleted', () => restoreNote(removed))
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Note for week ${weekIndex + 1}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">
              Week {weekIndex + 1} · age {age} · {phase}
            </p>
            <h2 className="drawer__title">{formatRange(start, end)}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close note">
            ×
          </button>
        </header>

        <label className="field">
          <span className="field__label">
            {phase === 'intention' ? 'What matters this week?' : 'What happened, or what did you learn?'}
          </span>
          <textarea
            ref={textareaRef}
            className="field__textarea"
            value={text}
            placeholder="Write a few honest lines…"
            rows={7}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="field-row">
          <div className="field">
            <span className="field__label">Mood</span>
            <div className="mood" role="group" aria-label="Mood rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`mood__dot${mood === n ? ' is-active' : ''}`}
                  aria-label={`Mood ${n} of 5`}
                  aria-pressed={mood === n}
                  onClick={() => setMood(mood === n ? undefined : n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Tags</span>
            <input
              type="text"
              className="field__input"
              value={tags}
              placeholder="health, work, family"
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
        </div>

        <footer className="drawer__foot">
          <span className={`saved-dot${saved ? ' is-saved' : ''}`} role="status" aria-live="polite">
            {saved ? 'Saved' : 'Saving…'}
          </span>
          <button
            type="button"
            className="btn btn--ghost-danger"
            onClick={handleDelete}
            disabled={!initial && !text && !tags}
          >
            Delete note
          </button>
        </footer>
      </div>
    </div>
  )
}
