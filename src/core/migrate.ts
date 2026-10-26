/**
 * Weekly → daily migration (schema v2 → v3). One idempotent pass:
 *
 *   • Each weekly Note becomes a daily entry dated its written day — the
 *     note's `createdAt` calendar date when it is on/after the birth date,
 *     otherwise the first day of the note's week.
 *   • `migrated: true` stamps provenance; the original Note[] in localStorage
 *     is never mutated and a JSON backup file is offered first.
 *   • Already-claimed dates find the next free day within their week and give
 *     up cleanly if the whole week is full — nothing is ever overwritten.
 *
 * Rollback: localStorage keeps the originals plus the backup file; `wipeDaily`
 * can clear the daily store to run again from zero.
 */

import type { Note } from '../data/model'
import { dateKey, dayIndex, isValidKey, weekOfDate, countWords, excerptOf } from '../domain/daily'
import { parseISODate, weekStart } from '../domain/dates'
import {JournalRepository, type EntryMeta} from './journal'

export interface MigrationResult {
  migrated: number
  skipped: number
  alreadyDone: boolean
}

interface MigrationFlag {
  done: number
  dbVersion: number
  at: string
}

function createdAtKey(note: Note): string | null {
  const t = Date.parse(note.updatedAt || note.createdAt)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const key = dateKey(d)
  return isValidKey(key) ? key : null
}

function nextFreeDateInWeek(dob: Date, weekIndex: number, taken: Set<string>): string | null {
  const start = weekStart(dob, weekIndex)
  for (let i = 0; i < 7; i++) {
    const key = dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    if (!taken.has(key)) return key
  }
  return null
}

export async function migrateWeeklyNotes(
  repo: JournalRepository,
  dob: Date,
  notes: Note[],
): Promise<MigrationResult> {
  const flag = await repo.getFlag<MigrationFlag>('migration')
  if (flag && flag.dbVersion >= 3) {
    return { migrated: 0, skipped: 0, alreadyDone: true }
  }

  const rows: { meta: EntryMeta; body: string }[] = []
  // Existing daily rows win; migration folds around them.
  const existing = new Set<string>(repo.liveDates())
  let migrated = 0
  let skipped = 0

  for (const note of notes) {
    const has = Boolean(
      note.text?.trim() || note.mood || (note.tags && note.tags.length > 0),
    )
    if (!has) {
      skipped++
      continue
    }
    const weekIndex = note.weekIndex
    if (weekIndex < 0) {
      skipped++
      continue
    }
    let date: string | null = createdAtKey(note)
    if (date) {
      const di = dayIndex(dob, parseISODate(date))
      if (di < 0) date = null
      else {
        const w = weekOfDate(dob, parseISODate(date))
        if (w !== weekIndex) date = null // stale clock: trust the grid week
      }
    }
    if (!date || existing.has(date)) {
      date = nextFreeDateInWeek(dob, weekIndex, existing)
    }
    if (!date) {
      skipped++ // full week: keep the note in localStorage, write nothing
      continue
    }
    existing.add(date)
    const words = countWords(note.text!)
    const meta: EntryMeta = {
      date,
      weekIndex: weekOfDate(dob, parseISODate(date)),
      words,
      excerpt: excerptOf(note.text!),
      tags: (note.tags ?? []).slice(0, 8),
      updatedAt: Date.parse(note.updatedAt || note.createdAt) || Date.now(),
      migrated: true,
      ...(note.mood ? { mood: note.mood } : {}),
    }
    if (words === 0 && note.text!.trim()) meta.words = 1
    rows.push({ meta, body: note.text! })
    migrated++
  }

  await repo.putMigratedRows(rows)
  await repo.setFlag('migration', {
    done: migrated + skipped,
    dbVersion: 3,
    at: new Date().toISOString(),
  } satisfies MigrationFlag)
  return { migrated, skipped, alreadyDone: false }
}

/** Rollback helper: clear ALL daily data so a fresh migration can re-run. */
export async function wipeDaily(repo: JournalRepository): Promise<void> {
  const names = ['entries_meta', 'entries_body', 'weeks_meta', 'trash', 'reviews', 'journal_meta', 'fts']
  for (const name of names) {
    try {
      const tx = (repo as unknown as { db: IDBDatabase }).db.transaction(name, 'readwrite')
      tx.objectStore(name).clear()
      await new Promise((res, rej) => {
        tx.oncomplete = res
        tx.onerror = () => rej(tx.error)
      })
    } catch {
      /* store may not exist in older dbs */
    }
  }
}
