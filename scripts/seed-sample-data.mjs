// ============================================================
// Seed script — realistic trial demo data for Frysmart
// Wipes all existing trial-only venues/trials/readings, then
// creates fresh realistic data across all trial stages.
//
// Run:    node scripts/seed-sample-data.mjs <username> <password>
// Delete: node scripts/seed-sample-data.mjs <username> <password> --delete
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mznlwouvgbnexmirwofd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Authenticate first (RLS requires auth) ──
const args = process.argv.filter(a => !a.startsWith('--'));
const username = args[2];
const pw = args[3];

if (!username || !pw) {
  console.error('Usage: node scripts/seed-sample-data.mjs <username> <password> [--delete]');
  process.exit(1);
}

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${username.trim()}@frysmart.app`,
  password: pw,
});
if (authErr) {
  console.error('Auth failed:', authErr.message);
  process.exit(1);
}
console.log('Authenticated\n');

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const daysAgoTs = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// ══════════════════════════════════════════════
// DELETE ALL TRIAL DATA
// ══════════════════════════════════════════════
console.log('Wiping all existing trial data...\n');

const { data: existingTrialVenues } = await supabase
  .from('venues').select('id').eq('status', 'trial-only');

if (existingTrialVenues?.length) {
  const ids = existingTrialVenues.map(v => v.id);
  console.log(`  Found ${ids.length} trial-only venues to delete`);

  // Delete readings
  const { error: readErr } = await supabase.from('tpm_readings').delete().in('venue_id', ids);
  console.log(`  tpm_readings: ${readErr ? 'ERR ' + readErr.message : 'deleted'}`);

  // Delete trials
  const { error: trialErr } = await supabase.from('trials').delete().in('venue_id', ids);
  console.log(`  trials: ${trialErr ? 'ERR ' + trialErr.message : 'deleted'}`);

  // Delete venues
  const { error: venueErr } = await supabase.from('venues').delete().eq('status', 'trial-only');
  console.log(`  venues: ${venueErr ? 'ERR ' + venueErr.message : 'deleted'}`);
} else {
  console.log('  No existing trial data found');
}

if (process.argv.includes('--delete')) {
  console.log('\nDone! All trial data removed.');
  process.exit(0);
}

// ══════════════════════════════════════════════
// SEED REALISTIC TRIAL DATA
// ══════════════════════════════════════════════
console.log('\nSeeding realistic trial data...\n');

// ── Look up real data ──
const { data: bdmUser } = await supabase.from('profiles').select('id, region, name').eq('username', 'bgurovsk').single();
const bdmId = bdmUser?.id || null;
const bdmName = bdmUser?.name || 'Bob G.';
const staffName = bdmName.split(' ')[0] + ' ' + (bdmName.split(' ')[1] || '').charAt(0) + '.';
console.log(`  BDM: ${bdmName} (${bdmId ? 'found' : 'NOT FOUND'})`);

// Cookers oils
const { data: cookerOils } = await supabase.from('oil_types')
  .select('id, name, code')
  .is('competitor_id', null)
  .eq('status', 'active');
const cookerMap = {};
cookerOils?.forEach(o => { cookerMap[o.code] = o.id; });
const XLFRY = cookerMap['XLFRY'] || null;
const ULTAFRY = cookerMap['ULTAFRY'] || null;
console.log(`  Cookers oils: XLFRY=${XLFRY ? 'yes' : 'NO'}, ULTAFRY=${ULTAFRY ? 'yes' : 'NO'}`);

// Competitor oils
const { data: compOils } = await supabase.from('oil_types')
  .select('id, name, code, competitor_id')
  .not('competitor_id', 'is', null)
  .eq('status', 'active');
const compOilIds = compOils?.map(o => o.id) || [];
const pickCompOil = () => compOilIds.length > 0 ? compOilIds[Math.floor(Math.random() * compOilIds.length)] : null;
console.log(`  Competitor oils: ${compOilIds.length} available`);

// ── Realistic notes pool ──
const NOTES = [
  'Oil looking clear, good colour',
  'Slight foam on surface — will filter tomorrow',
  'Customer mentioned chips are crispier than usual',
  'Changed oil — TPM was climbing',
  'Filtered before service, nice improvement',
  'Owner said they\'re noticing less oil smell in the shop',
  'Food quality noticeably better than their old oil',
  'Temp running slightly hot, adjusted thermostat down 2 degrees',
  'Busy lunch service, mostly frying chips and fish',
  'End of day filter, oil still looking good for tomorrow',
  'Owner happy with how long oil is lasting',
  'Compared side by side with old oil — ours is clearly cleaner',
  'Staff finding it easier to manage — less residue buildup',
  'Took photos of oil clarity for comparison report',
  'Great fry colour on crumbed items today',
  'Oil still clear at day 5 — impressive for this volume',
  'Owner asked about pricing for ongoing supply',
  'Quick check before lunch rush — all looking good',
  'Filtered and topped up 2L — very little wastage',
  'Fryer running perfectly, no issues to report',
];

const FOOD_TYPES = ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Mixed Service'];

// ── TPM progression model ──
// Cookers oil: slower degradation (the whole selling point)
const cookersTpmByDay = [
  [4, 7],   // day 1 fresh
  [6, 9],   // day 2
  [8, 12],  // day 3
  [10, 14], // day 4
  [12, 16], // day 5
  [14, 18], // day 6
  [16, 20], // day 7
  [18, 22], // day 8+
];

const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const randFloat = (min, max) => +(min + Math.random() * (max - min)).toFixed(2);
const maybeNote = (pct = 0.3) => Math.random() < pct ? NOTES[Math.floor(Math.random() * NOTES.length)] : null;

// ── Generate readings for a trial ──
function generateReadings(venueId, trialId, fryerCount, startDate, endDate, trialOilCode) {
  const readings = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date(today);
  const tpmTable = cookersTpmByDay; // Cookers oil = slower progression

  for (let fryer = 1; fryer <= fryerCount; fryer++) {
    let oilAge = 1;
    let cur = new Date(start);

    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];

      // Oil change cycle: change oil when oilAge hits 6-8 days (Cookers lasts longer)
      const changeThreshold = randBetween(6, 8);
      if (oilAge > changeThreshold) {
        oilAge = 1; // Fresh oil change
      }

      const dayIdx = Math.min(oilAge - 1, tpmTable.length - 1);
      const [tpmMin, tpmMax] = tpmTable[dayIdx];
      const tpmValue = randBetween(tpmMin, tpmMax);

      const setTemp = [170, 175, 180][Math.floor(Math.random() * 3)];
      const actualTemp = setTemp + randBetween(-3, 3);

      const isFresh = oilAge === 1;
      const litresFilled = isFresh
        ? randBetween(12, 20)
        : (Math.random() < 0.3 ? randBetween(1, 4) : 0);

      const filtered = isFresh ? true : Math.random() < 0.7;

      // More notes on day 1 (oil change) and later days (observations)
      const notePct = isFresh ? 0.6 : oilAge >= 5 ? 0.4 : 0.25;

      readings.push({
        venue_id: venueId,
        trial_id: trialId,
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
        staff_name: staffName,
        not_in_use: false,
        notes: maybeNote(notePct),
      });

      oilAge++;
      cur.setDate(cur.getDate() + 1);
    }
  }

  return readings;
}

// ══════════════════════════════════════════════
// DEFINE 13 TRIAL VENUES
// ══════════════════════════════════════════════

const trialDefs = [
  // ── PENDING (2) — created but not started yet ──
  {
    venue: { name: 'Bayside Fish & Chips', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 75 },
    trial: { status: 'pending', trial_oil: XLFRY, currentPrice: 2.35, offeredPrice: 3.10, createdDaysAgo: 2 },
  },
  {
    venue: { name: 'Doncaster Takeaway', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 120 },
    trial: { status: 'pending', trial_oil: ULTAFRY, currentPrice: 2.20, offeredPrice: 2.95, createdDaysAgo: 1 },
  },

  // ── IN-PROGRESS (3) — actively running ──
  {
    venue: { name: 'Richmond Takeaway', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 80 },
    trial: { status: 'in-progress', trial_oil: XLFRY, currentPrice: 2.40, offeredPrice: 3.20, startDaysAgo: 3 },
  },
  {
    venue: { name: 'South Yarra Grill', fryer_count: 4, volume_bracket: '150-plus', current_weekly_avg: 180 },
    trial: { status: 'in-progress', trial_oil: XLFRY, currentPrice: 2.55, offeredPrice: 3.35, startDaysAgo: 6 },
  },
  {
    venue: { name: 'Brunswick Street Fryer', fryer_count: 1, volume_bracket: 'under-60', current_weekly_avg: 45 },
    trial: { status: 'in-progress', trial_oil: ULTAFRY, currentPrice: 2.15, offeredPrice: 2.85, startDaysAgo: 8 },
  },

  // ── COMPLETED (2) — ended, awaiting decision ──
  {
    venue: { name: 'St Kilda Seafood Bar', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 110 },
    trial: { status: 'completed', trial_oil: XLFRY, currentPrice: 2.45, offeredPrice: 3.25, startDaysAgo: 12, durationDays: 8 },
  },
  {
    venue: { name: 'Fitzroy Chicken Shop', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 70 },
    trial: { status: 'completed', trial_oil: XLFRY, currentPrice: 2.30, offeredPrice: 3.05, startDaysAgo: 10, durationDays: 7 },
  },

  // ── ACCEPTED (1) — won but awaiting customer code ──
  {
    venue: { name: 'Preston Fish Bar', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 85 },
    trial: { status: 'accepted', trial_oil: XLFRY, currentPrice: 2.40, offeredPrice: 3.15, startDaysAgo: 18, durationDays: 9, outcomeDaysAgo: 6, reason: 'oil-lasted-longer', soldPrice: 3.05 },
  },

  // ── WON (3) — successful trials ──
  {
    venue: { name: 'Hawthorn Hot Foods', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 130 },
    trial: { status: 'won', trial_oil: XLFRY, currentPrice: 2.50, offeredPrice: 3.30, startDaysAgo: 30, durationDays: 10, outcomeDaysAgo: 15, reason: 'better-food-quality', soldPrice: 3.15, custCode: 'MEL-001' },
  },
  {
    venue: { name: 'Coburg Kebab & Chips', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 90 },
    trial: { status: 'won', trial_oil: ULTAFRY, currentPrice: 2.25, offeredPrice: 2.90, startDaysAgo: 25, durationDays: 7, outcomeDaysAgo: 12, reason: 'cost-savings', soldPrice: 2.80, custCode: 'MEL-002' },
  },
  {
    venue: { name: 'Footscray Golden Fry', fryer_count: 4, volume_bracket: '150-plus', current_weekly_avg: 160 },
    trial: { status: 'won', trial_oil: XLFRY, currentPrice: 2.60, offeredPrice: 3.40, startDaysAgo: 35, durationDays: 9, outcomeDaysAgo: 20, reason: 'oil-lasted-longer', soldPrice: 3.25, custCode: 'MEL-003' },
  },

  // ── LOST (2) — unsuccessful trials ──
  {
    venue: { name: 'Dandenong Quick Eats', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 65 },
    trial: { status: 'lost', trial_oil: XLFRY, currentPrice: 2.10, offeredPrice: 3.00, startDaysAgo: 22, durationDays: 8, outcomeDaysAgo: 10, reason: 'price-too-high' },
  },
  {
    venue: { name: 'Frankston Fish House', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 100 },
    trial: { status: 'lost', trial_oil: XLFRY, currentPrice: 2.45, offeredPrice: 3.20, startDaysAgo: 28, durationDays: 10, outcomeDaysAgo: 14, reason: 'contract-locked' },
  },
];

// ══════════════════════════════════════════════
// INSERT VENUES + TRIALS + READINGS
// ══════════════════════════════════════════════
let totalReadings = 0;

for (const def of trialDefs) {
  const { venue: vDef, trial: tDef } = def;

  // Prospect code
  const prospectCode = `PRS-${String(trialDefs.indexOf(def) + 1).padStart(4, '0')}`;

  // Insert venue
  const venueRow = {
    name: vDef.name,
    status: 'trial-only',
    state: 'VIC',
    fryer_count: vDef.fryer_count,
    volume_bracket: vDef.volume_bracket,
    default_oil: pickCompOil(),
    bdm_id: bdmId,
    customer_code: tDef.custCode || prospectCode,
    ...(tDef.custCode ? { customer_code_saved_at: daysAgoTs(tDef.outcomeDaysAgo || 0) } : {}),
  };

  const { data: insertedVenue, error: vErr } = await supabase.from('venues').insert(venueRow).select().single();
  if (vErr) { console.error(`  ERR venue ${vDef.name}: ${vErr.message}`); continue; }

  // Build trial row
  const startDate = tDef.startDaysAgo ? daysAgo(tDef.startDaysAgo) : null;
  const endDate = tDef.durationDays && startDate ? daysAgo(tDef.startDaysAgo - tDef.durationDays) : null;
  const outcomeDate = tDef.outcomeDaysAgo ? daysAgo(tDef.outcomeDaysAgo) : null;

  const trialRow = {
    venue_id: insertedVenue.id,
    status: tDef.status,
    trial_oil_id: tDef.trial_oil,
    notes: `TRL-${String(trialDefs.indexOf(def) + 1).padStart(4, '0')} | Melbourne`,
    current_price_per_litre: tDef.currentPrice,
    offered_price_per_litre: tDef.offeredPrice,
    current_weekly_avg: vDef.current_weekly_avg,
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
    ...(outcomeDate ? { outcome_date: outcomeDate } : {}),
    ...(tDef.reason ? { trial_reason: tDef.reason } : {}),
    ...(tDef.soldPrice ? { sold_price_per_litre: tDef.soldPrice } : {}),
  };

  // Trial status flow: pending → in-progress → completed → accepted (won, needs code) → won (code saved)

  const { data: insertedTrial, error: tErr } = await supabase.from('trials').insert(trialRow).select().single();
  if (tErr) { console.error(`  ERR trial for ${vDef.name}: ${tErr.message}`); continue; }

  // Generate and insert readings (only for trials that have started)
  if (startDate) {
    const trialOilCode = tDef.trial_oil === XLFRY ? 'XLFRY' : 'ULTAFRY';
    const readings = generateReadings(
      insertedVenue.id,
      insertedTrial.id,
      vDef.fryer_count,
      startDate,
      endDate || todayStr,
      trialOilCode
    );

    if (readings.length > 0) {
      const { error: rErr } = await supabase.from('tpm_readings').insert(readings);
      if (rErr) { console.error(`  ERR readings for ${vDef.name}: ${rErr.message}`); }
      else { totalReadings += readings.length; }
    }

    // Update venue last_tpm_date
    const latestDate = readings.length > 0 ? readings[readings.length - 1].reading_date : null;
    if (latestDate) {
      await supabase.from('venues').update({ last_tpm_date: latestDate }).eq('id', insertedVenue.id);
    }
  }

  const statusIcon = { pending: 'pipeline', 'in-progress': 'active', completed: 'decision', accepted: 'accepted', won: 'WON', lost: 'LOST' }[tDef.status];
  console.log(`  ${vDef.name} — ${statusIcon} (${vDef.fryer_count} fryers)`);
}

console.log(`\nDone!`);
console.log(`  ${trialDefs.length} trial venues created`);
console.log(`  ${totalReadings} TPM readings generated`);
console.log(`  All assigned to ${bdmName} in VIC`);
console.log(`  Trial oils: mostly XLFRY, some ULTAFRY`);
console.log(`  Status mix: 2 pending, 3 active, 2 awaiting decision, 1 accepted, 3 won, 2 lost`);
