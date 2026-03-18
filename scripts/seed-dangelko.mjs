// ============================================================
// seed-dangelko.mjs — Realistic 6-trial seed for dangelko (one per status)
//
// Scenarios:
//   1. PIPELINE    — venue qualified, trial not yet started
//   2. ACTIVE      — trial running (7 days in)
//   3. PENDING     — 7-day trial ended, assessment complete, awaiting decision
//   4. ACCEPTED    — won on lifespan story, awaiting customer code
//   5. SUCCESSFUL  — outstanding result, customer converted & coded
//   6. UNSUCCESSFUL — oil quality evident, price gap too large to bridge
//
// Rules:
//   - All trials exactly 7 days
//   - Day 1: all fryers get a fresh fill (oil_age = 1, 14–20L)
//   - Cookers oil: slow TPM rise, holds 7 days without needing a change
//   - Competitor baseline: oil changed every 5–6 days (FryerChanges)
//   - Assessment dropdown values strictly match app options
//   - All venue names prefixed with (TEST)
//
// Run:    node scripts/seed-dangelko.mjs dangelko dangelko
// Delete: node scripts/seed-dangelko.mjs dangelko dangelko --delete
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
  console.error('Usage: node scripts/seed-dangelko.mjs <username> <password> [--delete]');
  process.exit(1);
}

// ── Auth ──
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: `${username.trim()}@frysmart.app`,
  password: pw,
});
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log(`Authenticated as ${username}\n`);

// ── Look up dangelko profile ──
const { data: bdm } = await supabase
  .from('profiles').select('id, name, username, region').eq('username', 'dangelko').single();
if (!bdm) { console.error('dangelko profile not found'); process.exit(1); }
console.log(`BDM: ${bdm.name || 'dangelko'} (${bdm.username}), region: ${bdm.region || 'VIC'}\n`);

// ── Wipe ALL existing trial-only venues for dangelko ──
const { data: existing } = await supabase
  .from('venues').select('id').eq('status', 'trial-only').eq('bdm_id', bdm.id);
if (existing?.length) {
  const ids = existing.map(v => v.id);
  await supabase.from('tpm_readings').delete().in('venue_id', ids);
  await supabase.from('trials').delete().in('venue_id', ids);
  await supabase.from('venues').delete().in('id', ids);
  console.log(`Wiped ${ids.length} existing trial venue(s) for dangelko\n`);
} else {
  console.log('No existing trial data found for dangelko\n');
}

if (isDelete) {
  console.log('Done — all dangelko trial data removed.');
  process.exit(0);
}

// ── Look up oils ──
const { data: cookerOils } = await supabase
  .from('oil_types').select('id, code').is('competitor_id', null).eq('status', 'active');
const cookerMap = {};
cookerOils?.forEach(o => { cookerMap[o.code] = o.id; });
const XLFRY   = cookerMap['XLFRY']   || null;
const ULTAFRY = cookerMap['ULTAFRY'] || null;
const TRIALOIL = XLFRY || ULTAFRY || cookerOils?.[0]?.id || null;

const { data: compOils } = await supabase
  .from('oil_types').select('id').not('competitor_id', 'is', null).eq('status', 'active');
const compOilIds = compOils?.map(o => o.id) || [];
const pickCompOil = () => compOilIds.length ? compOilIds[Math.floor(Math.random() * compOilIds.length)] : null;

console.log(`Cookers trial oil: ${TRIALOIL ? 'found' : 'NOT FOUND — readings will have null trial_oil_id'}`);

// ── Food types from system_settings ──
const { data: sysRow } = await supabase
  .from('system_settings').select('food_type_options').eq('id', 1).single();
const FOOD_TYPES = (sysRow?.food_type_options?.length)
  ? sysRow.food_type_options
  : ['Chips/Fries', 'Crumbed Items', 'Battered Items', 'Plain Proteins', 'Pastries/Donuts', 'High Starch', 'Mixed Service'];
console.log(`Food types (${FOOD_TYPES.length}): ${FOOD_TYPES.join(', ')}\n`);

// ── Date helpers ──
const today    = new Date();
const todayStr = today.toISOString().split('T')[0];
const daysAgo  = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const daysAgoTs = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString(); };

// ── Helpers ──
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ── Notes helper — realistic BDM field notes on readings ──
const readingNotes = [
  'Oil looking clear — good golden colour at this stage',
  'Slight foam settling after filter — normal for day 2',
  'Chips coming out noticeably crispier than before trial',
  'Filtered before service, oil still in excellent condition',
  'Owner commented the fryer smells much cleaner than usual',
  'Compared colour to old oil — ours is visibly cleaner at this age',
  'Temp running 2° above set — flagged to owner, checked thermostat',
  'Busy service today, mostly crumbed chicken and chips',
  'End-of-day top-up, oil holding up well',
  'Staff noticed less smoke during service',
  'Customer mentioned chips taste better — crispier finish',
  'Oil still performing well — TPM tracking exactly as expected',
  'Owner asked how much longer it would last vs his usual oil',
  'Filtered at changeover — residue noticeably lighter than competitor oil',
  'Good fryer recovery after big lunch rush',
  'No unusual colour or smell — oil in great shape for this age',
];
const maybeNote = (pct = 0.3) => Math.random() < pct
  ? readingNotes[Math.floor(Math.random() * readingNotes.length)]
  : null;

// ── TPM by day (Cookers oil — slow degradation, holds 7+ days)
// Competitor baseline would hit 22–26 by day 5–6 and need changing
const TPM_BY_DAY = [
  [4,  7],  // day 1 — fresh oil
  [6,  9],  // day 2
  [8, 11],  // day 3
  [10, 13], // day 4
  [12, 15], // day 5
  [14, 17], // day 6
  [16, 20], // day 7
];

// ── Readings generator (7-day trials, day 1 always fresh fill for all fryers) ──
function generateReadings(venueId, trialId, fryerCount, startDate, endDate, primaryFoodType) {
  const readings = [];
  const start = new Date(startDate + 'T00:00:00');
  const end   = endDate ? new Date(endDate + 'T00:00:00') : new Date(todayStr + 'T00:00:00');

  // Each fryer gets its own dedicated food type to be realistic
  const fryerFoods = Array.from({ length: fryerCount }, () =>
    primaryFoodType || FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)]
  );

  for (let fryer = 1; fryer <= fryerCount; fryer++) {
    // Stagger start temps per fryer — realistic multi-fryer setup
    const setTemp = [175, 180, 170][fryer - 1] ?? 175;
    let oilAge = 0;
    const cur = new Date(start);

    while (cur <= end) {
      const dateStr = cur.toISOString().split('T')[0];
      oilAge++;

      const isFresh = oilAge === 1;
      const [tpmMin, tpmMax] = TPM_BY_DAY[Math.min(oilAge - 1, TPM_BY_DAY.length - 1)];

      // Day 1: guaranteed fresh fill (14–20L). Other days: small top-up 25% of the time.
      const litresFilled = isFresh
        ? randInt(14, 20)
        : (Math.random() < 0.25 ? randInt(1, 3) : 0);

      // More notes on day 1 (fresh fill is an event), and on later days when things get interesting
      const notePct = isFresh ? 0.8 : oilAge >= 5 ? 0.4 : 0.2;

      readings.push({
        venue_id:           venueId,
        trial_id:           trialId,
        fryer_number:       fryer,
        reading_date:       dateStr,
        reading_number:     1,
        oil_age:            oilAge,
        litres_filled:      litresFilled,
        tpm_value:          randInt(tpmMin, tpmMax),
        set_temperature:    setTemp,
        actual_temperature: setTemp + randInt(-2, 3),
        filtered:           isFresh ? true : (oilAge >= 4 ? Math.random() < 0.65 : false),
        food_type:          fryerFoods[fryer - 1],
        not_in_use:         false,
        notes:              maybeNote(notePct),
      });

      cur.setDate(cur.getDate() + 1);
    }
  }
  return readings;
}

// ── State from region ──
const STATE = (() => {
  const r = bdm.region || '';
  if (/vic/i.test(r))              return 'VIC';
  if (/nsw|new south/i.test(r))    return 'NSW';
  if (/qld|queensland/i.test(r))   return 'QLD';
  if (/\bsa\b|south aus/i.test(r)) return 'SA';
  if (/\bwa\b|western/i.test(r))   return 'WA';
  return 'VIC';
})();

// ── Goal/notes helpers ──
// Valid goal keys: 'save-money' | 'reduce-waste' | 'food-quality' | 'food-colour' | 'reduce-changes' | 'extend-life'
const mkGoalsLine    = (...keys) => `[Goals: ${keys.join(', ')}]`;
const mkAchievedLine = (...keys) => `[GoalsAchieved: ${keys.join(', ')}]`;
const mkFindingsLine = (text)    => `[TrialFindings: ${text}]`;

// ── Assessment insight objects ──
// All values must exactly match dropdown options in the app.
// Valid options per field:
//   tpmPerformance:         'Acceptable' | 'Above normal' | 'Unstable'
//   lifespanVsCompetitor:   'Longer' | 'On par' | 'Shorter' | 'No comparable baseline'
//   topUpFreqVsCompetitor:  'Fewer' | 'Same' | 'More' | 'No comparable baseline'
//   setVsActual:            'Well calibrated' | 'Minor variance' | 'Significant variance'
//   calibrationNeeded:      'None' | 'Minor adjustment' | 'Professional service required'
//   tempRecovery:           'Fast' | 'Normal' | 'Slow'
//   taste / texture / appearance:  'Improved' | 'Same' | 'Worse'
//   chefFeedback / overallReception: 'Positive' | 'Neutral' | 'Negative'
//   staffEngagement:        'High' | 'Moderate' | 'Low'
//   costSavings / qualityGains / operationalEfficiency: 'Evident' | 'Partially evident' | 'Not evident' | 'N/A'
//   interestedInTesto / interestedInFrySmart: 'Yes' | 'No' | 'Not sure'
//   topicsCovered: array of 'Oil filtering' | 'Scheduled changes' | 'Fryer calibration' |
//                           'Fryer temperature' | 'Daily TPM testing' | 'Top-up procedure'

const ASSESSMENT = {
  // PENDING — positive trial, good lifespan result, customer weighing up the price
  pending: {
    insight_oil_longevity:     JSON.stringify({ tpmPerformance: 'Acceptable', lifespanVsCompetitor: 'Longer', topUpFreqVsCompetitor: 'Fewer' }),
    insight_temp_observations: JSON.stringify({ setVsActual: 'Well calibrated', calibrationNeeded: 'None', tempRecovery: 'Fast' }),
    insight_food_quality:      JSON.stringify({ taste: 'Improved', texture: 'Same', appearance: 'Improved' }),
    insight_training:          JSON.stringify({ topicsCovered: ['Daily TPM testing', 'Oil filtering', 'Top-up procedure'] }),
    insight_engagement:        JSON.stringify({ chefFeedback: 'Positive', staffEngagement: 'Moderate', overallReception: 'Positive' }),
    insight_recommendations:   JSON.stringify({ costSavings: 'Partially evident', qualityGains: 'Evident', operationalEfficiency: 'Partially evident', interestedInTesto: 'Not sure', interestedInFrySmart: 'Not sure' }),
  },
  // ACCEPTED — lifespan story landed well, clear savings case, customer said yes
  accepted: {
    insight_oil_longevity:     JSON.stringify({ tpmPerformance: 'Acceptable', lifespanVsCompetitor: 'Longer', topUpFreqVsCompetitor: 'Fewer' }),
    insight_temp_observations: JSON.stringify({ setVsActual: 'Minor variance', calibrationNeeded: 'None', tempRecovery: 'Normal' }),
    insight_food_quality:      JSON.stringify({ taste: 'Improved', texture: 'Improved', appearance: 'Improved' }),
    insight_training:          JSON.stringify({ topicsCovered: ['Daily TPM testing', 'Oil filtering', 'Scheduled changes', 'Top-up procedure'] }),
    insight_engagement:        JSON.stringify({ chefFeedback: 'Positive', staffEngagement: 'High', overallReception: 'Positive' }),
    insight_recommendations:   JSON.stringify({ costSavings: 'Evident', qualityGains: 'Evident', operationalEfficiency: 'Evident', interestedInTesto: 'Yes', interestedInFrySmart: 'Yes' }),
  },
  // SUCCESSFUL — outstanding result, all goals hit, customer fully converted
  successful: {
    insight_oil_longevity:     JSON.stringify({ tpmPerformance: 'Acceptable', lifespanVsCompetitor: 'Longer', topUpFreqVsCompetitor: 'Fewer' }),
    insight_temp_observations: JSON.stringify({ setVsActual: 'Well calibrated', calibrationNeeded: 'None', tempRecovery: 'Fast' }),
    insight_food_quality:      JSON.stringify({ taste: 'Improved', texture: 'Improved', appearance: 'Improved' }),
    insight_training:          JSON.stringify({ topicsCovered: ['Daily TPM testing', 'Oil filtering', 'Scheduled changes', 'Fryer calibration', 'Fryer temperature', 'Top-up procedure'] }),
    insight_engagement:        JSON.stringify({ chefFeedback: 'Positive', staffEngagement: 'High', overallReception: 'Positive' }),
    insight_recommendations:   JSON.stringify({ costSavings: 'Evident', qualityGains: 'Evident', operationalEfficiency: 'Evident', interestedInTesto: 'Yes', interestedInFrySmart: 'Yes' }),
  },
  // UNSUCCESSFUL — trial performed well technically, but price was the dealbreaker
  unsuccessful: {
    insight_oil_longevity:     JSON.stringify({ tpmPerformance: 'Acceptable', lifespanVsCompetitor: 'Longer', topUpFreqVsCompetitor: 'Fewer' }),
    insight_temp_observations: JSON.stringify({ setVsActual: 'Minor variance', calibrationNeeded: 'Minor adjustment', tempRecovery: 'Normal' }),
    insight_food_quality:      JSON.stringify({ taste: 'Improved', texture: 'Same', appearance: 'Same' }),
    insight_training:          JSON.stringify({ topicsCovered: ['Daily TPM testing', 'Oil filtering'] }),
    insight_engagement:        JSON.stringify({ chefFeedback: 'Neutral', staffEngagement: 'Low', overallReception: 'Neutral' }),
    insight_recommendations:   JSON.stringify({ costSavings: 'Partially evident', qualityGains: 'Partially evident', operationalEfficiency: 'Not evident', interestedInTesto: 'No', interestedInFrySmart: 'No' }),
  },
};

// ══════════════════════════════════════════════
// 6 TRIAL DEFINITIONS — one per status
// ══════════════════════════════════════════════
const TRIAL_DEFS = [

  // ── 1. PIPELINE ─────────────────────────────────────────────────────────
  // Venue qualified and created, trial not yet started. BDM has done the
  // groundwork and is ready to book the first visit.
  {
    venueName:      '(TEST) Bayside Burger Co',
    fryerCount:     2,
    volumeBracket:  '60-100',
    weeklyAvg:      70,
    status:         'pipeline',
    curPrice:       2.35,
    offPrice:       3.10,
    goalKeys:       ['save-money', 'extend-life', 'food-quality'],
    fryerChanges:   5,  // competitor oil: changes every 5 days
    primaryFood:    'Crumbed Items',
    notes: `Met owner James last Tuesday — he runs a busy lunch trade, mostly crumbed chicken burgers and chips. Currently on a generic canola at $2.35/L. Changes oil every 5 days purely by smell and colour, no testing. Turnover is consistent but he's frustrated by how fast the oil goes dark during a big service. He was receptive when I explained the lifespan story — two extra days per cycle would be meaningful for a two-fryer operation. Key angle is cost-per-cycle, not cost-per-litre. He wants to see hard data so make sure every reading is logged clearly from day one.`,
  },

  // ── 2. ACTIVE ────────────────────────────────────────────────────────────
  // 7 days into the trial. TPM tracking beautifully — oil still well below
  // warning threshold where competitor oil would have been changed by now.
  {
    venueName:      '(TEST) Riverview Fish & Chips',
    fryerCount:     3,
    volumeBracket:  '100-150',
    weeklyAvg:      115,
    status:         'active',
    curPrice:       2.45,
    offPrice:       3.20,
    startDaysAgo:   7,
    goalKeys:       ['save-money', 'food-quality', 'extend-life', 'reduce-changes'],
    fryerChanges:   6,  // competitor oil: changes every 6 days
    primaryFood:    'Chips/Fries',
    notes: `Owner Gary has been in the game 12 years and is a tough convince — he's heard the pitch from every oil rep going. What got him interested was the TPM testing; he'd never seen live oil quality data before and was genuinely surprised by how quickly competitor oil degrades. Three fryers flat out from 11am, busy dinner trade on weekends. His biggest complaint is staff spending 45 mins on a full fryer change mid-service — if we can cut that from every 6 days to every 8–9 days, it's an immediate operational win. Keeping the report clean is critical here — Gary is detail-oriented and will scrutinise the numbers before he makes any decision.`,
  },

  // ── 3. PENDING ───────────────────────────────────────────────────────────
  // 7-day trial ended 2 days ago. Results clearly positive — oil lasted the
  // full trial without a change while competitor baseline was 5 days.
  // Owner is weighing up the $0.80/L price difference vs the savings.
  {
    venueName:      '(TEST) Hillside Chicken Shop',
    fryerCount:     2,
    volumeBracket:  '60-100',
    weeklyAvg:      80,
    status:         'pending',
    curPrice:       2.40,
    offPrice:       3.20,
    startDaysAgo:   9,
    durationDays:   7,
    goalKeys:       ['save-money', 'food-quality', 'reduce-changes'],
    achievedKeys:   ['save-money', 'food-quality'],
    fryerChanges:   5,
    primaryFood:    'Crumbed Items',
    findings: `Oil held for the full 7 days with TPM peaking at 19 on day 7 — well within acceptable range. Competitor oil was typically changed at day 5. Owner Priya commented unprompted that the crumbed chicken had better colour and a crispier finish. She was also surprised by how clean the oil still looked on day 6. Cost savings vs competitor: approximately $18/week based on her volume. She's keen but needs to see the full numbers before committing — follow-up booked for Wednesday.`,
    assessment:     ASSESSMENT.pending,
    notes: `Priya runs a tidy operation — two fryers, consistent lunch and dinner. She was initially sceptical, having tried a "premium" oil two years ago that didn't deliver. The TPM data sold her — she'd never seen her old oil tested and was shocked when we compared the trajectory. The main hesitation now is pure price: $3.20/L vs $2.40/L feels like a big jump even with the lifespan argument. Need to walk her through the total cost calculation — cost per cycle, not per litre — and show her exactly how many fewer changes per month that means.`,
  },

  // ── 4. ACCEPTED ──────────────────────────────────────────────────────────
  // 7-day trial won on the lifespan story. Owner converted at $3.05/L.
  // Awaiting customer code from head office to finalise the account.
  {
    venueName:      '(TEST) Metro Grill & Fry',
    fryerCount:     2,
    volumeBracket:  '60-100',
    weeklyAvg:      90,
    status:         'accepted',
    curPrice:       2.50,
    offPrice:       3.25,
    startDaysAgo:   12,
    durationDays:   7,
    outcomeDaysAgo: 5,
    reason:         'oil-lasted-longer',
    soldPrice:      3.05,
    goalKeys:       ['save-money', 'extend-life', 'reduce-waste'],
    achievedKeys:   ['save-money', 'extend-life', 'reduce-waste'],
    fryerChanges:   6,
    primaryFood:    'Mixed Service',
    findings: `Excellent result. Oil lasted the full 7 days; competitor baseline was 6 days. TPM peaked at 18 on day 7 — still inside the acceptable range where competitor oil was consistently hitting 22–24 by day 5. Owner Marcus was particularly impressed by how little oil was discarded — the reduced waste argument resonated strongly. He calculated himself that he'd save approximately $22–25 per week factoring in fewer full changes. Agreed to come on at $3.05/L pending customer code from head office. Follow up Friday to confirm account is set up.`,
    assessment:     ASSESSMENT.accepted,
    notes: `Marcus is a numbers person — ran his own spreadsheet to verify my savings calculation before committing. Two fryers, mixed service (chips, crumbed items, plain proteins). He changes oil every 6 days by habit but admitted he sometimes does it earlier when it looks dark. The waste reduction angle hit harder than I expected — he hates throwing away oil that "might have lasted another day." Had to negotiate slightly on price (offered $3.25, settled $3.05) but it's a solid account. He has a mate in the industry he's already talking to about switching.`,
  },

  // ── 5. SUCCESSFUL ────────────────────────────────────────────────────────
  // Outstanding outcome. Food quality story + lifespan data = easy conversion.
  // Customer code assigned, account active.
  {
    venueName:      '(TEST) Coastal Seafood Kitchen',
    fryerCount:     3,
    volumeBracket:  '100-150',
    weeklyAvg:      130,
    status:         'successful',
    curPrice:       2.55,
    offPrice:       3.30,
    startDaysAgo:   19,
    durationDays:   7,
    outcomeDaysAgo: 10,
    reason:         'better-food-quality',
    soldPrice:      3.20,
    custCode:       `${STATE}-7821`,
    goalKeys:       ['save-money', 'food-quality', 'food-colour', 'extend-life', 'reduce-changes'],
    achievedKeys:   ['save-money', 'food-quality', 'food-colour', 'extend-life', 'reduce-changes'],
    fryerChanges:   6,
    primaryFood:    'Battered Items',
    findings: `Outstanding result across the board. TPM tracked smoothly from 4 on day 1 to a peak of 17 on day 7 — the clearest demonstration yet of cookers oil outperforming competitor product. Competitor baseline was 6 days; our oil would comfortably have run to day 9 or 10. Food quality was the decisive factor for owner Linda — she noticed the battered fish came out with a significantly better golden colour and lighter texture as early as day 2. Regular customers commented on the difference unprompted during the trial. Cost savings approximately $30/week based on her volume and change frequency. Converted at $3.20/L without pushback on price — she valued the quality outcome above the raw $/L number. Full training completed with head chef on day 3. Customer code assigned.`,
    assessment:     ASSESSMENT.successful,
    notes: `Linda has been in seafood retail for 22 years and has high standards — her regulars are loyal because of consistent food quality. Oil smell during service was her biggest complaint with the old product; competitor oil would start producing dark smoke by day 4 on her high-volume fryers. On day 2 of the trial a regular customer walked up to the counter and said "the fish tastes different today — what did you change?" — that was the moment Linda was sold. Three fryers running hard, mostly battered fish, calamari and chips. Full training with head chef Tony went really well — he was already sold before I'd finished explaining the TPM system. Best trial result in my last 12 months.`,
  },

  // ── 6. UNSUCCESSFUL ──────────────────────────────────────────────────────
  // Trial data was solid — oil performed well and lifespan was demonstrably
  // better. But owner wouldn't move from $1.90/L bulk buying price.
  // Price gap simply too wide to bridge. Follow up in 6 months.
  {
    venueName:      '(TEST) Dockside Kebabs',
    fryerCount:     2,
    volumeBracket:  'under-60',
    weeklyAvg:      55,
    status:         'unsuccessful',
    curPrice:       1.90,
    offPrice:       3.00,
    startDaysAgo:   14,
    durationDays:   7,
    outcomeDaysAgo: 6,
    reason:         'price-too-high',
    goalKeys:       ['save-money', 'food-quality'],
    achievedKeys:   [],
    fryerChanges:   5,
    primaryFood:    'Mixed Service',
    findings: `Trial data was positive — TPM stayed below 18 for the full 7 days and oil would have comfortably run to day 9, compared to the competitor 5-day baseline. However, owner Demi was purchasing bulk canola at $1.90/L through a wholesale arrangement that is genuinely hard to beat on a pure per-litre basis. Despite walking through the full cost-per-cycle calculation showing a net saving of ~$8/week, the $1.10/L price gap felt too large for a low-margin operation at this volume. She acknowledged the quality difference but said it wasn't compelling enough at this size to justify the switch. Recommend revisiting in 6 months — if she opens the second location she's planning, the volume equation changes completely.`,
    assessment:     ASSESSMENT.unsuccessful,
    notes: `Demi has a small but busy lunchtime trade — mostly döner kebabs, chips and fried halloumi. She's price-conscious and shops around constantly for better rates. The bulk canola deal she has is genuinely competitive; hard to argue with $1.90/L if she's happy with 5-day oil life. I tried the total-cost approach but at 55L/week the weekly saving just doesn't feel significant to her. The quality improvement was evident on the plate and she acknowledged it — but her customers are regulars who aren't comparing her chips to a premium seafood restaurant. Worth a revisit if volume grows. Left on good terms, she said "come back if the price ever moves."`,
  },
];

// ══════════════════════════════════════════════
// INSERT ALL 6 TRIALS
// ══════════════════════════════════════════════
console.log('Seeding 6 trials for dangelko...\n');
let totalReadings = 0;

for (let i = 0; i < TRIAL_DEFS.length; i++) {
  const def = TRIAL_DEFS[i];

  // Prospect code starts at PRS-8001 to avoid collisions with other seeds
  const prospectCode = `PRS-${String(8000 + i + 1).padStart(4, '0')}`;

  // ── Insert venue ──
  const { data: venue, error: vErr } = await supabase.from('venues').insert({
    name:           def.venueName,
    status:         'trial-only',
    state:          STATE,
    fryer_count:    def.fryerCount,
    volume_bracket: def.volumeBracket,
    default_oil:    pickCompOil(),        // what they're currently using
    bdm_id:         bdm.id,
    customer_code:  def.custCode || prospectCode,
    ...(def.custCode ? { customer_code_saved_at: daysAgoTs(def.outcomeDaysAgo || 0) } : {}),
  }).select().single();

  if (vErr) { console.error(`  ERR venue "${def.venueName}": ${vErr.message}`); continue; }

  // ── Build trial notes ──
  // Format: TRL-XXXX\n[Goals:...]\n[FryerChanges: N]\n[GoalsAchieved:...]\n[TrialFindings:...]\nfree text notes
  const trialIdLine = `TRL-${String(8000 + i + 1).padStart(4, '0')}`;
  const notesLines  = [trialIdLine];
  if (def.goalKeys?.length)     notesLines.push(mkGoalsLine(...def.goalKeys));
  if (def.fryerChanges)         notesLines.push(`[FryerChanges: ${def.fryerChanges}]`);
  if (def.achievedKeys?.length) notesLines.push(mkAchievedLine(...def.achievedKeys));
  if (def.findings)             notesLines.push(mkFindingsLine(def.findings));
  if (def.notes)                notesLines.push(def.notes);
  const trialNotes = notesLines.filter(Boolean).join('\n');

  // ── Date calculations ──
  const startDate   = def.startDaysAgo ? daysAgo(def.startDaysAgo) : null;
  const endDate     = (def.durationDays && startDate) ? daysAgo(def.startDaysAgo - def.durationDays) : null;
  const outcomeDate = def.outcomeDaysAgo ? daysAgo(def.outcomeDaysAgo) : null;

  // ── Insert trial ──
  const { data: trial, error: tErr } = await supabase.from('trials').insert({
    venue_id:                venue.id,
    status:                  def.status,
    trial_oil_id:            TRIALOIL,
    notes:                   trialNotes,
    current_price_per_litre: def.curPrice,
    offered_price_per_litre: def.offPrice,
    current_weekly_avg:      def.weeklyAvg,
    ...(startDate   ? { start_date:           startDate   } : {}),
    ...(endDate     ? { end_date:             endDate     } : {}),
    ...(outcomeDate ? { outcome_date:         outcomeDate } : {}),
    ...(def.reason    ? { trial_reason:         def.reason    } : {}),
    ...(def.soldPrice ? { sold_price_per_litre: def.soldPrice } : {}),
  }).select().single();

  if (tErr) { console.error(`  ERR trial "${def.venueName}": ${tErr.message}`); continue; }

  // ── Generate readings for started trials ──
  let readingCount = 0;
  if (startDate) {
    const readingEndDate = endDate || todayStr;
    const readings = generateReadings(venue.id, trial.id, def.fryerCount, startDate, readingEndDate, def.primaryFood);
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

  // ── Save assessment data (for trials that have completed a review) ──
  if (def.assessment) {
    const { error: aErr } = await supabase.from('venues').update(def.assessment).eq('id', venue.id);
    if (aErr) console.error(`  ERR assessment "${def.venueName}": ${aErr.message}`);
  }

  // ── Log result ──
  const label    = def.status.toUpperCase().padEnd(12);
  const readStr  = startDate ? `, ${readingCount} readings` : ', no readings yet';
  const assessStr = def.assessment ? ', assessment ✓' : '';
  console.log(`  [${label}] ${def.venueName} (${def.fryerCount} fryers${readStr}${assessStr})`);
  console.log(`              Goals: ${def.goalKeys?.join(', ') || 'none'}`);
  if (def.achievedKeys?.length) {
    console.log(`              Achieved: ${def.achievedKeys.join(', ')}`);
  }
}

console.log(`\n✓ Done!`);
console.log(`  6 trial venues created for dangelko (${STATE})`);
console.log(`  Total TPM readings: ${totalReadings}`);
console.log(`  Day 1 = fresh fill (14–20L) for every fryer — guaranteed`);
console.log(`  Cookers oil: slow TPM rise, holds 7 days without a change`);
console.log(`  Competitor baseline (FryerChanges): 5–6 days`);
console.log(`  Assessment data seeded for: pending, accepted, successful, unsuccessful`);
console.log(`  Food types sourced from: ${sysRow?.food_type_options?.length ? 'system_settings' : 'app defaults'}`);
