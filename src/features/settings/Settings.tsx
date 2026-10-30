import { useEffect, useRef, useState } from 'react'

import { MiniGrid } from '../grid/MiniGrid'
import { parseISODate, toISODate } from '../../domain/dates'
import { MAX_LIFE_YEARS, MIN_LIFE_YEARS } from '../../domain/lifeMath'
import { DAY_SHORT } from '../../domain/review'
import {
  calculateStorageWarning,
  formatBytes,
  getBackupHealthStatus,
  getLocalStorageSize,
  type BackupFrequency,
  type IntegrityCheckResult,
} from '../../domain/storageHealth'
import { repo } from '../../core/useJournal'
import {
  VaultError,
  decryptJSON,
  encryptJSON,
  isEncryptedEnvelope,
  makeLockRecord,
} from '../../domain/crypto'
import { PassphraseDialog } from './PassphraseDialog'
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
  const vault = useStore((s) => s.vault)
  const updateProfile = useStore((s) => s.updateProfile)
  const setTheme = useStore((s) => s.setTheme)
  const setGentleMode = useStore((s) => s.setGentleMode)
  const setReduceMotion = useStore((s) => s.setReduceMotion)
  const setReminderDay = useStore((s) => s.setReminderDay)
  const setVault = useStore((s) => s.setVault)
  const exportJSON = useStore((s) => s.exportJSON)
  const importJSON = useStore((s) => s.importJSON)
  const clearProfile = useStore((s) => s.clearProfile)

  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  )

  const setBackupFrequency = useStore((s) => s.setBackupFrequency)
  const recordBackupSuccess = useStore((s) => s.recordBackupSuccess)
  const recordBackupFailure = useStore((s) => s.recordBackupFailure)

  const [entryCount, setEntryCount] = useState(() => repo.liveDates().length)
  const [storageText, setStorageText] = useState('Calculating...')
  const [warningLevel, setWarningLevel] = useState<string>('normal')
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null)

  useEffect(() => {
    void (async () => {
      setEntryCount(repo.liveDates().length)
      const lsBytes = getLocalStorageSize()
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate()
          const usage = (est.usage ?? 0) + lsBytes
          const quota = est.quota ?? 1
          const pct = Math.round((usage / quota) * 100)
          setStorageText(`${formatBytes(usage)} of ${formatBytes(quota)} (${pct}%)`)
          setWarningLevel(calculateStorageWarning(pct))
        } catch {
          setStorageText(formatBytes(lsBytes) + ' (localStorage)')
        }
      } else {
        setStorageText(formatBytes(lsBytes) + ' (localStorage)')
      }
    })()
  }, [])

  async function runIntegrityCheck() {
    const res = await repo.integrityCheck()
    setIntegrityResult(res)
    onToast(res.ok ? 'Integrity check passed' : 'Integrity issues detected')
  }

  const backupHealth = getBackupHealthStatus(settings.lastBackupAt, settings.backupFrequency ?? 'weekly', Date.now(), settings.lastBackupFailed)

  type VaultDialog =
    | { kind: 'hidden' }
    | { kind: 'export' }
    | { kind: 'import' }
    | { kind: 'lock' }
  const [vaultDialog, setVaultDialog] = useState<VaultDialog>({ kind: 'hidden' })
  /** Unparsed encrypted file text awaiting a passphrase. */
  const [pendingImportText, setPendingImportText] = useState<string | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [vaultError, setVaultError] = useState<string | null>(null)

  function closeVaultDialog() {
    setVaultDialog({ kind: 'hidden' })
    setPendingImportText(null)
    setVaultBusy(false)
    setVaultError(null)
  }

  if (!profile) return null
  const dobDate = parseISODate(profile.dob)

  function handleExport() {
    try {
      const blob = new Blob([exportJSON()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memento-mori-backup-${toISODate(new Date())}.json`
      a.click()
      URL.revokeObjectURL(url)
      recordBackupSuccess()
      onToast('Backup downloaded')
    } catch {
      recordBackupFailure()
      onToast('Backup export failed')
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    try {
      const parsed: unknown = JSON.parse(text)
      if (isEncryptedEnvelope(parsed)) {
        setPendingImportText(text)
        setVaultDialog({ kind: 'import' })
        return
      }
    } catch {
      /* fall through to the plain-path error reporting */
    }
    const result = importJSON(text)
    onToast(result.ok ? 'Data imported' : result.error ?? 'Import failed')
  }

  async function runEncryptedExport(passphrase: string) {
    setVaultBusy(true)
    setVaultError(null)
    try {
      const envelope = await encryptJSON(exportJSON(), passphrase)
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memento-mori-vault-${toISODate(new Date())}.json`
      a.click()
      URL.revokeObjectURL(url)
      recordBackupSuccess()
      onToast('Encrypted backup downloaded')
      closeVaultDialog()
    } catch (err) {
      recordBackupFailure()
      setVaultError(err instanceof VaultError ? err.message : 'Encryption is unavailable here.')
    } finally {
      setVaultBusy(false)
    }
  }

  async function runEncryptedImport(passphrase: string) {
    if (pendingImportText == null) return
    setVaultBusy(true)
    setVaultError(null)
    try {
      const envelope: unknown = JSON.parse(pendingImportText)
      const json = await decryptJSON(envelope, passphrase)
      const result = importJSON(json)
      if (result.ok) {
        onToast('Encrypted backup restored')
        closeVaultDialog()
      } else {
        setVaultError(result.error ?? 'Import failed')
      }
    } catch (err) {
      setVaultError(err instanceof VaultError ? err.message : 'Could not decrypt that file.')
    } finally {
      setVaultBusy(false)
    }
  }

  async function runEnableLock(passphrase: string) {
    setVaultBusy(true)
    setVaultError(null)
    try {
      const record = await makeLockRecord(passphrase)
      setVault(record, true)
      onToast('App lock on — it asks for your passphrase on the next load')
      closeVaultDialog()
    } catch {
      setVaultError('The app lock could not be set up here.')
    } finally {
      setVaultBusy(false)
    }
  }

  function handleLockToggle() {
    if (!settings.appLock && !vault) {
      setVaultDialog({ kind: 'lock' })
      return
    }
    setVault(null, false)
    onToast('App lock off')
  }

  async function handleNotifyToggle() {
    if (!supported) return
    if (Notification.permission === 'granted') {
      onToast('Permission already granted — manage it in your browser settings')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotifPermission(permission)
      onToast(permission === 'granted' ? 'Reminders on' : 'No reminder without permission')
    } catch {
      onToast('Browser refused the request')
    }
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
          <h3 className="settings__heading">Weekly review</h3>
          <p className="settings__note">
            Pick one quiet day for the ritual: last week's note beside a fresh intention. Skipping
            a week never puts you behind.
          </p>
          <div className="segmented" role="group" aria-label="Review reminder day">
            {DAY_SHORT.map((label, day) => (
              <button
                key={day}
                type="button"
                className={`segmented__btn${settings.reminderDay === day ? ' is-active' : ''}`}
                aria-pressed={settings.reminderDay === day}
                onClick={() => setReminderDay(settings.reminderDay === day ? undefined : day)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              disabled={!supported || notifPermission === 'granted'}
              checked={notifPermission === 'granted'}
              onChange={handleNotifyToggle}
            />
            <span>
              Local reminder
              {supported ? '' : ' — not supported here'}
              {supported && notifPermission === 'denied' ? ' — permission blocked' : ''}
            </span>
          </label>
          <p className="settings__note">
            A calm one-time nudge when the app is open; asking by itself never happens without
            your click.
          </p>
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Data Health Center</h3>
          <p className="settings__note">
            Monitor storage usage, verify database integrity, and configure backup reminders.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', margin: '12px 0' }}>
            <div style={{ padding: '10px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Database</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Healthy (v4)</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Journal Entries</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{entryCount} days</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Storage Used</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{storageText}</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Backup Health</div>
              <div style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize' }}>{backupHealth}</div>
            </div>
          </div>

          {warningLevel !== 'normal' && (
            <div style={{ padding: '8px 12px', background: warningLevel === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              ⚠ Storage warning ({warningLevel}): Approaching capacity. Please export a backup.
            </div>
          )}

          <label className="field">
            <span className="field__label">Backup Reminders</span>
            <select
              className="field__input"
              value={settings.backupFrequency ?? 'weekly'}
              onChange={(e) => setBackupFrequency(e.target.value as BackupFrequency)}
            >
              <option value="off">Off</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>

          <div className="settings__actions" style={{ marginTop: '12px' }}>
            <button type="button" className="btn" onClick={() => void runIntegrityCheck()}>
              Run Database Integrity Check
            </button>
          </div>
          {integrityResult && (
            <div className="settings__note" style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-subtle, rgba(0,0,0,0.03))', borderRadius: '6px' }}>
              {integrityResult.ok ? (
                <span style={{ color: 'var(--success, #10b981)' }}>✓ Integrity check passed ({integrityResult.entryCount} entries, {integrityResult.versionCount} versions)</span>
              ) : (
                <span style={{ color: 'var(--danger, #ef4444)' }}>⚠ Integrity issues found: {integrityResult.errors.join(', ')}</span>
              )}
            </div>
          )}
        </section>

        <section className="settings__section">
          <h3 className="settings__heading">Data</h3>
          <p className="settings__note">
            Your weeknotes, profile and settings live only on this device. Export a JSON backup any
            time (plain or encrypted), or import one to restore.
          </p>
          <div className="settings__actions">
            <button type="button" className="btn" onClick={handleExport}>
              Export backup
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setVaultDialog({ kind: 'export' })}
            >
              Encrypted backup…
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

        <section className="settings__section">
          <h3 className="settings__heading">Privacy</h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.appLock === true && vault != null}
              onChange={handleLockToggle}
            />
            <span>App lock — ask for a passphrase when the app opens</span>
          </label>
          <p className="settings__note">
            The lock derives one key from your passphrase to verify it, then forgets everything.
            There is no recovery without the passphrase, but any backup file restores you.
          </p>
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

      {vaultDialog.kind === 'export' && (
        <PassphraseDialog
          mode="create"
          title="Encrypted backup"
          description="Files on disk are readable by anyone with them — this keeps the backup itself unreadable without your passphrase."
          confirmLabel="Create encrypted backup"
          busy={vaultBusy}
          error={vaultError}
          onConfirm={runEncryptedExport}
          onClose={closeVaultDialog}
        />
      )}

      {vaultDialog.kind === 'import' && (
        <PassphraseDialog
          mode="unlock"
          title="Encrypted backup"
          description="Type the passphrase this file was written with."
          confirmLabel="Restore"
          busy={vaultBusy}
          error={vaultError}
          onConfirm={runEncryptedImport}
          onClose={closeVaultDialog}
        />
      )}

      {vaultDialog.kind === 'lock' && (
        <PassphraseDialog
          mode="create"
          title="Set the app-lock passphrase"
          description="You will type this each time the app opens."
          confirmLabel="Turn on app lock"
          busy={vaultBusy}
          error={vaultError}
          onConfirm={runEnableLock}
          onClose={closeVaultDialog}
        />
      )}
    </div>
  )
}
