# Memento Mori

A calm, private **life-in-weeks** visualizer. Enter your date of birth and see your life as a grid of weeks — filled for weeks lived, outlined for the road ahead, with a gentle pulse on the current week. Keep a short note for any week that matters.

> *"It is not that we have a short time to live, but that we waste much of it."* — Seneca

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
- **Live stats** — days, weeks, months, and years lived; weeks left; percent of life lived; next-birthday countdown.
- **Weekly notes** — click any cell to write a reflection (past) or an intention (future). Autosaves, no save button.
- **Mood + tags** — rate a week 1–5 and tag it (e.g. `health, work, family`). Cells with notes are marked on the grid.
- **Daily Stoic quote** — drawn from an offline library, stable for the whole day.
- **Gentle mode** — hides the "weeks left" figures for a softer experience.
- **Themes** — light, dark, or follow the system, with no flash of the wrong theme on load.
- **Bonus time** — past your expected lifespan, extra accent-coloured weeks are added instead of stopping.
- **Backup & restore** — export/import a JSON file; your data never leaves the device otherwise.
- **PWA** — installable and works offline via a service worker.
- **Accessible & calm** — keyboard shortcuts, `prefers-reduced-motion` support, and a manual reduce-motion toggle.

**Keyboard:** `N` opens the current week's note · `Esc` closes any overlay.

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
    grid/        MiniGrid preview
    notes/       WeekDrawer — the note editor
    settings/    profile, appearance, import/export, reset
  domain/      Pure logic: dates.ts, lifeMath.ts, quotes.ts
  data/        Types + storage model (Profile, Note, Settings)
  state/       Zustand store (persisted)
  shared/      Reusable hooks
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
Profile  { id, name, dob: 'YYYY-MM-DD', lifeYears, leapRule, createdAt }
Note     { id, profileId, weekIndex, text, mood?, tags[], pinned, createdAt, updatedAt }
Settings { theme, gentleMode, reduceMotion }
```

Notes store a `weekIndex` (an integer), never a date — the calendar range is derived from the DOB, so changing your birth date re-maps cleanly.

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
