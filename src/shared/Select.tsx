import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from './Icon'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

/**
 * macOS-style pop-up button: a rounded glass trigger with an up/down chevron
 * that opens a vibrancy menu with a checkmark on the current item.
 *
 * The menu is portalled to <body> and positioned with fixed coordinates, so
 * scrolling drawers (overflow + backdrop-filter) can never clip it. It flips
 * above the trigger when there is no room below. Keyboard: Enter/Space/↓ to
 * open, ↑↓ Home End to move, Enter to choose, Esc to close (without closing
 * the surrounding drawer), letters jump to matching items.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find((o) => o.value === value) ?? options[0]

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const menuH = Math.min(options.length * 34 + 12, 300)
    const up = window.innerHeight - r.bottom < menuH + 12 && r.top > menuH + 12
    setPos({ left: r.left, top: up ? r.top - menuH - 6 : r.bottom + 6, width: r.width, up })
  }, [options.length])

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    place()
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }
  const choose = (i: number) => {
    const opt = options[i]
    if (opt) onChange(opt.value)
    close()
  }

  // Keep the menu attached while anything scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  // Outside click closes.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Focus the menu when it opens so arrow keys work immediately.
  useEffect(() => {
    if (open) menuRef.current?.focus()
  }, [open])

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    }
  }

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Close only this menu, not the drawer behind it.
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(options.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Tab') {
      close(false)
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      const i = options.findIndex((o, idx) => idx > active && o.label.toLowerCase().startsWith(k))
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k))
      if (j >= 0) setActive(j)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ? `mac-select ${className}` : 'mac-select'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-open={open || undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span className="mac-select__value">{current?.label}</span>
        <span className="mac-select__chev" aria-hidden="true">
          <Icon name="chevronUp" size={10} strokeWidth={2.2} />
          <Icon name="chevronDown" size={10} strokeWidth={2.2} />
        </span>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={`${listId}-${active}`}
              className={`mac-menu${pos.up ? ' mac-menu--up' : ''}`}
              style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
              onKeyDown={onMenuKey}
            >
              {options.map((o, i) => {
                const selected = o.value === value
                return (
                  <div
                    key={o.value}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={selected}
                    className={`mac-menu__item${i === active ? ' is-active' : ''}`}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                  >
                    <span className="mac-menu__check" aria-hidden="true">
                      {selected ? <Icon name="check" size={13} strokeWidth={2.4} /> : null}
                    </span>
                    {o.label}
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
