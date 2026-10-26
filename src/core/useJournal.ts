import { useEffect, useRef, useState } from 'react'

import { JournalRepository } from './journal'

export const repo = new JournalRepository()

/** Single shared subscription: bump the version, re-derive. */
export function useJournal(): { repo: JournalRepository; version: number } {
  const [version, setVersion] = useState(repo.version)
  useEffect(() => repo.subscribe(() => setVersion(repo.version)), [])
  return { repo, version }
}

export interface JournalBoot {
  ready: boolean
  needsMigration: boolean
}

/**
 * Boot sequence: open the db, check for legacy weekly notes, expose
 * `needsMigration` to the gate UI in App. The migration itself only runs once
 * the user has chosen whether to download the safety backup.
 */
export function useJournalBoot(dob: Date | null): JournalBoot {
  const [needsMigration, setNeedsMigration] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    void (async () => {
      await repo.init()
      const flag = await repo.getFlag<{ dbVersion: number }>('migration')
      setNeedsMigration(!flag)
    })()
  }, [])

  useEffect(() => {
    repo.setDob(dob)
  }, [dob])

  return { ready: true, needsMigration }
}
