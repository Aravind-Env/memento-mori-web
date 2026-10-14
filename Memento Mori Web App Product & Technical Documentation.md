# Memento Mori Web App: Product & Technical Documentation

*Version 1.0 · Design and engineering spec*

## 1. Overview

**Purpose.** A calm, private web app that visualizes a human life as a grid of weeks ("Life in Weeks"), calculated automatically from the system date and the user's date of birth. It turns the abstract idea of limited time into something you can see, and pairs it with notes so each week can hold intention and reflection.

**Principles**

- **Honest, not morbid.** The tone is reflective and motivating, never scary.
- **Zero friction.** One input (date of birth) gives a full, working app.
- **Private by default.** All data stays on the device unless the user opts in to sync.
- **Always correct.** Everything is derived from the live system date; nothing is hardcoded or stale.

**Target users:** people practising Stoic reflection, productivity and journaling enthusiasts, and anyone doing life planning.

## 2. Core Calculation Logic (Auto, System-Date Based)

All numbers come from two inputs: `dateOfBirth` and `lifeExpectancy` (default 80 years, editable), plus `today` read from the system clock.

| Metric | Formula |
| --- | --- |
| Days lived | `floor((todayUTC - dobUTC) / 86,400,000)` |
| Weeks lived | `floor(daysLived / 7)` |
| Total weeks | `lifeExpectancy × 52` (display grid uses 52 columns) |
| Weeks remaining | `totalWeeks - weeksLived` |
| Percent of life lived | `weeksLived / totalWeeks × 100` |
| Current age | years since last birthday, using calendar comparison (not days / 365) |
| Next birthday | next occurrence of month/day, with Feb 29 handled |
| Current week index | `weeksLived` (0-based; this cell is highlighted "This week") |

**Engineering rules**

1. **Normalize to UTC midnight** before subtracting dates. This avoids daylight-saving bugs where a day is 23 or 25 hours.
2. **Week numbering is birthday-based** (week 1 starts on the birth date), not ISO weeks. Each row is one year of age. This keeps the grid meaningful.
3. **Leap-day birthdays:** treat Feb 29 as Mar 1 (or Feb 28, user setting) in non-leap years.
4. **Auto refresh:** recompute on page load, on tab focus (`visibilitychange`), and with a timer scheduled for the next local midnight, so a tab left open overnight stays correct.
5. **Pure functions:** all date math lives in one dependency-free module (`lifeMath.ts`) that takes `today` as a parameter. This makes it fully unit-testable.
6. **Validation:** DOB cannot be in the future; life expectancy range 1 to 120; if weeks lived exceeds total weeks, show the "bonus time" state (see Edge Cases).

```ts
export function getLifeStats(dob: Date, lifeYears: number, today = new Date()) {
  const d0 = Date.UTC(dob.getFullYear(), dob.getMonth(), dob.getDate());
  const d1 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLived = Math.floor((d1 - d0) / 86400000);
  const weeksLived = Math.floor(daysLived / 7);
  const totalWeeks = lifeYears * 52;
  return {
    daysLived, weeksLived, totalWeeks,
    weeksLeft: Math.max(totalWeeks - weeksLived, 0),
    percent: Math.min((weeksLived / totalWeeks) * 100, 100),
  };
}
```

## 3. Feature Set

### 3.1 MVP (Release 1)

- Onboarding: date of birth and expected lifespan.
- **Life grid:** 52 columns × N rows. Lived weeks are filled, the current week pulses, future weeks are outlined.
- **Stats panel:** days, weeks, months, years lived; weeks left; percent; next birthday countdown.
- **Weekly notes:** click any cell to add a note (past, present or future).
- Light and dark themes (follows system, user override).
- Local storage persistence.
- Fully responsive and keyboard accessible.

### 3.2 Version 1.x (Better features)

- **Life chapters:** colour-coded ranges (School, College, Career, Relationship, custom) painted on the grid with a legend.
- **Milestones and events:** birthdays, graduation, marriage, move; shown as markers on specific weeks.
- **Goals and countdowns:** target date with weeks remaining (retirement, a book, a fitness goal).
- **Weekly intention and review:** prompted each Monday ("What matters this week?") and Sunday ("What did I learn?").
- **Mood and rating dot** per week (1 to 5) with a heatmap view.
- **Tags and search** across all notes; filters by tag, chapter, or date range.
- **Daily quote** (Stoic and memento mori quotes, offline library).
- **Export and import:** JSON backup, Markdown journal, PDF poster of the grid, PNG share image.
- **Alternative views:** weeks, months, years; "Time left" view (e.g., remaining summers, weekends, books you can still read at your pace).

### 3.3 Advanced (Release 2+)

- **PWA and offline support** with installable app and weekly local notification reminder.
- **Optional end-to-end encrypted sync** across devices (key derived from a passphrase; server never sees plaintext).
- **Rich notes:** Markdown, checklists, image attachments (stored in IndexedDB).
- **Reflection insights:** word cloud, streaks, "weeks with notes" ratio, mood trends.
- **Compare and what-if:** change life expectancy to see how the grid changes; scenario for retiring at 60 vs 67.
- **Time-budget calculator:** hours of life left by activity (sleep, work, screens) from user-entered averages.
- **Widgets and embeds:** shareable read-only grid image, wallpaper generator for phone lock screens.
- **Multiple profiles** (parent, partner, child) for family planning.
- **Internationalization** (i18n), RTL support, and localized date formats.

### 3.4 Things easy to miss (added by design review)

| Gap | Resolution |
| --- | --- |
| Timezone and DST drift | UTC-normalized math; midnight auto-refresh |
| Data loss risk | Auto-backup prompts; one-click export; versioned schema |
| Privacy anxiety | No account required, no analytics by default, clear "data stays here" message |
| Emotional safety | Gentle copy, optional "hide remaining weeks" mode, support link in settings |
| Accessibility | Grid is navigable by arrow keys, ARIA labels, reduced-motion support, colour-blind-safe palette |
| Performance | 4,000+ cells rendered efficiently (canvas or CSS grid with memoization) |
| Onboarding drop-off | Single-screen onboarding with live preview |
| Life expectancy realism | Optional lookup by country and sex (static dataset) to suggest a default |
| Lock and privacy | Optional PIN or biometric lock; blur notes in app switcher |

## 4. UX Design

### 4.1 Core user flow

1. **Landing and onboarding:** pick birth date and lifespan; live preview of the grid updates as inputs change.
2. **Dashboard:** the grid is the hero; stats sit beside it (below on mobile).
3. **Interact:** hover or tap a cell to see its date range, age, chapter and note preview; click to open the note drawer.
4. **Reflect:** weekly prompt nudges a short note.
5. **Review and export:** year summaries, search, export.

### 4.2 UX principles

- **One primary action per screen.** The dashboard's primary action is "Write this week's note."
- **Progressive disclosure.** Basic users see grid and stats; chapters, goals and insights live behind tabs.
- **Immediate feedback.** Autosave notes with a subtle "Saved" indicator; no save button.
- **Undo over confirm.** Deleting a note shows an undo toast instead of a modal.
- **Calm motion.** Only the current week pulses; everything else is static. Respect `prefers-reduced-motion`.
- **Plain language.** Labels like "Weeks left" rather than jargon.

### 4.3 Key screens

| Screen | Contents |
| --- | --- |
| Onboarding | DOB picker, lifespan slider, live mini-grid, privacy note |
| Dashboard | Life grid, stats cards, quote, weekly prompt |
| Week drawer | Date range, age, note editor, mood, tags, milestone toggle |
| Chapters | Create and colour ranges, legend, timeline list |
| Notes | Searchable list and calendar view of all notes |
| Insights | Heatmap, streaks, time-budget calculator |
| Settings | Profile, theme, lifespan, notifications, export, lock, danger zone |

## 5. UI Design

**Layout (desktop):** left 70% life grid, right 30% sticky stats and today's quote. **Mobile:** stats collapse into a top summary strip; grid scrolls with pinch-zoom; note editor opens as a bottom sheet.

**Grid anatomy**

- Rows = years of age (labelled every 5 years), columns = week of year (labelled every 13 weeks / quarter).
- Cell states: *lived* (filled), *current* (accent colour with pulse), *future* (outline), *has note* (small dot), *milestone* (star or ring), *chapter* (tinted fill).
- Cell size: 10 to 14px with 2 to 3px gap, scaling by container width.

**Design tokens**

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | #FAF9F6 | #121214 |
| `--surface` | #FFFFFF | #1C1C20 |
| `--text` | #1B1B1F | #ECECF1 |
| `--lived` | #2B2B33 | #D6D6E0 |
| `--future` | #D9D9E0 | #3A3A44 |
| `--accent` | #E5533D | #FF7A63 |

**Typography:** serif display (e.g., Fraunces or Playfair) for headings to evoke gravity; clean sans (Inter) for UI and numbers; tabular numerals for stats.

**Accessibility:** contrast ratio of at least 4.5:1 for text; every cell reachable by keyboard (arrow keys move, Enter opens, Esc closes); `aria-label` such as "Week 1,203, Mar 4 to Mar 10, 2019, has note"; chapters use pattern plus colour, not colour alone.

## 6. Architecture

### 6.1 Recommended stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Framework | React + TypeScript (Vite) | Fast, typed, huge ecosystem |
| State | Zustand (or Redux Toolkit) | Small, simple, persisted slices |
| Styling | Tailwind CSS + CSS variables | Fast iteration, themeable tokens |
| Grid rendering | CSS Grid (default), Canvas fallback for very large grids | Accessible by default; Canvas if performance demands |
| Storage | IndexedDB via Dexie (notes), localStorage (settings) | Reliable, handles attachments |
| PWA | Workbox service worker | Offline and installable |
| Testing | Vitest, React Testing Library, Playwright | Unit, component, end-to-end |
| Optional backend | Supabase or Cloudflare Workers + D1 | Only for encrypted sync |

### 6.2 High-level architecture

```
Browser (PWA)
├─ UI layer         Components, pages, themes
├─ State layer      Zustand stores (profile, notes, ui)
├─ Domain layer     lifeMath.ts, chapters.ts, insights.ts  (pure functions)
├─ Data layer       Repository interface -> Dexie (local) | SyncAdapter (optional)
└─ Platform layer   Service worker, notifications, clock scheduler
          │
          └── (optional) Encrypted Sync API
```

### 6.3 Folder structure

```
src/
  app/            routes, providers, layout
  features/
    grid/         LifeGrid, Cell, useGridNavigation
    stats/        StatsPanel, CountdownCard
    notes/        WeekDrawer, NoteEditor, SearchPanel
    chapters/     ChapterManager, legend
    insights/     Heatmap, TimeBudget
    settings/     Profile, Export, Lock
  domain/         lifeMath.ts, dates.ts, quotes.ts
  data/           db.ts (Dexie), repositories, migrations
  shared/         ui kit, hooks, utils
  tests/
```

### 6.4 Data model

```ts
Profile  { id, name, dob: 'YYYY-MM-DD', lifeYears, leapRule, theme, createdAt }
Note     { id, profileId, weekIndex, text, mood?, tags[], pinned, createdAt, updatedAt }
Chapter  { id, profileId, label, color, pattern, startWeek, endWeek }
Milestone{ id, profileId, weekIndex, title, icon, notes? }
Goal     { id, profileId, title, targetDate, createdAt, done }
Meta     { schemaVersion, lastBackupAt }
```

Store `weekIndex` (integer) rather than a date. The calendar range is derived from DOB, so changing DOB re-maps cleanly. Index on `[profileId+weekIndex]` and a full-text index (e.g., MiniSearch) for notes.

### 6.5 Key technical decisions

- **Local-first.** The app works fully offline; sync is an add-on, not a dependency.
- **Repository pattern** keeps storage swappable (IndexedDB now, server later).
- **Schema versioning and migrations** from day one.
- **Clock service** abstracts `Date.now()` so tests and a "time travel" debug mode can inject any date.
- **Security:** strict CSP, no third-party trackers, sanitize Markdown output, AES-GCM for sync encryption with a PBKDF2/Argon2-derived key.
- **Performance budget:** first paint under 1.5s on mid-range mobile; bundle under 200 KB gzipped; memoize cells so a single-note change re-renders one cell.

## 7. Notes System (Across the App)

- **Anywhere access:** global shortcut (`N`) opens a quick-note for the current week; works from any screen.
- **Autosave** with debounce (500 ms), plus offline queue.
- **Context:** each note shows week range, age, and the chapter it falls in.
- **Organisation:** tags (`#health`), pinned notes, mood, and links between notes (`[[week 1204]]`).
- **Search:** instant full-text with filters; results jump to the grid and highlight the cell.
- **Past and future:** past notes are reflections; future notes act as intentions and surface when that week arrives.
- **Safety net:** version history (last 10 edits per note) and soft-delete with 30-day trash.

## 8. Edge Cases

| Case | Behaviour |
| --- | --- |
| Born today | Week 1 is current; stats show 0 weeks lived |
| Past the expected lifespan | Show "Bonus time" with a new row of accent-coloured weeks; reframe copy positively |
| Feb 29 birthday | Rule configurable; default Mar 1 in common years |
| 53-week years | Grid uses 52-week rows; the leftover 1 to 2 days per year are folded into the next row's start, with the true date range shown in the tooltip |
| Device clock changed | Warn if date is earlier than last-seen date; allow "time travel" only in debug mode |
| Tab open past midnight | Midnight scheduler recalculates and animates the current-week marker if it moves |
| Clearing browser data | Backup reminder after first note and every 30 days; export is one click |
| Very small screens | Grid switches to year-by-year accordion with compact rows |

## 9. Testing Strategy

- **Unit:** lifeMath across leap years, DST transitions, month ends, birthdays today and tomorrow, and extreme ages.
- **Component:** cell states, keyboard navigation, drawer behaviour.
- **End-to-end (Playwright):** onboarding to first note to reload (persists) to export.
- **Accessibility:** axe-core in CI; manual screen-reader pass.
- **Visual regression** for light and dark themes.

## 10. Roadmap

| Phase | Scope | Outcome |
| --- | --- | --- |
| 1 (Weeks 1 to 2) | Math module, onboarding, grid, stats, local persistence | Working core |
| 2 (Weeks 3 to 4) | Notes drawer, search, themes, export | Usable journal |
| 3 (Weeks 5 to 6) | Chapters, milestones, goals, weekly prompts, PWA | Feature complete v1 |
| 4 (Weeks 7 to 9) | Insights, time-budget calculator, share images, i18n | Delight features |
| 5 (Later) | Encrypted sync, multi-profile, widgets | Platform growth |

## 11. Ethical and Wellbeing Considerations

- Use encouraging language: "Make this week count," not "You're running out of time."
- Offer a **gentle mode** that hides remaining weeks and shows only lived weeks and goals.
- Include a note in Settings pointing to mental-health resources.
- Never gamify guilt (no streak-shaming or loss-based notifications).
- Clearly state that life expectancy is a statistical estimate, not a prediction.

## 12. Definition of Done (v1)

- Stats match an independent date calculator for 20+ test dates.
- Works offline and installs as a PWA.
- Lighthouse scores of 90+ for performance, accessibility and best practices.
- No data leaves the device without explicit opt-in.
- Export and import round-trip produces identical data.
