// ============================================================
// Seed script — loads sample data across the Frysmart app
// All records are prefixed with [SAMPLE] for easy identification
// Uses REAL oils and competitors from the database (no fake ones)
// Run: node scripts/seed-sample-data.mjs <username> <password>
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
  console.error('❌ Auth failed:', authErr.message);
  process.exit(1);
}
console.log('✅ Authenticated\n');

const PREFIX = '[SAMPLE]';
const today = new Date().toISOString().split('T')[0];
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

// ── DELETE MODE ──
if (process.argv.includes('--delete')) {
  console.log('🗑️  Deleting all [SAMPLE] data...\n');

  // Delete readings for sample venues
  const { data: sampleVenues } = await supabase.from('venues').select('id').like('name', `${PREFIX}%`);
  if (sampleVenues?.length) {
    const ids = sampleVenues.map(v => v.id);
    const { error: readErr } = await supabase.from('tpm_readings').delete().in('venue_id', ids);
    console.log(`  tpm_readings: ${readErr ? '❌ ' + readErr.message : '✅ deleted for ' + ids.length + ' venues'}`);
  }

  // Delete sample venues
  const { error: venueErr } = await supabase.from('venues').delete().like('name', `${PREFIX}%`);
  console.log(`  venues: ${venueErr ? '❌ ' + venueErr.message : '✅ deleted'}`);

  // Delete sample groups
  const { error: groupErr } = await supabase.from('groups').delete().like('name', `${PREFIX}%`);
  console.log(`  groups: ${groupErr ? '❌ ' + groupErr.message : '✅ deleted'}`);

  // NOTE: We no longer create sample competitors or oil types — we use real ones
  console.log('\n✅ Done! All [SAMPLE] data removed.');
  process.exit(0);
}

// ── SEED MODE ──
console.log('🌱 Seeding sample data...\n');

// ── Look up REAL data from the database ──

// 1. Find BDM user (Bob) to assign trials to
const { data: bdmUser } = await supabase.from('profiles').select('id, region').eq('username', 'bgurovsk').single();
const bdmId = bdmUser?.id || null;
const bdmState = bdmUser?.region || 'VIC';
if (bdmId) console.log(`  bdm user: ✅ found (${bdmId}), region: ${bdmState}`);
else console.log('  bdm user: ⚠️  bgurovsk not found, trials will be unassigned');

// 2. Get REAL Cookers oils
const { data: realCookerOils } = await supabase.from('oil_types')
  .select('id, name, code')
  .is('competitor_id', null)
  .eq('status', 'active');
console.log(`  cookers oils: ✅ ${realCookerOils?.length || 0} found`);

// Map real oil IDs by code
const cookerOilMap = {};
realCookerOils?.forEach(o => { cookerOilMap[o.code] = o.id; });
const XLFRY_ID = cookerOilMap['XLFRY'] || null;
const ULTAFRY_ID = cookerOilMap['ULTAFRY'] || null;
const CANOLA_ID = cookerOilMap['CANOLANA'] || cookerOilMap['CANOLA'] || null;

// 3. Get REAL competitor oils (with competitor info)
const { data: realCompOils } = await supabase.from('oil_types')
  .select('id, name, code, competitor_id')
  .not('competitor_id', 'is', null)
  .eq('status', 'active');
const { data: realComps } = await supabase.from('competitors')
  .select('id, name, code')
  .eq('status', 'active');
console.log(`  competitors: ✅ ${realComps?.length || 0} found`);
console.log(`  competitor oils: ✅ ${realCompOils?.length || 0} found`);

// Build lookup: competitor code → { id, name, oils: [...] }
const compLookup = {};
realComps?.forEach(c => {
  if (!c.name.startsWith(PREFIX)) {
    compLookup[c.code] = { id: c.id, name: c.name, oils: [] };
  }
});
realCompOils?.forEach(o => {
  const comp = realComps?.find(c => c.id === o.competitor_id);
  if (comp && compLookup[comp.code]) {
    compLookup[comp.code].oils.push({ id: o.id, name: o.name });
  }
});

// Helper to pick a random competitor oil from a specific competitor
const pickCompOil = (compCode) => {
  const comp = compLookup[compCode];
  if (!comp || comp.oils.length === 0) return null;
  return comp.oils[Math.floor(Math.random() * comp.oils.length)].id;
};

// 4. Groups
const groups = [
  { name: `${PREFIX} Demo Restaurant Group`, group_code: 'DRG', username: 'demogroup', status: 'active', password: 'demo123' },
  { name: `${PREFIX} City Eats Chain`, group_code: 'CEC', username: 'cityeats', status: 'active', password: 'demo123' },
];
const { data: groupData, error: groupErr } = await supabase.from('groups').insert(groups).select();
console.log(`  groups: ${groupErr ? '❌ ' + groupErr.message : '✅ ' + groupData.length + ' inserted'}`);
const groupIds = groupData ? groupData.reduce((m, g) => { m[g.group_code] = g.id; return m; }, {}) : {};

// 5. Venues (regular + trial-only)
// - Regular venues use real Cookers oils as default_oil
// - Trial venues: ALL in Bob's state (VIC), use REAL Cookers oils for trial,
//   REAL competitor oils for current oil
// - Pricing: current_price (competitor) is LOWER, offered_price (Cookers) is HIGHER
//   Cookers oil costs more per litre but lasts longer = overall savings
const venues = [
  // Regular venues — spread across states, using real Cookers oils
  { name: `${PREFIX} The Golden Fryer`, status: 'active', customer_code: 'SAMPGF01', state: 'VIC', fryer_count: 3, volume_bracket: '100-150', default_oil: XLFRY_ID, group_id: groupIds.DRG || null },
  { name: `${PREFIX} Crispy Corner`, status: 'active', customer_code: 'SAMPCC01', state: 'NSW', fryer_count: 2, volume_bracket: 'under-60', default_oil: ULTAFRY_ID, group_id: groupIds.DRG || null },
  { name: `${PREFIX} Ocean Fish Bar`, status: 'active', customer_code: 'SAMPOF01', state: 'QLD', fryer_count: 4, volume_bracket: '150-plus', default_oil: XLFRY_ID, group_id: groupIds.CEC || null },
  { name: `${PREFIX} Burger Boulevard`, status: 'active', customer_code: 'SAMPBB01', state: 'VIC', fryer_count: 2, volume_bracket: '60-100', default_oil: ULTAFRY_ID },
  { name: `${PREFIX} Harbour Kitchen`, status: 'active', customer_code: 'SAMPHK01', state: 'SA', fryer_count: 1, volume_bracket: 'under-60', default_oil: XLFRY_ID, group_id: groupIds.CEC || null },

  // Trial-only venues — ALL in Bob's state (VIC)
  // Trial oil = Cookers XLFRY or ULTAFRY (what we're proving)
  // Current oil = competitor oil (what they currently use)
  // Current price (competitor) < Offered price (Cookers) — Cookers costs more per litre
  {
    name: `${PREFIX} Trial — Seaview Cafe`,
    status: 'trial-only',
    state: bdmState,       // Bob's state
    fryer_count: 2,
    trial_status: 'in-progress',
    trial_start_date: daysAgo(5),
    trial_oil_id: XLFRY_ID,                    // Trialling Cookers XLFRY
    default_oil: pickCompOil('OIL2'),           // Currently using OIL2U oil
    current_price_per_litre: 2.40,              // Competitor price (lower)
    offered_price_per_litre: 3.20,              // Cookers price (higher, but lasts longer)
    current_weekly_avg: 40,
    bdm_id: bdmId,
  },
  {
    name: `${PREFIX} Trial — Mountview Grill`,
    status: 'trial-only',
    state: bdmState,       // Bob's state
    fryer_count: 1,
    trial_status: 'pending',
    trial_oil_id: ULTAFRY_ID,                   // Will trial Cookers ULTAFRY
    default_oil: pickCompOil('CFM'),            // Currently using CFM oil
    current_price_per_litre: 2.10,              // Competitor price (lower)
    offered_price_per_litre: 2.85,              // Cookers price (higher, but lasts longer)
    bdm_id: bdmId,
  },
  {
    name: `${PREFIX} Trial — Eastside Takeaway`,
    status: 'trial-only',
    state: bdmState,       // Bob's state
    fryer_count: 3,
    trial_status: 'completed',
    trial_start_date: daysAgo(8),
    trial_end_date: daysAgo(1),
    trial_oil_id: XLFRY_ID,                    // Trialled Cookers XLFRY
    default_oil: pickCompOil('TROJ'),           // Was using TROJAN oil
    current_price_per_litre: 2.30,              // Competitor price (lower)
    offered_price_per_litre: 3.10,              // Cookers price (higher, but lasts longer)
    current_weekly_avg: 55,
    bdm_id: bdmId,
  },
];
const { data: venueData, error: venueErr } = await supabase.from('venues').insert(venues).select();
console.log(`  venues: ${venueErr ? '❌ ' + venueErr.message : '✅ ' + venueData.length + ' inserted'}`);

// 6. TPM Readings — for the regular venues (past 5 days)
const readings = [];
const regularVenues = venueData ? venueData.filter(v => v.status === 'active') : [];
const trialVenues = venueData ? venueData.filter(v => v.status === 'trial-only') : [];

for (const venue of regularVenues) {
  const fc = venue.fryer_count || 2;
  for (let day = 0; day < 5; day++) {
    const readDate = daysAgo(day);
    for (let fryer = 1; fryer <= fc; fryer++) {
      const oilAge = Math.min(day + 1 + Math.floor(Math.random() * 3), 7);
      const tpm = 8 + Math.floor(Math.random() * 18); // 8-25
      const litres = oilAge === 1 ? (10 + Math.floor(Math.random() * 10)) : Math.floor(Math.random() * 5);
      readings.push({
        venue_id: venue.id,
        fryer_number: fryer,
        reading_date: readDate,
        reading_number: 1,
        oil_age: oilAge,
        litres_filled: litres,
        tpm_value: tpm,
        set_temperature: 170 + Math.floor(Math.random() * 3) * 5,
        actual_temperature: 168 + Math.floor(Math.random() * 10),
        filtered: Math.random() > 0.3,
        food_type: ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Mixed Service'][Math.floor(Math.random() * 4)],
        staff_name: `${PREFIX} Staff`,
        not_in_use: false,
      });
    }
  }
}

// Trial readings — Cookers oil performs BETTER (lower TPM, lasts longer)
for (const venue of trialVenues.filter(v => v.trial_status === 'in-progress' || v.trial_status === 'completed')) {
  const fc = venue.fryer_count || 1;
  const startDate = venue.trial_start_date || daysAgo(14);
  const daysToSeed = Math.min(10, Math.ceil((new Date() - new Date(startDate)) / 86400000));
  for (let day = 0; day < daysToSeed; day++) {
    const readDate = daysAgo(day);
    if (readDate < startDate) continue;
    for (let fryer = 1; fryer <= fc; fryer++) {
      const oilAge = Math.min(day + 1, 5);
      // Cookers trial oil: lower TPM (6-19) = better performance
      const tpm = 6 + Math.floor(Math.random() * 14);
      readings.push({
        venue_id: venue.id,
        fryer_number: fryer,
        reading_date: readDate,
        reading_number: 1,
        oil_age: oilAge,
        litres_filled: oilAge === 1 ? (8 + Math.floor(Math.random() * 8)) : Math.floor(Math.random() * 3),
        tpm_value: tpm,
        set_temperature: 175,
        actual_temperature: 172 + Math.floor(Math.random() * 6),
        filtered: true,
        food_type: 'Chips/Fries',
        staff_name: `${PREFIX} BDM`,
        not_in_use: false,
      });
    }
  }
}

if (readings.length > 0) {
  const { data: readData, error: readErr } = await supabase.from('tpm_readings').insert(readings).select();
  console.log(`  tpm_readings: ${readErr ? '❌ ' + readErr.message : '✅ ' + readData.length + ' inserted'}`);
} else {
  console.log('  tpm_readings: ⏭️  no readings to insert');
}

console.log('\n✅ Done! All sample data is prefixed with [SAMPLE].');
console.log('   Uses REAL Cookers oils (XLFRY, ULTAFRY) and REAL competitor oils (OIL2U, CFM, TROJAN).');
console.log('   Trial venues all in ' + bdmState + ' (Bob\'s region).');
console.log('   Pricing: competitor (current) < Cookers (offered) — Cookers costs more but lasts longer.');
console.log('   To delete: node scripts/seed-sample-data.mjs <username> <password> --delete');
