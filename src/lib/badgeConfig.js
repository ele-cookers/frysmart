// ============================================================
// Centralised badge, pill & color configuration
// Edit colors here — they flow into Admin, Venue & Group screens
// ============================================================

// ── Role badges (header bar + user tables) ──
// These appear on the dark blue header bar, so colors are lighter/translucent
export const HEADER_BADGE_COLORS = {
  admin:         { bg: 'rgba(236,72,153,0.25)',  color: '#f9a8d4', border: 'rgba(236,72,153,0.4)' },   // pink
  group_manager: { bg: 'rgba(139,92,246,0.25)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.4)' },   // purple
  venue:         { bg: 'rgba(249,115,22,0.25)',   color: '#ff8c00', border: 'rgba(249,115,22,0.5)' },   // orange
};

// ── Role badges (tables / light backgrounds) ──
export const ROLE_COLORS = {
  mgt:           { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },   // red
  admin:         { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },   // pink
  state_manager: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },   // yellow
  nam:           { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },   // blue
  bdm:           { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },   // green
  staff:         { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },   // orange
  group_manager: { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },   // purple
};

// ── State badges ──
export const STATE_BADGE_COLORS = {
  VIC:   { color: '#0369a1', bg: '#e0f2fe' },   // blue
  NSW:   { color: '#dc2626', bg: '#fee2e2' },   // red
  QLD:   { color: '#7c3aed', bg: '#ede9fe' },   // purple
  SA:    { color: '#a16207', bg: '#fef9c3' },   // amber
  WA:    { color: '#ea580c', bg: '#fff7ed' },   // orange
  TAS:   { color: '#15803d', bg: '#dcfce7' },   // green
  NT:    { color: '#64748b', bg: '#f1f5f9' },   // slate
  ACT:   { color: '#64748b', bg: '#f1f5f9' },   // slate
  'H/O': { color: '#1a428a', bg: '#e8eef6' },   // dark blue
};

// Plain state colors (for charts / venue table dots)
export const STATE_COLOURS = {
  VIC: '#0ea5e9', NSW: '#ef4444', QLD: '#8b5cf6', SA: '#eab308',
  WA: '#f97316',  TAS: '#22c55e', NT: '#64748b',  ACT: '#64748b',
};

// ── Status badges (active / inactive) ──
export const STATUS_COLORS = {
  active:   { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'ACTIVE' },
  inactive: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1', label: 'INACTIVE' },
};

// ── Oil tier badges ──
export const OIL_TIER_COLORS = {
  elite:    { bg: '#e6f9ff', text: '#0a8a9e', border: '#33ccff' },
  premium:  { bg: '#fff0eb', text: '#cc4400', border: '#ff6633' },
  standard: { bg: '#f0f9e8', text: '#5a7a1a', border: '#99cc33' },
};

// ── Competitor tier badges ──
export const COMPETITOR_TIER_COLORS = {
  standard: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
  premium:  { bg: '#e2e8f0', text: '#64748b', border: '#94a3b8' },
  elite:    { bg: '#cbd5e1', text: '#1f2937', border: '#64748b' },
};

// ── Code badges ──
export const CODE_BADGE_COLORS = {
  default:  { color: '#1a428a', background: '#e8eef6' },
  charcoal: { color: '#64748b', background: '#f1f5f9' },
};

// ── Trial status badges ──
export const TRIAL_STATUS_COLORS = {
  'pending':     { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1', label: 'Pipeline',     accent: '#94a3b8' },
  'in-progress': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Active',       accent: '#3b82f6' },
  'completed':   { bg: '#fef3c7', text: '#a16207', border: '#fde047', label: 'Pending',      accent: '#fbbf24' },
  'accepted':    { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: 'Accepted',  accent: '#f59e0b' },
  'won':         { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'Successful',   accent: '#10b981' },
  'lost':        { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Unsuccessful', accent: '#ef4444' },
};

// ── TPM status (traffic light) ──
export const TPM_COLORS = {
  good:     { color: '#10b981', bg: '#d1fae5', text: 'Oil quality good',        icon: 'check' },
  warning:  { color: '#f59e0b', bg: '#fef3c7', text: 'Recommended to change',   icon: 'alert' },
  critical: { color: '#ef4444', bg: '#fee2e2', text: 'Must change oil',         icon: 'x' },
  none:     { color: '#94a3b8', bg: '#f1f5f9', text: 'No reading',              icon: 'none' },
};

// ── Oil status (age-based) ──
export const OIL_STATUS_COLORS = {
  not_in_operation: { label: 'Not in Operation', color: '#94a3b8', bg: '#f1f5f9' },
  fresh:            { label: 'Fresh Oil',        color: '#92400e', bg: '#fef3c7' },
  in_use:           { label: 'In Use',           color: '#1e40af', bg: '#dbeafe' },
};

// ── Volume brackets ──
export const VOLUME_BRACKET_COLORS = [
  { key: 'under-60',  label: 'UNDER 60L', color: '#10b981' },   // green
  { key: '60-100',    label: '60 - 100L', color: '#eab308' },   // amber
  { key: '100-150',   label: '100 - 150L', color: '#f97316' },  // orange
  { key: '150-plus',  label: '150L+',      color: '#ef4444' },  // red
];

// ── Shared theme colors ──
export const THEME = {
  brand:      '#1a428a',
  brandDark:  '#0d2147',
  bg:         '#f8fafc',
  white:      '#ffffff',
  text:       '#1f2937',
  textMuted:  '#64748b',
  textFaint:  '#94a3b8',
  border:     '#e2e8f0',
};
