// ============================================================
// Seed script — realistic recording data for a single venue
// Generates 60 days of daily TPM readings for all fryers.
//
// Run:    node scripts/seed-venue-data.mjs <admin-user> <admin-pw> <customer-code>
// Delete: node scripts/seed-venue-data.mjs <admin-user> <admin-pw> <customer-code> --delete
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mznlwouvgbnexmirwofd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Parse args ──
const flags = process.argv.filter(a => a.startsWith('--'));
const args = process.argv.filter(a => !a.startsWith('--'));
const adminUser = args[2];
const adminPw = args[3];
const customerCode = args[4];
const DAYS = 60;

if (!adminUser || !adminPw || !customerCode) {
  console.error('Usage: node scripts/seed-venue-data.mjs <admin-user> <admin-pw> <customer-code> [--delete]');
  process.exit(1);
}

// ── Authenticate (RLS requires auth) ──
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${adminUser.trim()}@frysmart.app`,
  password: adminPw,
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log('Authenticated\n');

// ── Look up the venue ──
const { data: venue, error: vErr } = await supabase
  .from('venues').select('id, name, fryer_count, customer_code, default_oil, status, state')
  .ilike('customer_code', customerCode).single();
if (vErr || !venue) { console.error(`Venue "${customerCode}" not found:`, vErr?.message); process.exit(1); }
console.log(`Venue: "${venue.name}" (${venue.fryer_count} fryers, ${venue.state})`);
console.log(`Customer code: ${venue.customer_code}\n`);

// ══════════════════════════════════════════════
// DELETE EXISTING READINGS
// ══════════════════════════════════════════════
console.log('Deleting existing readings...');
const { error: delErr, count: delCount } = await supabase
  .from('tpm_readings').delete({ count: 'exact' }).eq('venue_id', venue.id);
console.log(delErr ? `  ERR: ${delErr.message}` : `  Deleted ${delCount ?? 'all'} readings`);

if (flags.includes('--delete')) {
  console.log('\nDone! All readings removed.');
  process.exit(0);
}

// ══════════════════════════════════════════════
// GENERATE REALISTIC READINGS
// ══════════════════════════════════════════════
console.log(`\nGenerating ${DAYS} days of realistic recording data...\n`);

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgoStr = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const maybeNote = (pct = 0.25) => Math.random() < pct ? NOTES[Math.floor(Math.random() * NOTES.length)] : null;

// ── Realistic notes pool ──
const NOTES = [
  'Oil looking clear, good colour',
  'Slight foam on surface — filtered',
  'Busy lunch service today',
  'Changed oil — TPM was getting high',
  'Filtered before service',
  'Oil still looking great',
  'Busy dinner rush, frying mostly fish',
  'Quiet day, minimal frying',
  'End of day filter, oil good for tomorrow',
  'New batch of oil — looking fresh',
  'Top-up added, oil level was low',
  'Steady trade, chips and crumbed items',
  'Oil darkening a bit, will change tomorrow',
  'Thermostat adjusted down 2°C',
  'Morning prep — oil preheated and checked',
  'Friday rush — heavy frying all day',
  'Saturday trade, good throughput',
  'Weekend service, mixed menu items',
  'Monday — fresh start, changed oil',
  'Mid-week check, all fryers running well',
  'Slow afternoon, minimal oil use',
  'Good fry colour on battered fish today',
  'Chips coming out perfectly crispy',
  'Noticed slight smoke — turned temp down',
  'Double-filtered today, big improvement',
  'Crumbed items frying beautifully',
];

const FOOD_TYPES = ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Mixed Service'];

// Staff names — realistic for a venue with a few staff
const STAFF_POOL = ['Maria', 'James', 'Sarah', 'Tony'];

// ── TPM progression — standard oil, degrades over 5-7 days ──
const tpmByDay = [
  [5, 8],    // day 1 fresh
  [8, 12],   // day 2
  [11, 15],  // day 3
  [14, 18],  // day 4
  [17, 21],  // day 5
  [19, 23],  // day 6
  [21, 25],  // day 7+
];

// ── Generate readings ──
const readings = [];
const fryerCount = venue.fryer_count || 2;
const startDate = new Date(today);
startDate.setDate(startDate.getDate() - (DAYS - 1));

for (let fryer = 1; fryer <= fryerCount; fryer++) {
  let oilAge = randBetween(1, 4); // Start mid-cycle
  let cur = new Date(startDate);

  while (cur <= today) {
    const dateStr = cur.toISOString().split('T')[0];

    // Oil change cycle: 5-7 days
    const changeThreshold = randBetween(5, 7);
    if (oilAge > changeThreshold) {
      oilAge = 1;
    }

    const dayIdx = Math.min(oilAge - 1, tpmByDay.length - 1);
    const [tpmMin, tpmMax] = tpmByDay[dayIdx];
    const tpmValue = randBetween(tpmMin, tpmMax);

    const setTemp = [170, 175, 180][Math.floor(Math.random() * 3)];
    const actualTemp = setTemp + randBetween(-3, 3);

    const isFresh = oilAge === 1;
    const litresFilled = isFresh
      ? randBetween(12, 20)
      : (Math.random() < 0.25 ? randBetween(1, 3) : 0);

    const filtered = isFresh ? true : Math.random() < 0.6;

    const notePct = isFresh ? 0.55 : oilAge >= 5 ? 0.35 : 0.18;

    // Staff rotation
    const staffIdx = Math.random() < 0.45 ? 0 : (Math.random() < 0.6 ? 1 : (Math.random() < 0.7 ? 2 : 3));
    const staff = STAFF_POOL[staffIdx];

    // Sunday closures — ~30% chance
    const dayOfWeek = cur.getDay();
    if (dayOfWeek === 0 && Math.random() < 0.3) {
      readings.push({
        venue_id: venue.id,
        trial_id: null,
        fryer_number: fryer,
        reading_date: dateStr,
        reading_number: 1,
        oil_age: oilAge,
        litres_filled: 0,
        tpm_value: null,
        set_temperature: null,
        actual_temperature: null,
        filtered: false,
        food_type: null,
        staff_name: staff,
        not_in_use: true,
        notes: 'Closed — Sunday',
      });
      cur.setDate(cur.getDate() + 1);
      continue;
    }

    readings.push({
      venue_id: venue.id,
      trial_id: null,
      fryer_number: fryer,
      reading_date: dateStr,
      reading_number: 1,
      oil_age: oilAge,
      litres_filled: litresFilled,
      tpm_value: tpmValue,
      set_temperature: setTemp,
      actual_temperature: actualTemp,
      filtered,
      food_type: FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)],
      staff_name: staff,
      not_in_use: false,
      notes: maybeNote(notePct),
    });

    oilAge++;
    cur.setDate(cur.getDate() + 1);
  }
}

// ── Insert in batches ──
const BATCH = 500;
for (let b = 0; b < readings.length; b += BATCH) {
  const batch = readings.slice(b, b + BATCH);
  const { error: rErr } = await supabase.from('tpm_readings').upsert(batch, {
    onConflict: 'venue_id,fryer_number,reading_date,reading_number',
  });
  if (rErr) { console.error(`  ERR inserting batch: ${rErr.message}`); break; }
}

// Update venue's last_tpm_date
const lastReading = readings[readings.length - 1];
if (lastReading) {
  await supabase.from('venues').update({ last_tpm_date: lastReading.reading_date }).eq('id', venue.id);
}

console.log(`  ✓ ${venue.name} — ${fryerCount} fryers × ${DAYS} days = ${readings.length} readings`);
console.log(`\nDone!`);
console.log(`  ${readings.length} total TPM readings generated`);
console.log(`  ${DAYS} days of data (${daysAgoStr(DAYS - 1)} → ${todayStr})`);
