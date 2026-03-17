# FrySmart BDM App

Internal tool for Cookers BDMs to manage fryer oil trials — tracking TPM readings, oil usage, and post-trial assessments.

Built with React + Vite, Supabase (Postgres + Auth), deployed on Netlify.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Deployment | Netlify (auto-deploy on push to `main`) |
| Styling | Inline styles, Lucide icons |

---

## Project structure

```
src/
  screens/
    BDMTrialsView.jsx     — main BDM app (trials, readings, assessment, summary)
    FrysmartAdminPanel.jsx — admin panel
    VenueStaffView.jsx     — venue staff TPM entry
    GroupManagerView.jsx   — group/chain manager view
  lib/
    supabase.js            — Supabase client
    mappers.js             — snake_case ↔ camelCase field mappers for every table
    badgeConfig.js         — oil/competitor badge config
scripts/
  seed-*.mjs              — seed scripts for test data
supabase-schema.sql       — full schema (run once in Supabase SQL Editor to create from scratch)
schema-migration.sql      — incremental SQL to run against an existing database
```

---

## Database tables

### `trials`
One row per trial. Linked to a venue.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `venue_id` | uuid | FK → venues |
| `status` | text | `pipeline` → `active` → `pending` → `accepted` \| `successful` \| `unsuccessful` |
| `start_date` | date | |
| `end_date` | date | Set when BDM clicks End Trial |
| `trial_oil_id` | uuid | FK → oil_types |
| `notes` | text | Free-text + structured metadata lines (see below) |
| `current_weekly_avg` | numeric | Pre-trial weekly oil usage (litres) |
| `current_price_per_litre` | numeric | Competitor's current price |
| `offered_price_per_litre` | numeric | Cookers' offered price |
| `outcome_date` | date | When accepted/rejected decision was made |
| `trial_reason` | text | FK → trial_reasons.key |
| `sold_price_per_litre` | numeric | Final negotiated price (if won) |

#### `trials.notes` metadata format
The notes field stores free-text BDM notes plus structured bracket lines:
```
TRL-0001
[Goals: save-money, extend-life]
[GoalsAchieved: save-money, extend-life]
[TrialFindings: Oil performed well. Chef was positive.]
[FryerChanges: 3]
Free-text pre-trial notes from the BDM go here.
```

### `venues`
One row per customer venue. Assessment data is attached here (not to the trial) so it persists across the trial lifecycle.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Venue name |
| `status` | text | `active` \| `inactive` \| `trial-only` |
| `customer_code` | text | Used as venue staff login prefix |
| `state` | text | |
| `fryer_count` | int | |
| `fryer_volumes` | jsonb | `{ "1": 20, "2": 15, ... }` litres per fryer |
| `volume_bracket` | text | FK → volume_brackets.key |
| `default_oil` | uuid | FK → oil_types |
| `group_id` | uuid | FK → groups |
| `bdm_id` | uuid | FK → profiles |
| `insight_tpm_performance` | text | Section 1 — Oil Longevity (JSON) |
| `insight_temp_observations` | text | Section 2 — Temperature Control (JSON) |
| `insight_food_quality` | text | Section 3 — Food Quality (JSON) |
| `insight_training` | text | Section 4 — Training & Education (JSON) |
| `insight_engagement` | text | Section 5 — Feedback & Engagement (JSON) |
| `insight_recommendations` | text | Sections 6+7 — Value + Next Steps (JSON) |

#### Assessment JSON shapes
```js
insight_tpm_performance:   { tpmPerformance, lifespanVsCompetitor, topUpFreqVsCompetitor }
insight_temp_observations: { setVsActual, calibrationNeeded }
insight_food_quality:      { tasteAndTexture, colourAndAppearance }
insight_training:          { trainingProvided, topicsCovered: string[] }
insight_engagement:        { chefFeedback, staffEngagement }
insight_recommendations:   { costSavings, qualityGains, operationalEfficiency,
                             interestedInTesto, interestedInFrySmart, bdmNotes }
```

### `tpm_readings`
One row per TPM reading entry.

| Column | Type | Notes |
|---|---|---|
| `venue_id` | uuid | FK → venues |
| `trial_id` | uuid | FK → trials (nullable) |
| `fryer_number` | int | 1-based |
| `reading_date` | date | |
| `oil_age` | int | Days since last fresh fill |
| `litres_filled` | numeric | 0 = no top-up; >0 = fresh fill (oil_age=1) or top-up |
| `tpm_value` | numeric | TPM reading |
| `set_temperature` | numeric | |
| `actual_temperature` | numeric | |
| `filtered` | bool | |
| `not_in_use` | bool | Fryer out of service that day |

### Other tables
- `profiles` — BDMs, admins, managers. Role: `admin` \| `mgt` \| `state_manager` \| `nam` \| `bdm`
- `groups` — chain/group accounts
- `competitors` — competitor oil brands
- `oil_types` — Cookers and competitor oil products
- `trial_reasons` — config: reasons for successful/unsuccessful outcomes
- `volume_brackets` — config: volume tier labels
- `system_settings` — single-row global config (TPM thresholds, trial duration, etc.)

---

## JS field name mapping (snake_case → camelCase)

All DB ↔ frontend mapping is in `src/lib/mappers.js`. Key mappings:

| DB column | JS field |
|---|---|
| `trials.status` | `trialStatus` |
| `trials.start_date` | `trialStartDate` |
| `trials.notes` | `trialNotes` |
| `trials.current_price_per_litre` | `currentPricePerLitre` |
| `trials.offered_price_per_litre` | `offeredPricePerLitre` |
| `venues.fryer_count` | `fryerCount` |
| `venues.fryer_volumes` | `fryerVolumes` |
| `venues.customer_code` | `customerCode` |
| `venues.insight_training` | `insightTraining` |
| `venues.insight_engagement` | `insightEngagement` |
| `tpm_readings.tpm_value` | `tpmValue` |
| `tpm_readings.oil_age` | `oilAge` |
| `tpm_readings.litres_filled` | `litresFilled` |

> Trial data is **merged into venue objects** in the BDM view for convenience (`mergeTrialIntoVenue` in mappers.js). Fields like `venue.trialStatus`, `venue.trialNotes` etc. come from the `trials` table, not venues.

---

## Setup

1. Create a Supabase project
2. Run `supabase-schema.sql` in Supabase SQL Editor (creates all tables, indexes, RLS)
3. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. `npm install && npm run dev`

### Applying schema changes to an existing database
Run `schema-migration.sql` in Supabase SQL Editor. It is safe to re-run (uses `IF NOT EXISTS` / `IF EXISTS` guards).

---

## Deployment

Netlify auto-deploys on every push to `main`. Each deploy consumes build credits — **batch commits and push once per session**.
