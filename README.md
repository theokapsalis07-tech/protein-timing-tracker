# Protein Timing Tracker

Corrects the "anabolic window" myth: most trackers only check your daily
protein total. This checks total **and** spacing, based on Areta et al.
2013 (J Physiol) — 20g protein every ~3h outperformed both more-frequent
and less-frequent dosing at stimulating muscle protein synthesis, at an
identical daily total.

## What's built (v1)

- Simple account system (signup/login)
- Onboarding: weight + activity level → personalised daily protein target
- Quick-log protein doses (presets + custom amount)
- "Today" screen: total vs. target, plain-language status, colour-coded
  timeline of today's doses (good spacing / too close / small dose / gap)
- "Why" tab: the science, in plain language, with citations
- "Trends" tab: basic 7-day view

The core science logic lives in one file: `backend/logic.js` — read this
first, it's the actual model (dose thresholds, spacing windows, status
messages). Everything else is plumbing around it.

## Running it locally

```bash
cd backend
npm install
npm start
```

Then open `http://localhost:3001` — the backend serves the frontend too,
so there's nothing else to run.

Data is stored in `backend/data.json` (a simple file-based store — good
enough for v1, swap for SQLite/Postgres later without touching the API
routes much, since `db.js` is the only file that would need to change).

## Suggested next steps 
1. **Real password hashing** — currently SHA-256, swap for bcrypt.
2. **Swap `data.json` for SQLite** — `db.js` is the only file to touch.
3. **Deploy it** — Render/Railway/Fly.io all have free tiers that suit
   this stack well (single Node process, tiny footprint).
4. **Trends chart** — currently a plain list; a simple bar/line chart
   (grams per day, spacing quality per day) would look much better.
5. **Workout-day protein bump** — v1 target is flat; a v2 could raise
   the target slightly on logged training days.
6. **Notifications** — a gentle nudge after ~4-5h with no logged protein.
7. **Edit/delete log entries** — currently log-only, no correction UI.

## this project supports

- Translating a body of primary research (Areta 2013, Mamerow 2014,
  Trommelen 2023) into a working product decision, including being
  transparent about where the science is still unsettled.
- Deliberate UX simplification: the model has real nuance, but the UI
  surfaces one plain-language status line first, with detail available
  on demand — a genuine design tradeoff, not just "less features."
- Full-stack basics: auth, a data model, an API, and a frontend that
  consumes it.
