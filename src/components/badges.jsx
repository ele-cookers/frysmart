import {
  TRIAL_STATUS_COLORS, OIL_TIER_COLORS, COMPETITOR_TIER_COLORS,
  STATE_BADGE_COLORS, VOLUME_BRACKET_COLORS, STATUS_COLORS,
  ROLE_COLORS, CODE_BADGE_COLORS,
} from '../lib/badgeConfig';

export const VOLUME_BRACKETS = VOLUME_BRACKET_COLORS;

export const ROLE_LABELS = {
  bdm: 'BDM', nam: 'NAM', state_manager: 'STATE MGR', mgt: 'MGT',
  admin: 'ADMIN', staff: 'STAFF', group_manager: 'GROUP MGR',
};

export const TrialStatusBadge = ({ status }) => {
  const c = TRIAL_STATUS_COLORS[status] || TRIAL_STATUS_COLORS['pending'];
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '82px', textAlign: 'center', verticalAlign: 'middle',
    }}>{c.label}</span>
  );
};

export const OilBadge = ({ oil, competitors: comps, compact }) => {
  if (!oil) return <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>;
  const isCompetitor = oil.category === 'competitor';
  const s = isCompetitor
    ? (COMPETITOR_TIER_COLORS[oil.tier] || COMPETITOR_TIER_COLORS.standard)
    : (OIL_TIER_COLORS[oil.tier] || OIL_TIER_COLORS.standard);
  const comp = isCompetitor && comps ? comps.find(c => c.id === oil.competitorId) : null;
  if (compact) {
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', display: 'inline-block', minWidth: '68px', textAlign: 'center', verticalAlign: 'middle',
      }}>{oil.name}</span>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {comp && <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{comp.name}</span>}
      <span style={{
        padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', display: 'inline-block', alignSelf: 'flex-start',
      }}>{oil.name}</span>
    </div>
  );
};

export const StateBadge = ({ state }) => {
  if (!state) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const c = STATE_BADGE_COLORS[state] || { color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      fontSize: '10px', fontWeight: '700', color: c.color, background: c.bg,
      padding: '2px 0', borderRadius: '6px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '42px', textAlign: 'center', letterSpacing: '0.3px', verticalAlign: 'middle',
    }}>{state}</span>
  );
};

export const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '68px', textAlign: 'center', verticalAlign: 'middle',
    }}>{c.label}</span>
  );
};

export const RoleBadge = ({ role }) => {
  const c = ROLE_COLORS[role] || ROLE_COLORS.staff;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '90px', textAlign: 'center', verticalAlign: 'middle',
    }}>{ROLE_LABELS[role] || role}</span>
  );
};

export const CodeBadge = ({ code, minWidth = '42px', variant = 'default' }) => {
  if (!code) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const c = CODE_BADGE_COLORS[variant] || CODE_BADGE_COLORS.default;
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', color: c.color, background: c.background,
      padding: '2px 0', borderRadius: '8px', whiteSpace: 'nowrap',
      display: 'inline-block', minWidth, textAlign: 'center', verticalAlign: 'middle',
    }}>{code}</span>
  );
};

export const VolumePill = ({ bracket, brackets }) => {
  const vb = brackets || VOLUME_BRACKETS;
  const b = vb.find(v => v.key === bracket);
  if (!b) return <span style={{ color: '#cbd5e1' }}>—</span>;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}40`,
      letterSpacing: '0.3px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '82px', textAlign: 'center', verticalAlign: 'middle',
    }}>{b.label}</span>
  );
};

export const CompetitorPill = ({ comp, table }) => {
  if (!comp) return null;
  const color = comp.color || '#64748b';
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
  const bgColor = `rgba(${r},${g},${b},0.15)`;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const textColor = luminance > 0.75 ? '#1f2937' : color;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      background: bgColor, color: textColor,
      fontSize: '11px', fontWeight: '600', letterSpacing: '0.2px',
      ...(table ? {
        width: '68px', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', textAlign: 'center',
      } : { whiteSpace: 'nowrap' }),
      verticalAlign: 'middle',
    }} title={comp.name}>{comp.name}</span>
  );
};
