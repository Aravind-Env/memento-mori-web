# Memento Mori

A calm, private **life-in-weeks** visualizer. Enter your date of birth and see your life as a grid of weeks — filled for weeks lived, outlined for the road ahead, with a gentle pulse on the current week. Keep a short note for any week that matters.

> *"It is not that we have a short time to live, but that we waste much of it."* — Seneca

## 🌐 Try it

**Live demo:** https://aravind-env.github.io/memento-mori-web/

Deployed automatically on every push to `main` via GitHub Pages. It runs entirely in your browser — nothing is sent to a server.

---

## Why

We all know time is limited, but it stays abstract. Turning it into a grid of ~4,000 dots makes it something you can actually see. This app pairs that honesty with reflection: a place to write this week's intention and look back at past ones.

**Principles**

- **Honest, not morbid** — reflective and motivating, never scary.
- **Zero friction** — one input (date of birth) gives a full app.
- **Private by default** — everything stays on your device. No account, no tracking.
- **Always correct** — numbers come from the live system date, never hardcoded.

---

## Features

- **Life grid** — 52 columns (weeks) × rows (years of age), rendered on a canvas so 4,000+ dots stay fast.
- **Zoom views** — see the whole life, one decade of ages, or a single year (13 weeks per column) via the Life/Decade/Year switch or the `Z` key. Zoomed views land on the current week and can be stepped through with `‹ ›`.
- **Life chapters** — name and colour week ranges (school, career, family…); painted as bands on the grid with a legend. Overlapping ranges are rejected, and deletions can be undone.
- **Goals & milestones** — pin a goal to any future week (it shows a soft ring on the grid), tick it off (a quiet diamond), and see the count ahead in the stats.
- **Live stats** — days, weeks, months, and years lived; weeks left; percent of life lived; next-birthday countdown.
- **Weekly notes** — click any cell to write a reflection (past) or an intention (future). Autosaves, no save button.
- **Mood + tags** — rate a week 1–5 and tag it (e.g. `health, work, family`). Cells with notes are marked on the grid.
- **Insights** — a calm read-only panel over your notes: mood-by-year heatmap, most-used tags, busiest years, and coverage of weeks lived. Nothing is shown until notes exist.
- **Weekly review** — pick a day of the week; on that day a ready chip appears with last week's note beside a fresh intention. Skipped weeks carry no penalty, and an optional local reminder needs your explicit permission first.
- **Search & command palette** — `Ctrl/Cmd+K`: full-text note search with `#tag` and `mood:1-5` filters, jump straight to any week/age (or "now"), and matching weeks get soft rings on the grid. Everything stays on the device.
- **Daily Stoic quote** — drawn from an offline library, stable for the whole day.
- **Gentle mode** — hides the "weeks left" figures and the shared-time counts for a softer experience.
- **Themes** — light, dark, or follow the system, with no flash of the wrong theme on load.
- **Cosmic dawn backdrop** — a fixed full-page photo ("Cosmic Dawn Over the Misty Mountains") painted behind the app, with a theme-aware scrim so text stays readable in both themes.
- **Bonus time** — past your expected lifespan, extra accent-coloured weeks are added instead of stopping.
- **Backup & restore** — export/import a JSON file; encrypted backups add an AES-GCM layer (PBKDF2 from your passphrase, 250k iterations) — wrong passphrases fail cleanly, plain backups still import, and no passphrase or key is ever stored.
- **App lock** — optional passphrase gate on open; the lock stores only an encrypted constant for verification, so forgetting the passphrase means the data waits (any unencrypted backup restores you).
- **People & shared time** — list the people you see regularly with a visits-per-year number; the panel computes *about N visits left* from the shorter of your two remaining estimates (add their birth date to sharpen it). Without a birth date the count stays honest and unknown. Hidden entirely in gentle mode.
- **PWA** — installable and works offline via a service worker.
- **Accessible & calm** — keyboard shortcuts, `prefers-reduced-motion` support, and a manual reduce-motion toggle.

**Keyboard:** `Ctrl/Cmd+K` searches notes and jumps · `N` opens the current week's note · `Z` cycles the zoom level · `Esc` closes any overlay.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | React 19 + TypeScript | Typed, fast, familiar |
| Build | Vite 6 | Instant dev server, small bundles |
| State | Zustand (with `persist`) | Tiny, simple, saved to `localStorage` |
| Grid | HTML5 Canvas | Smooth at thousands of cells |
| Styling | Plain CSS + CSS variables | Themeable design tokens |
| Testing | Vitest | Fast unit tests for the date math |
| Hosting | GitHub Pages | Deployed automatically on push to `main` |

---

## Architecture

The code is split by responsibility so the tricky part (date math) is isolated and easy to test.

```
src/
  app/         App shell — wires state, theme, routing between screens
  features/    UI by area
    onboarding/  first-run profile setup
    dashboard/   the hero card: grid, stats, quote (Dashboard, WeekCanvas, LandscapeScene)
    chapters/    life-chapter manager (ChaptersPanel)
    goals/       goals & milestones (GoalsPanel)
    grid/        MiniGrid preview
    notes/       WeekDrawer — the note editor
    settings/    profile, appearance, import/export, reset
    review/      weekly review ritual (ReviewPanel)
    insights/    mood heatmaps and tag stats (InsightsPanel)
    search/      command palette (CommandPalette)
    people/      people & shared time (PeoplePanel)
  domain/      Pure logic: lifeMath, dates, chapters, goals, insights, review, search, sharedTime, zoom, crypto, quotes — all unit-tested
  data/        Types + storage model (Profile, Note, Chapter, Goal, Relationship, Settings)  state/       Zustand store (persisted)
  shared/      Reusable hooks
  assets/      Static art (cosmic-dawn.jpg backdrop)
```

**Data flow (simplified):**

```
system date ─┐
date of birth ─┤─▶ domain/lifeMath ─▶ LifeStats ─▶ Dashboard → WeekCanvas
life expectancy ┘                                   └▶ Stats panel

user input ─▶ WeekDrawer ─▶ state/store ─▶ localStorage (auto-saved)
```

### The life math

All the numbers come from two inputs — `dateOfBirth` and `lifeExpectancy` — plus `today` read from the clock.

| Metric | Formula |
| --- | --- |
| Days lived | `floor((today − dob) / 86,400,000)` |
| Weeks lived | `floor(daysLived / 7)` |
| Total weeks | `lifeExpectancy × 52` |
| Weeks left | `totalWeeks − weeksLived` |
| Percent lived | `weeksLived / totalWeeks × 100` |
| Current age | calendar comparison, not `days / 365` |

Every function in `src/domain/lifeMath.ts` and `src/domain/dates.ts` is **pure** and takes `today` as a parameter, so it can be unit-tested and "time-travelled" to any date.

**Engineering rules that prevent bugs:**

1. **UTC-normalise dates to midnight** before subtracting, so daylight-saving days (23 or 25 hours) can't corrupt the count.
2. **Weeks are birthday-based** (week 1 starts on your birth date), row = one year of age.
3. **Feb 29 birthdays** are mapped to Mar 1 (default) or Feb 28 in non-leap years.
4. **Auto-refresh** on load, on tab focus, and at the next local midnight, so a tab left open stays correct.
5. **Validation** — DOB can't be in the future; lifespan is 1–120 years.

### Data model

```ts
Profile    { id, name, dob: 'YYYY-MM-DD', lifeYears, leapRule, createdAt }
Note       { id, profileId, weekIndex, text, mood?, tags[], pinned, createdAt, updatedAt }
Chapter    { id, profileId, name, startWeek, endWeek, color }
Goal       { id, profileId, weekIndex, text, done }
Relationship { id, profileId, name, kind, visitsPerYear, dob? }
Settings   { theme, gentleMode, reduceMotion, zoom: 'life' | 'decade' | 'year' }
```

Notes, chapters, goals and people store week indexes / plain data (integers, never derived dates) — the calendar ranges are derived from the DOB, so changing your birth date re-maps everything cleanly. Chapters never overlap; goals only use future weeks at creation. The persisted schema is versioned (`SCHEMA_VERSION = 7`) and old saves migrate automatically. The app-lock verification record never contains the passphrase or a usable key.

---

## Getting started

Requires **Node.js 20+**.

```bash
npm install       # install dependencies
npm run dev       # start the dev server (http://localhost:5173)
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc`) and build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Run tests in watch mode |

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which:

1. installs dependencies and runs the tests,
2. builds the app (setting `BASE_URL` to `/<repo>/` for a project site),
3. publishes `dist/` to GitHub Pages.

The live site is hosted at **https://aravind-env.github.io/memento-mori-web/**.

To enable it, set **Settings → Pages → Source** to **GitHub Actions** in the repository.

---

## Privacy & wellbeing

- **Nothing leaves your device.** There is no backend, no account, and no analytics.
- Life expectancy is a **statistical estimate, not a prediction** — change it any time in Settings.
- **Gentle mode** hides "weeks left" if the numbers feel heavy.
- If thinking about mortality is weighing on you, please reach out to someone you trust or a local support line.

---

## Documentation

The full product and technical spec lives in [`Memento Mori Web App Product & Technical Documentation.md`](./Memento%20Mori%20Web%20App%20Product%20%26%20Technical%20Documentation.md), covering the roadmap, UX design, UI tokens, edge cases, and testing strategy.

---

## License

No license file is included yet. All rights reserved by the author unless a license is added.
