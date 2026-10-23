import { useEffect, useRef, useState } from 'react'

import type { SearchResult, JumpItem } from '../../domain/search'
import './search.css'

export interface CommandPaletteProps {
  query: string
  onQueryChange: (query: string) => void
  jumps: JumpItem[]
  results: SearchResult[]
  totalResults: number
  maxShown?: number
  onSelectWeek: (weekIndex: number) => void
  onClose: () => void
}

interface Row {
  key: string
  label: string
  meta?: string
  chip?: string
  weekIndex: number
}

function jumpRow(item: JumpItem, i: number): Row {
  return {
    key: `jump-${i}-${item.weekIndex}`,
    label: item.label,
    meta: '→',
    weekIndex: item.weekIndex,
  }
}

function noteRow(result: SearchResult, queryShown: boolean): Row {
  const note = result.note
  const chip = [note.mood ? `mood ${note.mood}/5` : '', (note.tags ?? []).map((t) => `#${t}`).join(' ')]
    .filter(Boolean)
    .join('  ')
  return {
    key: `note-${note.id}`,
    label: queryShown ? result.snippet : note.text.trim(),
    meta: `wk ${note.weekIndex.toLocaleString('en-US')}`,
    chip: chip || undefined,
    weekIndex: note.weekIndex,
  }
}

/**
 * The command palette: a keyboard-first search over weekly notes with `#tag`
 * and `mood:1-5` filters plus week/age jumps. Everything is passed in
 * pre-computed so this component only renders and manages selection.
 */
export function CommandPalette({
  query,
  onQueryChange,
  jumps,
  results,
  totalResults,
  maxShown = 40,
  onSelectWeek,
  onClose,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const queryShown = query.trim().length > 0

  const rows: Row[] = [
    ...jumps.map(jumpRow),
    ...results.slice(0, Math.max(maxShown, 1)).map((r) => noteRow(r, queryShown)),
  ]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`#palette-row-${selected}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, query, results])

  function openRow(index: number) {
    const row = rows[index]
    if (row) onSelectWeek(row.weekIndex)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (rows.length === 0 ? 0 : (s + 1) % rows.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (rows.length === 0 ? 0 : (s - 1 + rows.length) % rows.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      openRow(selected)
    }
  }

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          value={query}
          placeholder="Search notes… try calm, #family, mood:4, 1034, or now"
          aria-label="Search notes"
          aria-activedescendant={rows[selected] ? `palette-row-${selected}` : undefined}
          aria-controls="palette-listbox"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div
          ref={listRef}
          id="palette-listbox"
          className="palette__list"
          role="listbox"
          aria-label="Search results"
        >
          {!queryShown && (
            <p className="palette__hint">
              Words search note text; <code>#tag</code> narrows by tag; <code>mood:1</code>–
              <code>mood:5</code> filters by mood; a plain number jumps to that week; <em>now</em>{' '}
              returns to this week.
            </p>
          )}
          {queryShown && rows.length === 0 && (
            <p className="palette__empty">No notes match — and nothing left the device looking.</p>
          )}
          {jumps.length > 0 && (
            <p className="palette__group" aria-hidden="true">
              Jump to
            </p>
          )}
          {rows.map((row, i) => (
            <div
              key={row.key}
              id={`palette-row-${i}`}
              role="option"
              aria-selected={i === selected}
              tabIndex={-1}
              className={`palette__row${i === selected ? ' is-selected' : ''}`}
              onPointerMove={() => setSelected(i)}
              onClick={() => openRow(i)}
            >
              <span className="palette__label">{row.label}</span>
              <span className="palette__meta">
                {row.chip ? <span className="palette__chip">{row.chip}</span> : null}
                <code>{row.meta}</code>
              </span>
            </div>
          ))}
          {queryShown && totalResults > maxShown && (
            <p className="palette__more">
              + {(totalResults - maxShown).toLocaleString('en-US')} more — narrow the query to see
              them
            </p>
          )}
        </div>
        <footer className="palette__foot" aria-hidden="true">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span>#tag · mood:1-5</span>
        </footer>
      </div>
    </div>
  )
}
