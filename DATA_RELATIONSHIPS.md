# Frysmart — Data Relationships

Entity relationship map for the entire database, including foreign keys, join patterns, and data flow by role.

---

## Entity Relationship Diagram (Text)

```
auth.users
  │
  └──< profiles (id → auth.users.id)
         │   │   │
         │   │   └──> venues (venue_id)        — staff assigned to venue
         │   │   └──> groups (group_id)         — staff assigned to group
         │   │
         │   ├──< groups (nam_id)              — NAM manages groups
         │   ├──< venues (bdm_id)              — BDM manages venues
         │   └──< tpm_readings (taken_by)      — staff who took reading
         │
         └──> user_roles (id, synced via trigger)

groups
  │
  ├──< venues (group_id)                       — group has many venues
  └──< profiles (group_id)                     — group staff

venues
  │
  ├──< trials (venue_id)                       — venue has trials
  ├──< tpm_readings (venue_id)                 — venue has readings
  ├──> groups (group_id)                       — belongs to group
  ├──> profiles (bdm_id)                       — assigned BDM
  ├──> oil_types (default_oil)                 — current oil product
  └──> volume_brackets (volume_bracket)        — size category

trials
  │
  ├──< tpm_readings (trial_id)                 — trial has readings
  ├──> venues (venue_id)                       — belongs to venue
  ├──> oil_types (trial_oil_id)                — oil being tested
  └──> trial_reasons (trial_reason)            — outcome reason

oil_types
  │
  └──> competitors (competitor_id)             — competitor's oil (NULL for Cookers)

competitors
  │
  └──< oil_types (competitor_id)               — competitor has many oils

system_settings                                — single-row config (id always 1)
trial_reasons                                  — config lookup (key → label)
volume_brackets                                — config lookup (key → label + colour)
user_roles                                     — shadow table (synced from profiles via trigger)
```

---

## Relationships Detail

### One-to-Many

| Parent | Child | FK Column | Notes |
|--------|-------|-----------|-------|
| auth.users | profiles | profiles.id | 1:1 (cascade delete) |
| competitors | oil_types | oil_types.competitor_id | NULL for Cookers oils |
| groups | venues | venues.group_id | Group contains many venues |
| groups | profiles | profiles.group_id | Group staff members |
| profiles (NAM) | groups | groups.nam_id | NAM manages many groups |
| profiles (BDM) | venues | venues.bdm_id | BDM manages many venues |
| venues | trials | trials.venue_id | Venue can have multiple trials (one active at a time) |
| venues | tpm_readings | tpm_readings.venue_id | Venue has many readings |
| venues | profiles | profiles.venue_id | Venue staff members |
| trials | tpm_readings | tpm_readings.trial_id | Trial has many readings (NULL if no active trial) |
| profiles | tpm_readings | tpm_readings.taken_by | Staff member took many readings |
| oil_types | venues | venues.default_oil | Many venues use same oil |
| oil_types | trials | trials.trial_oil_id | Many trials test same oil |
| trial_reasons | trials | trials.trial_reason | Many trials share same reason |
| volume_brackets | venues | venues.volume_bracket | Many venues in same bracket |

### Logical One-to-One

| Table A | Table B | Notes |
|---------|---------|-------|
| auth.users | profiles | Every auth user has exactly one profile |
| venues | trials (active) | Only one trial can be active per venue at a time (enforced by app logic, not DB constraint) |

---

## Join Patterns in Code

### BDM View — Venues + Trials Merge
```js
// File: BDMTrialsView.jsx
// Load separately, merge in memory:
const { data: venues } = await supabase.from('venues').select('*');
const { data: trials } = await supabase.from('trials').select('*');

const merged = mappedVenues.map(v => {
  const trial = mappedTrials.find(t => t.venueId === v.id);
  return mergeTrialIntoVenue(v, trial);
});
```
Result: flat object with both venue fields (name, state, customerCode...) and trial fields (trialStatus, startDate, offeredPrice...).

### BDM View — Venues + Readings (Batch)
```js
// File: BDMTrialsView.jsx
const venueIds = venues.map(v => v.id);
const { data: readings } = await supabase
  .from('tpm_readings').select('*').in('venue_id', venueIds);
```

### Group Manager — Group → Venues → Readings (Chain)
```js
// File: GroupManagerView.jsx
// Step 1: Get group
const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single();

// Step 2: Get venues for group
const { data: venues } = await supabase.from('venues').select('*').eq('group_id', groupId);

// Step 3: Get readings for those venues
const venueIds = venues.map(v => v.id);
const { data: readings } = await supabase
  .from('tpm_readings').select('*').in('venue_id', venueIds);
```

### Admin — All Data (Parallel)
```js
// File: FrysmartAdminPanel.jsx
// Loads all tables in parallel:
const [
  { data: profiles },
  { data: groups },
  { data: venues },
  { data: trials },
  { data: competitors },
  { data: oilTypes },
  { data: settings },
  { data: reasons },
  { data: brackets },
  { data: readings },
] = await Promise.all([
  supabase.from('profiles').select('*'),
  supabase.from('groups').select('*'),
  supabase.from('venues').select('*'),
  supabase.from('trials').select('*'),
  supabase.from('competitors').select('*'),
  supabase.from('oil_types').select('*'),
  supabase.from('system_settings').select('*').single(),
  supabase.from('trial_reasons').select('*'),
  supabase.from('volume_brackets').select('*'),
  supabase.from('tpm_readings').select('*'),
]);
```

### Venue Staff — Direct Venue + Readings
```js
// File: VenueStaffView.jsx
const { data: venue } = await supabase.from('venues').select('*').eq('id', venueId).single();
const { data: readings } = await supabase
  .from('tpm_readings').select('*').eq('venue_id', venueId);
```

---

## Data Flow by User Role

### Admin
```
Can read/write: ALL tables
Query pattern: Load everything in parallel, filter in memory
```

### BDM (Business Development Manager)
```
Reads: venues (filtered by bdm_id = self), trials, tpm_readings, oil_types, competitors, trial_reasons, system_settings
Writes: trials (create, update status), venues (create prospect), tpm_readings (log readings)
Query pattern: Load own venues + all trials, merge, batch load readings
```

### NAM / Group Manager
```
Reads: groups (filtered by nam_id = self OR group login), venues (by group_id), tpm_readings (by venue_ids)
Writes: None (read-only view)
Query pattern: Chain load group → venues → readings
```

### Venue Staff
```
Reads: venues (single, by customer_code), tpm_readings (by venue_id)
Writes: tpm_readings (upsert daily readings)
Query pattern: Direct venue lookup, then readings for that venue
```

---

## Authentication Flow

```
1. User enters username + password
2. App constructs email: {username}@frysmart.app
3. Supabase auth.signInWithPassword({ email, password })
4. On success → load profile by auth.users.id
5. Profile.role determines which view to show:
   - admin / mgt / state_manager → FrysmartAdminPanel
   - bdm → BDMTrialsView
   - nam (via group login) → GroupManagerView
   - venue staff (via customer_code) → VenueStaffView
```

### Venue/Group Login (Alternative)
```
1. User enters customer_code (venue) or group username
2. App matches against venues.customer_code or groups.username
3. Constructs email: {code}@frysmart.app
4. Signs in with matched credentials
5. Routes to VenueStaffView or GroupManagerView
```

---

## Data Mapper Layer

**File:** `src/lib/mappers.js`

All database rows pass through mappers that convert snake_case DB columns to camelCase JS properties:

| Mapper Function | Table | Key Mappings |
|----------------|-------|--------------|
| `mapProfile()` | profiles | rep_code → repCode, crm_code → crmCode, last_active → lastActive |
| `mapGroup()` | groups | group_code → groupCode, nam_id → namId, last_tpm_date → lastTpmDate |
| `mapVenue()` | venues | customer_code → customerCode, fryer_count → fryerCount, volume_bracket → volumeBracket, default_oil → defaultOil, group_id → groupId, bdm_id → bdmId |
| `mapTrial()` | trials | venue_id → venueId, start_date → startDate, end_date → endDate, trial_oil_id → trialOilId, current_weekly_avg → currentWeeklyAvg, offered_price_per_litre → offeredPricePerLitre, sold_price_per_litre → soldPricePerLitre, trial_reason → trialReason, outcome_date → outcomeDate |
| `mapReading()` | tpm_readings | venue_id → venueId, trial_id → trialId, fryer_number → fryerNumber, reading_date → readingDate, reading_number → readingNumber, taken_by → takenBy, oil_age → oilAge, litres_filled → litresFilled, tpm_value → tpmValue, set_temperature → setTemperature, actual_temperature → actualTemperature, not_in_use → notInUse, staff_name → staffName |
| `mapCompetitor()` | competitors | — (minimal mapping) |
| `mapOilType()` | oil_types | oil_type → oilType, pack_size → packSize, competitor_id → competitorId |
| `mapSettings()` | system_settings | warning_threshold → warningThreshold, critical_threshold → criticalThreshold, default_fryer_count → defaultFryerCount, trial_duration → trialDuration, etc. |

---

## Denormalization Patterns

The frontend merges data from multiple tables into flat objects for convenience:

### Venue + Trial Merge
```js
// mergeTrialIntoVenue() combines:
venue: { id, name, state, customerCode, fryerCount, volumeBracket, defaultOil, groupId, bdmId }
trial: { trialStatus, startDate, endDate, trialOilId, offeredPrice, soldPrice, trialReason, outcomeDate, notes }
// → single flat object used throughout BDM view
```

### Venue + Oil Name Resolution
```js
// Oil names resolved from oil_types lookup:
venue.currentOilName = oilTypes.find(o => o.id === venue.defaultOil)?.name
venue.trialOilName = oilTypes.find(o => o.id === venue.trialOilId)?.name
venue.competitorName = competitors.find(c => c.id === oilType.competitorId)?.name
```

### Venue + BDM Name Resolution
```js
venue.bdmName = profiles.find(p => p.id === venue.bdmId)?.name
```
