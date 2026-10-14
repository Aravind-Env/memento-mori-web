import { useRef, useState } from 'react'

import { MiniGrid } from '../grid/MiniGrid'
import { parseISODate, toISODate } from '../../domain/dates'
import { MAX_LIFE_YEARS, MIN_LIFE_YEARS } from '../../domain/lifeMath'
import { useStore } from '../../state/store'
import type { Theme } from '../../data/model'

export interface SettingsProps {
  onClose: () => void
  onToast: (message: string, undo?: () => void) => void
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function Settings({ onClose, onToast }: SettingsProps) {
  const profile = useStore((s) => s.profile)
  const settings = useStore((s) => s.settings)
  const updateProfile = useStore((s) => s.updateProfile)
  const setTheme = useStore((s) => s.setTheme)
  const setGentleMode = useStore((s) => s.setGentleMode)
  const setReduceMotion = useStore((s) => s.setReduceMotion)
  const exportJSON = useStore((s) => s.exportJSON)
  const importJSON = useStore((s) => s.importJSON)
  const clearProfile = useStore((s) => s.clearProfile)

  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  if (!profile) return null
  const dobDate = parseISODate(profile.dob)

  function handleExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `memento-mori-backup-${toISODate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
    onToast('Backup downloaded')
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importJSON(String(reader.result ?? ''))
      onToast(result.ok ? 'Data imported' : result.error ?? 'Import failed')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <h2 className="drawer__title">Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <section className="settings__section">
          <h3 className="settings__heading">Profile</h3>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              type="text"
              className="field__input"
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Date of birth</span>
            <input
              type="date"
              className="field__input"
              value={profile.dob}
              max={toISODate(new Date())}
              onChange={(e) => updateProfile({ dob: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">
              Expected lifespan: <strong>{profile.lifeYears} years</strong>
            </span>
            <input
              type="range"
              className="field__range"
              min={MIN_LIFE_YEARS}
              max={MAX_LIFE_YEARS}
              value={profile.lifeYears}
              onChange={(e) => updateProfile({ lifeYears: Number(e.target.value) })}
            />
          </label>
          <div className="settings__preview">
            <MiniGrid dob={dobDate} lifeYears={profile.lifeYears} />
          </div>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Appearance</h3>
          <div className="segmented" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`segmented__btn${settings.theme === t.value ? ' is-active' : ''}`}
                aria-pressed={settings.theme === t.value}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.gentleMode}
              onChange={(e) => setGentleMode(e.target.checked)}
            />
            <span>Gentle mode — hide weeks-remaining figures</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
            />
            <span>Reduce motion — stop the current-week pulse</span>
          </label>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Data</h3>
          <p className="settings__note">
            Your weeknotes, profile and settings live only on this device. Export a JSON backup any
            time, or import one to restore.
          </p>
          <div className="settings__actions">
            <button type="button" className="btn" onClick={handleExport}>
              Export backup
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleImportFile}
            />
          </div>
        </section>

        <section className="settings__section settings__section--danger">
          <h3 className="settings__heading">Start over</h3>
          <p className="settings__note">
            Removes your profile and all notes from this device. This cannot be undone.
          </p>
          {confirmReset ? (
            <div className="settings__actions">
              <button
                type="button"
                className="btn btn--ghost-danger"
                onClick={() => {
                  clearProfile()
                  onClose()
                  onToast('Profile cleared')
                }}
              >
                Yes, delete everything
              </button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost-danger"
              onClick={() => setConfirmReset(true)}
            >
              Delete my data
            </button>
          )}
        </section>

        <p className="settings__support">
          If thinking about mortality is weighing on you, please reach out to someone you trust or a
          local support line. Life expectancy here is a statistical estimate, not a prediction.
        </p>
      </div>
    </div>
  )
}
