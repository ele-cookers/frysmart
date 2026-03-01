# Frysmart — Database Schema

Complete Supabase/PostgreSQL schema. Source: `supabase-schema.sql`

---

## Tables Overview

| # | Table | Purpose | RLS | Rows (typical) |
|---|-------|---------|-----|-----------------|
| 1 | system_settings | Global config (single row) | Yes | 1 |
| 2 | trial_reasons | Outcome reason codes | Yes | ~25 |
| 3 | volume_brackets | Volume size categories | Yes | 4 |
| 4 | competitors | Competitor companies | Yes | ~20 |
| 5 | oil_types | Oil products (Cookers + competitor) | Yes | ~30 |
| 6 | profiles | User accounts | Yes | ~50 |
| 7 | groups | Restaurant groups/chains | Yes | ~20 |
| 8 | venues | Individual restaurant locations | Yes | ~200 |
| 9 | trials | Oil trials at venues | Yes | ~200 |
| 10 | tpm_readings | TPM oil quality readings | Yes | ~5000+ |
| 11 | user_roles | RLS helper (shadow table) | No | ~50 |

---

## 1. system_settings

Single-row global configuration. Enforced by `CHECK (id = 1)`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | INT | 1 | PK, CHECK id = 1 |
| `warning_threshold` | INT | 18 | TPM warning level |
| `critical_threshold` | INT | 24 | TPM critical level |
| `default_fryer_count` | INT | 4 | Default fryers for new venues |
| `trial_duration` | INT | 7 | Default trial length (days) |
| `report_frequency` | TEXT | 'weekly' | Report cadence |
| `reminder_days` | INT | 7 | Reminder interval |
| `oil_type_options` | TEXT[] | ['canola','palm','sunflower','soybean','cottonseed','tallow','blend','unknown'] | Available oil types |
| `permissions_config` | JSONB | '{}' | Role permission overrides |
| `target_win_rate` | NUMERIC | 75 | KPI target (%) |
| `target_avg_time_to_decision` | INT | 14 | KPI target (days) |
| `target_sold_price_per_litre` | NUMERIC | 2.50 | KPI target ($) |
| `target_trials_per_month` | INT | 12 | KPI target (count) |

**Trigger:** `update_updated_at()` on UPDATE

---

## 2. trial_reasons

Lookup table for trial outcome reasons.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `key` | TEXT | — | PK |
| `label` | TEXT | — | NOT NULL, display name |
| `type` | TEXT | — | NOT NULL, CHECK ('successful', 'unsuccessful') |

**Seed data (25 rows):**

Successful (13): oil-lasted-longer, better-food-quality, cost-savings, cleaner-frying, bdm-relationship, healthier-oil, easier-to-manage, consistent-results, better-value, recommended, trial-results, reduced-oil-smell, other-successful

Unsuccessful (12): no-savings, price-too-high, preferred-current, quality-concern, staff-resistance, contract-locked, ownership-change, venue-closed, chose-competitor, owner-not-interested, no-response, other-unsuccessful

---

## 3. volume_brackets

Lookup table for venue volume categories.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `key` | TEXT | — | PK |
| `label` | TEXT | — | NOT NULL |
| `color` | TEXT | — | NOT NULL, hex colour |

**Seed data (4 rows):**

| Key | Label | Colour |
|-----|-------|--------|
| under-60 | UNDER 60L | #10b981 |
| 60-100 | 60 - 100L | #eab308 |
| 100-150 | 100 - 150L | #f97316 |
| 150-plus | 150L+ | #ef4444 |

---

## 4. competitors

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `name` | TEXT | — | NOT NULL |
| `code` | TEXT | — | NOT NULL |
| `status` | TEXT | 'active' | CHECK ('active', 'inactive') |
| `type` | TEXT | 'direct' | CHECK ('direct', 'indirect') |
| `states` | TEXT[] | '{}' | States where active |
| `color` | TEXT | '#e53e3e' | Hex colour for UI |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |
| `updated_at` | TIMESTAMPTZ | now() | NOT NULL |

**Trigger:** `competitors_updated_at` → `update_updated_at()`

---

## 5. oil_types

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `name` | TEXT | — | NOT NULL |
| `code` | TEXT | — | NOT NULL |
| `category` | TEXT | — | NOT NULL, CHECK ('cookers', 'competitor') |
| `tier` | TEXT | 'standard' | CHECK ('standard', 'premium', 'elite') |
| `oil_type` | TEXT | 'canola' | CHECK ('canola','palm','sunflower','soybean','cottonseed','tallow','blend','unknown') |
| `pack_size` | TEXT | 'bulk' | CHECK ('bulk','20l','15l','10l','4l') |
| `status` | TEXT | 'active' | CHECK ('active', 'inactive') |
| `competitor_id` | UUID | NULL | FK → competitors(id) ON DELETE SET NULL |

**Index:** `idx_oil_types_competitor_id`

**Notes:** Cookers oils have `category = 'cookers'` and `competitor_id = NULL`. Competitor oils have `category = 'competitor'` and reference their competitor.

---

## 6. profiles

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | — | PK, FK → auth.users(id) ON DELETE CASCADE |
| `name` | TEXT | — | NOT NULL |
| `email` | TEXT | NULL | |
| `role` | TEXT | — | NOT NULL, CHECK ('admin','mgt','state_manager','nam','bdm') |
| `region` | TEXT | NULL | State/region assignment |
| `status` | TEXT | 'active' | CHECK ('active', 'inactive') |
| `username` | TEXT | NULL | Login username |
| `rep_code` | TEXT | NULL | Sales rep code |
| `crm_code` | TEXT | NULL | CRM identifier |
| `password` | TEXT | NULL | Backup password field |
| `venue_id` | UUID | NULL | FK → venues(id) ON DELETE SET NULL |
| `group_id` | UUID | NULL | FK → groups(id) ON DELETE SET NULL |
| `last_active` | DATE | NULL | Last login/activity |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |
| `updated_at` | TIMESTAMPTZ | now() | NOT NULL |

**Index:** `idx_profiles_role`
**Triggers:**
- `profiles_updated_at` → `update_updated_at()`
- `trg_sync_user_roles` → `sync_user_roles()` (syncs to user_roles on insert/update/delete)

---

## 7. groups

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `name` | TEXT | — | NOT NULL |
| `group_code` | TEXT | — | NOT NULL |
| `username` | TEXT | NULL | Login username for group manager |
| `nam_id` | UUID | NULL | FK → profiles(id) ON DELETE SET NULL |
| `password` | TEXT | NULL | Login password |
| `status` | TEXT | 'active' | CHECK ('active', 'inactive') |
| `last_tpm_date` | DATE | NULL | Most recent TPM reading |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |
| `updated_at` | TIMESTAMPTZ | now() | NOT NULL |

**Indexes:** `idx_groups_username_lower`, `idx_groups_nam_id`
**Trigger:** `groups_updated_at` → `update_updated_at()`

---

## 8. venues

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `name` | TEXT | — | NOT NULL |
| `status` | TEXT | 'active' | CHECK ('active', 'inactive', 'trial-only') |
| `customer_code` | TEXT | NULL | Venue login identifier |
| `state` | TEXT | — | NOT NULL, Australian state |
| `fryer_count` | INT | 4 | NOT NULL |
| `volume_bracket` | TEXT | NULL | FK → volume_brackets(key) |
| `default_oil` | UUID | NULL | FK → oil_types(id) ON DELETE SET NULL |
| `group_id` | UUID | NULL | FK → groups(id) ON DELETE SET NULL |
| `bdm_id` | UUID | NULL | FK → profiles(id) ON DELETE SET NULL |
| `last_tpm_date` | DATE | NULL | Most recent TPM reading |
| `password` | TEXT | NULL | Venue staff login password |
| `customer_code_saved_at` | TIMESTAMPTZ | NULL | When code was assigned |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |
| `updated_at` | TIMESTAMPTZ | now() | NOT NULL |

**Indexes:** `idx_venues_group_id`, `idx_venues_bdm_id`, `idx_venues_status`, `idx_venues_customer_code`, `idx_venues_state`
**Trigger:** `venues_updated_at` → `update_updated_at()`

**Status values:**
- `active` — Operating venue, potential trial candidate
- `inactive` — Deactivated venue
- `trial-only` — Prospect venue created by BDM for trial purposes

---

## 9. trials

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `venue_id` | UUID | — | NOT NULL, FK → venues(id) ON DELETE CASCADE |
| `status` | TEXT | 'pending' | CHECK ('pending','in-progress','completed','accepted','won','lost') |
| `start_date` | DATE | NULL | Trial start |
| `end_date` | DATE | NULL | Trial end |
| `trial_oil_id` | UUID | NULL | FK → oil_types(id) ON DELETE SET NULL |
| `notes` | TEXT | NULL | BDM notes |
| `current_weekly_avg` | NUMERIC | NULL | Pre-trial litres/week baseline |
| `current_price_per_litre` | NUMERIC | NULL | Competitor price $/L |
| `offered_price_per_litre` | NUMERIC | NULL | Cookers offered price $/L |
| `outcome_date` | DATE | NULL | Date trial was decided |
| `trial_reason` | TEXT | NULL | FK → trial_reasons(key) |
| `sold_price_per_litre` | NUMERIC | NULL | Final negotiated price $/L |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |
| `updated_at` | TIMESTAMPTZ | now() | NOT NULL |

**Indexes:** `idx_trials_venue_id`, `idx_trials_status`, `idx_trials_outcome_date`
**Trigger:** `trials_updated_at` → `update_updated_at()`

**Status lifecycle:**
```
pending → in-progress → completed → accepted → won
                                  └→ lost
```

---

## 10. tpm_readings

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | uuid_generate_v4() | PK |
| `venue_id` | UUID | — | NOT NULL, FK → venues(id) ON DELETE CASCADE |
| `trial_id` | UUID | NULL | FK → trials(id) ON DELETE SET NULL |
| `fryer_number` | INT | — | NOT NULL, 1-based |
| `reading_date` | DATE | — | NOT NULL |
| `reading_number` | INT | 1 | NOT NULL, for multiple readings/day |
| `taken_by` | UUID | NULL | FK → profiles(id) ON DELETE SET NULL |
| `oil_age` | INT | NULL | Days since oil change (1 = fresh) |
| `litres_filled` | NUMERIC | NULL | Volume filled |
| `tpm_value` | NUMERIC | NULL | TPM percentage |
| `set_temperature` | NUMERIC | NULL | Fryer set temp (°C) |
| `actual_temperature` | NUMERIC | NULL | Measured temp (°C) |
| `filtered` | BOOLEAN | NULL | Was oil filtered? |
| `food_type` | TEXT | NULL | Food being fried |
| `notes` | TEXT | NULL | |
| `not_in_use` | BOOLEAN | false | NOT NULL, fryer inactive flag |
| `staff_name` | TEXT | NULL | Name of person recording |
| `created_at` | TIMESTAMPTZ | now() | NOT NULL |

**Unique constraint:** `(venue_id, fryer_number, reading_date, reading_number)`
**Indexes:** `idx_tpm_readings_venue_id`, `idx_tpm_readings_trial_id`, `idx_tpm_readings_reading_date`
**Upsert key:** `venue_id, fryer_number, reading_date, reading_number`

**food_type values:** Chips/Fries, Crumbed Items, Battered Items, Chicken, Seafood, Spring Rolls, Donuts/Pastry, Mixed, Other

---

## 11. user_roles (Helper — No RLS)

Shadow table kept in sync with profiles via trigger. Used by RLS helper functions to avoid circular dependencies.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | UUID | — | PK, FK → auth.users(id) ON DELETE CASCADE |
| `role` | TEXT | — | NOT NULL |
| `region` | TEXT | NULL | |

**RLS:** DISABLED (intentional — authenticated read only)
**Sync trigger:** `trg_sync_user_roles` on profiles table

---

## RLS Helper Functions

All defined as `SECURITY DEFINER` (run with table owner privileges):

| Function | Returns | Purpose |
|----------|---------|---------|
| `auth_email_prefix()` | TEXT | Extracts username from JWT email |
| `get_my_role()` | TEXT | Returns caller's role from user_roles |
| `get_my_region()` | TEXT | Returns caller's region from user_roles |
| `get_my_profile_id()` | UUID | Returns profile ID matching auth email |
| `get_my_venue_id()` | UUID | Returns venue ID matching customer_code |
| `get_my_group_id()` | UUID | Returns group ID matching username |
| `is_admin_or_mgt()` | BOOLEAN | Checks for admin or mgt role |
| `is_admin()` | BOOLEAN | Checks for admin role |

---

## RLS Policies

All user-facing tables have RLS enabled with a simple permissive policy:

```sql
CREATE POLICY "allow_all" ON {table}
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

**Additional security layers:**
1. Supabase Auth — no unauthenticated access
2. Admin verification — critical writes gated by Netlify function (`admin-user.mjs`)
3. Role-based UI — frontend restricts actions per role

---

## Triggers

| Table | Trigger Name | Function | Event |
|-------|-------------|----------|-------|
| competitors | competitors_updated_at | update_updated_at() | BEFORE UPDATE |
| venues | venues_updated_at | update_updated_at() | BEFORE UPDATE |
| trials | trials_updated_at | update_updated_at() | BEFORE UPDATE |
| profiles | profiles_updated_at | update_updated_at() | BEFORE UPDATE |
| groups | groups_updated_at | update_updated_at() | BEFORE UPDATE |
| profiles | trg_sync_user_roles | sync_user_roles() | AFTER INSERT / UPDATE (role, region) / DELETE |

---

## Indexes

| Table | Index Name | Column(s) |
|-------|-----------|-----------|
| oil_types | idx_oil_types_competitor_id | competitor_id |
| profiles | idx_profiles_role | role |
| groups | idx_groups_username_lower | LOWER(username) |
| groups | idx_groups_nam_id | nam_id |
| venues | idx_venues_group_id | group_id |
| venues | idx_venues_bdm_id | bdm_id |
| venues | idx_venues_status | status |
| venues | idx_venues_customer_code | customer_code |
| venues | idx_venues_state | state |
| trials | idx_trials_venue_id | venue_id |
| trials | idx_trials_status | status |
| trials | idx_trials_outcome_date | outcome_date |
| tpm_readings | idx_tpm_readings_venue_id | venue_id |
| tpm_readings | idx_tpm_readings_trial_id | trial_id |
| tpm_readings | idx_tpm_readings_reading_date | reading_date |

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Enum Values Summary

| Table.Column | Allowed Values |
|-------------|----------------|
| competitors.status | active, inactive |
| competitors.type | direct, indirect |
| oil_types.category | cookers, competitor |
| oil_types.tier | standard, premium, elite |
| oil_types.oil_type | canola, palm, sunflower, soybean, cottonseed, tallow, blend, unknown |
| oil_types.pack_size | bulk, 20l, 15l, 10l, 4l |
| profiles.role | admin, mgt, state_manager, nam, bdm |
| profiles.status | active, inactive |
| groups.status | active, inactive |
| venues.status | active, inactive, trial-only |
| trials.status | pending, in-progress, completed, accepted, won, lost |
| trial_reasons.type | successful, unsuccessful |
