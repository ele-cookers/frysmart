// ============================================================
// Seed script — additional varied trial data across all BDMs
// Adds to existing data (does NOT wipe anything).
// Each BDM gets a different number of trials with varied
// timings so the analytics screen shows realistic spread.
//
// Run:  node scripts/seed-additional-trials.mjs <username> <password>
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mznlwouvgbnexmirwofd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ──
const args = process.argv.filter(a => !a.startsWith('--'));
const username = args[2];
const pw = args[3];
if (!username || !pw) {
  console.error('Usage: node scripts/seed-additional-trials.mjs <username> <password>');
  process.exit(1);
}

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${username.trim()}@frysmart.app`,
  password: pw,
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log('Authenticated\n');

// ── Helpers ──
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
const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ── Look up BDM profiles ──
const bdmUsernames = ['aswan', 'cstewart', 'ctaaffe', 'cbadams', 'snagpal', 'bgurovsk'];
const { data: bdmProfiles } = await supabase
  .from('profiles')
  .select('id, username, name, region')
  .in('username', bdmUsernames);
const bdmMap = {};
bdmProfiles?.forEach(p => { bdmMap[p.username] = p; });
console.log('BDMs found:', Object.keys(bdmMap).join(', '));

// ── Look up Cookers oils ──
const { data: cookerOils } = await supabase
  .from('oil_types')
  .select('id, name, code')
  .is('competitor_id', null)
  .eq('status', 'active');
const cookerMap = {};
cookerOils?.forEach(o => { cookerMap[o.code] = o.id; });
const XLFRY = cookerMap['XLFRY'] || null;
const ULTAFRY = cookerMap['ULTAFRY'] || null;
console.log(`Cookers oils: XLFRY=${XLFRY ? 'yes' : 'NO'}, ULTAFRY=${ULTAFRY ? 'yes' : 'NO'}`);

// ── Look up competitor oils (used as venue's existing oil) ──
const { data: compOils } = await supabase
  .from('oil_types')
  .select('id')
  .not('competitor_id', 'is', null)
  .eq('status', 'active');
const compOilIds = compOils?.map(o => o.id) || [];
const pickCompOil = () =>
  compOilIds.length > 0 ? compOilIds[Math.floor(Math.random() * compOilIds.length)] : null;
console.log(`Competitor oils: ${compOilIds.length} available\n`);

// ── TPM reading generation ──
const NOTES = [
  'Oil looking clear, good colour',
  'Slight foam on surface — will filter tomorrow',
  'Customer mentioned chips are crispier than usual',
  'Changed oil — TPM was climbing',
  'Filtered before service, nice improvement',
  "Owner said they're noticing less oil smell in the shop",
  'Food quality noticeably better than their old oil',
  'Owner happy with how long oil is lasting',
  "Compared side by side with old oil — ours is clearly cleaner",
  'Filtered and topped up 2L — very little wastage',
  'Fryer running perfectly, no issues to report',
  'Great fry colour on crumbed items today',
  'Oil still clear at day 5 — impressive for this volume',
  'Staff finding it easier to manage — less residue buildup',
  'Quick check before lunch rush — all looking good',
];
const FOOD_TYPES = ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Mixed Service'];
const TPM_BY_DAY = [
  [4, 7], [6, 9], [8, 12], [10, 14], [12, 16], [14, 18], [16, 20], [18, 22],
];
const maybeNote = (pct) => Math.random() < pct
  ? NOTES[Math.floor(Math.random() * NOTES.length)]
  : null;

function generateReadings(venueId, trialId, fryerCount, startDate, endDate, firstName) {
  const readings = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date(today);

  for (let fryer = 1; fryer <= fryerCount; fryer++) {
    let oilAge = 1;
    let cur = new Date(start);
    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      const changeAt = randBetween(6, 9);
      if (oilAge > changeAt) oilAge = 1;
      const dayIdx = Math.min(oilAge - 1, TPM_BY_DAY.length - 1);
      const [tpmMin, tpmMax] = TPM_BY_DAY[dayIdx];
      const setTemp = [170, 175, 180][Math.floor(Math.random() * 3)];
      const isFresh = oilAge === 1;
      readings.push({
        venue_id: venueId,
        trial_id: trialId,
        fryer_number: fryer,
        reading_date: dateStr,
        reading_number: 1,
        oil_age: oilAge,
        litres_filled: isFresh ? randBetween(12, 20) : (Math.random() < 0.3 ? randBetween(1, 4) : 0),
        tpm_value: randBetween(tpmMin, tpmMax),
        set_temperature: setTemp,
        actual_temperature: setTemp + randBetween(-3, 3),
        filtered: isFresh ? true : Math.random() < 0.7,
        food_type: FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)],
        staff_name: firstName,
        not_in_use: false,
        notes: maybeNote(isFresh ? 0.6 : oilAge >= 5 ? 0.4 : 0.2),
      });
      oilAge++;
      cur.setDate(cur.getDate() + 1);
    }
  }
  return readings;
}

// ══════════════════════════════════════════════
// TRIAL DEFINITIONS — varied per BDM
// Note: XLFry sold ~3.55–3.65, UltraFry ~3.82–3.92
// ══════════════════════════════════════════════
const trialsByBdm = {

  // ── aswan (NSW) — 4 trials: 2 successful, 1 unsuccessful, 1 active ──
  aswan: {
    state: 'NSW',
    trials: [
      {
        venue: { name: 'Parramatta Chicken Shop', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 78 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.45, offeredPrice: 3.65,
          startDaysAgo: 38, durationDays: 9, outcomeDaysAgo: 25, custCodeDaysAgo: 18,
          reason: 'oil-lasted-longer', soldPrice: 3.58, custCode: 'NSW-A01' },
      },
      {
        venue: { name: 'Surry Hills Fish Bar', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 115 },
        trial: { status: 'successful', trial_oil: ULTAFRY, currentPrice: 2.60, offeredPrice: 3.90,
          startDaysAgo: 60, durationDays: 14, outcomeDaysAgo: 40, custCodeDaysAgo: 30,
          reason: 'better-food-quality', soldPrice: 3.88, custCode: 'NSW-A02' },
      },
      {
        venue: { name: 'Bondi Fish & Chip Co', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 68 },
        trial: { status: 'unsuccessful', trial_oil: XLFRY, currentPrice: 2.20, offeredPrice: 3.65,
          startDaysAgo: 30, durationDays: 8, outcomeDaysAgo: 18, reason: 'price-too-high' },
      },
      {
        venue: { name: 'Newtown Hot Food', fryer_count: 1, volume_bracket: 'under-60', current_weekly_avg: 42 },
        trial: { status: 'active', trial_oil: XLFRY, currentPrice: 2.35, offeredPrice: 3.60, startDaysAgo: 5 },
      },
    ],
  },

  // ── cstewart (QLD) — 3 trials: 1 successful, 1 pending decision, 1 pipeline ──
  cstewart: {
    state: 'QLD',
    trials: [
      {
        venue: { name: 'Fortitude Valley Chicken', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 125 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.50, offeredPrice: 3.65,
          startDaysAgo: 45, durationDays: 11, outcomeDaysAgo: 30, custCodeDaysAgo: 22,
          reason: 'cost-savings', soldPrice: 3.60, custCode: 'QLD-C01' },
      },
      {
        venue: { name: 'South Bank Seafood', fryer_count: 4, volume_bracket: '150-plus', current_weekly_avg: 190 },
        trial: { status: 'pending', trial_oil: ULTAFRY, currentPrice: 2.70, offeredPrice: 3.95,
          startDaysAgo: 18, durationDays: 11 },
      },
      {
        venue: { name: 'Toowoomba Takeaway', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 72 },
        trial: { status: 'pending', trial_oil: XLFRY, currentPrice: 2.30, offeredPrice: 3.60 },
      },
    ],
  },

  // ── ctaaffe (VIC) — 5 trials: busiest BDM, strong mixed record ──
  ctaaffe: {
    state: 'VIC',
    trials: [
      {
        venue: { name: 'Sunshine Takeaway', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 82 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.40, offeredPrice: 3.60,
          startDaysAgo: 55, durationDays: 11, outcomeDaysAgo: 38, custCodeDaysAgo: 28,
          reason: 'oil-lasted-longer', soldPrice: 3.55, custCode: 'VIC-T01' },
      },
      {
        venue: { name: 'Werribee Fish Bar', fryer_count: 1, volume_bracket: 'under-60', current_weekly_avg: 38 },
        trial: { status: 'successful', trial_oil: ULTAFRY, currentPrice: 2.15, offeredPrice: 3.88,
          startDaysAgo: 70, durationDays: 9, outcomeDaysAgo: 56, custCodeDaysAgo: 48,
          reason: 'better-food-quality', soldPrice: 3.85, custCode: 'VIC-T02' },
      },
      {
        venue: { name: 'Melton Quick Eats', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 105 },
        trial: { status: 'unsuccessful', trial_oil: XLFRY, currentPrice: 2.35, offeredPrice: 3.60,
          startDaysAgo: 35, durationDays: 7, outcomeDaysAgo: 24, reason: 'contract-locked' },
      },
      {
        venue: { name: 'Hoppers Crossing Fries', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 76 },
        trial: { status: 'accepted', trial_oil: ULTAFRY, currentPrice: 2.55, offeredPrice: 3.90,
          startDaysAgo: 22, durationDays: 8, outcomeDaysAgo: 10,
          reason: 'better-food-quality', soldPrice: 3.88 },
      },
      {
        venue: { name: 'St Albans Hot Food', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 88 },
        trial: { status: 'active', trial_oil: XLFRY, currentPrice: 2.45, offeredPrice: 3.65, startDaysAgo: 4 },
      },
    ],
  },

  // ── cbadams (NSW) — 2 trials: fewer but quick to close ──
  cbadams: {
    state: 'NSW',
    trials: [
      {
        venue: { name: 'Liverpool Chicken & Chips', fryer_count: 4, volume_bracket: '150-plus', current_weekly_avg: 175 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.55, offeredPrice: 3.60,
          startDaysAgo: 20, durationDays: 7, outcomeDaysAgo: 10, custCodeDaysAgo: 5,
          reason: 'oil-lasted-longer', soldPrice: 3.55, custCode: 'NSW-B01' },
      },
      {
        venue: { name: 'Bankstown Hot Food', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 135 },
        trial: { status: 'active', trial_oil: ULTAFRY, currentPrice: 2.60, offeredPrice: 3.88, startDaysAgo: 6 },
      },
    ],
  },

  // ── snagpal (VIC) — 4 trials: strong win rate ──
  snagpal: {
    state: 'VIC',
    trials: [
      {
        venue: { name: 'Ringwood Hot Food', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 92 },
        trial: { status: 'successful', trial_oil: ULTAFRY, currentPrice: 2.50, offeredPrice: 3.90,
          startDaysAgo: 52, durationDays: 12, outcomeDaysAgo: 35, custCodeDaysAgo: 26,
          reason: 'oil-lasted-longer', soldPrice: 3.88, custCode: 'VIC-S01' },
      },
      {
        venue: { name: 'Croydon Fish Bar', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 118 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.45, offeredPrice: 3.62,
          startDaysAgo: 65, durationDays: 10, outcomeDaysAgo: 50, custCodeDaysAgo: 40,
          reason: 'better-food-quality', soldPrice: 3.60, custCode: 'VIC-S02' },
      },
      {
        venue: { name: 'Knox City Takeaway', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 80 },
        trial: { status: 'unsuccessful', trial_oil: XLFRY, currentPrice: 2.25, offeredPrice: 3.60,
          startDaysAgo: 28, durationDays: 9, outcomeDaysAgo: 15, reason: 'price-too-high' },
      },
      {
        venue: { name: 'Bayswater Fish & Chips', fryer_count: 1, volume_bracket: 'under-60', current_weekly_avg: 48 },
        trial: { status: 'pending', trial_oil: ULTAFRY, currentPrice: 2.15, offeredPrice: 3.88 },
      },
    ],
  },

  // ── bgurovsk (VIC) — 2 additional (already has 13 from seed-sample-data) ──
  bgurovsk: {
    state: 'VIC',
    trials: [
      {
        venue: { name: 'Essendon Takeaway', fryer_count: 2, volume_bracket: '60-100', current_weekly_avg: 85 },
        trial: { status: 'successful', trial_oil: XLFRY, currentPrice: 2.40, offeredPrice: 3.62,
          startDaysAgo: 72, durationDays: 10, outcomeDaysAgo: 57, custCodeDaysAgo: 50,
          reason: 'cost-savings', soldPrice: 3.58, custCode: 'VIC-B01' },
      },
      {
        venue: { name: 'Moonee Ponds Fish Bar', fryer_count: 3, volume_bracket: '100-150', current_weekly_avg: 128 },
        trial: { status: 'active', trial_oil: ULTAFRY, currentPrice: 2.55, offeredPrice: 3.88, startDaysAgo: 7 },
      },
    ],
  },
};

// ══════════════════════════════════════════════
// INSERT ALL TRIALS
// ══════════════════════════════════════════════
let totalVenues = 0;
let totalReadings = 0;

for (const [bdmUsername, bdmData] of Object.entries(trialsByBdm)) {
  const bdm = bdmMap[bdmUsername];
  if (!bdm) { console.warn(`  WARNING: BDM '${bdmUsername}' not found — skipping`); continue; }

  const firstName = bdm.name?.split(' ')[0] || bdmUsername;
  console.log(`\n── ${bdm.name} (${bdmUsername}) — ${bdmData.trials.length} trial(s) ──`);

  for (const def of bdmData.trials) {
    const { venue: vDef, trial: tDef } = def;

    // Venue row
    const venueRow = {
      name: vDef.name,
      status: 'trial-only',
      state: bdmData.state,
      fryer_count: vDef.fryer_count,
      volume_bracket: vDef.volume_bracket,
      default_oil: pickCompOil(),
      bdm_id: bdm.id,
      customer_code: tDef.custCode || `PRS-${Date.now().toString().slice(-6)}`,
      ...(tDef.custCode && tDef.custCodeDaysAgo
        ? { customer_code_saved_at: daysAgoTs(tDef.custCodeDaysAgo) }
        : {}),
    };

    const { data: insertedVenue, error: vErr } = await supabase
      .from('venues').insert(venueRow).select().single();
    if (vErr) { console.error(`    ERR venue ${vDef.name}: ${vErr.message}`); continue; }

    // Trial row
    const startDate = tDef.startDaysAgo ? daysAgo(tDef.startDaysAgo) : null;
    const endDate = tDef.durationDays && startDate
      ? daysAgo(tDef.startDaysAgo - tDef.durationDays)
      : null;
    const outcomeDate = tDef.outcomeDaysAgo ? daysAgo(tDef.outcomeDaysAgo) : null;

    const trialRow = {
      venue_id: insertedVenue.id,
      status: tDef.status,
      trial_oil_id: tDef.trial_oil,
      notes: `${bdmData.state} | ${bdm.name}`,
      current_price_per_litre: tDef.currentPrice,
      offered_price_per_litre: tDef.offeredPrice,
      current_weekly_avg: vDef.current_weekly_avg,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
      ...(outcomeDate ? { outcome_date: outcomeDate } : {}),
      ...(tDef.reason ? { trial_reason: tDef.reason } : {}),
      ...(tDef.soldPrice ? { sold_price_per_litre: tDef.soldPrice } : {}),
    };

    const { data: insertedTrial, error: tErr } = await supabase
      .from('trials').insert(trialRow).select().single();
    if (tErr) { console.error(`    ERR trial ${vDef.name}: ${tErr.message}`); continue; }

    // Generate readings for trials that have started
    let readingCount = 0;
    if (startDate) {
      const reads = generateReadings(
        insertedVenue.id, insertedTrial.id,
        vDef.fryer_count, startDate, endDate || todayStr, firstName
      );
      if (reads.length > 0) {
        const { error: rErr } = await supabase.from('tpm_readings').insert(reads);
        if (rErr) { console.error(`    ERR readings ${vDef.name}: ${rErr.message}`); }
        else {
          readingCount = reads.length;
          totalReadings += reads.length;
          // Update venue last_tpm_date
          const latestDate = reads[reads.length - 1].reading_date;
          await supabase.from('venues').update({ last_tpm_date: latestDate }).eq('id', insertedVenue.id);
        }
      }
    }

    console.log(`    ✓ ${vDef.name} [${tDef.status}] — ${vDef.fryer_count} fryers, ${readingCount} readings`);
    totalVenues++;
  }
}

console.log(`\n════════════════════════════════════`);
console.log(`Done!`);
console.log(`  ${totalVenues} venues created`);
console.log(`  ${totalReadings} TPM readings generated`);
console.log(`  BDM breakdown:`);
for (const [username, data] of Object.entries(trialsByBdm)) {
  const bdm = bdmMap[username];
  console.log(`    ${bdm?.name || username}: ${data.trials.length} trial(s)`);
}
