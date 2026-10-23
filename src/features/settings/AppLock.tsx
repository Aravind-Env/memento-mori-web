import { useEffect, useRef, useState } from 'react'

import './passphrase.css'

export interface AppLockProps {
  verify: (passphrase: string) => Promise<boolean>
  onUnlock: () => void
}

/**
 * Full-screen gate when the app-lock passphrase is set. There is no "cancel"
 * — the data is here, just unreadable until the right passphrase returns.
 */
export function AppLock({ verify, onUnlock }: AppLockProps) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !pass) return
    setBusy(true)
    setError(null)
    try {
      if (await verify(pass)) {
        onUnlock()
        return
      }
      setError('Wrong passphrase.')
    } catch {
      setError('Unlock failed — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="applock-scrim">
      <form className="applock" onSubmit={submit}>
        <h2 className="applock__title">Memento Mori is locked</h2>
        <input
          ref={inputRef}
          type="password"
          className="field__input"
          value={pass}
          placeholder="Vault passphrase"
          autoComplete="current-password"
          aria-label="Vault passphrase"
          onChange={(e) => setPass(e.target.value)}
        />
        {error && <p className="applock__error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy || !pass}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <p className="applock__hint">
          The key derives from the passphrase only — nothing is stored. Without it, your data
          stays private on this device.
        </p>
      </form>
    </div>
  )
}
