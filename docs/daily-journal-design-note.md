# Daily Journal — Design Note

## What changes
The unit of writing becomes the **day** (`YYYY-MM-DD`). The week grid remains the
big-picture view; every week dot becomes a roll-up of its 7 days. The existing
weekly `Note` records are migrated once, safely, and the original record is kept
for rollback.

## Data model

### IndexedDB (`memento-mori-journal` db, version 3 schema dailies)
| Store | Key | Shape |
|---|---|---|
| `entries_meta` | `date` | `{date, weekIndex, title?, mood?, energy?, tags[], words, excerpt(≤120), goodThing?, draft?, updatedAt, migrated?, deletedAt?}` |
| `entries_body` | `date` | `{date, body, comp: 0\|1, enc: 0\|1, iv?, updatedAt}` |
| `weeks_meta` | `weekIndex` | derived cache `{weekIndex, daysWritten, avgMood, words, lastDate, updatedAt}` |
| `trash` | `date` | full `{meta, body}` rows deleted in the last 30 days |
| `fts` | term bucket | delta-encoded postings, capped at 8 MB, rebuilt lazily |
| `reviews` | `weekIndex` | `{weekIndex, reflection, updatedAt}` |

Indexes: `entries_meta` on `weekIndex`, `updatedAt`, `mood`, `deletedAt`;
multiEntry on `tags`. Bodies ≥1 KB are gzipped via `CompressionStream` when
available, then AES-GCM encrypted if the privacy lock is on (compress first).

### Memory budget (steady state, 10 years ≈ 3,650 entries)
| Citation | Resident | Size |
|---|---|---|
| Meta index | Map date → meta record (no bodies) | ~400 B × 3,650 ≈ 1.5 MB |
| Decoded bodies | LRU cache, hard cap 20 | ≤ 20 × ~1.5 KB ≈ 30 KB |
| Editor state | current draft text | 1 note |
| Weeks cache | 566 week roll-ups | ~230 KB |
| FTS | lives in the Worker only | main thread 0 |

Lists never load bodies. The archive renders a fixed-height windowed list
(5-row buffer, 50-row pages). Search runs either against metadata on the main
thread (<10 ms for 3,650 rows) or routes full-text term hits through the Worker.

### What stays where
- `localStorage` (zustand **v2 schema, untouched**): profile, settings, chapters,
  goals, people, vault, and the original weekly `Note[]`. This untouched copy is
  the **rollback record**.
- `IndexedDB`: every daily entry (meta + body), week cache, trash, FTS, reviews.

## Migration plan (v2 → v3)
1. On boot, after hydration, if the journal db has no `migration_done` flag:
   a. Offer/download an automatic JSON backup of `notes` + profile (dialog with
      a "Download backup & continue" button; the run can proceed without it).
   b. For each weekly `Note`: `date = toISODate(createdAt base date || weekStart
      (dob, weekIndex))`, write `entries_body` (text) + `entries_meta`
      (`migrated: true`, mood, tags carried over, words + excerpt derived).
   c. Write derived `weeks_meta` for affected weeks only (incremental math).
   d. Stamp `migration_done` (`{v: 3, at, count}` in a tiny `journal_meta`
      store). Idempotent: re-running is a no-op; already-existing dates lose
      nothing (the local weekly note is left in place either way).
2. Rollback path: the weekly `Note[]` in localStorage is never mutated, plus a
   timestamped JSON backup file. A "Restore weekly notes" action can wipe the
   daily store and re-run.
3. Week id stays derivable: `weekIndex = floor(daysSinceBirth / 7)` — no stored
   week ids anywhere; `entries_meta.weekIndex` is a denormalized cache.

## Budgets
- Drawer open < 150 ms; keystroke-to-paint < 16 ms (typing never touches IDB);
  autosave ≤ 50 ms write (single atomic txn: body+meta+week cache).
- Main-thread tasks during search/import/migration chunked below 50 ms.
- Idle heap target 40 MB with a 3,650-entry history.

## Implementation status (2026-10-23) — done, verified
- `src/core/journal.ts` — repository as specced. Encryption added: random 16-byte
  salt stored in `journal_meta` (`enc_salt`); PBKDF2-SHA256 600k iterations →
  AES-GCM-256; `enableEncryption` probe-encrypts before committing the flag.
  Backup export, trash (meta+body snapshots), streak calc, sync `onThisDay`.
- `src/core/migrate.ts` — idempotent one-shot; `date` = weekly note's `createdAt`
  day when it falls inside the note's week, else next free day in that week;
  `migrated: true`; originals untouched; flag in `journal_meta` (key/value rows).
- `src/core/fts.worker.ts` — delta postings, 8 MB cap with rarest-terms prune.
- UI: `DailyDrawer` (Day/Week tabs, 7-day strip + native date picker, autosave
  800 ms + flush on blur/visibilitychange/pagehide, markdown-lite preview, trash
  + undo), `MigrationGate` (backup → migrate → result), `JournalPanel`
  (virtualized day-entry archive + `#tag/mood:` search + trash restore),
  `InsightsPanel` (metadata only), `WeekCanvas` year mode = 7×52 day heat-map
  (rows = weekdays Mon-top, mood colors, today ring), Streak stat cell.
- ReviewPanel keeps editing the weekly store for now (defunct after migration);
  see simplification list below.

### Measured (QA scripts in `qa\`: `daily.mjs`, `bench.mjs`, `verify.mjs`, `finale.mjs`)
- 161/161 unit tests, `tsc --noEmit` clean, `vite build` green (worker chunked).
- 3,650-entry benchmark: day-drawer open 5–12 ms (budget 150), archive open
  62–75 ms rendering 9 rows (4,264 ms pre-virtualization), metadata search
  roundtrip ~165 ms net of a scripted 150 ms sleep, scroll FPS 53–61, heap
  14→18 MB, zero console errors.
- Walkthrough (`daily.mjs`) all green: gate → 8 migrated → autosave → week tab →
  reload persistence → heat-map click → silent empty-profile migration →
  virtualized archive → tag search.

## Simplification list (follow-ups)
1. `ReviewPanel` still writes the legacy weekly store — repoint it at day
   entries (or retire the tab) so `notesByWeek` disappears from the store.
2. Deferred extras: daily reminder time picker, privacy-lock UI in Settings
   (engine exists behind `enableEncryption/passphrase`), trash auto-purge job.
3. `JournalPanel` trash row carries a meaningless `deletedAt` field; drop it.
4. FTS 8 MB cap prune is best-effort; switch to size-priority compaction if a
   power user overshoots.
5. The year heat-map editor strip renders 2.4 px-pitch dots with a cropped
   bottom row (bonus days first) — a switch to canvas would avoid DOM churn
   if it ever feels janky.
