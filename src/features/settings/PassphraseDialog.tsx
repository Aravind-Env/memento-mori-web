import { useEffect, useRef, useState } from 'react'

import './passphrase.css'

export interface PassphraseDialogProps {
  /** `unlock` = one field; `create` = passphrase + confirmation, 8+ chars. */
  mode: 'unlock' | 'create'
  title: string
  description?: string
  confirmLabel: string
  /** True while PBKDF2 derivation runs (buttons disabled). */
  busy?: boolean
  /** Error passed from the caller (e.g. "Wrong passphrase"). */
  error?: string | null
  onConfirm: (passphrase: string) => void
  onClose: () => void
}

/**
 * Shared passphrase entry for encrypted export/import and the app lock.
 * Type `password` only — nothing is ever shown or stored in plain text.
 */
export function PassphraseDialog({
  mode,
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onClose,
}: PassphraseDialogProps) {
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (pass.length < 8) {
      setLocalError('Passphrases need at least 8 characters.')
      return
    }
    if (mode === 'create' && pass !== again) {
      setLocalError('The two passphrases do not match.')
      return
    }
    setLocalError(null)
    onConfirm(pass)
  }

  return (
    <div className="dialog-scrim">
      <div
        className="passdialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="passdialog__title">{title}</h2>
        {description && <p className="passdialog__desc">{description}</p>}
        <form onSubmit={submit}>
          <label className="field">
            <span className="field__label">Passphrase</span>
            <input
              ref={inputRef}
              type="password"
              className="field__input"
              value={pass}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              aria-label="Passphrase"
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
          {mode === 'create' && (
            <label className="field">
              <span className="field__label">Confirm</span>
              <input
                type="password"
                className="field__input"
                value={again}
                autoComplete="new-password"
                aria-label="Confirm passphrase"
                onChange={(e) => setAgain(e.target.value)}
              />
            </label>
          )}
          {(localError ?? error) && (
            <p className="passdialog__error" role="alert">
              {localError ?? error}
            </p>
          )}
          <div className="passdialog__actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Deriving key…' : confirmLabel}
            </button>
          </div>
        </form>
        {mode === 'create' && (
          <p className="passdialog__note">
            There is no recovery for a lost passphrase — the key exists only when you type it.
          </p>
        )}
      </div>
    </div>
  )
}
