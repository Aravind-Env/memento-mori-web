import { useEffect, useMemo, useRef, useState } from 'react'

import type { Chapter } from '../../data/model'
import './chapters.css'
import {
  CHAPTER_PALETTE,
  type ChapterColorId,
  formatChapterAges,
  validateChapterDraft,
} from '../../domain/chapters'
import { formatDate, weekRange } from '../../domain/dates'
import { weekAge } from '../../domain/lifeMath'
import { useStore } from '../../state/store'

export interface ChaptersPanelProps {
  dob: Date
  chapters: Chapter[]
  totalCells: number
  /** Used as the default start of a fresh chapter ("about now"). */
  defaultStart: number
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

type FormMode = { kind: 'hidden' } | { kind: 'add' } | { kind: 'edit'; id: string }

const COLOR_LABELS: Record<ChapterColorId, string> = {
  teal: 'Teal',
  blue: 'Blue',
  violet: 'Violet',
  amber: 'Amber',
  leaf: 'Leaf',
  rose: 'Rose',
  slate: 'Slate',
  sea: 'Sea',
}

/** Manage the named, coloured bands painted over life weeks. */
export function ChaptersPanel({
  dob,
  chapters,
  totalCells,
  defaultStart,
  onClose,
  onToast,
}: ChaptersPanelProps) {
  const addChapter = useStore((s) => s.addChapter)
  const updateChapter = useStore((s) => s.updateChapter)
  const removeChapter = useStore((s) => s.removeChapter)
  const restoreChapter = useStore((s) => s.restoreChapter)

  const [mode, setMode] = useState<FormMode>({ kind: 'hidden' })
  const [name, setName] = useState('')
  const [color, setColor] = useState<ChapterColorId>(CHAPTER_PALETTE[0])
  const [startWeek, setStartWeek] = useState(0)
  const [endWeek, setEndWeek] = useState(0)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode.kind !== 'hidden') nameRef.current?.focus()
  }, [mode])
  useEffect(() => {
    if (mode.kind !== 'hidden') setError('')
  }, [name, startWeek, endWeek, color, mode])

  const sorted = useMemo(
    () => [...chapters].sort((a, b) => a.startWeek - b.startWeek || b.endWeek - a.endWeek),
    [chapters],
  )

  /** "Age 12 — May 3, 2002" label for a week slider. */
  const describeWeek = (idx: number) => {
    const { start } = weekRange(dob, idx)
    return `Age ${weekAge(idx)} — ${formatDate(start)}`
  }

  function openAdd() {
    const start = Math.min(Math.max(defaultStart, 0), totalCells - 1)
    setName('')
    setColor(CHAPTER_PALETTE[0])
    setStartWeek(start)
    setEndWeek(Math.min(start + 52 * 10, totalCells - 1))
    setMode({ kind: 'add' })
  }

  function openEdit(chapter: Chapter) {
    setName(chapter.name)
    setColor(chapter.color as ChapterColorId)
    setStartWeek(chapter.startWeek)
    setEndWeek(chapter.endWeek)
    setMode({ kind: 'edit', id: chapter.id })
  }

  function closeForm() {
    setMode({ kind: 'hidden' })
    setError('')
  }

  function save() {
    if (mode.kind === 'hidden') return
    const others = mode.kind === 'edit' ? chapters.filter((c) => c.id !== mode.id) : chapters
    const message = validateChapterDraft({ name, startWeek, endWeek, color }, others, totalCells, mode.kind === 'edit' ? mode.id : undefined)
    if (message) {
      setError(message)
      return
    }
    if (mode.kind === 'edit') {
      updateChapter(mode.id, { name: name.trim(), color, startWeek, endWeek })
      closeForm()
      return
    }
    addChapter(name, startWeek, endWeek, color)
    closeForm()
  }

  function handleDelete(chapter: Chapter) {
    const removed = removeChapter(chapter.id)
    if (mode.kind === 'edit' && mode.id === chapter.id) closeForm()
    if (removed)
      onToast(`Removed ${removed.name || 'chapter'}`, () => restoreChapter(removed))
  }

  /** Dragging the start past the end pulls the end along, and vice versa. */
  function moveStart(value: number) {
    setStartWeek(value)
    if (endWeek < value) setEndWeek(value)
  }
  function moveEnd(value: number) {
    setEndWeek(value)
    if (startWeek > value) setStartWeek(value)
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Life chapters"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div>
            <p className="drawer__eyebrow">Life chapters</p>
            <h2 className="drawer__title">Seasons of your life</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close chapters">
            ×
          </button>
        </header>

        <p className="chapters__lead">
          Paint named bands over the weeks — school, career, family, whatever you live in. Bands
          sit behind the dots and never overlap.
        </p>

        {sorted.length === 0 && mode.kind === 'hidden' && (
          <p className="chapters__empty">No chapters yet. Every life has seasons worth naming.</p>
        )}

        {sorted.length > 0 && (
          <ul className="chapters__list">
            {sorted.map((c) => (
              <li key={c.id} className={mode.kind === 'edit' && mode.id === c.id ? 'chapter-row is-editing' : 'chapter-row'}>
                <i className="chapter-row__chip" style={{ background: `var(--ch-${c.color})` }} />
                <span className="chapter-row__name">{c.name}</span>
                <span className="chapter-row__meta">
                  {formatChapterAges(c.startWeek, c.endWeek)} · week {c.startWeek.toLocaleString()}–{c.endWeek.toLocaleString()}
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => openEdit(c)}
                  aria-label={`Edit chapter ${c.name}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  onClick={() => handleDelete(c)}
                  aria-label={`Delete chapter ${c.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {mode.kind === 'hidden' && (
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            New chapter
          </button>
        )}

        {mode.kind !== 'hidden' && (
          <div className="chapter-form">
            <label className="field">
              <span className="field__label">Name</span>
              <input
                ref={nameRef}
                type="text"
                className="field__input"
                value={name}
                placeholder="e.g. Grad school"
                maxLength={28}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                }}
              />
            </label>

            <div className="field">
              <span className="field__label">Colour</span>
              <div className="swatches" role="group" aria-label="Chapter colour">
                {CHAPTER_PALETTE.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`swatch${color === id ? ' is-active' : ''}`}
                    style={{ background: `var(--ch-${id})` }}
                    aria-label={COLOR_LABELS[id]}
                    aria-pressed={color === id}
                    title={COLOR_LABELS[id]}
                    onClick={() => setColor(id)}
                  />
                ))}
              </div>
            </div>

            <label className="field">
              <span className="field__label">
                Starts · {describeWeek(startWeek)}
              </span>
              <input
                type="range"
                className="field__range"
                min={0}
                max={totalCells - 1}
                value={startWeek}
                aria-label="Chapter start week"
                onChange={(e) => moveStart(Number(e.target.value))}
              />
            </label>

            <label className="field">
              <span className="field__label">
                Ends · {describeWeek(endWeek)}
              </span>
              <input
                type="range"
                className="field__range"
                min={0}
                max={totalCells - 1}
                value={endWeek}
                aria-label="Chapter end week"
                onChange={(e) => moveEnd(Number(e.target.value))}
              />
            </label>

            {error ? (
              <p className="field__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="chapter-form__actions">
              <button type="button" className="btn btn--primary" onClick={save}>
                {mode.kind === 'edit' ? 'Save chapter' : 'Add chapter'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
