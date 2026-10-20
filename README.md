# NutriTrack

Personal nutrition and protein tracker. Local-first PWA built with Next.js, TypeScript and Tailwind CSS.
All tracking data lives in your browser (IndexedDB). No account and no paid service is needed for core use.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit + persistence tests
npm run typecheck
npm run build && npm start   # production (enables the offline service worker)
```

Requires Node 20.19+ (developed on Node 24).

## What works with no credentials

Home dashboard, goals, manual foods, My Foods (create / edit / duplicate / archive / delete), quick-add with custom
portions, repeat last serving, combinations, daily log with edit/delete, history by date, week/month progress,
suggestions from your library (diet, exclusions, budget), JSON export/import, delete-my-data, offline use (production
build).

## What needs credentials

| Feature | Service | Variable | Cost |
|---|---|---|---|
| AI photo analysis | Google Gemini API (vision) | `GEMINI_API_KEY` | Free tier exists; usage beyond it is paid |

Copy `.env.example` to `.env.local`. The key is read only in the server route
`app/api/ai/analyze-food/route.ts` and never reaches the browser. Without a key the route returns HTTP 503 and the
photo dialog shows a clear message; everything else keeps working.

## How AI photo logging works

1. The photo and optional description go to `/api/ai/analyze-food`.
2. The model **only identifies foods and estimates portions** (with confidence and clarifying questions).
   It is not asked for nutrition values.
3. In the review screen you correct names, quantities and units, and choose which food in your library supplies the
   nutrition. Unmatched items are logged with **unknown** nutrition, never invented numbers.
4. Nothing is saved until you press Confirm. Entries are labelled "AI Estimated".

Only the image and your description are sent. Profile data is not. Photos are not stored by this app.

## Nutrition data

- Every nutrient is a number (known) or `null` (unknown). Unknown is never summed as 0 and is shown as "unknown".
- Each food records its reference (per 100 g / 100 ml / serving), source, and verification status.
- Unit conversions (ml↔g, piece/tbsp/cup→g) happen **only** if that food defines a conversion; otherwise an error asks
  you to pick a valid unit.
- Logging stores a frozen **snapshot**. Editing or deleting a food never changes past entries.

> **Starter data caveat:** `lib/nutrition/starter-db.ts` holds ~11 common foods with approximate values compiled for
> development. They are **not laboratory-verified** and not yet checked against IFCT or USDA. Compare with your
> package labels and edit as needed. The UI labels them "Starter data".

Not yet implemented: USDA FoodData Central search, barcode/label scanning, and a larger verified Indian food set
(Phase 2 of the PRD).

## Architecture

```
lib/nutrition/   types, calculator (scaling, units, snapshots, aggregation), combination, progress, recommender, starter data
lib/storage/     IndexedDB access, export/import validation, deletion helpers
app/             pages (Home, Food Log, My Foods, Discover, Progress, Profile) + AI route
components/      UI building blocks
supabase/migrations/0001_init.sql   optional cloud schema with row-level security
```

Calculations live in `lib/nutrition` and are covered by tests; UI components call them rather than re-implementing.

## Optional cloud sync (not wired up)

`supabase/migrations/0001_init.sql` defines the schema, RLS policies, and a private `food-photos` bucket. The app does
not use Supabase yet, so there is no authentication and **no server-side access control for logs or photos**
(they never leave your device). To add sync you would need a Supabase project, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus a sync layer.

## Deployment

Any Next.js host works (for example Vercel). Set `GEMINI_API_KEY` as a server environment variable there.
Use HTTPS so camera capture and the service worker work.

## Privacy and limits

- Data is stored per browser/device. Clearing site data deletes it, so export backups regularly (Profile → Export).
- Targets and suggestions are general estimates, not medical advice.
- Nothing here diagnoses deficiencies, and no food is claimed to guarantee hair growth or treat a condition.
- Allergy filtering is by keyword in food name/category. It is a convenience, not a safety guarantee. Always read labels.
