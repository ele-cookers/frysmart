// ============================================================
// snake_case (Supabase) ↔ camelCase (frontend) mappers
// One mapper per table, following the reference doc field map.
// ============================================================

// ── competitors ──
export const mapCompetitor = (r) => ({
  id: r.id,
  name: r.name,
  code: r.code,
  status: r.status,
  type: r.type,
  states: r.states ?? [],
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const unMapCompetitor = (c) => ({
  name: c.name,
  code: c.code,
  status: c.status,
  type: c.type,
  states: c.states ?? [],
  color: c.color,
});

// ── oil_types ──
export const mapOilType = (r) => ({
  id: r.id,
  name: r.name,
  code: r.code,
  category: r.category,
  tier: r.tier,
  oilType: r.oil_type,
  packSize: r.pack_size,
  status: r.status,
  competitorId: r.competitor_id ?? '',
});

export const unMapOilType = (o) => ({
  name: o.name,
  code: o.code,
  category: o.category,
  tier: o.tier,
  oil_type: o.oilType,
  pack_size: o.packSize,
  status: o.status,
  competitor_id: o.competitorId || null,
});

// ── profiles → users ──
export const mapProfile = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email ?? '',
  role: r.role,
  region: r.region ?? '',
  status: r.status,
  username: r.username ?? '',
  password: r.password ?? '',
  repCode: r.rep_code ?? '',
  crmCode: r.crm_code ?? '',
  venueId: r.venue_id ?? '',
  groupId: r.group_id ?? '',
  lastActive: r.last_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const unMapProfile = (u) => ({
  name: u.name,
  email: u.email || null,
  role: u.role,
  region: u.region || null,
  status: u.status,
  username: u.username || null,
  password: u.password || null,
  rep_code: u.repCode || null,
  crm_code: u.crmCode || null,
  venue_id: u.venueId || null,
  group_id: u.groupId || null,
});

// ── groups ──
export const mapGroup = (r) => ({
  id: r.id,
  name: r.name,
  groupCode: r.group_code,
  username: r.username ?? '',
  namId: r.nam_id ?? '',
  status: r.status,
  lastTpmDate: r.last_tpm_date,
  password: r.password ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const unMapGroup = (g) => ({
  name: g.name,
  group_code: g.groupCode,
  username: g.username || null,
  nam_id: g.namId || null,
  status: g.status,
  password: g.password || null,
});

// ── venues (no trial fields — those live in trials table now) ──
export const mapVenue = (r) => ({
  id: r.id,
  name: r.name,
  status: r.status,
  customerCode: r.customer_code ?? '',
  state: r.state,
  fryerCount: r.fryer_count,
  volumeBracket: r.volume_bracket ?? '',
  defaultOil: r.default_oil ?? '',
  groupId: r.group_id ?? '',
  bdmId: r.bdm_id ?? '',
  lastTpmDate: r.last_tpm_date,
  password: r.password ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const unMapVenue = (v) => ({
  name: v.name,
  status: v.status,
  customer_code: v.customerCode || null,
  state: v.state,
  fryer_count: v.fryerCount,
  volume_bracket: v.volumeBracket || null,
  default_oil: v.defaultOil || null,
  group_id: v.groupId || null,
  bdm_id: v.bdmId || null,
  last_tpm_date: v.lastTpmDate || null,
  password: v.password || null,
});

// ── trials ──
export const mapTrial = (r) => ({
  trialId: r.id,
  venueId: r.venue_id,
  trialStatus: r.status,
  trialStartDate: r.start_date,
  trialEndDate: r.end_date,
  trialOilId: r.trial_oil_id ?? '',
  trialNotes: r.notes ?? '',
  currentWeeklyAvg: r.current_weekly_avg,
  currentPricePerLitre: r.current_price_per_litre,
  offeredPricePerLitre: r.offered_price_per_litre,
  outcomeDate: r.outcome_date,
  trialReason: r.trial_reason ?? '',
  soldPricePerLitre: r.sold_price_per_litre,
  trialCreatedAt: r.created_at,
});

export const unMapTrial = (t) => ({
  venue_id: t.venueId,
  status: t.trialStatus || null,
  start_date: t.trialStartDate || null,
  end_date: t.trialEndDate || null,
  trial_oil_id: t.trialOilId || null,
  notes: t.trialNotes || null,
  current_weekly_avg: t.currentWeeklyAvg ?? null,
  current_price_per_litre: t.currentPricePerLitre ?? null,
  offered_price_per_litre: t.offeredPricePerLitre ?? null,
  outcome_date: t.outcomeDate || null,
  trial_reason: t.trialReason || null,
  sold_price_per_litre: t.soldPricePerLitre ?? null,
});

// ── Trial ↔ Venue merge/split helpers ──
// These let existing UI code continue using venue.trialStatus etc.
export const TRIAL_FIELDS = [
  'trialId', 'trialStatus', 'trialStartDate', 'trialEndDate',
  'trialOilId', 'trialNotes', 'currentWeeklyAvg', 'currentPricePerLitre',
  'offeredPricePerLitre', 'outcomeDate', 'trialReason', 'soldPricePerLitre',
  'trialCreatedAt',
];

export const mergeTrialIntoVenue = (venue, trial) => {
  if (!trial) return venue;
  const merged = { ...venue };
  TRIAL_FIELDS.forEach(f => { if (trial[f] !== undefined) merged[f] = trial[f]; });
  return merged;
};

export const splitTrialFromVenue = (merged) => {
  const trial = {};
  TRIAL_FIELDS.forEach(f => { trial[f] = merged[f]; });
  trial.venueId = merged.id;
  return trial;
};

// ── tpm_readings ──
export const mapReading = (r) => ({
  id: r.id,
  venueId: r.venue_id,
  trialId: r.trial_id ?? null,
  fryerNumber: r.fryer_number,
  readingDate: r.reading_date,
  readingNumber: r.reading_number ?? 1,
  takenBy: r.taken_by,
  oilAge: r.oil_age,
  litresFilled: r.litres_filled,
  tpmValue: r.tpm_value,
  setTemperature: r.set_temperature,
  actualTemperature: r.actual_temperature,
  filtered: r.filtered,
  foodType: r.food_type,
  notes: r.notes ?? '',
  notInUse: r.not_in_use,
  staffName: r.staff_name ?? '',
  createdAt: r.created_at,
});

export const unMapReading = (rd) => ({
  venue_id: rd.venueId,
  trial_id: rd.trialId || null,
  fryer_number: rd.fryerNumber,
  reading_date: rd.readingDate,
  reading_number: rd.readingNumber ?? 1,
  taken_by: rd.takenBy || null,
  oil_age: rd.oilAge,
  litres_filled: rd.litresFilled != null ? rd.litresFilled : 0,
  tpm_value: rd.tpmValue ?? null,
  set_temperature: rd.setTemperature ?? null,
  actual_temperature: rd.actualTemperature ?? null,
  filtered: rd.filtered ?? null,
  food_type: rd.foodType || null,
  notes: rd.notes || null,
  not_in_use: rd.notInUse ?? false,
  staff_name: rd.staffName || null,
});

// ── trial_reasons (config — read only from frontend perspective) ──
export const mapTrialReason = (r) => ({
  key: r.key,
  label: r.label,
  type: r.type,
});

// ── volume_brackets (config) ──
export const mapVolumeBracket = (r) => ({
  key: r.key,
  label: r.label,
  color: r.color,
});

// ── system_settings (single row) ──
export const mapSystemSettings = (r) => ({
  warningThreshold: r.warning_threshold,
  criticalThreshold: r.critical_threshold,
  defaultFryerCount: r.default_fryer_count,
  trialDuration: r.trial_duration,
  reportFrequency: r.report_frequency,
  reminderDays: r.reminder_days,
  oilTypeOptions: r.oil_type_options ?? [],
  themeConfig: r.theme_config ?? {},
  permissionsConfig: r.permissions_config ?? {},
  targetWinRate: r.target_win_rate ?? 75,
  targetAvgTimeToDecision: r.target_avg_time_to_decision ?? 14,
  targetSoldPricePerLitre: r.target_sold_price_per_litre ?? 2.50,
  targetTrialsPerMonth: r.target_trials_per_month ?? 12,
});

export const unMapSystemSettings = (s) => ({
  warning_threshold: s.warningThreshold,
  critical_threshold: s.criticalThreshold,
  default_fryer_count: s.defaultFryerCount,
  trial_duration: s.trialDuration,
  report_frequency: s.reportFrequency,
  reminder_days: s.reminderDays,
  oil_type_options: s.oilTypeOptions,
  theme_config: s.themeConfig,
  permissions_config: s.permissionsConfig,
  target_win_rate: s.targetWinRate,
  target_avg_time_to_decision: s.targetAvgTimeToDecision,
  target_sold_price_per_litre: s.targetSoldPricePerLitre,
  target_trials_per_month: s.targetTrialsPerMonth,
});
