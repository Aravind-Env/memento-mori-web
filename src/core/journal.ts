/**
 * The daily journal repository. IndexedDB only — entries never touch
 * localStorage. Main-thread memory keeps the metadata index, the week roll-up
 * cache and an LRU of at most 20 decoded bodies; everything else streams.
 *
 * Write path: ONE atomic transaction per save (body + meta + week roll-up),
 * debounced at the UI layer, plus a BroadcastChannel ping so two tabs agree.
 * Week roll-ups are recomputed incrementally — exactly one week per write.
 * Bodies ≥ 1KB are gzipped (when the platform has CompressionStream) and then,
 * if the privacy lock is on, AES-GCM encrypted. Compress first, then encrypt.
 */

import { getAll, openDB, req } from './idb'
import { toBase64, fromBase64 } from '../domain/crypto'
import {
  countWords,
  dateKey,
  excerptOf,
  isValidKey,
  keyFromIndex,
  onThisDay,
  streaks,
  weekOfDate,
} from '../domain/daily'
import type { DailyMetaLike } from '../domain/dailySearch'
import type { IntegrityCheckResult } from '../domain/storageHealth'

export const DB_NAME = 'memento-mori-journal'
export const DB_VERSION = 4

export interface EntryVersion {
  id: string
  date: string
  meta: EntryMeta
  body: EntryBody
  createdAt: number
}

export interface JournalExportData {
  entries: { meta: EntryMeta; body: EntryBody }[]
  versions: EntryVersion[]
  reviews: ReviewRecord[]
  exportedAt: string
}

export interface EntryMeta {
  date: string
  weekIndex: number
  title?: string
  mood?: number
  energy?: number
  tags: string[]
  words: number
  excerpt: string
  goodThing?: string
  updatedAt: number
  migrated?: boolean
  deletedAt?: number
}

export interface EntryBody {
  date: string
  /** Plain text, or (gzip'd →) AES-GCM'd bytes, always base64 after comp/enc. */
  body: string
  comp: 0 | 1
  enc: 0 | 1
  iv?: string
  updatedAt: number
}

export interface WeekMeta {
  weekIndex: number
  daysWritten: number
  avgMood: number
  words: number
  lastDate: string
  updatedAt: number
}

export interface ReviewRecord {
  weekIndex: number
  reflection: string
  updatedAt: number
}

export interface TrashRow {
  date: string
  meta: EntryMeta
  body: EntryBody | null
}

export interface EntryInput {
  title?: string
  body?: string
  mood?: number
  energy?: number
  tags?: string[]
  goodThing?: string
  migrated?: boolean
}

interface TrashOutRow {
  date: string
  deletedAt?: number
}

const LRU_MAX = 20
const PAGE = 50
const TRASH_DAYS = 30
const GZIP_MIN = 1024
const TAG_MAX = 8

const hasCompression = typeof CompressionStream !== 'undefined'

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

function txnDone(tx: IDBTransaction, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error(label))
    tx.onabort = () => reject(tx.error ?? new Error(label))
  })
}

/** Recompute one week's roll-up from the entries index, inside the write txn. */
function recomputeWeekIn(
  tx: IDBTransaction,
  weekIndex: number,
): Promise<WeekMeta | undefined> {
  if (weekIndex < 0) return Promise.resolve(undefined)
  const entries = tx.objectStore('entries_meta').index('weekIndex') as unknown as {
    getAll: (r: number) => IDBRequest<EntryMeta[]>
  }
  const put = tx.objectStore('weeks_meta')
  return req(entries.getAll(weekIndex)).then((rows) => {
    let days = 0
    let words = 0
    let moodSum = 0
    let moods = 0
    let lastDate = ''
    for (const r of rows) {
      days++
      words += r.words
      if (r.mood !== undefined) {
        moodSum += r.mood
        moods++
      }
      if (r.date > lastDate) lastDate = r.date
    }
    const row: WeekMeta = {
      weekIndex,
      daysWritten: days,
      avgMood: moods ? moodSum / moods : 0,
      words,
      lastDate,
      updatedAt: Date.now(),
    }
    put.put(row as never)
    return row
  })
}

export class JournalRepository {
  private db!: IDBDatabase
  private meta = new Map<string, EntryMeta>()
  private weeks = new Map<number, WeekMeta>()
  private trash = new Map<string, number>() // date → deletedAt stamp

  /** Read-only map views for the dashboard paint (no copies). */
  getMetaMap(): ReadonlyMap<string, EntryMeta> {
    return this.meta
  }

  getWeekMap(): ReadonlyMap<number, WeekMeta> {
    return this.weeks
  }
  private sorted: string[] = []
  private lruBodies = new Map<string, string>()
  private cipherKey: CryptoKey | null = null
  private channel: BroadcastChannel | null = null
  private listeners = new Set<() => void>()
  private worker: Worker | null = null
  private workerReady = false
  private workerSeq = 0
  private workerPending = new Map<number, (v: unknown) => void>()
  private dobDate: Date | null = null
  version = 0

  async init(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, (db, _, oldVersion) => {
      if (oldVersion < 1 || !db.objectStoreNames.contains('journal_meta')) {
        if (!db.objectStoreNames.contains('journal_meta')) db.createObjectStore('journal_meta', { keyPath: 'key' } as never)
        if (!db.objectStoreNames.contains('entries_meta')) {
          const entries = db.createObjectStore('entries_meta', { keyPath: 'date' })
          entries.createIndex('weekIndex', 'weekIndex')
          entries.createIndex('updated', 'updatedAt')
          entries.createIndex('mood', 'mood')
          entries.createIndex('tag', 'tags', { multiEntry: true })
          entries.createIndex('deleted', 'deletedAt')
        }
        if (!db.objectStoreNames.contains('entries_body')) db.createObjectStore('entries_body', { keyPath: 'date' })
        if (!db.objectStoreNames.contains('weeks_meta')) db.createObjectStore('weeks_meta', { keyPath: 'weekIndex' })
        if (!db.objectStoreNames.contains('trash')) db.createObjectStore('trash', { keyPath: 'date' })
        if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews', { keyPath: 'weekIndex' })
        if (!db.objectStoreNames.contains('fts')) db.createObjectStore('fts', { keyPath: 'id' })
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('entry_versions')) {
          const vStore = db.createObjectStore('entry_versions', { keyPath: 'id' })
          vStore.createIndex('date', 'date')
          vStore.createIndex('updated', 'createdAt')
        }
      }
    })
    const [rows, weekRows, trashRows] = await Promise.all([
      getAll<EntryMeta>(this.db.transaction('entries_meta').objectStore('entries_meta')),
      getAll<WeekMeta>(this.db.transaction('weeks_meta').objectStore('weeks_meta')),
      getAll<TrashOutRow>(this.db.transaction('trash').objectStore('trash')),
    ])
    for (const r of rows) this.meta.set(r.date, r)
    for (const w of weekRows) this.weeks.set(w.weekIndex, w)
    for (const t of trashRows) if (t.deletedAt) this.trash.set(t.date, t.deletedAt)
    this.rebuildSorted()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('memento-mori-journal')
      this.channel.onmessage = (ev) => void this.onRemote(ev.data)
    }
    this.bump()
  }

  /* --------------------------- subscriptions --------------------------- */

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private bump(): void {
    this.version++
    for (const l of this.listeners) l()
  }

  /* ------------------------------ reads ------------------------------- */

  /** Live (non-deleted) dates, newest first. */
  liveDates(): string[] {
    return this.sorted
  }

  trashDates(): string[] {
    return [...this.trash.keys()].sort((a, b) => (this.trash.get(b) ?? 0) - (this.trash.get(a) ?? 0))
  }

  private rebuildSorted(): void {
    this.sorted = [...this.meta.keys()].sort().reverse()
  }

  page(from?: string, limit = PAGE): EntryMeta[] {
    const startIdx = from ? this.sorted.indexOf(from) + 1 : 0
    const out: EntryMeta[] = []
    for (let i = startIdx; i < this.sorted.length && out.length < limit; i++) {
      out.push(this.meta.get(this.sorted[i])!)
    }
    return out
  }

  getMeta(date: string): EntryMeta | undefined {
    return this.meta.get(date)
  }

  isTrashed(date: string): boolean {
    return this.trash.has(date)
  }

  private async rawBody(date: string): Promise<EntryBody | undefined> {
    return req<EntryBody | undefined>(
      this.db.transaction('entries_body').objectStore('entries_body').get(date),
    )
  }

  private decodeBody(row: EntryBody): Promise<string> {
    return (async () => {
      let bytes: Uint8Array
      if (row.enc) {
        if (!this.cipherKey) throw new Error('locked')
        const iv = row.iv ? fromBase64(row.iv) : new Uint8Array(12)
        const plain = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as unknown as BufferSource },
          this.cipherKey,
          fromBase64(row.body) as unknown as BufferSource,
        )
        bytes = new Uint8Array(plain)
      } else {
        bytes = fromBase64(row.body)
      }
      if (row.comp) return gunzip(bytes)
      return new TextDecoder().decode(bytes)
    })()
  }

  /** Body text with a 20-deep LRU; a miss reads IndexedDB once. */
  async body(date: string): Promise<string> {
    const hit = this.lruBodies.get(date)
    if (hit !== undefined) {
      this.lruBodies.delete(date)
      this.lruBodies.set(date, hit)
      return hit
    }
    const row = await this.rawBody(date)
    if (!row) return ''
    const text = await this.decodeBody(row)
    this.lruBodies.delete(date)
    this.lruBodies.set(date, text)
    while (this.lruBodies.size > LRU_MAX) {
      const oldest = this.lruBodies.keys().next().value
      if (oldest === undefined) break
      this.lruBodies.delete(oldest)
    }
    return text
  }

  getWeek(weekIndex: number): WeekMeta | undefined {
    return this.weeks.get(weekIndex)
  }

  /** The 7 days of a week with their metas (for strip + Week tab). */
  daysInWeek(weekIndex: number, dob: Date): { key: string; meta: EntryMeta | undefined }[] {
    const out: { key: string; meta: EntryMeta | undefined }[] = []
    for (let i = 0; i < 7; i++) {
      if (weekIndex < 0) {
        out.push({ key: '', meta: undefined })
        continue
      }
      const key = keyFromIndex(dob, weekIndex * 7 + i)
      out.push({ key, meta: this.meta.get(key) })
    }
    return out
  }

  /**
   * The ~365 days of an age year (birthday-anchored), each with its meta —
   * the Year heat-map reads this directly; derived from the meta index only.
   */
  daysInAgeYear(dob: Date, ageYear: number): { key: string; meta: EntryMeta | undefined }[] {
    const out: { key: string; meta: EntryMeta | undefined }[] = []
    const start = new Date(dob.getFullYear() + ageYear, dob.getMonth(), dob.getDate())
    const end = new Date(dob.getFullYear() + ageYear + 1, dob.getMonth(), dob.getDate())
    for (let t = new Date(start); t < end; t.setDate(t.getDate() + 1)) {
      const key = dateKey(new Date(t))
      out.push({ key, meta: this.meta.get(key) })
    }
    return out
  }

  weekOf(weekIndex: number): { metas: EntryMeta[]; avgMood: number; words: number; days: number } {
    const metas: EntryMeta[] = []
    for (const m of this.meta.values()) {
      if (m.weekIndex === weekIndex && !this.trash.has(m.date)) metas.push(m)
    }
    metas.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const withMood = metas.filter((m) => m.mood !== undefined)
    const avgMood = withMood.length
      ? withMood.reduce((a, m) => a + (m.mood ?? 0), 0) / withMood.length
      : 0
    const words = metas.reduce((a, m) => a + m.words, 0)
    return { metas, avgMood, words, days: metas.length }
  }

  streak(now: Date): { current: number; longest: number } {
    return streaks(this.sorted, now)
  }

  onThisDay(now: Date, limit = 3): ReturnType<typeof onThisDay> {
    const rows: DailyMetaLike[] = []
    for (const m of this.meta.values()) {
      if (!this.trash.has(m.date)) {
        rows.push({ date: m.date, title: m.title, mood: m.mood, tags: m.tags, excerpt: m.excerpt })
      }
    }
    return onThisDay(rows, now, limit)
  }

  /* --------------------------- body codecs ---------------------------- */

  private async encodeBody(text: string): Promise<Omit<EntryBody, 'date' | 'updatedAt'>> {
    let bytes: Uint8Array
    let comp: 0 | 1 = 0
    const utf8 = new TextEncoder().encode(text)
    if (hasCompression && utf8.length >= GZIP_MIN) {
      bytes = await gzip(text)
      comp = 1
    } else {
      bytes = utf8
    }
    let enc: 0 | 1 = 0
    let iv: string | undefined
    if (this.cipherKey) {
      const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12))
      const cipher = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
        this.cipherKey,
        bytes as unknown as BufferSource,
      )
      bytes = new Uint8Array(cipher)
      enc = 1
      iv = toBase64(ivBytes)
    }
    return { body: toBase64(bytes), comp, enc, iv }
  }

  /* -------------------------- privacy lock ---------------------------- */

  get isEncrypted(): boolean {
    return this.cipherKey !== null
  }

  /**
   * Derives the AES key in memory ONLY (a reload re-prompts). 600k iterations
   * per the privacy spec; the passphrase itself is never stored. The KDF salt
   * lives in `journal_meta` ('enc_salt') — public, per-app: entry secrecy
   * rests on the passphrase + unique per-record IVs, like the app lock.
   */
  private async deriveKeyFor(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const base = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase) as unknown as BufferSource,
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    return globalThis.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }

  /** First-time enablement: mint a random salt, store it, keep the key warm. */
  async enableEncryption(passphrase: string): Promise<boolean> {
    if (!passphrase) return false
    try {
      const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
      const key = await this.deriveKeyFor(passphrase, salt, 600_000)
      // Prove the lock record round-trips before committing the salt.
      const probe = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: globalThis.crypto.getRandomValues(new Uint8Array(12)) as unknown as BufferSource },
        key,
        new TextEncoder().encode('probe') as unknown as BufferSource,
      )
      if (!probe.byteLength) return false
      await this.setFlag('enc_salt', toBase64(salt))
      this.cipherKey = key
      this.lruBodies.clear()
      return true
    } catch {
      return false
    }
  }

  /** Subsequent unlocks; false when encryption was never enabled. */
  async unlock(passphrase: string, iterations = 600_000): Promise<boolean> {
    try {
      const saltB64 = await this.getFlag<string>('enc_salt')
      if (!saltB64) return false
      const key = await this.deriveKeyFor(passphrase, fromBase64(saltB64), iterations)
      this.cipherKey = key
      this.lruBodies.clear()
      return true
    } catch {
      this.cipherKey = null
      return false
    }
  }

  lock(): void {
    this.cipherKey = null
    this.lruBodies.clear()
  }

  /* ------------------------------ writes ------------------------------ */

  setDob(dob: Date | null): void {
    this.dobDate = dob
  }

  private weekIndexOf(date: string): number {
    if (!this.dobDate) return 0
    return weekOfDate(this.dobDate, parseKeyDate(date))
  }

  /**
   * Atomic save. A day with no substance (no body, title, good-thing, tags)
   * cannot exist — an emptied entry is removed so "days written" stays honest.
   */
  async saveEntry(date: string, input: EntryInput): Promise<EntryMeta | undefined> {
    if (!isValidKey(date)) throw new Error('Invalid date key')
    const existing = this.meta.get(date)
    let existingBody: EntryBody | undefined
    if (existing) {
      existingBody = await this.rawBody(date)
    }

    const bodyText = input.body ?? ''
    const title = input.title?.trim() ?? ''
    const goodThing = input.goodThing?.trim() ?? ''
    const tags = (input.tags ?? [])
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
      .slice(0, TAG_MAX)
    const uniqueTags = Array.from(new Set(tags))
    const words = countWords(bodyText)
    if (!bodyText.trim() && !title && !goodThing && uniqueTags.length === 0 && !input.mood && !input.energy) {
      if (existing || this.trash.has(date)) await this.hardRemove(date)
      return undefined
    }

    let hasChanged = true
    if (existing && existingBody) {
      try {
        const oldText = await this.decodeBody(existingBody)
        const sameText = oldText === bodyText
        const sameTitle = (existing.title ?? '') === title
        const sameMood = existing.mood === input.mood
        const sameEnergy = existing.energy === input.energy
        const sameGood = (existing.goodThing ?? '') === goodThing
        const sameTags = JSON.stringify(existing.tags) === JSON.stringify(uniqueTags)
        if (sameText && sameTitle && sameMood && sameEnergy && sameGood && sameTags) {
          hasChanged = false
        }
      } catch {
        hasChanged = true
      }
    }

    const versionRow: EntryVersion | undefined = existing && existingBody && hasChanged ? {
      id: `${date}-${existing.updatedAt}`,
      date,
      meta: existing,
      body: existingBody,
      createdAt: existing.updatedAt,
    } : undefined

    const updatedAt = Date.now()
    const meta: EntryMeta = {
      date,
      weekIndex: this.weekIndexOf(date),
      words,
      excerpt: excerptOf(bodyText, 120) || excerptOf(`${title}${goodThing ? ` — ${goodThing}` : ''}`),
      tags: uniqueTags,
      updatedAt,
      ...(title ? { title } : {}),
      ...(input.mood ? { mood: input.mood } : {}),
      ...(input.energy ? { energy: input.energy } : {}),
      ...(goodThing ? { goodThing } : {}),
      ...(existing?.migrated ? { migrated: true } : input.migrated ? { migrated: true } : {}),
    }
    const encoded = await this.encodeBody(bodyText)
    const bodyRow: EntryBody = { date, updatedAt, ...encoded }

    const storeNames = ['entries_meta', 'entries_body', 'weeks_meta']
    if (versionRow && this.db.objectStoreNames.contains('entry_versions')) {
      storeNames.push('entry_versions')
    }
    const tx = this.db.transaction(storeNames, 'readwrite')
    tx.objectStore('entries_meta').put(meta as never)
    tx.objectStore('entries_body').put(bodyRow as never)
    if (versionRow && storeNames.includes('entry_versions')) {
      tx.objectStore('entry_versions').put(versionRow as never)
    }
    const weekPromise = recomputeWeekIn(tx as IDBTransaction, meta.weekIndex)
    await txnDone(tx, 'Saving failed')
    const week = await weekPromise

    this.meta.set(date, meta)
    this.trash.delete(date)
    this.rebuildSorted()
    if (week) this.weeks.set(week.weekIndex, week)
    if (this.lruBodies.has(date)) this.lruBodies.delete(date)
    this.broadcast({ type: 'entry', date, updatedAt, weekIndex: meta.weekIndex })
    this.notifyWorkerIndex(date, bodyText)
    this.bump()
    return meta
  }

  async getEntryVersions(date: string): Promise<EntryVersion[]> {
    try {
      if (!this.db || !this.db.objectStoreNames.contains('entry_versions')) return []
      const store = this.db.transaction('entry_versions').objectStore('entry_versions')
      const index = store.index('date')
      const rows = await req<EntryVersion[]>(index.getAll(date))
      return rows.sort((a, b) => b.createdAt - a.createdAt)
    } catch {
      return []
    }
  }

  async restoreEntryVersion(date: string, versionId: string): Promise<boolean> {
    try {
      if (!this.db || !this.db.objectStoreNames.contains('entry_versions')) return false
      const store = this.db.transaction('entry_versions').objectStore('entry_versions')
      const version = await req<EntryVersion | undefined>(store.get(versionId))
      if (!version || version.date !== date) return false

      const text = await this.decodeBody(version.body)
      await this.saveEntry(date, {
        title: version.meta.title,
        body: text,
        mood: version.meta.mood,
        energy: version.meta.energy,
        tags: version.meta.tags,
        goodThing: version.meta.goodThing,
        migrated: version.meta.migrated,
      })
      return true
    } catch {
      return false
    }
  }

  async integrityCheck(): Promise<IntegrityCheckResult> {
    const storesChecked = [
      'journal_meta',
      'entries_meta',
      'entries_body',
      'weeks_meta',
      'trash',
      'reviews',
      'fts',
      'entry_versions',
    ]
    const errors: string[] = []
    let entryCount = 0
    let versionCount = 0
    let orphanedBodies = 0
    let orphanedMetas = 0

    try {
      if (!this.db) {
        return { ok: false, storesChecked, entryCount: 0, versionCount: 0, orphanedBodies: 0, orphanedMetas: 0, errors: ['Database not initialized'] }
      }

      const txNames = storesChecked.filter((s) => this.db.objectStoreNames.contains(s))
      const tx = this.db.transaction(txNames, 'readonly')

      const metas = await req<EntryMeta[]>(tx.objectStore('entries_meta').getAll())
      entryCount = metas.length
      const metaDates = new Set(metas.map((m) => m.date))

      const bodies = await req<EntryBody[]>(tx.objectStore('entries_body').getAll())
      const bodyDates = new Set(bodies.map((b) => b.date))

      for (const d of bodyDates) {
        if (!metaDates.has(d)) orphanedBodies++
      }
      for (const d of metaDates) {
        if (!bodyDates.has(d)) orphanedMetas++
      }

      if (this.db.objectStoreNames.contains('entry_versions')) {
        const versions = await req<unknown[]>(tx.objectStore('entry_versions').getAll())
        versionCount = versions.length
      }

      await txnDone(tx, 'Integrity check transaction failed')

      const ok = errors.length === 0 && orphanedBodies === 0 && orphanedMetas === 0
      return { ok, storesChecked: txNames, entryCount, versionCount, orphanedBodies, orphanedMetas, errors }
    } catch (err) {
      return {
        ok: false,
        storesChecked,
        entryCount,
        versionCount,
        orphanedBodies,
        orphanedMetas,
        errors: [(err as Error).message ?? 'Unknown integrity error'],
      }
    }
  }

  /* ------------------- unified export/import for journal ------------------ */

  /**
   * Export all journal entries, bodies, versions, and reviews as a serializable
   * structure for inclusion in a unified application backup.
   */
  async exportAllEntries(): Promise<JournalExportData> {
    const entries: { meta: EntryMeta; body: EntryBody }[] = []
    for (const date of this.sorted) {
      const meta = this.meta.get(date)
      const body = await this.rawBody(date)
      if (meta && body) {
        entries.push({ meta, body })
      }
    }

    const versions: EntryVersion[] = []
    if (this.db.objectStoreNames.contains('entry_versions')) {
      const versionRows = await req<EntryVersion[]>(
        this.db.transaction('entry_versions').objectStore('entry_versions').getAll()
      )
      versions.push(...versionRows)
    }

    const reviews = await getAll<ReviewRecord>(
      this.db.transaction('reviews').objectStore('reviews')
    )

    return {
      entries,
      versions,
      reviews,
      exportedAt: new Date().toISOString(),
    }
  }

  /**
   * Import journal entries, bodies, versions, and reviews from a unified backup.
   * Skips entries whose `updatedAt` is not newer than existing.
   */
  async importAllEntries(data: JournalExportData): Promise<{ written: number; skipped: number }> {
    let written = 0
    let skipped = 0

    // Import entries + bodies
    for (const { meta, body } of data.entries) {
      const existing = this.meta.get(meta.date)
      if (existing && existing.updatedAt >= meta.updatedAt) {
        skipped++
        continue
      }
      const tx = this.txns(['entries_meta', 'entries_body', 'weeks_meta'])
      tx.objectStore('entries_meta').put(meta as never)
      tx.objectStore('entries_body').put(body as never)
      const week = recomputeWeekIn(tx as IDBTransaction, meta.weekIndex)
      await txnDone(tx, 'Import entry failed')
      const w = await week
      this.meta.set(meta.date, meta)
      this.trash.delete(meta.date)
      this.rebuildSorted()
      if (w) this.weeks.set(w.weekIndex, w)
      written++
    }

    // Import versions
    if (this.db.objectStoreNames.contains('entry_versions')) {
      for (const version of data.versions) {
        const existing = await req<EntryVersion | undefined>(
          this.db.transaction('entry_versions').objectStore('entry_versions').get(version.id)
        )
        if (!existing) {
          const vTx = this.txns(['entry_versions'])
          vTx.objectStore('entry_versions').put(version as never)
          await txnDone(vTx, 'Import version failed')
        }
      }
    }

    // Import reviews
    for (const review of data.reviews) {
      const existing = await req<ReviewRecord | undefined>(
        this.db.transaction('reviews').objectStore('reviews').get(review.weekIndex)
      )
      if (!existing) {
        const rTx = this.txns(['reviews'])
        rTx.objectStore('reviews').put(review as never)
        await txnDone(rTx, 'Import review failed')
      }
    }

    this.bump()
    return { written, skipped }
  }

  private txns(names: string[]): IDBTransaction {
    return this.db.transaction(names, 'readwrite')
  }

  private hardRemove(date: string): Promise<void> {
    const tx = this.txns(['entries_meta', 'entries_body', 'weeks_meta', 'trash'])
    const meta = this.meta.get(date)
    tx.objectStore('entries_meta').delete(date)
    tx.objectStore('entries_body').delete(date)
    const week = meta ? recomputeWeekIn(tx, meta.weekIndex) : Promise.resolve(undefined)
    return txnDone(tx, 'Removing failed').then(async () => {
      await week
      this.meta.delete(date)
      this.trash.delete(date)
      if (this.lruBodies.has(date)) this.lruBodies.delete(date)
      this.rebuildSorted()
      this.bump()
    })
  }

  /* --------------------------- soft delete ---------------------------- */

  /** Moves the day to the 30-day trash in one transaction; Undo puts it back. */
  async deleteEntry(date: string): Promise<void> {
    const meta = this.meta.get(date)
    if (!meta) return
    const body = await this.rawBody(date)
    const stamp = Date.now()
    const weekIndex = meta.weekIndex
    const deleted: EntryMeta = { ...meta, deletedAt: stamp, updatedAt: stamp }
    const tx = this.txns(['entries_meta', 'entries_body', 'trash', 'weeks_meta'])
    tx.objectStore('trash').put({ date, meta: deleted, body: body ?? null } as never)
    tx.objectStore('entries_meta').delete(date)
    tx.objectStore('entries_body').delete(date)
    const week = recomputeWeekIn(tx, weekIndex)
    await txnDone(tx, 'Removing failed')
    this.meta.delete(date)
    this.trash.set(date, stamp)
    if (this.lruBodies.has(date)) this.lruBodies.delete(date)
    this.rebuildSorted()
    const w = await week
    if (w) this.weeks.set(w.weekIndex, w)
    this.broadcast({ type: 'trash', date, updatedAt: stamp, weekIndex })
    this.notifyWorkerIndex(date, '')
    this.bump()
  }

  /** Undo path: pull a trash row back into the live stores. */
/* see restoreDate below — the repository exposes one name for both. */

/** Knock-out rows older than the 30-day retention. */
  async purgeTrash(now = Date.now()): Promise<number> {
    const cutoff = now - TRASH_DAYS * 86_400_000
    const doomed = [...this.trash.entries()].filter(([, t]) => t < cutoff).map(([d]) => d)
    for (const date of doomed) {
      const tx = this.txns(['trash'])
      tx.objectStore('trash').delete(date)
      await txnDone(tx, 'Purge failed')
      this.trash.delete(date)
    }
    if (doomed.length) this.bump()
    return doomed.length
  }

  restoreDate(date: string): Promise<boolean> {
    return req<TrashRow | undefined>(
      this.db.transaction('trash').objectStore('trash').get(date),
    )
      .then(async (row) => {
        if (!row) return false
        const weekIndex = row.meta.weekIndex
        const tx = this.txns(['entries_meta', 'entries_body', 'trash', 'weeks_meta'])
        const restored: EntryMeta = { ...row.meta, deletedAt: undefined, updatedAt: Date.now() }
        tx.objectStore('entries_meta').put(restored as never)
        if (row.body) tx.objectStore('entries_body').put(row.body as never)
        tx.objectStore('trash').delete(date)
        const week = recomputeWeekIn(tx, weekIndex)
        await txnDone(tx, 'Restore failed')
        this.meta.set(date, restored)
        this.trash.delete(date)
        this.rebuildSorted()
        const w = await week
        if (w) this.weeks.set(w.weekIndex, w)
        this.broadcast({ type: 'entry', date, updatedAt: restored.updatedAt, weekIndex })
        this.notifyWorkerIndex(date, row.body ? await this.decodeBody(row.body) : '')
        this.bump()
        return true
      })
      .catch(() => false)
  }

  /* ----------------------------- reviews ------------------------------ */

  async saveReview(weekIndex: number, reflection: string): Promise<void> {
    const row: ReviewRecord = { weekIndex, reflection, updatedAt: Date.now() }
    await req(this.db.transaction('reviews', 'readwrite').objectStore('reviews').put(row as never))
    this.bump()
  }

  async getReview(weekIndex: number): Promise<ReviewRecord | undefined> {
    return req<ReviewRecord | undefined>(
      this.db.transaction('reviews').objectStore('reviews').get(weekIndex),
    )
  }

  /* ------------------- journal_meta flags (migration) ------------------ */

  async getFlag<T>(key: string): Promise<T | undefined> {
    const row = await req<{ key: string; value: unknown } | undefined>(
      this.db.transaction('journal_meta').objectStore('journal_meta').get(key),
    )
    return row?.value as T | undefined
  }

  async setFlag(key: string, value: unknown): Promise<void> {
    await req(
      this.db
        .transaction('journal_meta', 'readwrite')
        .objectStore('journal_meta')
        .put({ key, value } as never),
    )
  }

  /* ---------------------------- cross-tab ----------------------------- */

  private broadcast(msg: { type: string; date: string; updatedAt: number; weekIndex?: number }): void {
    try {
      this.channel?.postMessage(msg)
    } catch {
      /* closed */
    }
  }

  private async onRemote(msg: { type: string; date: string; updatedAt: number; weekIndex?: number }): Promise<void> {
    if (!msg || !msg.date) return
    const local = this.meta.get(msg.date)
    if (local && local.updatedAt >= msg.updatedAt) return
    if (msg.type === 'trash') {
      const row = await req<TrashRow | undefined>(
        this.db.transaction('trash').objectStore('trash').get(msg.date),
      )
      if (row) {
        this.meta.delete(msg.date)
        this.trash.set(msg.date, row.meta.deletedAt ?? Date.now())
      } else {
        this.trash.delete(msg.date)
      }
      if (this.lruBodies.has(msg.date)) this.lruBodies.delete(msg.date)
    } else {
      const row = await req<EntryMeta | undefined>(
        this.db.transaction('entries_meta').objectStore('entries_meta').get(msg.date),
      )
      if (row) {
        this.meta.set(row.date, row)
        this.trash.delete(row.date)
        if (this.lruBodies.has(row.date)) this.lruBodies.delete(row.date)
      } else {
        this.meta.delete(msg.date)
      }
    }
    if (msg.weekIndex !== undefined && msg.weekIndex >= 0) {
      const w = await this.recomputeWeekReadonly(msg.weekIndex).catch(() => undefined)
      if (w) this.weeks.set(w.weekIndex, w)
      else this.weeks.delete(msg.weekIndex)
    }
    this.rebuildSorted()
    this.bump()
  }

  /** Read-only single-week recompute (used by cross-tab sync). */
  private async recomputeWeekReadonly(weekIndex: number): Promise<WeekMeta | undefined> {
    if (weekIndex < 0) return undefined
    const idx = this.db.transaction('entries_meta').objectStore('entries_meta').index('weekIndex')
    const rows = await req<EntryMeta[]>(idx.getAll(weekIndex))
    let days = 0
    let words = 0
    let moodSum = 0
    let moods = 0
    let lastDate = ''
    for (const r of rows) {
      if (this.trash.has(r.date)) continue
      days++
      words += r.words
      if (r.mood !== undefined) {
        moodSum += r.mood
        moods++
      }
      if (r.date > lastDate) lastDate = r.date
    }
    const row: WeekMeta = {
      weekIndex,
      daysWritten: days,
      avgMood: moods ? moodSum / moods : 0,
      words,
      lastDate,
      updatedAt: Date.now(),
    }
    await req(
      this.db
        .transaction('weeks_meta', 'readwrite')
        .objectStore('weeks_meta')
        .put(row as never),
    )
    return row
  }

  /* ---------------- full-text search via the Worker ------------------- */

  async startWorker(payload: { dates: string[] }): Promise<void> {
    if (typeof Worker === 'undefined') return
    try {
      this.worker = new Worker(new URL('./fts.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { seq?: number; result?: unknown; ready?: boolean }
        if (data.ready) {
          this.workerReady = true
          this.bump()
          return
        }
        if (data.seq !== undefined && this.workerPending.has(data.seq)) {
          const res = this.workerPending.get(data.seq)
          this.workerPending.delete(data.seq)
          res?.(data.result)
        }
      }
      this.worker.onerror = () => {
        // A dead worker degrades to metadata search silently.
        this.worker = null
        this.workerReady = false
      }
      this.worker.postMessage({ cmd: 'init', seq: 0 })
      void payload
      // Index what we already know (bodies stream in lazily from the LRU).
      this.worker.postMessage({ cmd: 'begin-build' })
    } catch {
      this.worker = null
    }
  }

  /** Worker-side full-text: dates whose body contains ALL terms. */
  async workerQuery(terms: string[]): Promise<{ dates: string[]; rows: string[] }> {
    if (!this.worker || !this.workerReady || terms.length === 0) return { dates: [], rows: [] }
    const seq = ++this.workerSeq
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (this.workerPending.has(seq)) {
          this.workerPending.delete(seq)
          resolve({ dates: [], rows: [] })
        }
      }, 800)
      this.workerPending.set(seq, (v) => {
        window.clearTimeout(timer)
        resolve(v as { dates: string[]; rows: [] })
      })
      this.worker!.postMessage({ cmd: 'query', seq, terms })
    })
  }

  private notifyWorkerIndex(date: string, body: string): void {
    try {
      this.worker?.postMessage({ cmd: 'index', date, body })
    } catch {
      /* worker not ready yet */
    }
  }

  /* ----------------------- backup (JSON, versioned) ------------------- */

  async exportBackup(): Promise<string> {
    const entries: { meta: EntryMeta; body: string }[] = []
    // Encrypted vaults export through the same path: the lock key is in
    // memory, so bodies decode. If the lock key is gone, encrypted bodies are
    // skipped with a marker rather than lost silently.
    let skippedLocked = 0
    for (const date of this.sorted) {
      const meta = this.meta.get(date)!
      let body = ''
      try {
        body = await this.body(date)
      } catch (e) {
        if ((e as Error).message === 'locked') skippedLocked++
      }
      entries.push({ meta, body })
    }
    const reviews = await getAll<ReviewRecord>(this.db.transaction('reviews').objectStore('reviews'))
    return JSON.stringify(
      {
        format: 'memento-daily-v1',
        schemaVersion: DB_VERSION,
        exportedAt: new Date().toISOString(),
        encryptedSkipped: skippedLocked,
        entries,
        reviews,
      },
      null,
      2,
    )
  }

  /**
   * Validated, de-duplicated restore. `replace` clears everything first;
   * `merge` skips rows whose existing `updatedAt` is newer. A dry run returns
   * the counts without writing. Chunked 50-per-transaction so a 10-year
   * import never blocks the thread for long.
   */
  async importBackup(
    raw: string,
    mode: 'merge' | 'replace',
    dryRun = false,
  ): Promise<{ ok: boolean; error?: string; written: number; skipped: number; dryRun?: DryRunReport }> {
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Could not read that JSON file.', written: 0, skipped: 0 }
    }
    const v = data as Record<string, unknown>
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Not a valid journal backup.', written: 0, skipped: 0 }
    }
    if (v.format !== 'memento-daily-v1') {
      return { ok: false, error: 'Not a daily-journal backup file.', written: 0, skipped: 0 }
    }
    if (typeof v.schemaVersion === 'number' && v.schemaVersion > DB_VERSION) {
      return { ok: false, error: 'This backup was written by a newer version of the app.', written: 0, skipped: 0 }
    }
    if (!Array.isArray(v.entries)) {
      return { ok: false, error: 'No entries found in the file.', written: 0, skipped: 0 }
    }
    const rows = validateRows(v.entries)
    if (rows.length === 0) {
      return { ok: false, error: 'No valid entries found in the file.', written: 0, skipped: 0 }
    }

    if (mode === 'merge') {
      let report: DryRunReport = { add: 0, update: 0, keep: 0 }
      for (const r of rows) {
        const existing = this.meta.get(r.meta.date)
        if (!existing) report.add++
        else if (existing.updatedAt < r.meta.updatedAt) report.update++
        else report.keep++
      }
      if (dryRun) return { ok: true, written: 0, skipped: 0, dryRun: report }
    }
    if (mode === 'replace' && dryRun) {
      return { ok: true, written: 0, skipped: 0, dryRun: { add: rows.length, update: 0, keep: 0 } }
    }

    if (mode === 'replace') {
      const tx = this.txns(['entries_meta', 'entries_body', 'weeks_meta', 'trash', 'journal_meta'])
      tx.objectStore('entries_meta').clear()
      tx.objectStore('entries_body').clear()
      tx.objectStore('weeks_meta').clear()
      tx.objectStore('trash').clear()
      await txnDone(tx, 'Clear failed')
      this.meta.clear()
      this.weeks.clear()
      this.trash.clear()
      this.lruBodies.clear()
    }

    let written = 0
    let skipped = 0
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE)
      for (const r of chunk) {
        if (mode === 'merge') {
          const existing = this.meta.get(r.meta.date)
          if (existing && existing.updatedAt >= r.meta.updatedAt) {
            skipped++
            continue
          }
        }
        await this.saveEntryImport(r.meta, r.body)
        written++
      }
      // Yield between chunks keeps the main thread responsive.
      await new Promise((res) => setTimeout(res, 0))
    }
    this.bump()
    return { ok: true, written, skipped }
  }

  /** Import path: write a row with its ORIGINAL updatedAt (no re-stamp). */
  private async saveEntryImport(meta: EntryMeta, body: string): Promise<void> {
    const encoded = await this.encodeBody(body)
    const bodyRow: EntryBody = { date: meta.date, updatedAt: meta.updatedAt, ...encoded }
    const tx = this.txns(['entries_meta', 'entries_body', 'weeks_meta'])
    tx.objectStore('entries_meta').put(meta as never)
    tx.objectStore('entries_body').put(bodyRow as never)
    const week = recomputeWeekIn(tx, meta.weekIndex)
    await txnDone(tx, 'Import failed')
    this.meta.set(meta.date, meta)
    this.trash.delete(meta.date)
    this.rebuildSorted()
    const w = await week
    if (w) this.weeks.set(w.weekIndex, w)
  }

  /**
   * Migration write: validated pre-baked rows, chunked 50-per-transaction,
   * with one week roll-up per affected week computed inside its txn. No
   * broadcasts — the migration runs once at boot before UI reads.
   */
  async putMigratedRows(rows: { meta: EntryMeta; body: string }[]): Promise<void> {
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE)
      const tx = this.txns(['entries_meta', 'entries_body', 'weeks_meta'])
      const weeks = chunk.map((r) => recomputeWeekIn(tx, r.meta.weekIndex).catch(() => undefined))
      for (const r of chunk) {
        const encoded = await this.safeEncode(r.body)
        const bodyRow: EntryBody = { date: r.meta.date, updatedAt: r.meta.updatedAt, ...encoded }
        tx.objectStore('entries_meta').put(r.meta as never)
        tx.objectStore('entries_body').put(bodyRow as never)
      }
      await txnDone(tx, 'Migration write failed')
      const settled = await Promise.all(weeks)
      for (const r of chunk) this.meta.set(r.meta.date, r.meta)
      for (const w of settled) if (w) this.weeks.set(w.weekIndex, w)
      await new Promise((res) => setTimeout(res, 0))
    }
    this.rebuildSorted()
    this.bump()
  }

  private async safeEncode(body: string): Promise<Omit<EntryBody, 'date' | 'updatedAt'>> {
    try {
      return await this.encodeBody(body)
    } catch {
      // Plain fallback: a migration must never fail because of crypto issues.
      return { body: toBase64(new TextEncoder().encode(body)), comp: 0, enc: 0 }
    }
  }
}

/* ---------------------------- validation ---------------------------- */

export interface DryRunReport {
  add: number
  update: number
  keep: number
}

function validateRows(list: unknown[]): { meta: EntryMeta; body: string }[] {
  const rows: { meta: EntryMeta; body: string }[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const meta = e.meta as EntryMeta | undefined
    if (!meta || typeof meta.date !== 'string' || !isValidKey(meta.date)) continue
    if (typeof meta.updatedAt !== 'number' || !Number.isFinite(meta.updatedAt)) continue
    if (!Array.isArray(meta.tags)) continue
    if (typeof meta.weekIndex !== 'number') continue
    const body = typeof e.body === 'string' ? e.body : ''
    if (seen.has(meta.date)) continue // de-duplicate by date
    seen.add(meta.date)
    rows.push({
      meta: {
        date: meta.date,
        weekIndex: Math.max(Math.round(meta.weekIndex), 0),
        words: Math.max(Math.round(meta.words) || 0, 0),
        excerpt: typeof meta.excerpt === 'string' ? meta.excerpt.slice(0, 120) : '',
        tags: meta.tags.slice(0, TAG_MAX).map((t: string) => String(t).toLowerCase()),
        updatedAt: meta.updatedAt,
        ...(typeof meta.title === 'string' && meta.title ? { title: meta.title } : {}),
        ...(meta.mood ? { mood: meta.mood as number } : {}),
        ...(meta.energy ? { energy: meta.energy as number } : {}),
        ...(typeof meta.goodThing === 'string' && meta.goodThing ? { goodThing: meta.goodThing } : {}),
        ...(meta.migrated ? { migrated: true } : {}),
      },
      body,
    })
  }
  return rows
}

function parseKeyDate(key: string): Date {
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
  )
}

void parseKeyDate
