/**
 * Seed realistic venue staff readings for COOKERS CAFE (Jan 1 – Mar 19 2026)
 *
 * Model:
 *  - 4 fryers, each with its own food type, set temp and oil-degradation rate
 *  - TPM climbs daily at a rate influenced by food type and service busyness
 *  - Fill decisions: no_fill | top_up | fresh_fill driven by current TPM
 *  - oil_age  = days since last fresh fill + 1  (1 = fresh fill day)
 *  - Fill type is DERIVED by the frontend from oilAge + litresFilled:
 *      fresh_fill → oilAge = 1,  litresFilled > 0
 *      top_up     → oilAge > 1, litresFilled > 0
 *      no_fill    → oilAge > 1, litresFilled = 0
 *  - reading_number = 1 (primary) or 2 (same-day second read after oil change)
 *  - Missed readings ~8% of open days; closed some Sundays + public holidays
 *  - Temperatures: set per fryer, actual varies ±0–5 °C
 *  - Filtering: true most days, not on fresh-fill days, ~20% skipped otherwise
 *  - Notes: contextual, ~30% coverage
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://mznlwouvgbnexmirwofd.supabase.co',
  'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL'
);

const { error: authErr } = await sb.auth.signInWithPassword({
  email: 'cookers@frysmart.app',
  password: 'frysmart!',
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log('✓ Authenticated as cookers');

// ─── Constants ───────────────────────────────────────────────────────────────
const VENUE_ID  = 'c4e88f55-3176-41cf-ab3a-b74137eb6f35';
const WARNING   = 18;
const CRITICAL  = 24;

const STAFF = ['Sarah Mitchell', 'Marcus Lee', 'Priya Sharma', 'Tom Walsh'];

// food_type must match system_settings.food_type_options
// Increments tuned for realistic ~5-6 day oil cycles (critical=24, fresh oil ~10 TPM → delta ~14)
// Chips/Fries degrade fastest, Plain Proteins slowest but still within 6-7 days
const FRYERS = [
  { num: 1, foodType: 'Chips/Fries',    incMin: 2.8, incMax: 4.0, setTemp: 175 },
  { num: 2, foodType: 'Battered Items', incMin: 2.2, incMax: 3.2, setTemp: 178 },
  { num: 3, foodType: 'Mixed Service',  incMin: 2.0, incMax: 3.0, setTemp: 176 },
  { num: 4, foodType: 'Plain Proteins', incMin: 1.6, incMax: 2.6, setTemp: 180 },
];

// All fryers start with fresh oil on Jan 1 (oil_age = 2 on that day, fresh fill Dec 31)
const state = {
  1: { tpm: 9.5,  lastFreshFillDate: '2025-12-31' },
  2: { tpm: 10.0, lastFreshFillDate: '2025-12-31' },
  3: { tpm: 9.0,  lastFreshFillDate: '2025-12-31' },
  4: { tpm: 10.5, lastFreshFillDate: '2025-12-31' },
};

// Australian public holidays in VIC within range
const PUBLIC_HOLIDAYS = new Set(['2026-01-01', '2026-01-26', '2026-03-09']);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const rand  = (min, max) => min + Math.random() * (max - min);
const rInt  = (min, max) => Math.floor(rand(min, max + 0.9999));
const r1    = (n) => Math.round(n * 10) / 10;
const ds    = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// Staff rotates by date + fryer so different fryers have different lead staff
const pickStaff = (date, fryerNum) =>
  STAFF[(date.getDate() + date.getMonth() * 3 + fryerNum) % STAFF.length];

// ─── Contextual notes ────────────────────────────────────────────────────────
const NOTE_POOLS = {
  freshFill: [
    'Fresh oil in — clean and clear',
    'New oil loaded, previous was very dark',
    'Changed oil — was getting thick and dark',
    'New batch Cookers oil in',
    'Fresh oil in, much better colour already',
    null,
  ],
  highTpm: [
    'Oil darkening significantly',
    'TPM creeping up — keeping an eye on it',
    'Oil quality declining, topped up',
    'Oil looking dark, may need a change soon',
    'Getting close to limit — topped up today',
    null,
  ],
  busy: [
    'Busy lunch service today',
    'Big lunch rush — high volume fry',
    'Catering event in — much heavier load than usual',
    'Packed Saturday service',
    'Busiest Friday in a while',
    null,
  ],
  quiet: [
    'Very quiet today',
    'Light service, not much through the fryers',
    'Public holiday — reduced volume',
    'Slow morning, picked up a little later',
    'Staff training this afternoon — shorter service',
    null,
  ],
  general: [
    'Filtered before open — oil colour improved',
    'Running slightly hotter than usual today',
    'Thermostat checked — all good',
    'Deep cleaned fry baskets before service',
    'Oil still looking good',
    null, null, null, null, null, // nulls increase no-note probability
  ],
};

const pickNote = (fillType, tpm, isBusy, isQuiet) => {
  if (Math.random() > 0.30) return null;
  if (fillType === 'fresh_fill') return NOTE_POOLS.freshFill[rInt(0, NOTE_POOLS.freshFill.length - 1)];
  if (tpm >= WARNING + 2)       return NOTE_POOLS.highTpm[rInt(0, NOTE_POOLS.highTpm.length - 1)];
  if (isBusy)                   return NOTE_POOLS.busy[rInt(0, NOTE_POOLS.busy.length - 1)];
  if (isQuiet)                  return NOTE_POOLS.quiet[rInt(0, NOTE_POOLS.quiet.length - 1)];
  return NOTE_POOLS.general[rInt(0, NOTE_POOLS.general.length - 1)];
};

// ─── Main generation loop ─────────────────────────────────────────────────────
const readings = [];

const startDate = new Date('2026-01-01');
const endDate   = new Date('2026-03-19');

for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const dateStr   = ds(d);
  const dow       = d.getDay(); // 0=Sun
  const isSunday  = dow === 0;
  const isMonday  = dow === 1;
  const isFriday  = dow === 5;
  const isSat     = dow === 6;
  const isHoliday = PUBLIC_HOLIDAYS.has(dateStr);

  // Service level: drives TPM increment multiplier + busyness notes
  const serviceMult = isHoliday ? 0.4 : isFriday || isSat ? 1.3 : isMonday ? 0.75 : isSunday ? 0.55 : 1.0;
  const isBusy  = serviceMult >= 1.3;
  const isQuiet = serviceMult <= 0.6;

  // Closed: all public holidays + ~35% of Sundays
  const isClosed = isHoliday || (isSunday && Math.random() < 0.35);

  for (const fryer of FRYERS) {
    const st = state[fryer.num];

    if (isClosed) {
      // Oil still oxidises slowly when venue closed
      st.tpm += rand(0.15, 0.5);
      continue;
    }

    // Daily TPM increment before staff take the reading
    const dailyInc = rand(fryer.incMin, fryer.incMax) * serviceMult;

    // Miss ~8% of open days
    if (Math.random() < 0.08) {
      st.tpm += dailyInc; // TPM keeps climbing even on missed days
      continue;
    }

    const tpmAfterClimb = r1(st.tpm + dailyInc);

    // ── Fill decision ────────────────────────────────────────────────────────
    // Good oil management = change oil at/near warning (18), not just at critical.
    // This produces realistic ~5-6 day cycles for high-volume frying.
    let fillType, litres, recordedTpm, nextTpm;

    if (tpmAfterClimb >= CRITICAL - 0.5) {
      // Critical or near-critical → must do fresh fill
      fillType     = 'fresh_fill';
      litres       = r1(rand(18, 24));
      recordedTpm  = r1(rand(8.5, 12.5));
      nextTpm      = recordedTpm;
      st.lastFreshFillDate = dateStr;

    } else if (tpmAfterClimb >= WARNING + 1) {
      // Over warning (19+) → fresh fill 65%, top up 35%
      if (Math.random() < 0.65) {
        fillType     = 'fresh_fill';
        litres       = r1(rand(18, 24));
        recordedTpm  = r1(rand(8.5, 12.5));
        nextTpm      = recordedTpm;
        st.lastFreshFillDate = dateStr;
      } else {
        fillType    = 'top_up';
        litres      = r1(rand(8, 14));
        const drop  = rand(2.0, 4.0);
        recordedTpm = r1(Math.max(tpmAfterClimb - drop, WARNING - 2));
        nextTpm     = recordedTpm;
      }

    } else if (tpmAfterClimb >= WARNING) {
      // At warning (18) → fresh fill 50%, top up 50%
      if (Math.random() < 0.50) {
        fillType     = 'fresh_fill';
        litres       = r1(rand(18, 24));
        recordedTpm  = r1(rand(8.5, 12.5));
        nextTpm      = recordedTpm;
        st.lastFreshFillDate = dateStr;
      } else {
        fillType    = 'top_up';
        litres      = r1(rand(6, 12));
        const drop  = rand(1.5, 3.0);
        recordedTpm = r1(Math.max(tpmAfterClimb - drop, WARNING - 3));
        nextTpm     = recordedTpm;
      }

    } else if (tpmAfterClimb >= WARNING - 3 && Math.random() < 0.15) {
      // 15–17 range: occasional proactive top-up (15% chance)
      fillType    = 'top_up';
      litres      = r1(rand(4, 8));
      const drop  = rand(0.5, 1.5);
      recordedTpm = r1(tpmAfterClimb - drop);
      nextTpm     = recordedTpm;

    } else {
      fillType    = 'no_fill';
      litres      = 0;
      recordedTpm = tpmAfterClimb;
      nextTpm     = tpmAfterClimb;
    }

    st.tpm = nextTpm;

    // ── oil_age ──────────────────────────────────────────────────────────────
    // fresh_fill day → 1; otherwise days elapsed since last fresh fill + 1
    const oilAge = fillType === 'fresh_fill'
      ? 1
      : daysBetween(st.lastFreshFillDate, dateStr) + 1;

    // ── Temperature ──────────────────────────────────────────────────────────
    const tempVariance  = rand(-1.5, 4.5);
    const actualTemp    = r1(fryer.setTemp + tempVariance);

    // ── Filtering ────────────────────────────────────────────────────────────
    // Don't filter on fresh-fill day; otherwise ~78% of days
    const filtered = fillType !== 'fresh_fill' && Math.random() < 0.78;

    // ── Notes & staff ────────────────────────────────────────────────────────
    const notes     = pickNote(fillType, recordedTpm, isBusy, isQuiet);
    const staffName = pickStaff(d, fryer.num);

    readings.push({
      venue_id:          VENUE_ID,
      trial_id:          null,
      fryer_number:      fryer.num,
      reading_date:      dateStr,
      reading_number:    1,
      taken_by:          null,
      oil_age:           oilAge,
      litres_filled:     litres,
      tpm_value:         recordedTpm,
      set_temperature:   fryer.setTemp,
      actual_temperature: actualTemp,
      filtered,
      food_type:         fryer.foodType,
      notes,
      not_in_use:        false,
      staff_name:        staffName,
    });

    // ── Occasional second reading (emergency oil change same day) ─────────────
    // Happens when no_fill was logged first (missed the call) and TPM was high.
    // ~50% chance when no_fill + TPM >= 21. Represents staff returning to rectify.
    if (fillType === 'no_fill' && recordedTpm >= 21 && Math.random() < 0.50) {
      const freshTpm = r1(rand(8.5, 12.0));
      const freshLitres = r1(rand(18, 24));
      readings.push({
        venue_id:          VENUE_ID,
        trial_id:          null,
        fryer_number:      fryer.num,
        reading_date:      dateStr,
        reading_number:    2,
        taken_by:          null,
        oil_age:           1,
        litres_filled:     freshLitres,
        tpm_value:         freshTpm,
        set_temperature:   fryer.setTemp,
        actual_temperature: r1(fryer.setTemp + rand(-1.0, 2.0)),
        filtered:          false,
        food_type:         fryer.foodType,
        notes:             'Oil changed after high TPM reading — fresh oil in',
        not_in_use:        false,
        staff_name:        staffName,
      });
      st.tpm = freshTpm;
      st.lastFreshFillDate = dateStr;
    }
  }
}

// ── Not-in-use readings (fryer down / too quiet to warrant running) ────────────
// A few realistic "not in use" records spread across the period
const NOT_IN_USE_DAYS = [
  { date: '2026-01-13', fryer: 4, note: 'Fryer 4 not needed — quiet Tuesday, running 3 fryers only' },
  { date: '2026-02-03', fryer: 3, note: 'Under routine maintenance — back in service tomorrow' },
  { date: '2026-02-17', fryer: 4, note: 'Fryer not required today — light service day' },
  { date: '2026-03-05', fryer: 4, note: 'Equipment issue — engineer booked for tomorrow' },
];

for (const niu of NOT_IN_USE_DAYS) {
  // Remove any generated reading for this fryer/date if it exists
  const idx = readings.findIndex(r => r.reading_date === niu.date && r.fryer_number === niu.fryer);
  if (idx !== -1) readings.splice(idx, 1);

  readings.push({
    venue_id:          VENUE_ID,
    trial_id:          null,
    fryer_number:      niu.fryer,
    reading_date:      niu.date,
    reading_number:    1,
    taken_by:          null,
    oil_age:           null,
    litres_filled:     0,
    tpm_value:         null,
    set_temperature:   null,
    actual_temperature: null,
    filtered:          null,
    food_type:         null,
    notes:             niu.note,
    not_in_use:        true,
    staff_name:        STAFF[rInt(0, STAFF.length - 1)],
  });
}

console.log(`Generated ${readings.length} readings`);
console.log(`  Second readings (reading_number=2): ${readings.filter(r => r.reading_number === 2).length}`);
console.log(`  Not-in-use: ${readings.filter(r => r.not_in_use).length}`);
console.log(`  Fresh fills (oil_age=1): ${readings.filter(r => r.oil_age === 1).length}`);
console.log(`  Top ups (litres>0, oil_age>1): ${readings.filter(r => r.litres_filled > 0 && r.oil_age > 1).length}`);
console.log(`  No fills: ${readings.filter(r => r.litres_filled === 0 && !r.not_in_use).length}`);

// ── Clear existing readings for this venue ────────────────────────────────────
console.log('Clearing existing venue staff readings...');
const { error: delErr } = await sb
  .from('tpm_readings')
  .delete()
  .eq('venue_id', VENUE_ID)
  .is('trial_id', null);
if (delErr) { console.error('Delete failed:', delErr.message); process.exit(1); }
console.log('✓ Cleared');

// ── Insert in batches ─────────────────────────────────────────────────────────
const BATCH = 50;
let inserted = 0, failed = 0;

for (let i = 0; i < readings.length; i += BATCH) {
  const batch = readings.slice(i, i + BATCH);
  const { error } = await sb.from('tpm_readings').insert(batch);
  if (error) {
    console.error(`Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
    failed += batch.length;
  } else {
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${readings.length}...`);
  }
}

console.log(`\n\n✓ Done — ${inserted} inserted, ${failed} failed`);

// ── Verify ────────────────────────────────────────────────────────────────────
const { count } = await sb
  .from('tpm_readings')
  .select('*', { count: 'exact', head: true })
  .eq('venue_id', VENUE_ID)
  .is('trial_id', null);
console.log(`✓ Total venue staff readings in DB: ${count}`);

// ── Gaps / issues identified during development ────────────────────────────────
console.log(`
════════════════════════════════════════════════════════
GAPS & ISSUES FOUND DURING SEEDING REVIEW
════════════════════════════════════════════════════════

1. [BUG] isOilChange → reading_number never incremented
   VenueStaffView.jsx checkAndSave() tags duplicate fryer/date
   readings with { isOilChange: true }, but unMapReading() has no
   isOilChange field and reading_number defaults to 1 regardless.
   A second reading for the same fryer/date will fail the unique
   constraint: (venue_id, fryer_number, reading_date, reading_number).
   FIX: In checkAndSave, when a duplicate exists, count how many
   readings exist for that fryer/date and set readingNumber = count + 1.

2. [DESIGN GAP] fillType is UI-only — not stored in DB
   The DB derives fill type from oilAge + litresFilled:
     fresh_fill  → oil_age = 1,  litres_filled > 0
     top_up      → oil_age > 1, litres_filled > 0
     no_fill     → oil_age > 1, litres_filled = 0
   Edge case: if oil_age = 1 but litres_filled = 0 (e.g. user taps
   Fresh Fill then sets litres to 0), the DB will look like a fresh fill
   but with no oil added.  Consider adding a NOT NULL fill_type column
   to tpm_readings to make intent explicit.

3. [DATA GAP] No venue_staff profiles exist
   Venue staff authenticate via venues.customer_code, so taken_by is
   always null and staff identity is only tracked as free text in
   staff_name. No FK integrity, no login history, no per-user
   permissions. Consider creating profile rows with role='venue_staff'
   once the schema role check constraint is expanded.

4. [SCHEMA] profiles.role check excludes 'venue_staff' / 'group_viewer'
   The check constraint is: role IN ('admin','mgt','state_manager','nam','bdm')
   If a venue_staff profile is ever needed, the constraint must be
   updated first — or the implicit role pattern (customer_code lookup)
   must remain the only path.

5. [DISPLAY] Second readings shadowed in TPM Log / Calendar
   TPM Log and DayView show only dayRecs[dayRecs.length - 1] — the
   last reading of the day.  A reading_number=2 fresh fill would
   correctly appear (newest wins), but the original high-TPM reading
   (reading_number=1) is silently hidden with no indication to staff
   that multiple readings exist.  A "2 readings" badge or expandable
   row would improve visibility.

6. [MATHS] oil_age calc breaks for new venues with no reading history
   calcOilAge() looks for the most recent reading with oil_age=1.
   For a brand-new venue or fryer with no history, it returns 0.
   oil_age=0 is not explicitly handled in the UI (RecordingCard shows
   it as-is, DayView labels it as "Day 0").  A null or "Unknown" state
   would be safer.

7. [MINOR] litres_filled defaults to 0 in unMapReading
   rd.litresFilled != null ? rd.litresFilled : 0
   Null and 0 are semantically different (unknown vs confirmed no fill).
   The isToppedUp logic (litresFilled > 0) is safe, but any analytics
   that try to sum litres should exclude nulls explicitly.
════════════════════════════════════════════════════════
`);
