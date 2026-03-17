// ============================================================
// seed-ctaaffe.mjs — Clean 6-trial seed for ctaaffe (one per status)
//
// Fixes applied vs previous seed:
//   - Wipes ALL ctaaffe trial-only venues first (no duplicates)
//   - Food types fetched from system_settings (falls back to hardcoded list)
//   - litres_filled is always integer (no decimals)
//   - Goal keys match current GOAL_OPTIONS in BDMTrialsView
//   - Venue names prefixed with (TEST)
//   - Trials are 7-10 days long
//
// Run:    node scripts/seed-ctaaffe.mjs <username> <password>
// Delete: node scripts/seed-ctaaffe.mjs <username> <password> --delete
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mznlwouvgbnexmirwofd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J_9Q_QpAw10oi3AAV3TIQw_CtU2DAKL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.filter(a => !a.startsWith('--'));
const username = args[2];
const pw = args[3];
const isDelete = process.argv.includes('--delete');

if (!username || !pw) {
  console.error('Usage: node scripts/seed-ctaaffe.mjs <username> <password> [--delete]');
  process.exit(1);
}

// ── Auth ──
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${username.trim()}@frysmart.app`,
  password: pw,
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log(`Authenticated as ${username}\n`);

// ── Look up ctaaffe profile ──
const { data: bdm } = await supabase
  .from('profiles').select('id, name, username, region').eq('username', 'ctaaffe').single();
if (!bdm) { console.error('ctaaffe profile not found'); process.exit(1); }
console.log(`BDM: ${bdm.name || 'ctaaffe'} (${bdm.username}), region: ${bdm.region || 'VIC'}\n`);

// ── Wipe ALL existing trial-only venues for ctaaffe ──
const { data: existing } = await supabase
  .from('venues').select('id').eq('status', 'trial-only').eq('bdm_id', bdm.id);
if (existing?.length) {
  const ids = existing.map(v => v.id);
  await supabase.from('tpm_readings').delete().in('venue_id', ids);
  await supabase.from('trials').delete().in('venue_id', ids);
  await supabase.from('venues').delete().in('id', ids);
  console.log(`Wiped ${ids.length} existing trial venue(s) for ctaaffe\n`);
} else {
  console.log('No existing trial data found for ctaaffe\n');
}

if (isDelete) {
  console.log('Done — all ctaaffe trial data removed.');
  process.exit(0);
}

// ── Look up oils ──
const { data: cookerOils } = await supabase
  .from('oil_types').select('id, code').is('competitor_id', null).eq('status', 'active');
const cookerMap = {};
cookerOils?.forEach(o => { cookerMap[o.code] = o.id; });
const XLFRY   = cookerMap['XLFRY']   || null;
const ULTAFRY = cookerMap['ULTAFRY'] || null;

const { data: compOils } = await supabase
  .from('oil_types').select('id').not('competitor_id', 'is', null).eq('status', 'active');
const compOilIds = compOils?.map(o => o.id) || [];
const pickCompOil = () => compOilIds.length ? compOilIds[Math.floor(Math.random() * compOilIds.length)] : null;

console.log(`Oils — XLFRY: ${XLFRY ? 'found' : 'NOT FOUND'}, ULTAFRY: ${ULTAFRY ? 'found' : 'NOT FOUND'}`);

// ── Food types: fetch from system_settings, fall back to app defaults ──
const { data: sysRow } = await supabase
  .from('system_settings').select('food_type_options').eq('id', 1).single();
const FOOD_TYPES = (sysRow?.food_type_options?.length)
  ? sysRow.food_type_options
  : ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Plain Proteins', 'Pastries/Donuts', 'High Starch', 'Mixed Service'];
console.log(`Food types (${FOOD_TYPES.length}): ${FOOD_TYPES.join(', ')}\n`);

// ── Date helpers ──
const today   = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgo  = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const daysAgoTs = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString(); };

// ── Randomise helpers (integers only — no decimals) ──
const randInt  = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const maybeNote = (pct = 0.3) => {
  if (Math.random() >= pct) return null;
  const NOTES = [
    'Oil looking clear, good colour',
    'Slight foam on surface — will filter tomorrow',
    'Customer mentioned chips are crispier than usual',
    'Changed oil — TPM was climbing',
    'Filtered before service, nice improvement',
    'Owner noticed less oil smell in the shop',
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
  return NOTES[Math.floor(Math.random() * NOTES.length)];
};

// TPM range by oil age day (Cookers oil = slower degradation)
const TPM_BY_DAY = [
  [4,  7],  // day 1 fresh
  [6,  9],  // day 2
  [8, 12],  // day 3
  [10,14],  // day 4
  [12,16],  // day 5
  [14,18],  // day 6
  [16,20],  // day 7
  [18,22],  // day 8+
];

function generateReadings(venueId, trialId, fryerCount, startDate, endDate) {
  const readings = [];
  const start = new Date(startDate + 'T00:00:00');
  const end   = endDate ? new Date(endDate + 'T00:00:00') : new Date(today);

  for (let fryer = 1; fryer <= fryerCount; fryer++) {
    let oilAge = 1;
    const cur = new Date(start);

    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];

      // Oil change cycle: 6–8 days
      if (oilAge > randInt(6, 8)) oilAge = 1;

      const [tpmMin, tpmMax] = TPM_BY_DAY[Math.min(oilAge - 1, TPM_BY_DAY.length - 1)];
      const setTemp  = [170, 175, 180][Math.floor(Math.random() * 3)];
      const isFresh  = oilAge === 1;

      // litres_filled: always integer — fresh fill 12–20L, top-up 1–4L, or 0
      const litresFilled = isFresh
        ? randInt(12, 20)
        : (Math.random() < 0.3 ? randInt(1, 4) : 0);

      readings.push({
        venue_id:           venueId,
        trial_id:           trialId,
        fryer_number:       fryer,
        reading_date:       dateStr,
        reading_number:     1,
        oil_age:            oilAge,
        litres_filled:      litresFilled,           // integer, never decimal
        tpm_value:          randInt(tpmMin, tpmMax),
        set_temperature:    setTemp,
        actual_temperature: setTemp + randInt(-3, 3),
        filtered:           isFresh ? true : Math.random() < 0.7,
        food_type:          FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)],
        not_in_use:         false,
        notes:              maybeNote(isFresh ? 0.6 : oilAge >= 5 ? 0.4 : 0.25),
      });

      oilAge++;
      cur.setDate(cur.getDate() + 1);
    }
  }
  return readings;
}

// ── State from region ──
const STATE = (() => {
  const r = bdm.region || '';
  if (/vic/i.test(r))           return 'VIC';
  if (/nsw|new south/i.test(r)) return 'NSW';
  if (/qld|queensland/i.test(r))return 'QLD';
  if (/\bsa\b|south aus/i.test(r)) return 'SA';
  if (/\bwa\b|western/i.test(r))return 'WA';
  return 'VIC';
})();

// ── Goal keys — must exactly match GOAL_OPTIONS in BDMTrialsView ──
// Valid keys: 'save-money' | 'reduce-waste' | 'food-quality' | 'food-colour' | 'reduce-changes' | 'extend-life'
const mkGoalsLine    = (...keys) => `[Goals: ${keys.join(', ')}]`;
const mkAchievedLine = (...keys) => `[GoalsAchieved: ${keys.join(', ')}]`;
const mkFindingsLine = (text)    => `[TrialFindings: ${text}]`;

// ── 6 trial definitions — one per status ──
const TRIAL_DEFS = [
  // 1. PIPELINE — created recently, not yet started
  {
    venueName:  '(TEST) Northside Fish & Chips',
    fryerCount: 2, volumeBracket: '60-100', weeklyAvg: 75,
    status: 'pipeline',
    trialOil: XLFRY, curPrice: 2.35, offPrice: 3.10,
    goalKeys: ['save-money', 'reduce-waste'],
    achievedKeys: [],
    notes: 'Met with owner last week — currently on Canola at $2.35/L, going through around 75L/week. He changes oil by eye, no testing. Fryer 2 gets hammered on Friday nights. He\'s open to trying something different if we can show real savings. Key watch: book the first visit on a busy service day so the TPM data lands with impact.',
  },

  // 2. ACTIVE — trial running now (started 7 days ago)
  {
    venueName:  '(TEST) Southgate Takeaway',
    fryerCount: 3, volumeBracket: '100-150', weeklyAvg: 110,
    status: 'active',
    trialOil: XLFRY, curPrice: 2.40, offPrice: 3.20,
    startDaysAgo: 7,
    goalKeys: ['save-money', 'food-quality', 'extend-life'],
    achievedKeys: [],
    notes: 'Owner (Mike) has been with same supplier 3+ years but says oil doesn\'t last like it used to. A few customer comments about soggy chips recently. Heavy crumbed chicken and chips menu. Biggest concern is price — he was nervous going above $2.40/L. Showed him the lifespan comparison numbers and he was genuinely intrigued. Three fryers running fairly hard across lunch and dinner.',
  },

  // 3. PENDING — trial ended, awaiting decision (9-day trial, ended 2 days ago)
  {
    venueName:  '(TEST) Eastside Grill',
    fryerCount: 2, volumeBracket: '60-100', weeklyAvg: 80,
    status: 'pending',
    trialOil: XLFRY, curPrice: 2.45, offPrice: 3.25,
    startDaysAgo: 11, durationDays: 9,
    goalKeys: ['save-money', 'reduce-changes', 'extend-life'],
    achievedKeys: [],
    findings: 'Oil held up well across the full 9-day trial. TPM stayed below 18 throughout. Customer noted noticeably better chip colour and crispness.',
    notes: 'Small operation, owner does everything himself — 2 fryers, mostly chips and flathead. He\'s been changing oil every 3–4 days purely on colour because he has no way to test it. Told him a TPM meter would transform how he manages the fryer. Competitor oil is cheap but he\'s clearly over-changing and throwing money away. If we can reduce his change frequency by even 2 days, the savings argument is bulletproof.',
  },

  // 4. ACCEPTED — won, waiting on customer code (8-day trial, accepted 4 days ago)
  {
    venueName:  '(TEST) Westport Chicken & Chips',
    fryerCount: 2, volumeBracket: '60-100', weeklyAvg: 85,
    status: 'accepted',
    trialOil: XLFRY, curPrice: 2.40, offPrice: 3.15,
    startDaysAgo: 15, durationDays: 8, outcomeDaysAgo: 4,
    reason: 'oil-lasted-longer', soldPrice: 3.05,
    goalKeys: ['save-money', 'reduce-waste', 'extend-life'],
    achievedKeys: ['save-money', 'extend-life'],
    findings: 'Oil lasted 8 days vs their usual 5 days with competitor oil. Owner confirmed they will switch. Customer code pending.',
    notes: 'Sharon runs a tight operation — busy lunch and dinner, lots of chicken pieces and chips. Frustrated that oil breaks down fast in summer. Both fryers at 180°. Main angle is lifespan — if we can show 2+ extra days per cycle the savings argument writes itself. She wants to see the numbers before committing, so make sure every reading is logged and the report is clean.',
  },

  // 5. SUCCESSFUL — trial won with customer code (10-day trial, won 8 days ago)
  {
    venueName:  '(TEST) Central Fish Bar',
    fryerCount: 3, volumeBracket: '100-150', weeklyAvg: 130,
    status: 'successful',
    trialOil: XLFRY, curPrice: 2.50, offPrice: 3.30,
    startDaysAgo: 22, durationDays: 10, outcomeDaysAgo: 8,
    reason: 'better-food-quality', soldPrice: 3.15,
    custCode: `${STATE}-9001`,
    goalKeys: ['save-money', 'food-quality', 'reduce-waste', 'extend-life'],
    achievedKeys: ['save-money', 'food-quality', 'extend-life'],
    findings: 'Outstanding result. TPM peaked at 20 on day 10 vs competitor baseline of 26+ by day 6. Food quality improvement noted by both owner and customers. Customer converted at $3.15/L.',
    notes: 'High-volume shop — 3 fryers flat out from 11am every day. Tony has heard of Cookers but always assumed it was too expensive. Oil goes dark fast, changing every 5 days, staff complaining about the smell during service. Think this one has real potential if we nail the food quality story — his chips are what the locals come for. Push the comparison data hard on the first visit.',
  },

  // 6. UNSUCCESSFUL — trial lost (8-day trial, marked unsuccessful 5 days ago)
  {
    venueName:  '(TEST) Harbour Kebab & Chips',
    fryerCount: 2, volumeBracket: '60-100', weeklyAvg: 65,
    status: 'unsuccessful',
    trialOil: XLFRY, curPrice: 2.10, offPrice: 3.00,
    startDaysAgo: 17, durationDays: 8, outcomeDaysAgo: 5,
    reason: 'price-too-high',
    goalKeys: ['save-money', 'food-quality'],
    achievedKeys: [],
    findings: 'Trial showed clear TPM improvement but owner was unwilling to move from $2.10/L. Price gap too large to bridge at this stage. Follow up in 6 months.',
    notes: 'Small shop, 2 fryers, decent lunch trade, mostly kebabs and chips. Owner buys oil from a wholesale club in bulk — paying $2.10/L. Very price sensitive, margins are tight. Acknowledged the oil goes dark by end of service but doesn\'t see it as a problem. Going to be a tough sell purely on price — need to focus entirely on oil life and show him exactly how many fewer changes he\'d need to do per month.',
  },
];

// ══════════════════════════════════════════════
// INSERT ALL 6 TRIALS
// ══════════════════════════════════════════════
console.log('Seeding 6 trials for ctaaffe...\n');
let totalReadings = 0;

for (let i = 0; i < TRIAL_DEFS.length; i++) {
  const def = TRIAL_DEFS[i];
  const prospectCode = `PRS-${String(9000 + i + 1).padStart(4, '0')}`;

  // ── Insert venue ──
  const { data: venue, error: vErr } = await supabase.from('venues').insert({
    name:             def.venueName,
    status:           'trial-only',
    state:            STATE,
    fryer_count:      def.fryerCount,
    volume_bracket:   def.volumeBracket,
    default_oil:      pickCompOil(),
    bdm_id:           bdm.id,
    customer_code:    def.custCode || prospectCode,
    ...(def.custCode ? { customer_code_saved_at: daysAgoTs(def.outcomeDaysAgo || 0) } : {}),
  }).select().single();

  if (vErr) { console.error(`  ERR venue "${def.venueName}": ${vErr.message}`); continue; }

  // ── Build trial notes ──
  const trialIdLine  = `TRL-${String(9000 + i + 1).padStart(4, '0')}`;
  const notesLines   = [trialIdLine];
  if (def.goalKeys?.length)     notesLines.push(mkGoalsLine(...def.goalKeys));
  if (def.achievedKeys?.length) notesLines.push(mkAchievedLine(...def.achievedKeys));
  if (def.findings)             notesLines.push(mkFindingsLine(def.findings));
  if (def.notes)                notesLines.push(def.notes);
  const trialNotes   = notesLines.filter(Boolean).join('\n');

  // ── Date calculations ──
  const startDate   = def.startDaysAgo  ? daysAgo(def.startDaysAgo)  : null;
  const endDate     = (def.durationDays && startDate) ? daysAgo(def.startDaysAgo - def.durationDays) : null;
  const outcomeDate = def.outcomeDaysAgo ? daysAgo(def.outcomeDaysAgo) : null;

  // ── Insert trial ──
  const { data: trial, error: tErr } = await supabase.from('trials').insert({
    venue_id:                 venue.id,
    status:                   def.status,
    trial_oil_id:             def.trialOil,
    notes:                    trialNotes,
    current_price_per_litre:  def.curPrice,
    offered_price_per_litre:  def.offPrice,
    current_weekly_avg:       def.weeklyAvg,
    ...(startDate   ? { start_date:            startDate   } : {}),
    ...(endDate     ? { end_date:              endDate     } : {}),
    ...(outcomeDate ? { outcome_date:          outcomeDate } : {}),
    ...(def.reason    ? { trial_reason:          def.reason    } : {}),
    ...(def.soldPrice ? { sold_price_per_litre:  def.soldPrice } : {}),
  }).select().single();

  if (tErr) { console.error(`  ERR trial "${def.venueName}": ${tErr.message}`); continue; }

  // ── Generate readings for started trials ──
  let readingCount = 0;
  if (startDate) {
    const readings = generateReadings(venue.id, trial.id, def.fryerCount, startDate, endDate || todayStr);
    if (readings.length) {
      const { error: rErr } = await supabase.from('tpm_readings').insert(readings);
      if (rErr) {
        console.error(`  ERR readings "${def.venueName}": ${rErr.message}`);
      } else {
        readingCount   = readings.length;
        totalReadings += readings.length;
        const latestDate = readings[readings.length - 1].reading_date;
        await supabase.from('venues').update({ last_tpm_date: latestDate }).eq('id', venue.id);
      }
    }
  }

  const label = def.status.toUpperCase().padEnd(12);
  const readStr = startDate ? `, ${readingCount} readings` : ', no readings yet';
  console.log(`  [${label}] ${def.venueName} (${def.fryerCount} fryers${readStr})`);
  if (def.goalKeys?.length) {
    console.log(`              Goals: ${def.goalKeys.join(', ')}`);
  }
}

console.log(`\n✓ Done!`);
console.log(`  6 trial venues created for ctaaffe (${STATE})`);
console.log(`  Total TPM readings: ${totalReadings}`);
console.log(`  All litres_filled values are integers (no decimals)`);
console.log(`  Goal keys match current app GOAL_OPTIONS`);
console.log(`  Food types sourced from: ${sysRow?.food_type_options?.length ? 'system_settings' : 'app defaults'}`);
