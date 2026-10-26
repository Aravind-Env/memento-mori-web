import { useState } from 'react'

import { useJournal } from '../../core/useJournal'
import { migrateWeeklyNotes } from '../../core/migrate'
import type { Note } from '../../data/model'
import { useStore } from '../../state/store'

interface Props {
  dob: Date
  notes: Note[]
  onDone: () => void
}

/**
 * One-time gate: the weekly → daily migration explains itself, offers the
 * JSON backup, then runs. The originals in localStorage are never touched,
 * so the backup + flag-free rollback remain.
 */
export function MigrationGate({ dob, notes, onDone }: Props) {
  const { repo } = useJournal()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ migrated: number; skipped: number } | null>(null)

  const withBackup = () => {
    const json = useStore.getState().exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `memento-mori-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const run = async () => {
    setRunning(true)
    const res = await migrateWeeklyNotes(repo, dob, notes)
    setResult({ migrated: res.migrated, skipped: res.skipped })
    setRunning(false)
  }

  return (
    <>
      <div className="drawer-scrim" aria-hidden="true" />
      <div className="migration-gate" role="dialog" aria-modal="true" aria-label="Journal upgrade">
        <p className="drawer__eyebrow">Journal</p>
        <h2 className="drawer__title">Your journal becomes daily</h2>
        <p className="migration-gate__copy">
          Each weekly note is turning into a day entry, dated the day it was
          written, exactly where it belongs. A JSON backup of everything stays
          available in Settings either way — the originals are never removed.
        </p>
        {result ? (
          <>
            <p className="migration-gate__copy" data-qa="migration-result">
              {result.migrated} entr{result.migrated === 1 ? 'y' : 'ies'} carried over
              {result.skipped > 0 ? `, ${result.skipped} empty weeks skipped` : ''}.
            </p>
            <div className="migration-gate__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={onDone}
                data-qa="migration-finish"
              >
                Go to today's entry
              </button>
            </div>
          </>
        ) : (
          <div className="migration-gate__actions">
            <button type="button" className="btn btn--primary" disabled={running} onClick={run} data-qa="migration-continue">
              {running ? 'Moving your notes…' : 'Move my notes'}
            </button>
            <button type="button" className="btn" onClick={withBackup} disabled={running}>
              Download backup first
            </button>
          </div>
        )}
      </div>
    </>
  )
}
