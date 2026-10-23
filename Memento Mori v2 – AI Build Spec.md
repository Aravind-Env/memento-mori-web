# Memento Mori v2 – AI Build Spec

Eight advanced features to add to the existing React + Zustand app, ordered by value and risk. Written for an AI coding assistant: extend the repo, never rewrite it.

## 1. Context (already built, do not rebuild)

- Stack: React 19, TypeScript, Vite 6, Zustand (persist, localStorage), Canvas grid, plain CSS variables, Vitest, GitHub Pages.
- Existing: life grid, live stats, weekly notes with mood and tags, daily quote, gentle mode, themes, bonus time, JSON backup, PWA, keyboard shortcuts (N, Esc).
- Folders: `app/`, `features/*`, `domain/` (pure logic), `data/` (types), `state/` (store), `shared/` (hooks).
- Model rule: notes store `weekIndex`, never dates. Keep this for every new record.

## 2. AI Rules

1. Read the repo first. Match naming, folder layout and CSS tokens.
2. Build one feature per session in the order in section 5, then stop.
3. New logic goes in `domain/` as pure functions that take `today` as a parameter, with Vitest tests.
4. Output only changed files or diffs.
5. No backend, no analytics, no network calls beyond loading the site. Everything stays on device.
6. Add no dependency unless essential; name it and say why.
7. Bump the persist `version` and write a `migrate` step for every data-model change. Old saves must still load.
8. Keep the tone calm: no streak guilt, no red warnings, respect gentle mode and reduce-motion.

## 3. Data Model Additions (`data/types.ts`)

```ts
Chapter      { id, profileId, name, startWeek, endWeek, color }
Goal         { id, profileId, weekIndex, text, done }
Relationship { id, profileId, name, kind, visitsPerYear, dob? }
Note         + { photoIds?: string[] }          // blobs live in IndexedDB
Settings     + { appLock?: boolean, reminderDay?: 0-6, zoom: 'life'|'decade'|'year' }
```

Chapters must not overlap. Goals only use future `weekIndex` values.

## 4. Features

| ID | Feature | Where | Done when |
| --- | --- | --- | --- |
| A1 | Life chapters: named, coloured week ranges drawn as bands on the grid, with a legend | `features/chapters`, `WeekCanvas` | Overlaps are rejected; colours persist; canvas still smooth at 4,000+ cells |
| A2 | Goals and milestones: future markers on the grid, tick off when done | `features/goals`, `WeekCanvas` | Goal shows a marker on its week; done goals change style; counts appear in stats |
| A3 | Insights: mood heatmap by year, top tags, busiest years, weeks with notes | `domain/insights.ts`, `features/insights` | Pure functions tested; panel works with zero notes; gentle mode hides remaining-time figures |
| A4 | Search and command palette (Ctrl/Cmd+K): full-text note search, filter by tag or mood, jump to any week; matching cells highlight on the canvas | `features/search` | Results in under 100 ms for 1,000 notes; keyboard-only flow works; Esc closes |
| A5 | Weekly review ritual: on a chosen weekday, show last week's intention beside a new one; optional local reminder via the Notification API | `features/review` | Works offline; no reminder without permission; skipping a week has no penalty |
| A6 | Zoom views: Life (52 columns by years), Decade, and Year (weeks with month labels) | `features/dashboard` | Switch by button or Z; selected week stays in view; labels readable on mobile |
| A7 | Private vault: AES-GCM encrypted backup (PBKDF2 key from passphrase) and optional app lock on open | `domain/crypto.ts`, `features/settings` | Wrong passphrase fails cleanly; unencrypted import still works; no key is ever stored |
| A8 | People and shared time: add parents, partner or friends with visits per year, then show remaining meetings from their age and yours | `features/people`, `domain/sharedTime.ts` | Formula tested; optional, hidden in gentle mode; no data leaves the device |

### Stretch (after A1 to A8)

- **Rich notes:** photos per week stored in IndexedDB (not localStorage), with markdown preview.
- **Poster export:** render the grid to PNG at phone-wallpaper and print sizes, excluding notes.
- **Year in review:** a local summary card per year built from moods, tags and goals, with no AI or network.
- **Life expectancy helper:** optional questionnaire that suggests a lifespan, labelled as an estimate.
- **File sync:** read and write the backup file through the File System Access API so users can sync with their own cloud folder.

## 5. Build Order

| Step | Feature | Why this position |
| --- | --- | --- |
| 1 | A1 Chapters | Biggest visual change; sets up the migration pattern |
| 2 | A2 Goals | Reuses the marker drawing from A1 |
| 3 | A6 Zoom | Needed before the grid gets busier |
| 4 | A4 Search | Makes existing notes useful |
| 5 | A3 Insights | Builds on the data from A1 to A4 |
| 6 | A7 Vault | Protects the data users now care about |
| 7 | A5 Review | Habit loop, best after the rest is stable |
| 8 | A8 People | Most personal and optional, so last |

## 6. Quality Checklist (every feature)

- [ ] `npm run build` and `npm test` pass
- [ ] Persist `version` bumped and `migrate` tested with an old save
- [ ] Works on a 360 px wide phone and with keyboard only
- [ ] Respects theme, gentle mode and reduce-motion
- [ ] Canvas redraw stays under 16 ms per frame
- [ ] No new network requests; offline still works
- [ ] Cells and controls have accessible labels (for example, "Week 1,234, mood 4")

## 7. Prompt Template

> Read the repo and the README. Implement **A1 Life chapters** from the spec: data types, migration, domain logic with tests, UI, and canvas drawing. Follow sections 2, 3 and 6. Return only changed files, then stop.
