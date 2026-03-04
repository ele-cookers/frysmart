// ============================================================
// seed-all-bdms.mjs — seeds realistic trial data for all BDMs
// Run:    node scripts/seed-all-bdms.mjs <username> <password>
// Delete: node scripts/seed-all-bdms.mjs <username> <password> --delete
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mznlwouvgbnexmirwofd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.filter(a => !a.startsWith('--'));
const username = args[2];
const pw = args[3];

if (!username || !pw) {
  console.error('Usage: node scripts/seed-all-bdms.mjs <username> <password> [--delete]');
  process.exit(1);
}

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${username.trim()}@frysmart.app`,
  password: pw,
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log(`Authenticated as ${username}\n`);

const BDM_USERNAMES = ['aswan', 'cstewart', 'ctaaffe', 'cbadams', 'snagpal', 'bgurovsk'];

const { data: bdmProfiles } = await supabase
  .from('profiles')
  .select('id, name, username, region')
  .in('username', BDM_USERNAMES);

if (!bdmProfiles?.length) { console.error('No BDM profiles found'); process.exit(1); }
console.log(`Found ${bdmProfiles.length} BDM profiles\n`);

// ── Date helpers ──
const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const daysAgoTs = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString(); };
const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ── Fetch oil types ──
const { data: cookerOils } = await supabase.from('oil_types').select('id, code').is('competitor_id', null).eq('status', 'active');
const cookerMap = {};
cookerOils?.forEach(o => { cookerMap[o.code] = o.id; });
const XLFRY = cookerMap['XLFRY'] || null;
const ULTAFRY = cookerMap['ULTAFRY'] || null;

const { data: compOils } = await supabase.from('oil_types').select('id').not('competitor_id', 'is', null).eq('status', 'active');
const compOilIds = compOils?.map(o => o.id) || [];
const pickCompOil = () => compOilIds.length ? compOilIds[Math.floor(Math.random() * compOilIds.length)] : null;

console.log(`Oils — XLFRY: ${XLFRY ? 'yes' : 'NO'}, ULTAFRY: ${ULTAFRY ? 'yes' : 'NO'}, competitor oils: ${compOilIds.length}\n`);

// ── Venue name pools by state ──
const VENUE_POOLS = {
  VIC: [
    'Bayside Fish & Chips', 'Doncaster Takeaway', 'Richmond Takeaway', 'South Yarra Grill',
    'Brunswick Street Fryer', 'St Kilda Seafood Bar', 'Fitzroy Chicken Shop', 'Preston Fish Bar',
    'Hawthorn Hot Foods', 'Coburg Kebab & Chips', 'Footscray Golden Fry', 'Dandenong Quick Eats',
    'Frankston Fish House', 'Bentleigh Fryer', 'Reservoir Takeaway', 'Sunshine Fish & Chips',
  ],
  NSW: [
    'Parramatta Fish & Chips', 'Newtown Fryer', 'Bondi Takeaway', 'Surry Hills Chicken',
    'Liverpool Quick Eats', 'Penrith Golden Fry', 'Hurstville Seafood Bar', 'Blacktown Hot Foods',
    'Hornsby Fish Bar', 'Chatswood Takeaway', 'Campbelltown Fryer', 'Bankstown Kebab & Chips',
    'Castle Hill Fish House', 'Auburn Quick Eats', 'Fairfield Takeaway', 'Sutherland Fish Bar',
  ],
  QLD: [
    'Fortitude Valley Kebabs', 'Calamvale Chicken', 'Sunnybank Fish & Chips', 'Indooroopilly Fryer',
    'Toowong Takeaway', 'Chermside Quick Eats', 'Logan Fish Bar', 'Ipswich Golden Fry',
    'Redlands Seafood Bar', 'Robina Fish House', 'Southport Takeaway', 'Nerang Fryer',
    'Beenleigh Hot Foods', 'Strathpine Quick Eats', 'Caboolture Fish & Chips', 'Narangba Takeaway',
  ],
  SA: [
    'Glenelg Seafood', 'Norwood Fish Bar', 'Marion Takeaway', 'Modbury Fryer',
    'Elizabeth Quick Eats', 'Salisbury Fish & Chips', 'Tea Tree Gully Chicken', 'Hindmarsh Hot Foods',
    'Para Hills Golden Fry', 'Reynella Kebab & Chips', 'Morphett Vale Fryer', 'Christies Beach Fish Bar',
    'Port Noarlunga Takeaway', 'Hallett Cove Quick Eats', 'Seaford Fish House', 'Aldinga Fryer',
  ],
  WA: [
    'Fremantle Fryer', 'Subiaco Takeaway', 'Morley Fish & Chips', 'Joondalup Seafood Bar',
    'Rockingham Hot Foods', 'Mandurah Golden Fry', 'Midland Kebab & Chips', 'Armadale Quick Eats',
    'Cannington Fish Bar', 'Thornlie Takeaway', 'Bentley Fryer', 'Belmont Fish House',
    'Victoria Park Quick Eats', 'Canning Vale Takeaway', 'Gosnells Fish & Chips', 'Kelmscott Fryer',
  ],
};

function resolveState(region) {
  if (!region) return 'VIC';
  if (/vic/i.test(region)) return 'VIC';
  if (/nsw|new south/i.test(region)) return 'NSW';
  if (/qld|queensland/i.test(region)) return 'QLD';
  if (/\bsa\b|south aus/i.test(region)) return 'SA';
  if (/\bwa\b|western/i.test(region)) return 'WA';
  return 'VIC';
}

// ── Notes / food types ──
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
  'Oil still clear at day 5 — impressive for this volume',
  'Owner asked about pricing for ongoing supply',
  'Filtered and topped up 2L — very little wastage',
  'Fryer running perfectly, no issues to report',
];
const FOOD_TYPES = ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Mixed Service'];
const maybeNote = (pct = 0.3) => Math.random() < pct ? NOTES[Math.floor(Math.random() * NOTES.length)] : null;

const tpmByDay = [[4,7],[6,9],[8,12],[10,14],[12,16],[14,18],[16,20],[18,22]];

function generateReadings(venueId, trialId, fryerCount, startDate, endDate, staffName) {
  const readings = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date(today);

  for (let fryer = 1; fryer <= fryerCount; fryer++) {
    let oilAge = 1;
    const cur = new Date(start);
    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      if (oilAge > randBetween(6, 8)) oilAge = 1;
      const [tpmMin, tpmMax] = tpmByDay[Math.min(oilAge - 1, tpmByDay.length - 1)];
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
        staff_name: staffName,
        not_in_use: false,
        notes: maybeNote(isFresh ? 0.6 : oilAge >= 5 ? 0.4 : 0.25),
      });
      oilAge++;
      cur.setDate(cur.getDate() + 1);
    }
  }
  return readings;
}

// ── Trial template (13 trials per BDM) ──
// Won trials get a customer code generated at seed time
function buildTrialDefs(stateCode) {
  return [
    // PENDING (2)
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 75  }, t: { status: 'pipeline',     oil: XLFRY,  curPrice: 2.35, offPrice: 3.10, createdDaysAgo: 2 } },
    { v: { fryer_count: 3, volume_bracket: '100-150',  weekly_avg: 120 }, t: { status: 'pipeline',     oil: ULTAFRY,curPrice: 2.20, offPrice: 2.95, createdDaysAgo: 1 } },
    // IN-PROGRESS (3)
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 80  }, t: { status: 'active', oil: XLFRY,  curPrice: 2.40, offPrice: 3.20, startDaysAgo: 3 } },
    { v: { fryer_count: 4, volume_bracket: '150-plus', weekly_avg: 180 }, t: { status: 'active', oil: XLFRY,  curPrice: 2.55, offPrice: 3.35, startDaysAgo: 6 } },
    { v: { fryer_count: 1, volume_bracket: 'under-60', weekly_avg: 45  }, t: { status: 'active', oil: ULTAFRY,curPrice: 2.15, offPrice: 2.85, startDaysAgo: 8 } },
    // COMPLETED (2)
    { v: { fryer_count: 3, volume_bracket: '100-150',  weekly_avg: 110 }, t: { status: 'pending',   oil: XLFRY,  curPrice: 2.45, offPrice: 3.25, startDaysAgo: 12, durationDays: 8 } },
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 70  }, t: { status: 'pending',   oil: XLFRY,  curPrice: 2.30, offPrice: 3.05, startDaysAgo: 10, durationDays: 7 } },
    // ACCEPTED (1)
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 85  }, t: { status: 'accepted',    oil: XLFRY,  curPrice: 2.40, offPrice: 3.15, startDaysAgo: 18, durationDays: 9, outcomeDaysAgo: 6, reason: 'oil-lasted-longer', soldPrice: 3.05 } },
    // WON (3)
    { v: { fryer_count: 3, volume_bracket: '100-150',  weekly_avg: 130 }, t: { status: 'successful', oil: XLFRY,  curPrice: 2.50, offPrice: 3.30, startDaysAgo: 30, durationDays: 10, outcomeDaysAgo: 15, reason: 'better-food-quality', soldPrice: 3.15, custCode: `${stateCode}-001` } },
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 90  }, t: { status: 'successful', oil: ULTAFRY,curPrice: 2.25, offPrice: 2.90, startDaysAgo: 25, durationDays:  7, outcomeDaysAgo: 12, reason: 'cost-savings',       soldPrice: 2.80, custCode: `${stateCode}-002` } },
    { v: { fryer_count: 4, volume_bracket: '150-plus', weekly_avg: 160 }, t: { status: 'successful', oil: XLFRY,  curPrice: 2.60, offPrice: 3.40, startDaysAgo: 35, durationDays:  9, outcomeDaysAgo: 20, reason: 'oil-lasted-longer',  soldPrice: 3.25, custCode: `${stateCode}-003` } },
    // LOST (2)
    { v: { fryer_count: 2, volume_bracket: '60-100',   weekly_avg: 65  }, t: { status: 'unsuccessful', oil: XLFRY,  curPrice: 2.10, offPrice: 3.00, startDaysAgo: 22, durationDays: 8, outcomeDaysAgo: 10, reason: 'price-too-high'     } },
    { v: { fryer_count: 3, volume_bracket: '100-150',  weekly_avg: 100 }, t: { status: 'unsuccessful', oil: XLFRY,  curPrice: 2.45, offPrice: 3.20, startDaysAgo: 28, durationDays:10, outcomeDaysAgo: 14, reason: 'contract-locked'    } },
  ];
}

// ══════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════
const isDelete = process.argv.includes('--delete');
let grandTotal = 0;

for (const bdm of bdmProfiles) {
  const bdmName = bdm.name || bdm.username;
  const firstName = bdmName.split(' ')[0];
  const lastInitial = (bdmName.split(' ')[1] || '').charAt(0);
  const staffName = lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  const stateCode = resolveState(bdm.region);
  const venuePool = VENUE_POOLS[stateCode] || VENUE_POOLS.VIC;

  console.log(`── ${bdmName} (${bdm.username}) — ${stateCode} ──`);

  // Wipe this BDM's trial-only venues (scoped — won't touch other BDMs)
  const { data: existing } = await supabase
    .from('venues').select('id').eq('status', 'trial-only').eq('bdm_id', bdm.id);

  if (existing?.length) {
    const ids = existing.map(v => v.id);
    await supabase.from('tpm_readings').delete().in('venue_id', ids);
    await supabase.from('trials').delete().in('venue_id', ids);
    await supabase.from('venues').delete().in('id', ids);
    console.log(`  Wiped ${ids.length} old trial venues`);
  }

  if (isDelete) { console.log(`  Done.\n`); continue; }

  // Shuffle venue names for variety
  const venueNames = [...venuePool].sort(() => Math.random() - 0.5);
  const trialDefs = buildTrialDefs(stateCode);

  let bdmReadings = 0;
  for (let i = 0; i < trialDefs.length; i++) {
    const { v: vDef, t: tDef } = trialDefs[i];
    const venueName = venueNames[i] ?? `${stateCode} Venue ${i + 1}`;
    const prospectCode = `${stateCode}-PRS-${String(i + 1).padStart(4, '0')}`;

    const { data: venue, error: vErr } = await supabase.from('venues').insert({
      name: venueName,
      status: 'trial-only',
      state: stateCode,
      fryer_count: vDef.fryer_count,
      volume_bracket: vDef.volume_bracket,
      default_oil: pickCompOil(),
      bdm_id: bdm.id,
      customer_code: tDef.custCode || prospectCode,
      ...(tDef.custCode ? { customer_code_saved_at: daysAgoTs(tDef.outcomeDaysAgo || 0) } : {}),
    }).select().single();
    if (vErr) { console.error(`  ERR venue "${venueName}": ${vErr.message}`); continue; }

    const startDate   = tDef.startDaysAgo  ? daysAgo(tDef.startDaysAgo) : null;
    const endDate     = tDef.durationDays && startDate ? daysAgo(tDef.startDaysAgo - tDef.durationDays) : null;
    const outcomeDate = tDef.outcomeDaysAgo ? daysAgo(tDef.outcomeDaysAgo) : null;

    const { data: trial, error: tErr } = await supabase.from('trials').insert({
      venue_id: venue.id,
      status: tDef.status,
      trial_oil_id: tDef.oil,
      notes: `${stateCode}-TRL-${String(i + 1).padStart(4, '0')}`,
      current_price_per_litre: tDef.curPrice,
      offered_price_per_litre: tDef.offPrice,
      current_weekly_avg: vDef.weekly_avg,
      ...(startDate   ? { start_date:    startDate   } : {}),
      ...(endDate     ? { end_date:      endDate     } : {}),
      ...(outcomeDate ? { outcome_date:  outcomeDate } : {}),
      ...(tDef.reason    ? { trial_reason:          tDef.reason    } : {}),
      ...(tDef.soldPrice ? { sold_price_per_litre:  tDef.soldPrice } : {}),
    }).select().single();
    if (tErr) { console.error(`  ERR trial "${venueName}": ${tErr.message}`); continue; }

    if (startDate) {
      const readings = generateReadings(venue.id, trial.id, vDef.fryer_count, startDate, endDate || todayStr, staffName);
      if (readings.length) {
        const { error: rErr } = await supabase.from('tpm_readings').insert(readings);
        if (rErr) console.error(`  ERR readings "${venueName}": ${rErr.message}`);
        else {
          bdmReadings += readings.length;
          const latestDate = readings[readings.length - 1]?.reading_date;
          if (latestDate) await supabase.from('venues').update({ last_tpm_date: latestDate }).eq('id', venue.id);
        }
      }
    }

    const label = { pipeline:'PENDING','active':'ACTIVE',completed:'DECISION',accepted:'ACCEPTED',won:'WON',lost:'LOST' }[tDef.status];
    console.log(`  [${label}] ${venueName}`);
  }

  console.log(`  → ${trialDefs.length} venues, ${bdmReadings} readings\n`);
  grandTotal += bdmReadings;
}

if (!isDelete) {
  console.log(`Done!`);
  console.log(`  ${BDM_USERNAMES.length} BDMs seeded`);
  console.log(`  13 trial venues per BDM (2 pending, 3 active, 2 awaiting, 1 accepted, 3 won, 2 lost)`);
  console.log(`  Total TPM readings: ${grandTotal}`);
}
