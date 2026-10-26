/**
 * Daily search grammar over entry metadata only (title / excerpt / tags /
 * good-thing / mood / date). Never touches bodies — the full-text index in the
 * Worker covers body words separately. Pure functions, one linear pass.
 *
 * Grammar: words (AND), #tag, mood:N, date:YYYY(-MM|-DD), before:X, after:X,
 * has:good-thing. Date bounds compare as prefixes (before:2026-10 = dates in
 * October 2026 or earlier are NOT strictly before; strictly less than the 1st).
 */

export interface DailyQuery {
  terms: string[]
  tags: string[]
  mood?: number
  /** Exact pinch `YYYY` / `YYYY-MM` / full date; full matches only one day. */
  date?: { y: number; m?: number; d?: number }
  /** Strictly earlier than this key. */
  before?: string
  /** Strictly later than this key. */
  after?: string
  hasGoodThing: boolean
}

export interface DailyMetaLike {
  date: string
  title?: string
  mood?: number
  tags: string[]
  excerpt: string
  goodThing?: string
}

const MOOD_TOKEN = /^mood:(\d)$/i
const GOOD_TOKEN = /^has:good-thing$/i

/** Expand an incomplete date bound to a comparable full key. */
function boundKey(kind: 'min' | 'max', v: string): string | null {
  const parts = v.split('-').filter(Boolean)
  if (parts.length === 0 || parts.length > 3) return null
  const [ys, ms, ds] = parts
  if (!/^\d{4}$/.test(ys)) return null
  const y = Number(ys)
  const m = ms ? Number(ms) : 0
  const d = ds ? Number(ds) : 0
  if (m && (m < 1 || m > 12)) return null
  if (m === 0 && ds) return null
  if (parts.length === 1) return kind === 'min' ? `${y}-01-01` : `${y}-12-31`
  if (parts.length === 2) return kind === 'min' ? `${y}-${String(m).padStart(2, '0')}-01` : `${y}-${String(m).padStart(2, '0')}-31` // 31 handles all: any month day ≥ 28 min … lex compare safe
  const dd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return dd
}

export function parseDailySearch(raw: string): DailyQuery {
  const q: DailyQuery = { terms: [], tags: [], hasGoodThing: false }
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('#')) {
      const tag = token.slice(1).replace(/^#+/, '').trim().toLowerCase()
      if (tag && !q.tags.includes(tag)) q.tags.push(tag)
      continue
    }
    const mood = MOOD_TOKEN.exec(token)
    if (mood) {
      q.mood = Number(mood[1])
      continue
    }
    if (GOOD_TOKEN.test(token)) {
      q.hasGoodThing = true
      continue
    }
    const [head, ...rest] = token.split(':')
    const value = rest.join(':')
    if (head === 'date' || head === 'before' || head === 'after') {
      if (value && head === 'date') {
        const parts = value.split('-').filter(Boolean)
        if (parts.length >= 1 && parts.length <= 3) {
          const y = Number(parts[0])
          if (/^\d{4}$/.test(parts[0])) {
            const m = parts[1] ? Number(parts[1]) : undefined
            const d = parts[2] ? Number(parts[2]) : undefined
            if (!m || (m >= 1 && m <= 12 && (!d || (d >= 1 && d <= 31)))) {
              q.date = { y, m, d }
              continue
            }
          }
        }
        continue // malformed date: token ignored
      }
      const bound = value ? boundKey(head === 'before' ? 'max' : 'min', value) : null
      if (bound) {
        if (head === 'before') q.before = bound
        else q.after = bound
        continue
      }
    }
    q.terms.push(token.toLowerCase())
  }
  return q
}

/** True when the metadata row satisfies every parsed filter. */
export function matchesDaily(row: DailyMetaLike, q: DailyQuery): boolean {
  if (q.mood !== undefined && row.mood !== q.mood) return false
  if (q.hasGoodThing && !row.goodThing?.trim()) return false
  if (q.tags.length > 0) {
    const lowered = row.tags.map((t) => t.toLowerCase())
    for (const tag of q.tags) if (!lowered.includes(tag)) return false
  }
  if (q.date) {
    const y = Number(row.date.slice(0, 4))
    if (y !== q.date.y) return false
    if (q.date.m && Number(row.date.slice(5, 7)) !== q.date.m) return false
    if (q.date.d && Number(row.date.slice(8, 10)) !== q.date.d) return false
  }
  if (q.before && !(row.date < q.before)) return false
  if (q.after && !(row.date > q.after)) return false
  if (q.terms.length > 0) {
    const hay = `${row.title ?? ''} ${row.excerpt} ${row.tags.join(' ')} ${row.goodThing ?? ''}`.toLowerCase()
    for (const t of q.terms) if (!hay.includes(t)) return false
  }
  return true
}

/**
 * Filter + sort (newest first) a meta page. Pure, O(rows); single pass over
 * tags per row keeps it comfortably inside the 100ms budget.
 */
export function searchDailyMetas(rows: DailyMetaLike[], raw: string): DailyMetaLike[] {
  const q = parseDailySearch(raw)
  const scored: { row: DailyMetaLike; score: number }[] = []
  for (const row of rows) {
    if (!matchesDaily(row, q)) continue
    let score = 0
    const hay = `${row.title ?? ''} ${row.excerpt} ${row.tags.join(' ')} ${row.goodThing ?? ''}`.toLowerCase()
    for (const t of q.terms) {
      const at = hay.indexOf(t)
      score += at < 0 ? 0 : 1 + Math.max(0, 3 - Math.round(at / 40))
    }
    if (q.tags.length > 0) score += 2
    if (q.hasGoodThing) score += 1
    scored.push({ row, score })
  }
  scored.sort((a, b) => b.score - a.score || (a.row.date < b.row.date ? 1 : -1))
  return scored.map((s) => s.row)
}

/**
 * Case-insensitive first-hit highlight split: [before, hit, after], null when
 * the term is absent. Match is the exact source text slice.
 */
export function splitOnTerm(text: string, term: string): [string, string, string] | null {
  if (!term) return null
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return null
  return [text.slice(0, at), text.slice(at, at + term.length), text.slice(at + term.length)]
}
