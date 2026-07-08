# Project Kaizen (改)

A single-page, fully offline Progressive Web App for students preparing for
long-term competitive exams. No backend, no frameworks, no libraries —
plain HTML5, CSS3, and vanilla ES6.

## Running it

- **Quickest**: open `index.html` directly in Chrome. Everything works
  except the service worker (offline caching) and push-style notifications,
  which require `http(s)://`.
- **Full PWA experience**: serve the folder over HTTP, e.g.
  ```
  npx serve .
  # or
  python3 -m http.server 8080
  ```
  then open it in Chrome on Android and use "Add to Home Screen" to install it.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup for all 11 pages (10 nav pages + Weekly Planner) and the bottom navigation bar. |
| `style.css` | Dark-mode, purple-accent, Material-inspired design system. Theme/accent are CSS custom properties toggled via `data-theme` / `data-accent` attributes on `<html>`. |
| `app.js` | All logic, in a single `App` object (the only global). No inline JS/CSS anywhere in the markup. |
| `manifest.json` | PWA manifest (installable, standalone display, purple theme color). |
| `service-worker.js` | Cache-first offline strategy for the app shell. |

## Data model

Everything lives in **one** `localStorage` key: `kaizenDB`.

```js
kaizenDB = {
  sessions:  [ { id, timestamp, date, week, month, year, subject, minutes, focus, energy, notes } ],
  habits:    { logs: { "YYYY-MM-DD": { wake: true, exercise: false, ... } } },
  reviews:   { daily: [...], weekly: [...] },
  planner:   {},   // reserved for future planner-only state
  goals:     { daily, weekly, monthly, yearly, subjects: { Maths: 5, ... } },
  settings:  { theme, accent, reminderTime, jlptDate, jlptLevel },
  sleep:     { logs: { "YYYY-MM-DD": hours } },
  immersion: { logs: [ { id, date, minutes, type } ] }
}
```

`App.loadDB()` merges whatever is in storage with a `defaultDB()` template on
every load, so a missing or partially-corrupt key never crashes the app —
it just falls back to a sane default.

## Kaizen Score formula (documented, rule-based, out of 100)

| Factor | Weight | How it's measured |
|---|---|---|
| Consistency | 25 | `min(25, currentStreak / 14 * 25)` — a 14-day streak maxes this out. |
| Study hours | 20 | Today's logged minutes vs. the daily goal. |
| Habit completion | 15 | Fraction of today's 8 habits checked off. |
| Sleep | 10 | Last logged sleep vs. a 7-hour target. |
| Focus | 10 | Today's average focus slider (1–5) vs. 5. |
| Energy | 10 | Today's average energy slider (1–5) vs. 5. |
| Goal completion | 10 | This week's studied minutes vs. the weekly goal. |

The seven weighted components are summed and clamped to `[0, 100]`. See
`App.computeKaizenScore()` in `app.js`.

**Streak rule**: a calendar day "counts" toward the streak once at least
30 minutes are logged on it. Missing that threshold on a day breaks the
streak; the longest streak ever achieved is tracked separately.

## Smart insights (rule-based, no AI APIs)

`App.generateInsights()` looks at the last 7–10 sessions and the current
week/last week to produce short, rule-based messages, e.g. "You study Maths
consistently," "Your focus is dropping," "Japanese immersion increased,"
or "You're behind your weekly goal." Rules are plain comparisons and
thresholds — fully deterministic and inspectable in the source.

## Performance notes

- Aggregate stats (today/week/month/year/lifetime totals, streaks, subject
  minutes, per-day minutes) are computed once per data change in
  `App.getStats()` and memoized in `App.cache` until the next `persist()`
  call, so switching pages doesn't re-scan the whole session list.
- The History page caps rendering to the 200 most relevant sessions at a
  time and tells the user how many more matched, keeping the DOM light
  even with 10,000+ sessions.
- Charts are drawn with the Canvas 2D API only — no charting library.

## Error handling

Every DOM lookup goes through `App.$(id)` plus `setText` / `setHTML` /
`setWidth` helpers that check the element exists before touching it, so a
missing element never throws.

## Backup & restore

Settings → Backup lets you export the entire `kaizenDB` object as a JSON
file, and re-import it later (with structural validation) — useful before
clearing browser data or moving to a new device.

## Browser support

Built and tested against latest Chrome (Android + desktop), Firefox, and
Edge. Notifications and full offline caching depend on browser support for
the Notification API and Service Workers respectively; the app degrades
gracefully where either is unavailable.
