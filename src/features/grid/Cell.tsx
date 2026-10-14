import { memo } from 'react'

import type { CellState } from '../../domain/lifeMath'

export interface CellProps {
  index: number
  state: CellState
  hasNote: boolean
  pinned: boolean
  label: string
  focusable: boolean
  isSelected: boolean
  onSelect: (index: number) => void
  onFocus: (index: number) => void
}

/**
 * A single life week. Memoised so that editing one note re-renders one cell,
 * not all ~4,000 of them.
 */
export const Cell = memo(function Cell({
  index,
  state,
  hasNote,
  pinned,
  label,
  focusable,
  isSelected,
  onSelect,
  onFocus,
}: CellProps) {
  const classes = [
    'cell',
    `cell--${state}`,
    hasNote ? 'cell--note' : '',
    pinned ? 'cell--pinned' : '',
    isSelected ? 'cell--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      role="gridcell"
      className={classes}
      data-index={index}
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      aria-selected={isSelected}
      onClick={() => onSelect(index)}
      onFocus={() => onFocus(index)}
    />
  )
})
