/**
 * Full-text index for daily entries, running in a Web Worker so the main
 * thread never scans bodies. Postings are delta-encoded doc-id lists; the
 * serialized index persists in the `fts` object store, capped at 8MB — when
 * it grows past the cap the rarest 10% of terms are pruned and it is saved
 * again. A missing index rebuilds lazily from IndexedDB.
 *
 * Protocol: {cmd:'init'|'index'|'query', seq?, date?, body?, terms?}
 * Responses: {ready:true} | {seq, result:{dates:string[]}}
 */

import { openDB, getAll, req } from './idb'
import { DB_NAME, DB_VERSION } from './journal'

const FTS_CAP = 8 * 1024 * 1024
const MAX_TERM = 24
const ID = 'postings'

let db: IDBDatabase | null = null
/** term → docId → term-frequency. Doc ids are stable ints (date → seq). */
let postings = new Map<string, Map<number, number>>()
let bodySize = new Map<number, number>()
let docIds = new Map<string, number>()
let idDates = new Map<number, string>()

type PostingsJSON = {
  docIds: [string, number][]
  /** term → delta-encoded sorted doc ids. */
  terms: Record<string, number[]>
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9#']+/)
    .filter((t) => t.length > 0 && t.length <= MAX_TERM)
    .slice(0, 2000)
}

function deltaEncode(ids: number[]): number[] {
  const sorted = [...ids].sort((a, b) => a - b)
  let prev = 0
  return sorted.map((id) => {
    const d = id - prev
    prev = id
    return d
  })
}

function deltaDecode(deltas: number[]): number[] {
  let prev = 0
  return deltas.map((d) => {
    prev += d
    return prev
  })
}

function serialize(): string {
  const terms: PostingsJSON['terms'] = {}
  for (const [term, docs] of postings) {
    if (docs.size === 0) continue
    terms[term] = deltaEncode([...docs.keys()])
  }
  return JSON.stringify({ docIds: [...docIds.entries()], terms })
}

async function save(capped: boolean): Promise<void> {
  if (!db) return
  let json = serialize()
  let size = json.length
  if (capped && size > FTS_CAP) {
    // Prune rarest terms until under the cap: the words that appear in the
    // fewest entries contribute the least to finding things again.
    const bySize = [...postings.entries()].sort((a, b) => a[1].size - b[1].size)
    let i = 0
    const dropAt = Math.floor(bySize.length * 0.1)
    while (size > FTS_CAP && i < bySize.length && bySize.length - 0 >= 0) {
      postings.delete(bySize[i++][0])
      json = serialize()
      size = json.length
      if (i > dropAt + bySize.length) break // safety
    }
  }
  await req(db.transaction('fts', 'readwrite').objectStore('fts').put({ id: ID, json, size } as never))
}

function indexDoc(date: string, body: string): void {
  let id = docIds.get(date)
  if (id === undefined) {
    id = docIds.size ? Math.max(...docIds.values()) + 1 : 0
    if (id > 1_000_000) return // hard id ceiling; a 100-year journal
    docIds.set(date, id)
    idDates.set(id, date)
  }
  const tokens = tokenize(body)
  bodySize.set(id, tokens.length)
  for (const token of tokens) {
    let docs = postings.get(token)
    if (!docs) {
      docs = new Map()
      postings.set(token, docs)
    }
    docs.set(id, (docs.get(id) ?? 0) + 1)
  }
}

async function buildFromDb(): Promise<void> {
  if (!db) return
  // Stream bodies meta-first; bodies decode is kept byte-cheap there (no
  // comp/enc flags at the FTS layer — the repository feeds plain text).
  const rows = await getAll<{ date: string; body: string; comp: number; enc: number }>(
    db.transaction('entries_body').objectStore('entries_body'),
  )
  const metaRows = await getAll<unknown[]>(
    db.transaction('entries_meta').objectStore('entries_meta'),
  )
  void metaRows
  for (const row of rows) {
    if (row.comp || row.enc) continue // opaque rows need the repo; lazy rebuild
    indexDoc(row.date, row.body)
  }
}

async function query(terms: string[]): Promise<string[]> {
  if (terms.length === 0) return []
  const sets: Map<number, number>[] = []
  for (const term of terms) {
    const docs = postings.get(term)
    if (!docs || docs.size === 0) return []
    sets.push(docs)
  }
  sets.sort((a, b) => a.size - b.size)
  const out: { date: string; score: number }[] = []
  outer: for (const [id, freq] of sets[0]) {
    let score = freq
    for (let i = 1; i < sets.length; i++) {
      const f = sets[i].get(id)
      if (!f) continue outer
      score += f
    }
    const date = idDates.get(id)
    if (date) out.push({ date, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.map((o) => o.date).slice(0, 400)
}

self.onmessage = (ev: MessageEvent) => {
  void handle(ev.data)
}

async function handle(msg: {
  cmd: string
  seq?: number
  date?: string
  body?: string
  terms?: string[]
}): Promise<void> {
  try {
    if (msg.cmd === 'init') {
      if (!db) {
        db = await openDB(DB_NAME, DB_VERSION, () => undefined)
      }
      const stored = await req<{ json?: string } | undefined>(
        db.transaction('fts').objectStore('fts').get(ID),
      )
      if (stored?.json) {
        const parsed = JSON.parse(stored.json) as PostingsJSON
        postings = new Map()
        for (const [term, deltas] of Object.entries(parsed.terms)) {
          const ids = deltaDecode([...deltas])
          const docs = new Map<number, number>()
          for (const id of ids) docs.set(id, 1)
          postings.set(term, docs)
        }
        docIds = new Map(parsed.docIds)
        idDates = new Map()
        for (const [date, id] of docIds) idDates.set(id, date)
      } else {
        await buildFromDb()
        await save(true)
      }
      ;(self as unknown as Worker).postMessage({ ready: true })
      return
    }
    if (msg.cmd === 'index') {
      if (typeof msg.date === 'string' && typeof msg.body === 'string') {
        // Re-index: wipe the doc's previous postings then add fresh ones.
        const id = docIds.get(msg.date)
        if (id !== undefined) {
          for (const docs of postings.values()) docs.delete(id)
        }
        indexDoc(msg.date, msg.body)
      }
      return
    }
    if (msg.cmd === 'persist') {
      await save(true)
      return
    }
    if (msg.cmd === 'query') {
      const dates = await query(msg.terms ?? [])
      ;(self as unknown as Worker).postMessage({ seq: msg.seq, result: { dates } })
      return
    }
  } catch (e) {
    if (msg.seq !== undefined) {
      ;(self as unknown as Worker).postMessage({ seq: msg.seq, result: { dates: [] } })
    } else {
      // Ready anyway: metadata search still works, full-text is degraded.
      ;(self as unknown as Worker).postMessage({ ready: false, error: String(e) })
    }
  }
}
