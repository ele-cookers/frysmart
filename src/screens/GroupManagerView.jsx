import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { mapGroup, mapVenue, mapReading, mapSystemSettings } from '../lib/mappers';
import { SummaryView, DashboardView, DayView, WeekView, MonthView, QuarterView, YearView } from './VenueStaffView';
import {
  ChevronLeft, ChevronRight, ChevronDown, Filter, MessageSquare, X, Check,
  AlertCircle, Clock, Star, Building, LogOut, BarChart3, Calendar, Eye, Droplets
} from 'lucide-react';
import { HEADER_BADGE_COLORS, OIL_STATUS_COLORS } from '../lib/badgeConfig';

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const COLORS = {
  brand:        '#1a428a',
  brandDark:    '#0d2147',
  good:         '#10b981',
  goodBg:       '#d1fae5',
  goodDark:     '#059669',
  warning:      '#f59e0b',
  warningBg:    '#fef3c7',
  warningDark:  '#d97706',
  critical:     '#ef4444',
  criticalBg:   '#fee2e2',
  criticalDark: '#dc2626',
  text:         '#1f2937',
  textMuted:    '#64748b',
  textFaint:    '#94a3b8',
  border:       '#e2e8f0',
  bg:           '#f8fafc',
  white:        '#ffffff',
};

// Shared styles
const S = Object.freeze({
  card: {
    background: COLORS.white,
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardElevated: {
    background: COLORS.white,
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  navBtn: {
    padding: '8px',
    background: COLORS.white,
    border: `1.5px solid ${COLORS.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  pageWrap: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '12px',
  },
  pageTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: COLORS.text,
    margin: 0,
  },
  label: {
    fontSize: '10px',
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '36px',
    fontWeight: '700',
    lineHeight: '1',
    marginBottom: '8px',
  },
  statSub: {
    fontSize: '11px',
    color: COLORS.textFaint,
  },
  pill: {
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '20px',
  },
  modal: {
    background: COLORS.white,
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    position: 'relative',
  },
});

// ─────────────────────────────────────────────
// PURE UTILITIES
// ─────────────────────────────────────────────
const formatDate = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTodayString = () => formatDate(new Date());

const getTPMStatus = (tpm, warnAt = 18, critAt = 24) => {
  if (tpm < warnAt)  return { color: COLORS.good,     text: 'Oil quality good',       bg: COLORS.goodBg,     level: 'good',     icon: 'check' };
  if (tpm < critAt)  return { color: COLORS.warning,   text: 'Recommended to change',  bg: COLORS.warningBg,  level: 'warning',  icon: 'alert' };
  return               { color: COLORS.critical, text: 'Must change oil',         bg: COLORS.criticalBg, level: 'critical', icon: 'x' };
};

const tpmColor = (v, warnAt = 18, critAt = 24) => {
  const n = parseFloat(v);
  return n < warnAt ? COLORS.good : n < critAt ? COLORS.warning : COLORS.critical;
};

const complianceColor = (rate) =>
  rate >= 90 ? COLORS.good : rate >= 70 ? COLORS.warning : COLORS.critical;

const tempVarianceColor = (variance) => {
  const abs = Math.abs(variance);
  return abs <= 3 ? COLORS.good : abs <= 7 ? COLORS.warning : COLORS.critical;
};

const calcTempVariancePct = (setTemp, actualTemp) => {
  const s = parseFloat(setTemp);
  if (!s) return 0;
  return ((parseFloat(actualTemp) - s) / s) * 100;
};

const isFreshOil = (oilAge) => oilAge === 1 || oilAge === '1';

// Oil status label based on oil age — colors from badgeConfig
const getOilStatus = (oilAge, notInUse, colors = OIL_STATUS_COLORS) => {
  if (notInUse) return colors.not_in_operation;
  if (oilAge === 1 || oilAge === '1') return colors.fresh;
  if (oilAge != null && oilAge !== '' && oilAge > 0) return colors.in_use;
  return null;
};

// Build date-keyed recording map from flat readings array
const buildRecordingMap = (readings) => {
  const map = {};
  readings.forEach(r => {
    const date = r.readingDate;
    if (!date) return;
    if (!map[date]) map[date] = [];
    map[date].push({ ...r, date });
  });
  return map;
};

// ─────────────────────────────────────────────
// VENUE OVERVIEW
// ─────────────────────────────────────────────
const VenueOverview = ({ recordings, venueName, fryerCount, warnAt = 18, critAt = 24 }) => {
  const allRecs = Object.values(recordings).flat().filter(r => !r.notInUse);

  if (allRecs.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '20px', textAlign: 'center' }}>
        <Building size={48} color={COLORS.textFaint} style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '20px', color: COLORS.text, marginBottom: '8px' }}>No Data Yet</h2>
        <p style={{ color: COLORS.textMuted, fontSize: '14px' }}>Recordings for this venue will appear here.</p>
      </div>
    );
  }

  const today    = new Date();
  const todayStr = formatDate(today);
  const last7days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return formatDate(d); });
  const recs7     = last7days.flatMap(date => (recordings[date] || []).filter(r => !r.notInUse).map(r => ({ ...r, date })));

  // KPIs
  const daysWithRecs   = last7days.filter(d => (recordings[d] || []).length > 0).length;
  const complianceRate = Math.round((daysWithRecs / 7) * 100);
  const tpmVals        = recs7.map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v));
  const avgTPM         = tpmVals.length > 0 ? (tpmVals.reduce((a, b) => a + b, 0) / tpmVals.length).toFixed(1) : '—';
  const critCount      = tpmVals.filter(v => v >= critAt).length;
  const critRate       = tpmVals.length > 0 ? Math.round((critCount / tpmVals.length) * 100) : 0;
  const filterable     = recs7.filter(r => r.filtered !== null && r.filtered !== undefined);
  const filteringRate  = filterable.length > 0 ? Math.round((filterable.filter(r => r.filtered === true).length / filterable.length) * 100) : 0;
  const tempRecs       = recs7.filter(r => r.setTemperature && r.actualTemperature);
  const avgTempVar     = tempRecs.length > 0 ? tempRecs.reduce((s, r) => s + calcTempVariancePct(r.setTemperature, r.actualTemperature), 0) / tempRecs.length : null;
  const todayRecs      = recordings[todayStr] || [];

  // Streak
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if ((recordings[formatDate(d)] || []).length > 0) streak++; else break;
  }

  // Quality distribution
  const goodCount    = tpmVals.filter(v => v < warnAt).length;
  const warningCount = tpmVals.filter(v => v >= warnAt && v < critAt).length;

  // Staff leaderboard
  const staffMap = {};
  recs7.forEach(r => {
    if (!r.staffName) return;
    staffMap[r.staffName] = staffMap[r.staffName] || { count: 0, filtered: 0 };
    staffMap[r.staffName].count++;
    if (r.filtered === true) staffMap[r.staffName].filtered++;
  });
  const leaderboard = Object.entries(staffMap)
    .map(([name, d]) => ({ name, count: d.count, filterPct: d.count > 0 ? Math.round((d.filtered / d.count) * 100) : 0 }))
    .sort((a, b) => b.filterPct - a.filterPct || b.count - a.count)
    .slice(0, 5);

  const kpiColor = (val, good, warn) => val >= good ? COLORS.good : val >= warn ? COLORS.warning : COLORS.critical;

  const kpis = [
    { label: 'COMPLIANCE',   value: `${complianceRate}%`, color: kpiColor(complianceRate, 90, 70),       sub: `${streak} day streak` },
    { label: 'AVG TPM',      value: avgTPM,               color: avgTPM === '—' ? COLORS.textFaint : tpmColor(avgTPM, warnAt, critAt), sub: `target <${warnAt}` },
    { label: 'CRITICAL RATE',value: `${critRate}%`,        color: kpiColor(100 - critRate, 90, 75),       sub: `${critCount} readings` },
    { label: 'FILTERING',    value: `${filteringRate}%`,   color: kpiColor(filteringRate, 80, 60),        sub: 'oil filtered' },
    { label: 'TEMP VARIANCE',value: avgTempVar === null ? '—' : `${avgTempVar >= 0 ? '+' : ''}${avgTempVar.toFixed(1)}%`, color: avgTempVar === null ? COLORS.textFaint : tempVarianceColor(avgTempVar), sub: 'target ±3%' },
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: COLORS.text, margin: 0 }}>{venueName}</h2>
          <p style={{ fontSize: '13px', color: COLORS.textMuted, margin: '2px 0 0' }}>Last 7 days · {fryerCount} fryers</p>
        </div>
        <div style={{ fontSize: '13px', color: todayRecs.length > 0 ? COLORS.good : COLORS.warning, fontWeight: '600' }}>
          {todayRecs.length > 0 ? `${todayRecs.length} recorded today` : 'Nothing recorded today'}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...S.card, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ ...S.label, marginBottom: '6px' }}>{k.label}</div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: k.color, lineHeight: '1', marginBottom: '4px' }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: COLORS.textFaint }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Quality distribution */}
      {tpmVals.length > 0 && (
        <div style={{ ...S.card, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
          <div style={{ ...S.label, marginBottom: '10px' }}>OIL QUALITY DISTRIBUTION</div>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '12px', marginBottom: '10px' }}>
            {goodCount    > 0 && <div style={{ flex: goodCount,    background: COLORS.good }} />}
            {warningCount > 0 && <div style={{ flex: warningCount, background: COLORS.warning }} />}
            {critCount    > 0 && <div style={{ flex: critCount,    background: COLORS.critical }} />}
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: COLORS.good,     fontWeight: '600' }}>Good {Math.round(goodCount    / tpmVals.length * 100)}%</span>
            <span style={{ color: COLORS.warning,  fontWeight: '600' }}>Warning {Math.round(warningCount / tpmVals.length * 100)}%</span>
            <span style={{ color: COLORS.critical, fontWeight: '600' }}>Critical {Math.round(critCount    / tpmVals.length * 100)}%</span>
          </div>
        </div>
      )}

      {/* Staff leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{ ...S.card, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
          <div style={{ ...S.label, marginBottom: '12px' }}>STAFF LEADERBOARD — FILTERING & RECORDINGS</div>
          {leaderboard.map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: i < leaderboard.length - 1 ? `1px solid ${COLORS.bg}` : 'none' }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}>{i < 3 ? ['1st','2nd','3rd'][i] : `${i+1}th`}</span>
              <span style={{ flex: 1, fontSize: '14px', fontWeight: '600', color: COLORS.text }}>{s.name}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: s.filterPct >= 80 ? COLORS.good : s.filterPct >= 60 ? COLORS.warning : COLORS.critical, minWidth: '70px', textAlign: 'right' }}>{s.filterPct}% filtered</span>
              <span style={{ fontSize: '12px', color: COLORS.textFaint, minWidth: '60px', textAlign: 'right' }}>{s.count} recordings</span>
            </div>
          ))}
        </div>
      )}

      {/* Priority actions */}
      {(complianceRate < 80 || critRate > 15 || filteringRate < 60) && (
        <div style={{ background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '1px solid #fed7aa', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ ...S.label, color: '#92400e', marginBottom: '10px' }}>PRIORITY ACTIONS</div>
          {complianceRate < 80 && <div style={{ fontSize: '13px', color: '#78350f', marginBottom: '6px', paddingLeft: '12px', borderLeft: `3px solid ${COLORS.warning}` }}>Compliance at {complianceRate}% — assign daily checks to shift leaders</div>}
          {critRate > 15        && <div style={{ fontSize: '13px', color: '#78350f', marginBottom: '6px', paddingLeft: '12px', borderLeft: `3px solid ${COLORS.critical}` }}>Critical rate at {critRate}% — review oil change procedures</div>}
          {filteringRate < 60   && <div style={{ fontSize: '13px', color: '#78350f', marginBottom: '6px', paddingLeft: '12px', borderLeft: `3px solid ${COLORS.warning}` }}>Only {filteringRate}% filtering — daily filtering extends oil life by 50%</div>}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MANAGER OVERVIEW (Group Dashboard)
// ─────────────────────────────────────────────
const ManagerOverview = ({ venues, recordingsByVenue, groupName, systemSettings, onDrillDown, groupView = 'glance' }) => {
  const [healthFilter, setHealthFilter] = useState('all');
  const [tpmRange, setTpmRange] = useState(30);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const warnAt = systemSettings?.warningThreshold || 18;
  const critAt = systemSettings?.criticalThreshold || 24;

  const computed = useMemo(() => {
    const today    = new Date();
    const todayStr = formatDate(today);
    const last7days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return formatDate(d); });
    const last90   = Array.from({ length: 90 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return formatDate(d); });

    const venueStats = venues.map(venue => {
      const recordings = recordingsByVenue[venue.id] || {};

      const allRecs  = last7days.flatMap(date => (recordings[date] || []).filter(r => !r.notInUse).map(r => ({ ...r, date })));
      const pastDays = last7days.filter(date => new Date(date) <= today).length;
      const daysWithRecs = last7days.filter(d => (recordings[d] || []).length > 0).length;
      const complianceRate = pastDays > 0 ? Math.round((daysWithRecs / pastDays) * 100) : 0;

      const tpmValues   = allRecs.map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v));
      const avgTPM      = tpmValues.length > 0 ? (tpmValues.reduce((a, b) => a + b, 0) / tpmValues.length).toFixed(1) : '—';
      const critCount   = tpmValues.filter(v => v >= critAt).length;
      const critRate    = tpmValues.length > 0 ? Math.round((critCount / tpmValues.length) * 100) : 0;

      const filterable     = allRecs.filter(r => r.filtered !== null && r.filtered !== undefined);
      const filteringRate  = filterable.length > 0 ? Math.round((filterable.filter(r => r.filtered === true).length / filterable.length) * 100) : 0;

      const todayRecs    = recordings[todayStr] || [];

      const health =
        complianceRate < 70 || critRate > 25 || parseFloat(avgTPM) >= 22 ? 'critical' :
        complianceRate < 85 || critRate > 10 || parseFloat(avgTPM) >= 18 ? 'warning' :
        'good';

      // 90-day compliance
      const daysWithRecs90 = last90.reduce((n, d) => n + ((recordings[d] || []).length > 0 ? 1 : 0), 0);
      const complianceRate90 = Math.round((daysWithRecs90 / 90) * 100);

      // Changed early / late
      let changedEarly = 0, changedLate = 0;
      const byFryer = {};
      allRecs.forEach(r => {
        byFryer[r.fryerNumber] = byFryer[r.fryerNumber] || {};
        byFryer[r.fryerNumber][r.date] = byFryer[r.fryerNumber][r.date] || [];
        byFryer[r.fryerNumber][r.date].push(r);
      });
      Object.values(byFryer).forEach(fryerDates => {
        const sorted = Object.keys(fryerDates).sort();
        for (let i = 1; i < sorted.length; i++) {
          const fresh = fryerDates[sorted[i]].find(r => isFreshOil(r.oilAge));
          if (!fresh) continue;
          const prevRecs = fryerDates[sorted[i - 1]];
          const prevVals = prevRecs.map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v));
          if (prevVals.length === 0) continue;
          const prevMax  = Math.max(...prevVals);
          if (prevMax >= critAt) changedLate++;
          else if (prevMax < warnAt) changedEarly++;
        }
      });

      // Oil rating
      const oilScore = (() => {
        let s = 0;
        if (filteringRate >= 80) s += 3; else if (filteringRate >= 60) s += 2; else if (filteringRate >= 40) s += 1;
        const tpmN = parseFloat(avgTPM);
        if (!isNaN(tpmN)) { if (tpmN < 15) s += 3; else if (tpmN < warnAt) s += 2; else if (tpmN < 22) s += 1; }
        if (critRate <= 5) s += 2; else if (critRate <= 15) s += 1;
        if (complianceRate >= 90) s += 2; else if (complianceRate >= 70) s += 1;
        return s;
      })();
      const oilRating = oilScore >= 9
        ? { label: 'Excellent', color: COLORS.good,    bg: COLORS.goodBg }
        : oilScore >= 6
        ? { label: 'Good',      color: COLORS.goodDark, bg: COLORS.goodBg }
        : oilScore >= 4
        ? { label: 'Fair',      color: COLORS.warning,  bg: COLORS.warningBg }
        : { label: 'Poor',      color: COLORS.critical, bg: COLORS.criticalBg };

      return { ...venue, totalRecordings: allRecs.length, complianceRate, complianceRate90, avgTPM, criticalRate: critRate, filteringRate, changedEarly, changedLate, oilRating, todayRecordings: todayRecs.length, health, daysWithRecs, pastDays };
    });

    const totalVenues    = venues.length;
    const healthyVenues  = venueStats.filter(v => v.health === 'good').length;
    const warningVenues  = venueStats.filter(v => v.health === 'warning').length;
    const criticalVenues = venueStats.filter(v => v.health === 'critical').length;
    const avgCompliance  = venueStats.length > 0 ? Math.round(venueStats.reduce((s, v) => s + v.complianceRate, 0) / venueStats.length) : 0;
    const numericTPMs    = venueStats.filter(v => v.avgTPM !== '—').map(v => parseFloat(v.avgTPM));
    const overallAvgTPM  = numericTPMs.length > 0 ? (numericTPMs.reduce((a, b) => a + b, 0) / numericTPMs.length).toFixed(1) : '—';

    // Group temp variance
    const allTempRecs = venueStats.flatMap(v => {
      const recs = recordingsByVenue[v.id] || {};
      return Object.values(recs).flat().filter(r => r.setTemperature && r.actualTemperature && !r.notInUse);
    });
    const groupAvgTempVariance = allTempRecs.length > 0
      ? allTempRecs.reduce((s, r) => s + calcTempVariancePct(r.setTemperature, r.actualTemperature), 0) / allTempRecs.length
      : null;

    const totalFryers = venueStats.reduce((s, v) => s + (v.fryerCount || 4), 0);

    // Oil grade
    const avgFilterRate = venueStats.length > 0 ? venueStats.reduce((s, v) => s + v.filteringRate, 0) / venueStats.length : 0;
    const avgCritRate   = venueStats.length > 0 ? venueStats.reduce((s, v) => s + v.criticalRate, 0)  / venueStats.length : 0;
    const numericAvgTPM = numericTPMs.length > 0 ? numericTPMs.reduce((a, b) => a + b, 0) / numericTPMs.length : 0;
    let oilScore = 0;
    if (avgFilterRate >= 80) oilScore += 3; else if (avgFilterRate >= 60) oilScore += 2; else if (avgFilterRate >= 40) oilScore += 1;
    if (numericAvgTPM < 15) oilScore += 3; else if (numericAvgTPM < warnAt) oilScore += 2; else if (numericAvgTPM < 22) oilScore += 1;
    if (avgCritRate <= 5) oilScore += 2; else if (avgCritRate <= 15) oilScore += 1;
    if (avgCompliance >= 90) oilScore += 2; else if (avgCompliance >= 70) oilScore += 1;
    const oilGrade = oilScore >= 9
      ? { label: 'Excellent', color: COLORS.good,    bg: COLORS.goodBg }
      : oilScore >= 6
      ? { label: 'Good',      color: '#059669',       bg: '#d1fae5' }
      : oilScore >= 4
      ? { label: 'Fair',      color: COLORS.warning,  bg: COLORS.warningBg }
      : { label: 'Poor',      color: COLORS.critical, bg: COLORS.criticalBg };

    const topCritical = [...venueStats].sort((a, b) => b.criticalRate - a.criticalRate).slice(0, 3);
    const mostCompliant90 = [...venueStats].sort((a, b) => b.complianceRate90 - a.complianceRate90).slice(0, 3);
    const leastCompliant30 = [...venueStats].sort((a, b) => a.complianceRate - b.complianceRate).slice(0, 3);

    // Group-wide filtering rate
    const groupFilteringRate = venueStats.length > 0 ? Math.round(avgFilterRate) : 0;

    // ── Exec Summary extras ──
    const todayStr2 = formatDate(new Date());
    const recordedToday = venueStats.filter(v => v.todayRecordings > 0).length;
    const notRecordedToday = venueStats.filter(v => v.todayRecordings === 0).length;
    const notRecordedNames = venueStats.filter(v => v.todayRecordings === 0).map(v => v.name);

    // Actionable alerts
    const alerts = [];
    venueStats.forEach(v => {
      if (v.complianceRate < 70) alerts.push({ venue: v.name, id: v.id, type: 'critical', msg: `Compliance at ${v.complianceRate}% — well below 90% target` });
      if (v.criticalRate > 25) alerts.push({ venue: v.name, id: v.id, type: 'critical', msg: `${v.criticalRate}% of readings are critical — investigate oil change schedule` });
      if (v.filteringRate < 40) alerts.push({ venue: v.name, id: v.id, type: 'warning', msg: `Only ${v.filteringRate}% filtering rate — daily filtering extends oil life by 50%` });
      if (v.changedLate > 3) alerts.push({ venue: v.name, id: v.id, type: 'warning', msg: `${v.changedLate} late oil changes in the last 7 days` });
    });
    alerts.sort((a, b) => (a.type === 'critical' ? 0 : 1) - (b.type === 'critical' ? 0 : 1));

    // Best & worst performers (overall health score)
    const scored = venueStats.map(v => {
      let s = 0;
      if (v.complianceRate >= 90) s += 3; else if (v.complianceRate >= 70) s += 1;
      if (v.filteringRate >= 80) s += 2; else if (v.filteringRate >= 60) s += 1;
      if (v.criticalRate <= 5) s += 2; else if (v.criticalRate <= 15) s += 1;
      return { ...v, score: s };
    });
    const bestPerformers = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
    const worstPerformers = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);

    // Total oil changes in 7 days
    const totalChanges = venueStats.reduce((s, v) => s + v.changedLate + v.changedEarly, 0);
    const totalLateChanges = venueStats.reduce((s, v) => s + v.changedLate, 0);
    const totalEarlyChanges = venueStats.reduce((s, v) => s + v.changedEarly, 0);

    // ── Exec Summary extras — group-level aggregates from all venue readings ──

    // Flatten all readings across all venues for last 7 days
    const allGroupRecs = venueStats.flatMap(v => {
      const recs = recordingsByVenue[v.id] || {};
      return last7days.flatMap(date => (recs[date] || []).filter(r => !r.notInUse && r.tpmValue != null).map(r => ({ ...r, date })));
    });
    const totalGroupReadings = allGroupRecs.length;

    // Group-level critical rate
    const groupCritCount = allGroupRecs.filter(r => r.tpmValue >= critAt).length;
    const groupWarnCount = allGroupRecs.filter(r => r.tpmValue >= warnAt && r.tpmValue < critAt).length;
    const groupGoodCount = allGroupRecs.filter(r => r.tpmValue < warnAt).length;
    const groupCritRate = totalGroupReadings > 0 ? Math.round((groupCritCount / totalGroupReadings) * 100) : 0;

    // Oil management stats — group level
    const oilAgeRecs = allGroupRecs.filter(r => r.oilAge);
    const groupAvgOilAge = oilAgeRecs.length > 0 ? oilAgeRecs.reduce((s, r) => s + parseInt(r.oilAge), 0) / oilAgeRecs.length : 0;

    // Changed Too Early / Too Late — group level (from individual readings)
    const groupChangedTooEarly = (() => {
      let count = 0;
      const byVenueFryer = {};
      allGroupRecs.forEach(r => {
        const key = `${r.venueId || ''}_${r.fryerNumber}`;
        if (!byVenueFryer[key]) byVenueFryer[key] = {};
        if (!byVenueFryer[key][r.date]) byVenueFryer[key][r.date] = [];
        byVenueFryer[key][r.date].push(r);
      });
      Object.values(byVenueFryer).forEach(fryerDates => {
        const sorted = Object.keys(fryerDates).sort();
        for (let i = 1; i < sorted.length; i++) {
          const fresh = fryerDates[sorted[i]].find(r => isFreshOil(r.oilAge));
          if (!fresh) continue;
          const pv = fryerDates[sorted[i - 1]].map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v));
          if (pv.length === 0) continue;
          if (Math.max(...pv) < warnAt) count++;
        }
      });
      return count;
    })();
    const groupChangedTooLate = (() => {
      let count = 0;
      const byVenueFryer = {};
      allGroupRecs.forEach(r => {
        const key = `${r.venueId || ''}_${r.fryerNumber}`;
        if (!byVenueFryer[key]) byVenueFryer[key] = {};
        if (!byVenueFryer[key][r.date]) byVenueFryer[key][r.date] = [];
        byVenueFryer[key][r.date].push(r);
      });
      Object.values(byVenueFryer).forEach(fryerDates => {
        const sorted = Object.keys(fryerDates).sort();
        for (let i = 1; i < sorted.length; i++) {
          const fresh = fryerDates[sorted[i]].find(r => isFreshOil(r.oilAge));
          if (!fresh) continue;
          const pv2 = fryerDates[sorted[i - 1]].map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v));
          if (pv2.length === 0) continue;
          if (Math.max(...pv2) >= critAt) count++;
        }
      });
      return count;
    })();

    // Temp control — group level
    const groupTempRecs = allGroupRecs.filter(r => r.setTemperature && r.actualTemperature);
    const groupTempVariances = groupTempRecs.map(r => Math.abs(((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100));
    const groupSignedTempVariances = groupTempRecs.map(r => ((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100);
    const groupGoodTempControl = groupTempVariances.filter(v => v <= 7).length;
    const groupTempControlRate = groupTempRecs.length > 0 ? Math.round((groupGoodTempControl / groupTempRecs.length) * 100) : 0;
    const groupAvgSignedTempVariance = groupSignedTempVariances.length > 0 ? (groupSignedTempVariances.reduce((a, b) => a + b, 0) / groupSignedTempVariances.length) : 0;

    // Food type analysis — group level
    const groupFoodTypeData = {};
    allGroupRecs.forEach(r => {
      if (!r.foodType) return;
      if (!groupFoodTypeData[r.foodType]) groupFoodTypeData[r.foodType] = { count: 0, totalTPM: 0 };
      groupFoodTypeData[r.foodType].count++;
      groupFoodTypeData[r.foodType].totalTPM += parseFloat(r.tpmValue) || 0;
    });
    const groupFoodTypeAnalysis = Object.entries(groupFoodTypeData).map(([type, d]) => ({
      type, count: d.count, avgTPM: (d.totalTPM / d.count).toFixed(1),
    })).sort((a, b) => b.count - a.count);

    // Weekly compliance pattern — group level (last 7 days)
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const groupDayStats = {};
    dayNames.forEach(d => { groupDayStats[d] = { recorded: 0, total: 0 }; });
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = dayNames[d.getDay()];
      const ds = formatDate(d);
      // Count how many venues recorded on this date
      const venuesRecorded = venues.filter(v => {
        const recs = recordingsByVenue[v.id] || {};
        return (recs[ds] || []).length > 0;
      }).length;
      groupDayStats[dn].total += totalVenues;
      groupDayStats[dn].recorded += venuesRecorded;
    }

    // TPM Trend — group level (avg TPM across all venues per day)
    const buildGroupTrend = (days) => {
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const ds = formatDate(d);
        const dayRecs = venues.flatMap(v => {
          const recs = recordingsByVenue[v.id] || {};
          return (recs[ds] || []).filter(r => !r.notInUse && r.tpmValue != null);
        });
        const avg = dayRecs.length > 0 ? dayRecs.reduce((s, r) => s + r.tpmValue, 0) / dayRecs.length : null;
        result.push({ label: d.getDate().toString(), avg, count: dayRecs.length });
      }
      return result;
    };
    const groupLast30 = buildGroupTrend(30);
    const groupLast7 = buildGroupTrend(7);

    // TPM Recording Health — group level (like admin panel)
    const getAgeDays = (dateStr) => {
      if (!dateStr) return 999;
      const d = new Date(dateStr + 'T00:00:00');
      return Math.floor((today - d) / 86400000);
    };
    const venueLastTpm = venueStats.map(v => {
      const recs = recordingsByVenue[v.id] || {};
      const allDates = Object.keys(recs).filter(d => (recs[d] || []).length > 0).sort().reverse();
      return { ...v, lastTpmDate: allDates[0] || null };
    });
    const tpmHealthToday = venueLastTpm.filter(v => getAgeDays(v.lastTpmDate) === 0).length;
    const tpmHealthYesterday = venueLastTpm.filter(v => getAgeDays(v.lastTpmDate) === 1).length;
    const tpmHealthOverdue2 = venueLastTpm.filter(v => getAgeDays(v.lastTpmDate) >= 2 && getAgeDays(v.lastTpmDate) < 7).length;
    const tpmHealthOverdue7 = venueLastTpm.filter(v => getAgeDays(v.lastTpmDate) >= 7).length;
    const tpmHealthCompliancePct = totalVenues > 0 ? Math.round(((tpmHealthToday + tpmHealthYesterday) / totalVenues) * 100) : 0;
    const tpmHealthIsHealthy = tpmHealthCompliancePct >= 80;
    const overdueVenueList = venueLastTpm.filter(v => getAgeDays(v.lastTpmDate) >= 2).sort((a, b) => getAgeDays(b.lastTpmDate) - getAgeDays(a.lastTpmDate));

    return { venueStats, totalVenues, healthyVenues, warningVenues, criticalVenues, avgCompliance, overallAvgTPM, groupAvgTempVariance, totalFryers, oilGrade, topCritical, mostCompliant90, leastCompliant30, groupFilteringRate, recordedToday, notRecordedToday, notRecordedNames, alerts, bestPerformers, worstPerformers, totalChanges, totalLateChanges, totalEarlyChanges, totalGroupReadings, groupCritCount, groupWarnCount, groupGoodCount, groupCritRate, groupAvgOilAge, groupChangedTooEarly, groupChangedTooLate, groupTempControlRate, groupAvgSignedTempVariance, groupDayStats, dayNames, groupLast30, groupLast7, tpmHealthToday, tpmHealthYesterday, tpmHealthOverdue2, tpmHealthOverdue7, tpmHealthCompliancePct, tpmHealthIsHealthy, overdueVenueList, groupFoodTypeAnalysis };
  }, [venues, recordingsByVenue, warnAt, critAt]);

  const { venueStats, totalVenues, healthyVenues, warningVenues, criticalVenues, avgCompliance, overallAvgTPM, groupAvgTempVariance, totalFryers, oilGrade, topCritical, mostCompliant90, leastCompliant30, groupFilteringRate, recordedToday, notRecordedToday, notRecordedNames, alerts, bestPerformers, worstPerformers, totalChanges, totalLateChanges, totalEarlyChanges, totalGroupReadings, groupCritCount, groupWarnCount, groupGoodCount, groupCritRate, groupAvgOilAge, groupChangedTooEarly, groupChangedTooLate, groupTempControlRate, groupAvgSignedTempVariance, groupDayStats, dayNames, groupLast30, groupLast7, tpmHealthToday, tpmHealthYesterday, tpmHealthOverdue2, tpmHealthOverdue7, tpmHealthCompliancePct, tpmHealthIsHealthy, overdueVenueList, groupFoodTypeAnalysis } = computed;

  if (venues.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <Building size={48} color={COLORS.textFaint} style={{ marginBottom: '16px' }} />
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: COLORS.text, marginBottom: '8px' }}>No venues found</h3>
        <p style={{ color: COLORS.textMuted, fontSize: '14px' }}>No venues are linked to this group yet.</p>
      </div>
    );
  }

  const filteredVenues = venueStats
    .filter(v => healthFilter === 'all' || (healthFilter === 'recorded' ? v.todayRecordings > 0 : v.todayRecordings === 0))
    .sort((a, b) => {
      const aRec = a.todayRecordings > 0 ? 1 : 0;
      const bRec = b.todayRecordings > 0 ? 1 : 0;
      if (aRec !== bRec) return aRec - bRec;
      return a.name.localeCompare(b.name);
    });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: COLORS.text, marginBottom: '2px' }}>{groupName}</h2>
          <p style={{ fontSize: '14px', color: COLORS.textMuted, margin: 0 }}>{totalVenues} venue{totalVenues !== 1 ? 's' : ''} · Last 7 days</p>
        </div>
      </div>

      {/* AT A GLANCE — table only */}
      {groupView === 'glance' && (<>
        {/* Recording filter */}
        <div style={{ display: 'flex', background: COLORS.bg, borderRadius: '8px', padding: '3px', border: `1px solid ${COLORS.border}`, alignSelf: 'flex-start', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { id: 'all',          label: 'All',              count: totalVenues },
            { id: 'not_recorded', label: 'Not recorded',     count: notRecordedToday,  color: COLORS.critical },
            { id: 'recorded',     label: 'Recorded today',   count: recordedToday,     color: COLORS.good },
          ].map(({ id, label, count, color }) => {
            const active = healthFilter === id;
            return (
              <button key={id} onClick={() => setHealthFilter(id)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: active ? COLORS.white : 'transparent', color: active ? (color || COLORS.text) : COLORS.textMuted, borderRadius: '6px', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {label}
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '1px 6px', borderRadius: '10px', background: active ? COLORS.bg : 'transparent', color: color || COLORS.textMuted }}>{count}</span>
              </button>
            );
          })}
        </div>

        {isDesktop ? (
          <div style={{ background: COLORS.white, borderRadius: '12px', border: `1px solid ${COLORS.border}`, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="gm-table">
                <thead>
                  <tr>
                    <th style={{ width: '4px', padding: 0 }}></th>
                    <th style={{ width: '18%' }}>Venue</th>
                    <th style={{ textAlign: 'center', width: '8%' }}>Fryers</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>Compliance</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>Changed Late</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>Changed Early</th>
                    <th style={{ textAlign: 'center', width: '11%' }}>Oil Filtered</th>
                    <th style={{ textAlign: 'center', width: '13%' }}>Oil Mgt Rating</th>
                    <th style={{ textAlign: 'center', width: '7%' }}>Today</th>
                    <th style={{ width: '24px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVenues.map(venue => {
                    const compColor  = complianceColor(venue.complianceRate);
                    const filtColor  = venue.filteringRate >= 80 ? COLORS.good : venue.filteringRate >= 60 ? COLORS.warning : COLORS.critical;
                    const todayColor = venue.todayRecordings > 0 ? COLORS.good : COLORS.critical;
                    const lateColor  = venue.changedLate  > 0 ? COLORS.critical : COLORS.textFaint;
                    const earlyColor = venue.changedEarly > 0 ? COLORS.warning  : COLORS.textFaint;
                    return (
                      <tr key={venue.id} onClick={() => onDrillDown(venue.id)}>
                        <td style={{ padding: 0, width: '4px', background: venue.todayRecordings > 0 ? COLORS.good : COLORS.critical }}></td>
                        <td style={{ fontWeight: '600', fontSize: '13px' }}>{venue.name}</td>
                        <td style={{ textAlign: 'center', color: COLORS.textMuted }}>{venue.fryerCount || 4}</td>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: compColor }}>{venue.complianceRate}%</td>
                        <td style={{ textAlign: 'center', fontWeight: '600', color: lateColor }}>{venue.changedLate === 0 ? '0' : venue.changedLate}</td>
                        <td style={{ textAlign: 'center', fontWeight: '600', color: earlyColor }}>{venue.changedEarly === 0 ? '0' : venue.changedEarly}</td>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: filtColor }}>{venue.filteringRate}%</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: venue.oilRating.bg, color: venue.oilRating.color }}>{venue.oilRating.label}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: todayColor, margin: '0 auto' }} title={venue.todayRecordings > 0 ? 'Recorded today' : 'Not recorded today'} />
                        </td>
                        <td><ChevronRight size={14} color={COLORS.textFaint} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredVenues.map(venue => {
              const compColor  = complianceColor(venue.complianceRate);
              const filtColor  = venue.filteringRate >= 80 ? COLORS.good : venue.filteringRate >= 60 ? COLORS.warning : COLORS.critical;
              const todayColor = venue.todayRecordings > 0 ? COLORS.good : COLORS.critical;
              return (
                <div key={venue.id} onClick={() => onDrillDown(venue.id)} style={{
                  background: COLORS.white, borderRadius: '10px', border: `1px solid ${COLORS.border}`,
                  padding: '14px', cursor: 'pointer', borderLeft: `4px solid ${todayColor}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: venue.oilRating.bg, color: venue.oilRating.color }}>{venue.oilRating.label}</span>
                      <ChevronRight size={14} color={COLORS.textFaint} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Compliance</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: compColor }}>{venue.complianceRate}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Filtered</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: filtColor }}>{venue.filteringRate}%</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Late</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: venue.changedLate > 0 ? COLORS.critical : COLORS.textFaint }}>{venue.changedLate}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Fryers</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: COLORS.textMuted }}>{venue.fryerCount || 4}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {/* EXEC SUMMARY — group-level SummaryView + TPM Recording Health */}
      {groupView === 'exec' && (
        <div>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>{totalGroupReadings} readings analyzed across {totalVenues} venues • Last 7 days</p>

          {/* Pair 1: 4 KPI cards + Oil Management */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '16px' }}>
            {/* KPIs 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', height: '100%' }}>
              {[
                { label: 'COMPLIANCE',       value: `${avgCompliance}%`,    color: avgCompliance >= 90 ? '#10b981' : avgCompliance >= 70 ? '#f59e0b' : '#ef4444',                                                                              target: '90%+' },
                { label: 'REACHED CRITICAL', value: `${groupCritRate}%`,    color: groupCritRate <= 10 ? '#10b981' : groupCritRate <= 25 ? '#f59e0b' : '#ef4444',                                                                              target: '<10%' },
                { label: 'AVG TPM',          value: overallAvgTPM,          color: overallAvgTPM !== '—' && parseFloat(overallAvgTPM) < warnAt ? '#10b981' : overallAvgTPM !== '—' && parseFloat(overallAvgTPM) < critAt ? '#f59e0b' : '#ef4444', target: `<${warnAt}` },
                { label: 'FILTERING',        value: `${groupFilteringRate}%`,color: groupFilteringRate >= 80 ? '#10b981' : groupFilteringRate >= 60 ? '#f59e0b' : '#ef4444',                                                                  target: '80%+' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: 'white', borderRadius: '10px', padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>{kpi.label}</div>
                  <div style={{ fontSize: '26px', fontWeight: '700', color: kpi.color, lineHeight: '1', marginBottom: '6px' }}>{kpi.value}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>target: {kpi.target}</div>
                </div>
              ))}
            </div>

            {/* Oil Management */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: 0 }}>Oil Management</h3>
                <div style={{ padding: '3px 8px', borderRadius: '5px', background: oilGrade.bg, color: oilGrade.color, fontSize: '11px', fontWeight: '700' }}>{oilGrade.label}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { val: groupAvgOilAge.toFixed(1), label: 'Avg Oil Life',       sub: 'Longer is better*' },
                  { val: groupChangedTooEarly,       label: 'Changed Too Early',  sub: `Before ${warnAt} TPM` },
                  { val: groupChangedTooLate,        label: 'Changed Too Late',   sub: `After ${critAt} TPM` },
                  { val: `${groupTempControlRate}%`, label: 'Temp Control',       sub: `${groupAvgSignedTempVariance > 0 ? '+' : groupAvgSignedTempVariance < 0 ? '-' : ''}${Math.abs(groupAvgSignedTempVariance).toFixed(1)}% avg` },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937', marginBottom: '1px' }}>{item.val}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{item.label}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px', fontWeight: '600' }}>{item.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '10px', fontStyle: 'italic' }}>*Proper filtering and monitoring extends oil life</div>
            </div>
          </div>

          {/* Pair 2: Weekly Compliance + 7-Day TPM Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Weekly Compliance */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px 0' }}>Weekly Compliance</h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>Recording rate by day across all venues (last 30 days)</p>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {dayNames.map(day => {
                  const rate = groupDayStats[day].total > 0 ? Math.round((groupDayStats[day].recorded / groupDayStats[day].total) * 100) : 0;
                  const col = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={day} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>{day}</div>
                      <div style={{ height: '50px', background: '#f3f4f6', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${rate}%`, background: col, transition: 'height 0.3s' }} />
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: col, marginTop: '4px' }}>{rate}%</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', fontStyle: 'italic' }}>
                {(() => {
                  const rates = dayNames.map(d => ({ day: d, rate: groupDayStats[d].total > 0 ? Math.round((groupDayStats[d].recorded / groupDayStats[d].total) * 100) : 0 }));
                  const lowest = rates.reduce((m, c) => c.rate < m.rate ? c : m);
                  const highest = rates.reduce((m, c) => c.rate > m.rate ? c : m);
                  return lowest.rate < 50 ? `${lowest.day} is commonly missed • ${highest.day} has best compliance` : 'Great consistency across all days!';
                })()}
              </div>
            </div>

            {/* 7-Day TPM Trend */}
            {(() => {
              const maxT = Math.max(...groupLast7.filter(d => d.avg != null).map(d => d.avg), 30);
              return (
                <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0' }}>7-Day TPM Trend</h3>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '100px' }}>
                    {groupLast7.map((day, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        {day.avg != null ? (
                          <>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: getTPMStatus(day.avg, warnAt, critAt).color, marginBottom: '3px' }}>{day.avg.toFixed(0)}</div>
                            <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: getTPMStatus(day.avg, warnAt, critAt).color, height: `${Math.max((day.avg / maxT) * 100, 8)}%`, minHeight: '4px' }} />
                          </>
                        ) : (
                          <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
                        )}
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: '600' }}>{day.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '10px', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '2px', background: '#f59e0b' }} /> Warning ({warnAt})</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '2px', background: '#ef4444' }} /> Critical ({critAt})</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Pair 3: Quality Distribution + Most Fried Products */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Quality Distribution */}
            {totalGroupReadings > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0' }}>Quality Distribution</h3>
                <div style={{ display: 'flex', gap: '0', marginBottom: '10px', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ flex: groupGoodCount, background: '#10b981' }} />
                  <div style={{ flex: groupWarnCount, background: '#f59e0b' }} />
                  <div style={{ flex: groupCritCount, background: '#ef4444' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', textAlign: 'center' }}>
                  <div style={{ padding: '8px', background: '#f0fdf4', borderRadius: '8px' }}><div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>{Math.round((groupGoodCount / totalGroupReadings) * 100)}%</div><div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Good ({groupGoodCount})</div></div>
                  <div style={{ padding: '8px', background: '#fffbeb', borderRadius: '8px' }}><div style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b' }}>{Math.round((groupWarnCount / totalGroupReadings) * 100)}%</div><div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Warning ({groupWarnCount})</div></div>
                  <div style={{ padding: '8px', background: '#fef2f2', borderRadius: '8px' }}><div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>{groupCritRate}%</div><div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Critical ({groupCritCount})</div></div>
                </div>
              </div>
            )}

            {/* Most Fried Products */}
            {groupFoodTypeAnalysis.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 10px 0' }}>Most Fried Products</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {groupFoodTypeAnalysis.slice(0, 3).map(item => (
                    <div key={item.type} style={{ padding: '10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', marginBottom: '4px', minHeight: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.type}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', letterSpacing: '0.5px' }}>AVG TPM</div>
                      <div style={{ fontSize: '22px', fontWeight: '700', color: parseFloat(item.avgTPM) < warnAt ? '#10b981' : parseFloat(item.avgTPM) < critAt ? '#f59e0b' : '#ef4444' }}>{item.avgTPM}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{item.count} readings</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Priority Actions — full width */}
          <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '12px', padding: '16px', border: '1px solid #93c5fd', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1e40af', margin: '0 0 8px 0' }}>Priority Actions</h3>
            <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: '8px', flexWrap: 'wrap' }}>
              {avgCompliance < 80 && (
                <div style={{ flex: 1, minWidth: '200px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Recording Consistency</div>
                  <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>Group compliance is {avgCompliance}%. Implement daily reminders or assign to shift leaders.</div>
                </div>
              )}
              {groupCritRate > 15 && (
                <div style={{ flex: 1, minWidth: '200px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>High Critical Rate</div>
                  <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>{groupCritRate}% of readings reached critical TPM. Review oil change procedures across venues.</div>
                </div>
              )}
              {groupFilteringRate < 70 && (
                <div style={{ flex: 1, minWidth: '200px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Increase Filtering</div>
                  <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>Only {groupFilteringRate}% filtered across venues. Daily filtering can extend oil life by 50%.</div>
                </div>
              )}
              {groupTempControlRate < 80 && (
                <div style={{ flex: 1, minWidth: '200px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Temperature Control</div>
                  <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>{100 - groupTempControlRate}% of readings outside temp range. Review thermostat calibration across venues.</div>
                </div>
              )}
              {avgCompliance >= 80 && groupCritRate <= 15 && groupFilteringRate >= 70 && groupTempControlRate >= 80 && (
                <div style={{ flex: 1, minWidth: '200px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#059669', marginBottom: '2px' }}>Great Group Performance!</div>
                  <div style={{ fontSize: '11px', color: '#065f46', lineHeight: '1.5' }}>All group metrics within target. Keep up the excellent work across all venues.</div>
                </div>
              )}
            </div>
          </div>

          {/* TPM Recording Health */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: tpmHealthIsHealthy ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Droplets size={15} color={tpmHealthIsHealthy ? '#059669' : '#dc2626'} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>TPM Recording Health</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{totalVenues} venues</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: tpmHealthIsHealthy ? '#059669' : '#dc2626', lineHeight: 1 }}>{tpmHealthCompliancePct}%</div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: '#64748b', marginTop: '2px' }}>COMPLIANT</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: overdueVenueList.length > 0 ? '12px' : '0' }}>
              {[
                { label: 'Today',     count: tpmHealthToday,     color: '#10b981', bg: '#d1fae5' },
                { label: 'Yesterday', count: tpmHealthYesterday, color: '#3b82f6', bg: '#dbeafe' },
                { label: '2–6 days',  count: tpmHealthOverdue2,  color: '#f59e0b', bg: '#fef3c7' },
                { label: '7+ days',   count: tpmHealthOverdue7,  color: '#ef4444', bg: '#fee2e2' },
              ].map(b => (
                <div key={b.label} style={{ background: b.bg, borderRadius: '10px', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: b.color, lineHeight: 1 }}>{b.count}</div>
                  <div style={{ fontSize: '10px', fontWeight: '600', color: b.color, marginTop: '4px' }}>{b.label}</div>
                </div>
              ))}
            </div>
            {overdueVenueList.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px', marginBottom: '6px' }}>OVERDUE VENUES</div>
                {overdueVenueList.slice(0, 6).map((v, i) => {
                  const days = (() => { if (!v.lastTpmDate) return 999; const d = new Date(v.lastTpmDate + 'T00:00:00'); const t = new Date(); t.setHours(0,0,0,0); return Math.floor((t - d) / 86400000); })();
                  return (
                    <div key={v.id} onClick={() => onDrillDown(v.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: i < Math.min(overdueVenueList.length, 6) - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: days >= 7 ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937' }}>{days}d ago</span>
                    </div>
                  );
                })}
                {overdueVenueList.length > 6 && (
                  <div style={{ padding: '6px 0', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>+{overdueVenueList.length - 6} more</div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN GROUP MANAGER VIEW
// ─────────────────────────────────────────────
export default function GroupManagerView({ currentUser, onLogout }) {
  const [loading, setLoading]           = useState(true);
  const [group, setGroup]               = useState(null);
  const [venues, setVenues]             = useState([]);
  const [recordingsByVenue, setRecordingsByVenue] = useState({});
  const [systemSettings, setSystemSettings]     = useState(null);
  // Navigation
  const [primaryTab, setPrimaryTab]         = useState('all-venues');
  const [groupView, setGroupView]           = useState('glance');
  const [byVenueView, setByVenueView]      = useState('summary');
  const [calendarView, setCalendarView]     = useState('week');
  const [selectedDate, setSelectedDate]     = useState(new Date());
  const [selectedVenueId, setSelectedVenueId] = useState(null);

  // Responsive
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch group info
        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', currentUser.groupId)
          .single();

        if (groupData) setGroup(mapGroup(groupData));

        // Fetch venues for this group
        const { data: venueData } = await supabase
          .from('venues')
          .select('*')
          .eq('group_id', currentUser.groupId);

        const mappedVenues = (venueData || []).map(mapVenue);
        setVenues(mappedVenues);

        // Fetch system settings
        const { data: settingsData } = await supabase
          .from('system_settings')
          .select('*')
          .single();

        if (settingsData) setSystemSettings(mapSystemSettings(settingsData));

        // Fetch readings for all venues in a single batch query
        if (mappedVenues.length > 0) {
          const venueIds = mappedVenues.map(v => v.id);
          const { data: allReadings } = await supabase
            .from('tpm_readings')
            .select('*')
            .in('venue_id', venueIds)
            .order('reading_number', { ascending: true });

          // Group by venue, then use buildRecordingMap per venue
          const grouped = {};
          (allReadings || []).map(mapReading).forEach(r => {
            if (!grouped[r.venueId]) grouped[r.venueId] = [];
            grouped[r.venueId].push(r);
          });
          const byVenue = {};
          venueIds.forEach(id => { byVenue[id] = buildRecordingMap(grouped[id] || []); });
          setRecordingsByVenue(byVenue);
        }
      } catch (err) {
        console.error('GroupManagerView load error:', err);
      }
      setLoading(false);
    };
    loadData();
  }, [currentUser.groupId]);

  const handleDrillDown = (venueId) => {
    setSelectedVenueId(venueId);
    setPrimaryTab('by-venue');
    setByVenueView('summary');
  };

  const selectedVenue = venues.find(v => v.id === selectedVenueId);
  const activeRecordings = selectedVenueId ? (recordingsByVenue[selectedVenueId] || {}) : {};
  const flatReadings = useMemo(() => Object.entries(activeRecordings).flatMap(([date, recs]) => recs.map(r => ({ ...r, readingDate: r.readingDate || date }))), [activeRecordings]);

  const warnAt = systemSettings?.warningThreshold || 18;
  const critAt = systemSettings?.criticalThreshold || 24;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '24px',
        paddingBottom: '20vh', background: '#1a428a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <style>{`
          @keyframes cookersPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.06); opacity: 0.92; }
          }
          @keyframes dotFlash {
            0%, 20% { opacity: 0; }
            40%, 100% { opacity: 1; }
          }
        `}</style>
        <img src="/images/Cookers drop icon.png" alt="Loading" style={{
          width: '100px', height: '100px', objectFit: 'contain',
          animation: 'cookersPulse 1.6s ease-in-out infinite',
        }} />
        <div style={{ color: '#cbd5e1', fontSize: '16px', fontWeight: '500', letterSpacing: '0.5px' }}>
          Loading
          <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0s', opacity: 0 }}>.</span>
          <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0.3s', opacity: 0 }}>.</span>
          <span style={{ animation: 'dotFlash 1.4s infinite', animationDelay: '0.6s', opacity: 0 }}>.</span>
        </div>
      </div>
    );
  }

  // Tab styles
  const primaryTabStyle = (active) => ({
    flex: 1,
    padding: '13px 8px 11px',
    background: active ? COLORS.white : '#f0f2f7',
    border: `1.5px solid ${active ? COLORS.border : '#d4d9e5'}`,
    borderBottom: active ? `1.5px solid ${COLORS.white}` : `1.5px solid ${COLORS.border}`,
    borderRadius: '8px 8px 0 0',
    color: active ? COLORS.brand : '#7a8399',
    fontSize: '14px', fontWeight: active ? '700' : '600',
    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap', textAlign: 'center',
    position: 'relative',
    marginBottom: '-1.5px',
    zIndex: active ? 2 : 1,
  });

  const toggleStyle = (active, disabled) => ({
    flex: 1, padding: '9px 16px',
    background: active ? COLORS.brand : 'transparent',
    border: `1.5px solid ${disabled ? COLORS.border : active ? COLORS.brand : COLORS.border}`,
    borderRadius: '8px',
    color: disabled ? COLORS.border : active ? COLORS.white : COLORS.textMuted,
    fontSize: '13px', fontWeight: '600',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'all 0.15s', whiteSpace: 'nowrap', textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  });

  const calTabStyle = (active) => ({
    flex: 1, padding: '10px 4px', background: 'transparent', border: 'none',
    borderBottom: `3px solid ${active ? COLORS.brand : 'transparent'}`,
    color: active ? COLORS.brand : COLORS.textMuted,
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center',
  });

  return (
    <div style={{
      ...(isDesktop
        ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : { minHeight: '100vh' }),
      background: COLORS.bg,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
    }}>
    <style>{`
      .gm-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
      .gm-table thead th { position: sticky; top: 0; z-index: 20; padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
      .gm-table tbody tr { transition: background 0.1s; cursor: pointer; }
      .gm-table tbody tr:hover { background: #eef2ff; }
      .gm-table tbody td { padding: 8px 10px; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f1f5f9; vertical-align: middle; white-space: nowrap; }
    `}</style>
      {/* HEADER */}
      <div style={{ ...(isDesktop ? { flexShrink: 0 } : {}), zIndex: 100, background: '#1a428a', padding: isDesktop ? '6px 16px' : '0 0 0 0' }}>
        {isDesktop ? (
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/images/App header.png" alt="Frysmart" style={{ height: '65px' }} />
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                background: HEADER_BADGE_COLORS.group_manager.bg, color: HEADER_BADGE_COLORS.group_manager.color, border: `1px solid ${HEADER_BADGE_COLORS.group_manager.border}`,
                letterSpacing: '0.5px'
              }}>GROUP MANAGER</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '-4px' }}>
              <img src="/images/App header.png" alt="Frysmart" style={{ height: '62px', maxWidth: 'calc(100vw - 16px)', objectFit: 'contain', objectPosition: 'left' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '16px', paddingRight: '12px', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                  background: HEADER_BADGE_COLORS.group_manager.bg, color: HEADER_BADGE_COLORS.group_manager.color, border: `1px solid ${HEADER_BADGE_COLORS.group_manager.border}`,
                  letterSpacing: '0.5px'
                }}>GROUP MANAGER</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
              </div>
              <button
                onClick={() => { if (window.confirm('Are you sure you want to log out?')) onLogout(); }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: '600' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Desktop: Sidebar + Content ─── */}
      {isDesktop ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {/* Sidebar */}
          <div style={{
            width: '220px', flexShrink: 0, background: COLORS.white, borderRight: `1px solid ${COLORS.border}`,
            padding: '20px 12px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              {/* Core section — At a Glance + Exec Summary */}
              <div style={{ background: '#f0f4fa', borderRadius: '10px', padding: '6px', marginBottom: '14px' }}>
                {[
                  { id: 'glance', label: 'At a Glance', icon: BarChart3 },
                  { id: 'exec',   label: 'Exec Summary', icon: Eye },
                ].map(item => {
                  const isActive = primaryTab === 'all-venues' && groupView === item.id;
                  return (
                    <button key={item.id} onClick={() => { setPrimaryTab('all-venues'); setGroupView(item.id); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '2px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#1a428a' : 'transparent',
                      color: isActive ? 'white' : '#1a428a',
                      fontWeight: '600', fontSize: '13px',
                    }}>
                      <item.icon size={17} color={isActive ? 'white' : '#1a428a'} /> {item.label}
                    </button>
                  );
                })}
              </div>

              {/* By Venue section */}
              <div style={{ marginBottom: '14px' }}>
              <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>By Venue</div>
              {/* Venue dropdown */}
              <div style={{ padding: '0 12px 8px 16px' }}>
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedVenueId || ''}
                    disabled={venues.length === 0}
                    onChange={e => { if (e.target.value) { setSelectedVenueId(e.target.value); setPrimaryTab('by-venue'); } }}
                    style={{ appearance: 'none', width: '100%', padding: '7px 28px 7px 10px', border: `1.5px solid ${selectedVenueId && primaryTab === 'by-venue' ? '#c7d7f8' : COLORS.border}`, borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: COLORS.brand, background: selectedVenueId && primaryTab === 'by-venue' ? '#e8f0fe' : COLORS.white, cursor: 'pointer', outline: 'none' }}
                  >
                    {venues.length === 0
                      ? <option value="">No venues</option>
                      : <>
                          <option value="" disabled>Choose venue...</option>
                          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </>
                    }
                  </select>
                  <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <ChevronDown size={12} color={COLORS.brand} />
                  </div>
                </div>
              </div>
              {/* Dashboard + Summary */}
              {(() => {
                const goToByVenue = (view, cal) => {
                  if (selectedVenueId) { setPrimaryTab('by-venue'); setByVenueView(view); if (cal) setCalendarView(cal); }
                  else if (venues.length > 0) { setSelectedVenueId(venues[0].id); setPrimaryTab('by-venue'); setByVenueView(view); if (cal) setCalendarView(cal); }
                };
                const dashActive = primaryTab === 'by-venue' && byVenueView === 'dashboard';
                const summActive = primaryTab === 'by-venue' && byVenueView === 'summary';
                return (<>
                  <button onClick={() => goToByVenue('summary')} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                    background: summActive ? '#e8eef6' : 'transparent',
                    color: summActive ? COLORS.brand : '#1f2937',
                    fontWeight: summActive ? '600' : '500', fontSize: '13px',
                  }}>
                    <BarChart3 size={15} /> Summary
                  </button>
                  <button onClick={() => goToByVenue('dashboard')} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                    background: dashActive ? '#e8eef6' : 'transparent',
                    color: dashActive ? COLORS.brand : '#1f2937',
                    fontWeight: dashActive ? '600' : '500', fontSize: '13px',
                  }}>
                    <Eye size={15} /> Dashboard
                  </button>
                </>);
              })()}
              {/* Calendar with always-visible scale sub-items */}
              <button onClick={() => {
                if (selectedVenueId) { setPrimaryTab('by-venue'); setByVenueView('calendar'); }
                else if (venues.length > 0) { setSelectedVenueId(venues[0].id); setPrimaryTab('by-venue'); setByVenueView('calendar'); }
              }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                background: primaryTab === 'by-venue' && byVenueView === 'calendar' ? '#e8eef6' : 'transparent',
                color: primaryTab === 'by-venue' && byVenueView === 'calendar' ? COLORS.brand : '#1f2937',
                fontWeight: primaryTab === 'by-venue' && byVenueView === 'calendar' ? '600' : '500', fontSize: '13px',
              }}>
                <Calendar size={15} /> Calendar
              </button>
              {/* Day / Week / Month / Qtr / Year — always visible under Calendar */}
              <div style={{ paddingLeft: '28px', marginTop: '2px', marginBottom: '4px' }}>
                {['Day', 'Week', 'Month', 'Quarter', 'Year'].map(v => {
                  const isScale = primaryTab === 'by-venue' && byVenueView === 'calendar' && calendarView === v.toLowerCase();
                  return (
                    <button key={v} onClick={() => {
                      if (selectedVenueId) { setPrimaryTab('by-venue'); setByVenueView('calendar'); setCalendarView(v.toLowerCase()); }
                      else if (venues.length > 0) { setSelectedVenueId(venues[0].id); setPrimaryTab('by-venue'); setByVenueView('calendar'); setCalendarView(v.toLowerCase()); }
                    }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      marginBottom: '1px', textAlign: 'left',
                      background: isScale ? '#f0f4ff' : 'transparent',
                      color: isScale ? COLORS.brand : '#94a3b8',
                      fontWeight: isScale ? '600' : '500', fontSize: '13px',
                    }}>{v}</button>
                  );
                })}
              </div>
              </div>
            </div>
            {/* Logout at bottom */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
              <button onClick={() => { if (window.confirm('Are you sure you want to log out?')) onLogout(); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '9px', borderRadius: '8px', border: '1px solid #fca5a5',
                background: '#fff5f5', fontSize: '12px', fontWeight: '600', color: '#dc2626',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <LogOut size={14} /> Log Out
              </button>
            </div>
          </div>
          {/* Content — scrollable */}
          <div style={{ flex: 1, minWidth: 0, padding: '20px 16px 40px', overflowY: 'auto' }}>
            {primaryTab === 'all-venues' && (
              <ManagerOverview venues={venues} recordingsByVenue={recordingsByVenue} groupName={group?.name || currentUser?.name || 'Group'} systemSettings={systemSettings} onDrillDown={handleDrillDown} groupView={groupView} />
            )}
            {primaryTab === 'by-venue' && !selectedVenueId && (
              <div style={{ maxWidth: '600px', margin: '60px auto', padding: '20px', textAlign: 'center' }}>
                <Building size={48} color={COLORS.textFaint} style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: COLORS.text, marginBottom: '8px' }}>Select a Venue</h3>
                <p style={{ color: COLORS.textMuted, fontSize: '14px' }}>Choose a venue from the sidebar to view its details.</p>
              </div>
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'dashboard' && (
              <DashboardView readings={flatReadings} isWide />
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'summary' && (
              <SummaryView readings={flatReadings} isWide />
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'calendar' && (
              <div>
                {calendarView === 'day'     && <DayView     readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'week'    && <WeekView    readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'month'   && <MonthView   readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'quarter' && <QuarterView readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'year'    && <YearView    readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ─── Mobile: Horizontal tab bar ─── */}
          <div style={{ background: COLORS.white, borderBottom: `1.5px solid ${COLORS.border}`, position: 'sticky', top: 0, zIndex: 99, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: `1.5px solid ${COLORS.border}`, background: COLORS.bg, padding: '8px 8px 0' }}>
              <button onClick={() => setPrimaryTab('all-venues')} style={primaryTabStyle(primaryTab === 'all-venues')}>
                Group Dashboard
              </button>
              <button
                onClick={() => { setPrimaryTab('by-venue'); if (!selectedVenueId && venues.length > 0) setSelectedVenueId(venues[0].id); }}
                style={{ ...primaryTabStyle(primaryTab === 'by-venue'), marginLeft: '4px' }}
              >
                By Venue
              </button>
            </div>
            {primaryTab === 'all-venues' && (
              <div style={{ padding: '10px 16px', display: 'flex', gap: '8px', background: COLORS.white }}>
                <button onClick={() => setGroupView('glance')} style={toggleStyle(groupView === 'glance', false)}><BarChart3 size={15} /> At a Glance</button>
                <button onClick={() => setGroupView('exec')} style={toggleStyle(groupView === 'exec', false)}><Eye size={15} /> Exec Summary</button>
              </div>
            )}
            {primaryTab === 'by-venue' && (
              <div style={{ padding: '10px 16px', borderBottom: `1.5px solid ${COLORS.border}`, background: COLORS.bg, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0 }}>Viewing venue</div>
                <div style={{ flex: 1, position: 'relative', borderRadius: '8px', border: `1.5px solid ${selectedVenueId ? '#c7d7f8' : COLORS.border}`, background: selectedVenueId ? '#e8f0fe' : COLORS.white, overflow: 'hidden' }}>
                  <select value={selectedVenueId || ''} disabled={venues.length === 0} onChange={e => { if (e.target.value) setSelectedVenueId(e.target.value); }}
                    style={{ appearance: 'none', background: 'transparent', border: 'none', color: venues.length > 0 ? COLORS.brand : '#c0cad4', fontSize: '14px', fontWeight: '700', cursor: venues.length > 0 ? 'pointer' : 'default', outline: 'none', padding: '9px 36px 9px 12px', width: '100%', display: 'block' }}>
                    {venues.length === 0 ? <option value="">No venues</option> : <><option value="" disabled>Choose a venue...</option>{venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</>}
                  </select>
                  <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><ChevronDown size={14} color={venues.length > 0 ? COLORS.brand : '#c0cad4'} /></div>
                </div>
              </div>
            )}
            {primaryTab === 'by-venue' && (
              <div style={{ padding: '10px 16px', display: 'flex', gap: '8px', borderBottom: byVenueView === 'calendar' ? `1.5px solid ${COLORS.border}` : 'none', background: COLORS.white }}>
                <button onClick={() => { if (selectedVenueId) setByVenueView('summary'); }} style={toggleStyle(byVenueView === 'summary', !selectedVenueId)}><BarChart3 size={15} /> Summary</button>
                <button onClick={() => { if (selectedVenueId) setByVenueView('dashboard'); }} style={toggleStyle(byVenueView === 'dashboard', !selectedVenueId)}><Eye size={15} /> Dashboard</button>
                <button onClick={() => { if (selectedVenueId) setByVenueView('calendar'); }} style={toggleStyle(byVenueView === 'calendar', !selectedVenueId)}><Calendar size={15} /> Calendar</button>
              </div>
            )}
            {primaryTab === 'by-venue' && byVenueView === 'calendar' && selectedVenueId && (
              <div style={{ display: 'flex', background: COLORS.white, borderTop: `1px solid ${COLORS.bg}` }}>
                {['Day', 'Week', 'Month', 'Qtr', 'Year'].map(v => {
                  const val = v === 'Qtr' ? 'quarter' : v.toLowerCase();
                  return <button key={v} onClick={() => setCalendarView(val)} style={calTabStyle(calendarView === val)}>{v}</button>;
                })}
              </div>
            )}
          </div>
          <div style={{ paddingBottom: '40px' }}>
            {primaryTab === 'all-venues' && (
              <ManagerOverview venues={venues} recordingsByVenue={recordingsByVenue} groupName={group?.name || currentUser?.name || 'Group'} systemSettings={systemSettings} onDrillDown={handleDrillDown} groupView={groupView} />
            )}
            {primaryTab === 'by-venue' && !selectedVenueId && (
              <div style={{ maxWidth: '600px', margin: '60px auto', padding: '20px', textAlign: 'center' }}>
                <Building size={48} color={COLORS.textFaint} style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: COLORS.text, marginBottom: '8px' }}>Select a Venue</h3>
                <p style={{ color: COLORS.textMuted, fontSize: '14px' }}>Choose a venue from the dropdown above to view its details.</p>
              </div>
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'dashboard' && (
              <DashboardView readings={flatReadings} />
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'summary' && (
              <SummaryView readings={flatReadings} />
            )}
            {primaryTab === 'by-venue' && selectedVenueId && byVenueView === 'calendar' && (
              <>
                {calendarView === 'day'     && <DayView     readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'week'    && <WeekView    readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'month'   && <MonthView   readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'quarter' && <QuarterView readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
                {calendarView === 'year'    && <YearView    readings={flatReadings} selectedDate={selectedDate} onDateChange={setSelectedDate} fryerCount={selectedVenue?.fryerCount || 4} />}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
