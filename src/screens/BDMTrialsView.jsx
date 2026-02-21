import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { mapVenue, unMapVenue, mapOilType, mapCompetitor, mapReading, unMapReading, mapTrialReason, mapSystemSettings } from '../lib/mappers';
import {
  TRIAL_STATUS_COLORS, OIL_TIER_COLORS, COMPETITOR_TIER_COLORS,
  STATE_BADGE_COLORS, VOLUME_BRACKET_COLORS, getThemeColors,
} from '../lib/badgeConfig';
import {
  Plus, X, Check, Clock, AlertTriangle, LogOut,
  ClipboardList, Archive, Play, Trophy,
  XCircle, Building, ChevronUp, ChevronDown,
  LayoutList, LayoutGrid, ArrowUpDown, CheckCircle2,
  Search, ArrowDown, Filter, Monitor, Smartphone,
  Edit3, Calendar, Save, ChevronRight, BarChart3, TrendingUp
} from 'lucide-react';

// ─────────────────────────────────────────────
// COLUMN FILTER HOOK (ported from admin panel)
// ─────────────────────────────────────────────
const useColumnFilters = () => {
  const [filters, setFiltersState] = useState({});
  const setFilter = (col, val) => setFiltersState(prev => {
    const next = { ...prev };
    if (!val || val === '__all__') { delete next[col]; } else { next[col] = val; }
    return next;
  });
  const clearAll = () => setFiltersState({});
  const activeCount = Object.keys(filters).length;
  const applyFilters = (data, accessors) => data.filter(item =>
    Object.entries(filters).every(([col, val]) => {
      const accessor = accessors[col];
      if (!accessor) return true;
      const itemVal = String(accessor(item) ?? '');
      const vals = Array.isArray(val) ? val : [val];
      return vals.some(v => String(v) === itemVal);
    })
  );
  return { filters, setFilter, clearAll, activeCount, applyFilters };
};

const getUniqueValues = (data, accessor) => {
  const raw = data.map(accessor);
  const hasBlank = raw.some(v => v == null || v === '' || v === '—');
  const vals = raw.filter(v => v != null && v !== '' && v !== '—');
  const sorted = [...new Set(vals)].sort((a, b) => String(a).localeCompare(String(b)));
  if (hasBlank) sorted.push({ value: '', label: '(Blank)' });
  return sorted;
};

// ─────────────────────────────────────────────
// CONSTANTS & DESIGN TOKENS
// ─────────────────────────────────────────────
const BLUE = '#1a428a';

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

const FOOD_TYPES = [
  'Chips/Fries', 'Crumbed Items', 'Battered Items',
  'Plain Proteins', 'Pastries/Donuts', 'High Starch', 'Mixed Service',
];

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box', background: 'white', color: '#1f2937',
  fontFamily: 'inherit', fontWeight: '500',
};

const selectStyle = {
  ...inputStyle,
  WebkitAppearance: 'none', appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  paddingRight: '32px', cursor: 'pointer',
};

const S = Object.freeze({
  card: {
    background: COLORS.white,
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '20px',
  },
  modal: {
    background: COLORS.white,
    borderRadius: '16px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  pill: {
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  label: {
    fontSize: '11px', fontWeight: '700', color: '#64748b',
    letterSpacing: '0.3px', display: 'block', marginBottom: '6px',
    textTransform: 'uppercase',
  },
  field: { marginBottom: '14px' },
});

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
// Prevent scroll-to-change on number inputs (global listener)
if (typeof window !== 'undefined') {
  document.addEventListener('wheel', (e) => {
    if (e.target && e.target.type === 'number') e.target.blur();
  }, { passive: true });
}
const formatDate = (date) => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const getTodayString = () => formatDate(new Date());

const daysBetween = (start, end) => {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000);
};

const displayDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

const calcVolumeBracket = (litres) => {
  const val = parseFloat(litres);
  if (isNaN(val) || val < 0) return '';
  if (val < 60) return 'under-60';
  if (val < 100) return '60-100';
  if (val < 150) return '100-150';
  return '150-plus';
};

const calcTrialWeeklyAvg = (venueId, trialStartDate, readings, trialEndDate) => {
  if (!venueId || !trialStartDate || !readings) return null;
  const fills = readings.filter(r => r.venueId === venueId && r.oilAge === 1 && r.litresFilled > 0);
  if (fills.length === 0) return null;
  const totalLitres = fills.reduce((sum, r) => sum + r.litresFilled, 0);
  const start = new Date(trialStartDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cap = trialEndDate ? new Date(Math.min(today.getTime(), new Date(trialEndDate + 'T00:00:00').getTime())) : today;
  const daysElapsed = Math.max(1, Math.floor((cap - start) / 86400000));
  return Math.round((totalLitres / daysElapsed) * 7 * 10) / 10;
};

// ─────────────────────────────────────────────
// SHARED BADGE COMPONENTS (matching admin panel)
// ─────────────────────────────────────────────
const VOLUME_BRACKETS = VOLUME_BRACKET_COLORS;

const TrialStatusBadge = ({ status }) => {
  const c = TRIAL_STATUS_COLORS[status] || TRIAL_STATUS_COLORS['pending'];
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '82px', textAlign: 'center', verticalAlign: 'middle',
    }}>{c.label}</span>
  );
};

const OilBadge = ({ oil, competitors: comps, compact }) => {
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

const StateBadge = ({ state }) => {
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

const VolumePill = ({ bracket }) => {
  const b = VOLUME_BRACKETS.find(v => v.key === bracket);
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

const CompetitorPill = ({ comp }) => {
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
      width: '68px', whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis', textAlign: 'center', verticalAlign: 'middle',
    }} title={comp.name}>{comp.name}</span>
  );
};

// ─────────────────────────────────────────────
// SUCCESS TOAST
// ─────────────────────────────────────────────
const SuccessToast = ({ message, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 1200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={S.overlay}>
      <style>{`@keyframes scaleIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '32px',
        textAlign: 'center', maxWidth: '300px', width: '100%',
        animation: 'scaleIn 0.2s ease-out',
      }}>
        <div style={{
          width: '48px', height: '48px', background: '#10b981',
          borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px',
          animation: 'scaleIn 0.25s ease-out',
        }}>
          <Check size={24} color="white" strokeWidth={3} />
        </div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
          {message || 'Saved'}
        </h3>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// LOG READING MODAL (no staff name for BDM)
// ─────────────────────────────────────────────
const LogReadingModal = ({ venue, currentUser, onClose, onSave }) => {
  const fryerCount = venue.fryerCount || 1;
  const fryerNums = Array.from({ length: fryerCount }, (_, i) => i + 1);
  const [currentFryerIndex, setCurrentFryerIndex] = useState(0);
  const currentFryerNumber = fryerNums[currentFryerIndex];
  const [date] = useState(getTodayString());
  const [savedReadings, setSavedReadings] = useState([]);

  const makeFryer = (fNum) => ({
    fryerNumber: fNum, oilAge: 1, litresFilled: '', tpmValue: '',
    setTemperature: '', actualTemperature: '', foodType: 'Chips/Fries',
    filtered: true, notes: '', notInUse: false,
  });
  const [fryer, setFryerState] = useState(makeFryer(currentFryerNumber));

  useEffect(() => {
    setFryerState(makeFryer(fryerNums[currentFryerIndex]));
  }, [currentFryerIndex]);

  const updateFryer = (field, value) => {
    setFryerState(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'oilAge' && (value === '1' || value === 1)) next.filtered = true;
      if (field === 'oilAge' && value !== '1' && value !== 1 && value !== '') next.filtered = null;
      return next;
    });
  };

  const isFreshOil = parseInt(fryer.oilAge) === 1;
  const canSave = fryer.tpmValue;

  const inputSt = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' };
  const lbl = { display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' };
  const fld = { marginBottom: '12px' };

  const handleSkip = () => {
    if (currentFryerIndex < fryerNums.length - 1) setCurrentFryerIndex(i => i + 1);
    else onClose();
  };

  const handleSaveAndContinue = (e) => {
    e.preventDefault();
    if (!canSave) return;
    const reading = {
      venueId: venue.id,
      fryerNumber: fryer.fryerNumber,
      readingDate: date,
      takenBy: currentUser?.id || null,
      staffName: currentUser?.name || '',
      oilAge: parseInt(fryer.oilAge) || 1,
      litresFilled: fryer.litresFilled ? parseFloat(fryer.litresFilled) : 0,
      tpmValue: parseFloat(fryer.tpmValue),
      setTemperature: fryer.setTemperature ? parseFloat(fryer.setTemperature) : null,
      actualTemperature: fryer.actualTemperature ? parseFloat(fryer.actualTemperature) : null,
      filtered: fryer.filtered,
      foodType: fryer.foodType || null,
      notes: fryer.notes || null,
      notInUse: false,
    };
    if (currentFryerIndex < fryerNums.length - 1) {
      setSavedReadings(prev => [...prev, reading]);
      setCurrentFryerIndex(i => i + 1);
    } else {
      onSave([...savedReadings, reading]);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: '16px', maxWidth: '500px',
        width: '100%', maxHeight: '95vh', overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              {venue.name} — Fryer {currentFryerNumber}
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <X size={20} color="#64748b" />
            </button>
          </div>
          {fryerCount > 1 && (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Fryer {currentFryerIndex + 1} of {fryerCount}
            </div>
          )}
        </div>

        <form onSubmit={handleSaveAndContinue} style={{ padding: '16px' }}>
          {/* Oil Age */}
          <div style={fld}>
            <label style={lbl}>Oil Age (days)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.oilAge} required
              onChange={e => updateFryer('oilAge', e.target.value.replace(/[^0-9]/g, ''))}
              style={{ ...inputSt, borderColor: isFreshOil ? '#6ee7b7' : '#e2e8f0' }}
              onFocus={e => e.target.style.borderColor = isFreshOil ? '#10b981' : '#1a428a'}
              onBlur={e => e.target.style.borderColor = isFreshOil ? '#6ee7b7' : '#e2e8f0'} />
          </div>

          {/* Litres Filled */}
          <div style={fld}>
            <label style={lbl}>Litres Topped Up</label>
            <input type="text" inputMode="decimal" value={fryer.litresFilled} required
              onChange={e => updateFryer('litresFilled', e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0" style={inputSt}
              onFocus={e => e.target.style.borderColor = '#1a428a'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>

          {/* TPM */}
          <div style={fld}>
            <label style={lbl}>TPM Value (%)</label>
            <input type="text" inputMode="decimal" value={fryer.tpmValue} required
              onChange={e => updateFryer('tpmValue', e.target.value.replace(/[^0-9.]/g, ''))}
              style={inputSt}
              onFocus={e => e.target.style.borderColor = '#1a428a'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>

          {/* Temps — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div>
              <label style={lbl}>Set Temp (°C)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.setTemperature}
                onChange={e => updateFryer('setTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="180"
                style={inputSt} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
            </div>
            <div>
              <label style={lbl}>Actual Temp (°C)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.actualTemperature}
                onChange={e => updateFryer('actualTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="175"
                style={inputSt} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
            </div>
          </div>

          {/* Filtered */}
          <div style={fld}>
            <label style={lbl}>Did you filter?</label>
            {isFreshOil ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderRadius: '8px',
                border: '1.5px solid #d1fae5', background: '#f0fdf4', color: '#059669', fontSize: '12px', fontWeight: '600' }}>
                <Check size={14} strokeWidth={3} /> Yes — fresh oil is always filtered
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                {[{ val: true, label: 'Yes', activeColor: '#10b981', activeBg: '#d1fae5', activeText: '#059669' },
                  { val: false, label: 'No', activeColor: '#ef4444', activeBg: '#fee2e2', activeText: '#dc2626' }
                ].map(opt => (
                  <label key={String(opt.val)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    padding: '10px', borderRadius: '8px',
                    border: fryer.filtered === opt.val ? `1.5px solid ${opt.activeColor}` : '1.5px solid #e2e8f0',
                    background: fryer.filtered === opt.val ? opt.activeBg : 'white', transition: 'all 0.2s' }}>
                    <input type="radio" name="bdm-filtered" checked={fryer.filtered === opt.val}
                      onChange={() => updateFryer('filtered', opt.val)} style={{ display: 'none' }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: fryer.filtered === opt.val ? opt.activeText : '#1f2937' }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Food Type */}
          <div style={fld}>
            <label style={lbl}>What are you frying?</label>
            <select value={fryer.foodType} onChange={e => updateFryer('foodType', e.target.value)}
              style={{ ...inputSt, background: 'white' }} onFocus={e => e.target.style.borderColor = '#1a428a'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
              {FOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={lbl}>Notes (optional)</label>
            <textarea value={fryer.notes} onChange={e => updateFryer('notes', e.target.value)}
              placeholder="Add notes..."
              style={{ ...inputSt, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={handleSkip} style={{
              flex: 1, padding: '12px', background: 'white', border: '2px solid #e2e8f0',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>
              {currentFryerIndex === 0 ? 'Cancel' : 'Skip'}
            </button>
            <button type="submit" disabled={!canSave} style={{
              flex: 1, padding: '12px', background: canSave ? '#1a428a' : '#9ca3af', border: 'none',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: 'white',
              cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {currentFryerIndex < fryerNums.length - 1 ? 'Save & Next' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// CLOSE TRIAL MODAL (Won / Lost)
// ─────────────────────────────────────────────
const CloseTrialModal = ({ venue, outcome, trialReasons, onClose, onSave }) => {
  const isWon = outcome === 'won';
  const reasons = trialReasons.filter(r => r.type === (isWon ? 'successful' : 'unsuccessful'));
  const [form, setForm] = useState({ reason: '', outcomeDate: getTodayString(), soldPrice: '', notes: '' });
  const canSubmit = form.reason && form.outcomeDate && (isWon ? form.soldPrice : true);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderLeft: `4px solid ${isWon ? '#10b981' : '#ef4444'}`, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{isWon ? 'Close as Won' : 'Close as Lost'}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{venue.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
        </div>
        <div style={{ padding: '16px' }}>
          <div style={S.field}>
            <label style={S.label}>REASON <span style={{ color: '#ef4444' }}>*</span></label>
            <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={selectStyle}>
              <option value="">Select a reason...</option>
              {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>DECISION DATE <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="date" value={form.outcomeDate} onChange={e => setForm(f => ({ ...f, outcomeDate: e.target.value }))} style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
          {isWon && (
            <div style={S.field}>
              <label style={S.label}>SOLD PRICE / LITRE <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748b', fontWeight: '600', pointerEvents: 'none' }}>$</span>
                <input type="number" step="0.01" min="0" placeholder="2.45" value={form.soldPrice}
                  onChange={e => setForm(f => ({ ...f, soldPrice: e.target.value }))} style={{ ...inputStyle, paddingLeft: '22px' }}
                  onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </div>
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={S.label}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any final notes on the outcome..."
              onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
            <button disabled={!canSubmit} onClick={() => onSave({
              trialStatus: outcome === 'won' ? 'accepted' : outcome,
              trialReason: form.reason,
              outcomeDate: form.outcomeDate,
              trialNotes: form.notes,
              ...(isWon ? { soldPricePerLitre: parseFloat(form.soldPrice) } : {}),
            })} style={{ flex: 1, padding: '10px', background: canSubmit ? (isWon ? '#10b981' : '#ef4444') : '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {isWon ? 'Mark as Won' : 'Mark as Lost'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// END TRIAL MODAL — shows litres breakdown + savings
// ─────────────────────────────────────────────
const EndTrialModal = ({ venue, readings, onClose, onConfirm }) => {
  const venueReadings = readings.filter(r => r.venueId === venue.id && r.readingDate >= (venue.trialStartDate || ''));
  // Fresh fills = oilAge 1, meaning a full fryer capacity refill
  const freshFills = venueReadings.filter(r => r.oilAge === 1 && r.litresFilled > 0);
  const freshLitres = freshFills.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
  // Top-ups = oilAge > 1, with litres filled
  const topUps = venueReadings.filter(r => r.oilAge > 1 && r.litresFilled > 0);
  const topUpLitres = topUps.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
  const systemTotal = freshLitres + topUpLitres;

  const [adjustedTotal, setAdjustedTotal] = useState(String(Math.round(systemTotal * 10) / 10));
  const totalNum = parseFloat(adjustedTotal) || 0;

  // Trial duration
  const startDate = venue.trialStartDate ? new Date(venue.trialStartDate + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysElapsed = startDate ? Math.max(1, Math.floor((today - startDate) / 86400000)) : 0;
  const litresPerWeek = daysElapsed > 0 ? Math.round((totalNum / daysElapsed) * 7 * 10) / 10 : 0;
  const offeredPrice = parseFloat(venue.offeredPricePerLitre) || 0;
  const currentPrice = parseFloat(venue.currentPricePerLitre) || 0;
  const spendPerWeek = litresPerWeek * offeredPrice;
  const preTrialAvg = parseFloat(venue.currentWeeklyAvg) || 0;
  const litresSaved = preTrialAvg > 0 ? Math.round((preTrialAvg - litresPerWeek) * 10) / 10 : null;
  const dollarsSaved = litresSaved !== null && currentPrice > 0 ? Math.round((preTrialAvg * currentPrice - litresPerWeek * offeredPrice) * 100) / 100 : null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderLeft: '4px solid #f59e0b', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>End Trial</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{venue.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
        </div>
        <div style={{ padding: '16px' }}>
          {/* Start / End dates */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Start</div>
              <div style={{ fontSize: '13px', color: '#1f2937' }}>{displayDate(venue.trialStartDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>End</div>
              <div style={{ fontSize: '13px', color: '#1f2937' }}>{displayDate(getTodayString())}</div>
            </div>
            {daysElapsed > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Duration</div>
                <div style={{ fontSize: '13px', color: '#1f2937' }}>{daysElapsed} days</div>
              </div>
            )}
          </div>

          {/* Litres breakdown */}
          <div style={{ marginBottom: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Oil Usage</th>
                  <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Count</th>
                  <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Litres</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Fresh fills</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{freshFills.length}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{freshLitres.toFixed(1)}L</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Top-ups</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{topUps.length}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{topUpLitres.toFixed(1)}L</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Total</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937', textAlign: 'right' }}>{freshFills.length + topUps.length}</td>
                  <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937', textAlign: 'right' }}>{systemTotal.toFixed(1)}L</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Adjustable total */}
          <div style={S.field}>
            <label style={S.label}>TOTAL LITRES USED (adjust if needed)</label>
            <input type="number" min="0" step="0.1" value={adjustedTotal}
              onChange={e => setAdjustedTotal(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>

          {/* Live stats */}
          {daysElapsed > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '16px' }}>
              {[
                { label: 'Trial duration', value: `${daysElapsed} days` },
                { label: 'Litres/week', value: `${litresPerWeek} L` },
                ...(offeredPrice > 0 ? [{ label: '$/week', value: `$${spendPerWeek.toFixed(2)}` }] : []),
                ...(preTrialAvg > 0 ? [{ label: 'Pre-trial avg', value: `${preTrialAvg} L/wk` }] : []),
                ...(litresSaved !== null ? [{ label: 'Litres saved/wk', value: `${litresSaved > 0 ? '+' : ''}${litresSaved} L`, color: litresSaved > 0 ? '#059669' : '#dc2626' }] : []),
                ...(dollarsSaved !== null ? [{ label: '$ saved/wk', value: `${dollarsSaved > 0 ? '+' : ''}$${Math.abs(dollarsSaved).toFixed(2)}`, color: dollarsSaved > 0 ? '#059669' : '#dc2626' }] : []),
              ].map((row, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>{row.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: row.color || '#1f2937' }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onConfirm(venue.id, totalNum)} style={{ flex: 1, padding: '10px', background: '#f59e0b', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
              Confirm End Trial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// TRIAL DETAIL MODAL — view + edit trial info
// ─────────────────────────────────────────────
const TrialDetailModal = ({ venue, oilTypes, competitors, trialReasons, readings, onClose, onSave, onOpenLog, onOpenEnd, onOpenClose, onSaveCustomerCode, VOLUME_BRACKETS }) => {
  const statusConfig = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
  const compOil = oilTypes.find(o => o.id === venue.defaultOil);
  const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
  const cookerOils = oilTypes.filter(o => o.category !== 'competitor');
  const compOils = oilTypes.filter(o => o.category === 'competitor');

  const [editForm, setEditForm] = useState({
    name: venue.name || '',
    trialNotes: venue.trialNotes || '',
    currentPricePerLitre: venue.currentPricePerLitre ? String(venue.currentPricePerLitre) : '',
    offeredPricePerLitre: venue.offeredPricePerLitre ? String(venue.offeredPricePerLitre) : '',
    trialStartDate: venue.trialStartDate || '',
    trialEndDate: venue.trialEndDate || '',
    trialOilId: venue.trialOilId || '',
    defaultOil: venue.defaultOil || '',
    fryerCount: venue.fryerCount || 1,
    avgLitresPerWeek: venue.currentWeeklyAvg ? String(venue.currentWeeklyAvg) : '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editDirty, setEditDirty] = useState(false);

  const handleEditChange = (field, val) => {
    setEditForm(prev => ({ ...prev, [field]: val }));
    setEditDirty(true);
  };

  const handleSaveEdits = async () => {
    setEditSaving(true);
    const avgLitres = editForm.avgLitresPerWeek ? parseFloat(editForm.avgLitresPerWeek) : null;
    const updates = {
      name: editForm.name.trim() || venue.name,
      trialNotes: editForm.trialNotes,
      currentPricePerLitre: editForm.currentPricePerLitre ? parseFloat(editForm.currentPricePerLitre) : null,
      offeredPricePerLitre: editForm.offeredPricePerLitre ? parseFloat(editForm.offeredPricePerLitre) : null,
      trialStartDate: editForm.trialStartDate || null,
      trialEndDate: editForm.trialEndDate || null,
      trialOilId: editForm.trialOilId || null,
      defaultOil: editForm.defaultOil || null,
      fryerCount: parseInt(editForm.fryerCount) || 1,
      currentWeeklyAvg: avgLitres,
      volumeBracket: avgLitres ? calcVolumeBracket(avgLitres) : null,
    };
    await onSave(venue.id, updates);
    setEditSaving(false);
    setEditDirty(false);
  };

  // Pricing & savings
  const liveTrialAvg = calcTrialWeeklyAvg(venue.id, venue.trialStartDate, readings, venue.trialEndDate);
  const preTrialAvg = venue.currentWeeklyAvg;
  const weekLitres = preTrialAvg && liveTrialAvg ? Math.round((preTrialAvg - liveTrialAvg) * 10) / 10 : null;
  const annualLitres = weekLitres !== null ? Math.round(weekLitres * 52) : null;
  const trialPrice = venue.offeredPricePerLitre || venue.currentPricePerLitre;
  const currentPrice = venue.currentPricePerLitre;
  const weekSpend = weekLitres !== null && currentPrice && trialPrice ? Math.round((preTrialAvg * currentPrice - liveTrialAvg * trialPrice) * 100) / 100 : null;
  const annualSpend = weekSpend !== null ? Math.round(weekSpend * 52) : null;

  // TPM Readings Calendar
  const venueReadings = readings.filter(r => r.venueId === venue.id);
  const fryerCount = venue.fryerCount || 1;

  const comp = compOil && compOil.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;

  const isReadOnly = venue.trialStatus === 'won' || venue.trialStatus === 'lost' || venue.trialStatus === 'accepted';

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '94vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '12px 16px', borderLeft: `4px solid ${statusConfig.accent}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px' }}>{venue.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <StateBadge state={venue.state} />
                {venue.volumeBracket && <VolumePill bracket={venue.volumeBracket} />}
              </div>
              <TrialStatusBadge status={venue.trialStatus} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, marginLeft: '8px' }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        <div style={{ padding: '12px 16px' }}>

          {/* Timestamps */}
          {(venue.createdAt || venue.updatedAt) && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', fontSize: '11px', color: '#94a3b8' }}>
              {venue.createdAt && <span>Created: {displayDate(venue.createdAt.split('T')[0])}</span>}
              {venue.updatedAt && <span>Last edited: {displayDate(venue.updatedAt.split('T')[0])}</span>}
            </div>
          )}

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '12px' }}>
            {[
              { label: 'Start', value: displayDate(venue.trialStartDate) },
              { label: 'End', value: venue.trialEndDate ? displayDate(venue.trialEndDate) : '—' },
              { label: 'Fryers', value: venue.fryerCount || '—' },
              venue.customerCode ? { label: venue.customerCode.startsWith('PRS-') ? 'Prospect Code' : 'Customer Code', value: venue.customerCode } : null,
            ].filter(Boolean).map((row, i) => (
              <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>{row.label}</div>
                <div style={{ fontSize: '13px', color: '#1f2937' }}>{row.value}</div>
              </div>
            ))}
          </div>

          {/* Oil comparison */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            {comp && <CompetitorPill comp={comp} />}
            {comp && <span style={{ color: '#e2e8f0', margin: '0 2px' }}>·</span>}
            <OilBadge oil={compOil} competitors={competitors} compact />
            <span style={{ fontSize: '12px', color: '#94a3b8', margin: '0 4px' }}>vs</span>
            <OilBadge oil={cookersOil} competitors={competitors} compact />
          </div>

          {/* Pricing & volumes */}
          {(preTrialAvg || venue.currentPricePerLitre || venue.offeredPricePerLitre) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '12px' }}>
              {[
                venue.currentPricePerLitre ? { label: 'Current price/L', value: `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` } : null,
                venue.offeredPricePerLitre ? { label: 'Offered price/L', value: `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` } : null,
                preTrialAvg ? { label: 'Pre-trial weekly avg', value: `${preTrialAvg} L` } : null,
                liveTrialAvg !== null ? { label: 'Trial weekly avg', value: `${liveTrialAvg} L` } : null,
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>{row.label}</div>
                  <div style={{ fontSize: '13px', color: '#1f2937' }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Savings table */}
          {weekLitres !== null && (
            <div style={{ marginBottom: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Savings</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Litres</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Weekly</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: weekLitres < 0 ? '#dc2626' : '#059669', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #f1f5f9' }}>{weekLitres > 0 ? '+' : ''}{weekLitres} L</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: weekSpend !== null && weekSpend < 0 ? '#dc2626' : '#059669', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #f1f5f9' }}>{weekSpend !== null ? (weekSpend > 0 ? '+$' : '-$') + Math.abs(weekSpend).toFixed(0) : '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937' }}>Annual</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: annualLitres < 0 ? '#dc2626' : '#059669', textAlign: 'right', fontWeight: '600' }}>{annualLitres > 0 ? '+' : ''}{annualLitres} L</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: annualSpend !== null && annualSpend < 0 ? '#dc2626' : '#059669', textAlign: 'right', fontWeight: '600' }}>{annualSpend !== null ? (annualSpend > 0 ? '+$' : '-$') + Math.abs(annualSpend).toLocaleString() : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* TPM Readings Calendar */}
          {venue.trialStartDate && venue.trialStatus !== 'pending' && (() => {
            const start = new Date(venue.trialStartDate + 'T00:00:00');
            const end = venue.trialEndDate ? new Date(venue.trialEndDate + 'T00:00:00') : new Date();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const days = [];
            const d = new Date(start);
            const cap = venue.trialEndDate ? end : today;
            while (d <= cap) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
            if (days.length === 0) return null;

            const getReadingsForFryer = (fryerNum) => {
              const result = {};
              venueReadings.filter(r => r.fryerNumber === fryerNum).forEach(r => { result[r.readingDate] = r.tpmValue; });
              return result;
            };

            return (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: '6px' }}>TPM Readings</div>
                {Array.from({ length: fryerCount }, (_, i) => i + 1).map(fryerNum => {
                  const fReadings = getReadingsForFryer(fryerNum);
                  const readingCount = Object.keys(fReadings).length;
                  return (
                    <div key={fryerNum} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '12px', color: '#1f2937' }}>Fryer {fryerNum}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{readingCount}/{days.length}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(days.length, 14)}, 1fr)`, gap: '2px' }}>
                        {days.slice(-14).map((day, i) => {
                          const dateStr = day.toISOString().split('T')[0];
                          const reading = fReadings[dateStr];
                          const isFuture = day > today;
                          let bg = '#f1f5f9'; let color = '#cbd5e1';
                          if (isFuture) { bg = '#fafafa'; color = '#e2e8f0'; }
                          else if (reading !== undefined) {
                            if (reading <= 14) { bg = '#d1fae5'; color = '#065f46'; }
                            else if (reading <= 18) { bg = '#fef3c7'; color = '#92400e'; }
                            else { bg = '#fee2e2'; color = '#991b1b'; }
                          }
                          return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                              {fryerNum === 1 && <span style={{ fontSize: '8px', color: '#94a3b8' }}>{day.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>}
                              <div style={{ width: '100%', height: '20px', borderRadius: '4px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: day.getTime() === today.getTime() ? '2px solid #1a428a' : '1px solid transparent' }}>
                                {reading !== undefined ? <span style={{ fontSize: '9px', fontWeight: '600', color }}>{reading}</span> : !isFuture ? <span style={{ color: '#cbd5e1', fontSize: '9px' }}>—</span> : null}
                              </div>
                              {fryerNum === fryerCount && <span style={{ fontSize: '8px', color: '#94a3b8' }}>{day.getDate()}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: '12px', marginTop: '4px', justifyContent: 'flex-end' }}>
                  {[{ bg: '#d1fae5', label: '≤14' }, { bg: '#fef3c7', label: '15-18' }, { bg: '#fee2e2', label: '19+' }, { bg: '#f1f5f9', label: 'Missed' }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.bg }} />
                      <span style={{ fontSize: '10px', color: '#64748b' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Outcome strip (for won/lost/accepted) */}
          {(venue.trialStatus === 'won' || venue.trialStatus === 'lost' || venue.trialStatus === 'accepted') && (
            <div style={{
              padding: '8px 12px', borderRadius: '8px', marginBottom: '12px',
              background: venue.trialStatus === 'lost' ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${venue.trialStatus === 'lost' ? '#fecaca' : '#bbf7d0'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: venue.trialStatus === 'lost' ? '#dc2626' : '#059669' }}>
                  {venue.trialStatus === 'lost' ? 'Unsuccessful' : 'Successful'}
                </span>
                {venue.outcomeDate && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{displayDate(venue.outcomeDate)}</span></>}
                {venue.trialReason && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason}</span></>}
              </div>
              {(venue.trialStatus === 'won' || venue.trialStatus === 'accepted') && venue.soldPricePerLitre && (
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#065f46' }}>Sold @ ${parseFloat(venue.soldPricePerLitre).toFixed(2)}/L</div>
              )}
              {venue.trialStatus === 'won' && venue.customerCode && (
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle2 size={13} color="#059669" />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#065f46' }}>Cust Code: {venue.customerCode}</span>
                </div>
              )}
            </div>
          )}

          {/* Customer Code input for accepted trials */}
          {venue.trialStatus === 'accepted' && (
            <CustomerCodeInput venueId={venue.id} onSave={onSaveCustomerCode} />
          )}

          {/* Editable fields */}
          {!isReadOnly && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: '8px' }}>Edit Trial Details</div>
              <div style={{ marginBottom: '8px' }}>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>VENUE NAME</label>
                  <input type="text" value={editForm.name} onChange={e => handleEditChange('name', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} placeholder="Venue name" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>START DATE</label>
                  <input type="date" value={editForm.trialStartDate} onChange={e => handleEditChange('trialStartDate', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                </div>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>END DATE</label>
                  <input type="date" value={editForm.trialEndDate} onChange={e => handleEditChange('trialEndDate', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>CURRENT $/L</label>
                  <input type="number" step="0.01" min="0" value={editForm.currentPricePerLitre} onChange={e => handleEditChange('currentPricePerLitre', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} placeholder="0.00" />
                </div>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>OFFERED $/L</label>
                  <input type="number" step="0.01" min="0" value={editForm.offeredPricePerLitre} onChange={e => handleEditChange('offeredPricePerLitre', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} placeholder="0.00" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>TRIAL OIL</label>
                  <select value={editForm.trialOilId} onChange={e => handleEditChange('trialOilId', e.target.value)} style={{ ...selectStyle, fontSize: '12px', padding: '6px 8px' }}>
                    <option value="">—</option>
                    {cookerOils.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>CURRENT OIL</label>
                  <select value={editForm.defaultOil} onChange={e => handleEditChange('defaultOil', e.target.value)} style={{ ...selectStyle, fontSize: '12px', padding: '6px 8px' }}>
                    <option value="">—</option>
                    {oilTypes.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>AVG LITRES/WEEK</label>
                  <input type="number" min="0" step="1" value={editForm.avgLitresPerWeek} onChange={e => handleEditChange('avgLitresPerWeek', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} placeholder="e.g. 80" />
                  {editForm.avgLitresPerWeek && calcVolumeBracket(editForm.avgLitresPerWeek) && (
                    <div style={{ marginTop: '4px' }}><VolumePill bracket={calcVolumeBracket(editForm.avgLitresPerWeek)} /></div>
                  )}
                </div>
                <div style={S.field}>
                  <label style={{ ...S.label, fontSize: '10px' }}>FRYER COUNT</label>
                  <input type="number" min="1" max="20" value={editForm.fryerCount} onChange={e => handleEditChange('fryerCount', e.target.value)} style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }} />
                </div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ ...S.label, fontSize: '10px' }}>NOTES</label>
                <textarea value={editForm.trialNotes} onChange={e => handleEditChange('trialNotes', e.target.value)}
                  rows={2} style={{ ...inputStyle, resize: 'vertical', fontSize: '12px', padding: '6px 8px' }} placeholder="Trial notes..." />
              </div>
              {editDirty && (
                <button onClick={handleSaveEdits} disabled={editSaving} style={{
                  width: '100%', padding: '9px', background: editSaving ? '#94a3b8' : '#1a428a', border: 'none',
                  borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white',
                  cursor: editSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}>
                  <Save size={14} /> {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              {venue.trialStatus === 'pending' && (
                <button onClick={() => { onClose(); if (window.confirm(`Start trial for ${venue.name}?`)) onOpenLog(venue, 'start'); }} style={{ flex: 1, padding: '9px 12px', background: '#1a428a', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                  Start Trial
                </button>
              )}
              {venue.trialStatus === 'in-progress' && (
                <>
                  <button onClick={() => { onClose(); onOpenLog(venue, 'log'); }} style={{ flex: 1, padding: '9px 12px', background: '#e8eef6', border: '1.5px solid #1a428a', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#1a428a', cursor: 'pointer' }}>
                    Log Reading
                  </button>
                  <button onClick={() => { onClose(); onOpenEnd(venue); }} style={{ flex: 1, padding: '9px 12px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>
                    End Trial
                  </button>
                </>
              )}
              {venue.trialStatus === 'in-progress' && (
                <>
                  <button onClick={() => { onClose(); onOpenClose(venue, 'won'); }} style={{ flex: 1, padding: '9px 12px', background: '#1a428a', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                    Won
                  </button>
                  <button onClick={() => { onClose(); onOpenClose(venue, 'lost'); }} style={{ flex: 1, padding: '9px 12px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>
                    Lost
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPARISON VIEW (for completed/pending outcome trials)
// ─────────────────────────────────────────────
const ComparisonView = ({ venue, readings, oilTypes }) => {
  const venueReadings = readings.filter(r => r.venueId === venue.id);

  const trialReadings = venueReadings.filter(r => {
    if (!venue.trialStartDate) return false;
    return r.readingDate >= venue.trialStartDate && (!venue.trialEndDate || r.readingDate <= venue.trialEndDate);
  });

  const freshOilReadings = trialReadings.filter(r => r.oilAge === 1 || r.oilAge === '1');
  const weeklyLitres = freshOilReadings.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
  const avgTpm = trialReadings.length > 0
    ? (trialReadings.reduce((sum, r) => sum + (parseFloat(r.tpmValue) || 0), 0) / trialReadings.length).toFixed(1)
    : '—';
  const totalLitres = trialReadings.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);

  const trialOil = oilTypes.find(o => o.id === venue.trialOilId);
  const baselineAvg = venue.currentWeeklyAvg;

  const savingsPerWeek = baselineAvg && venue.currentPricePerLitre && venue.offeredPricePerLitre
    ? ((baselineAvg * venue.currentPricePerLitre) - (weeklyLitres * venue.offeredPricePerLitre)).toFixed(2)
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
      <div style={{ ...S.card, borderTop: `3px solid ${COLORS.brand}`, padding: '14px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '10px' }}>
          Trial Oil
        </div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text, marginBottom: '12px' }}>
          {trialOil?.name || '—'}
        </div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Readings: <span style={{ color: COLORS.text, fontWeight: '600' }}>{trialReadings.length}</span></div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Avg TPM: <span style={{ color: COLORS.text, fontWeight: '600' }}>{avgTpm}</span></div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Total Litres: <span style={{ color: COLORS.text, fontWeight: '600' }}>{totalLitres.toFixed(1)}L</span></div>
        {venue.offeredPricePerLitre && (
          <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Price: <span style={{ color: COLORS.text, fontWeight: '600' }}>${parseFloat(venue.offeredPricePerLitre).toFixed(2)}/L</span></div>
        )}
      </div>

      <div style={{ ...S.card, borderTop: '3px solid #94a3b8', padding: '14px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '10px' }}>
          Current / Baseline
        </div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text, marginBottom: '12px' }}>
          {venue.defaultOil ? (oilTypes.find(o => o.id === venue.defaultOil)?.name || venue.defaultOil) : '—'}
        </div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '4px' }}>Weekly Avg: <span style={{ color: COLORS.text, fontWeight: '600' }}>{baselineAvg ? `${baselineAvg}L` : '—'}</span></div>
        {venue.currentPricePerLitre && (
          <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Price: <span style={{ color: COLORS.text, fontWeight: '600' }}>${parseFloat(venue.currentPricePerLitre).toFixed(2)}/L</span></div>
        )}
      </div>

      {savingsPerWeek && parseFloat(savingsPerWeek) > 0 && (
        <div style={{ gridColumn: '1 / -1', ...S.card, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trophy size={18} color="#059669" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#059669' }}>Estimated Savings</div>
            <div style={{ fontSize: '12px', color: '#065f46' }}>${savingsPerWeek}/week based on trial data</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// FILTERABLE TABLE HEADER (ported from admin panel)
// ─────────────────────────────────────────────
const FilterableTh = ({ colKey, label, options, filters, setFilter, style = {}, children }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);

  const activeVal = filters[colKey] || null;
  const hasFilter = !!activeVal;
  const allOptions = options.map(opt => ({ value: String(typeof opt === 'object' ? opt.value : opt), label: String(typeof opt === 'object' ? opt.label : opt) }));
  const allValues = allOptions.map(o => o.value);

  const currentDraft = draft !== null ? draft : (hasFilter ? new Set(Array.isArray(activeVal) ? activeVal : [activeVal]) : new Set(allValues));
  const draftAllSelected = currentDraft.size >= allValues.length;
  const filteredOpts = search ? allOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : allOptions;

  const openDropdown = () => { setDraft(hasFilter ? new Set(Array.isArray(activeVal) ? activeVal : [activeVal]) : new Set(allValues)); setSearch(''); setOpen(true); };
  const toggle = (val) => { const next = new Set(currentDraft); if (next.has(val)) next.delete(val); else next.add(val); setDraft(next); };
  const draftSelectAll = () => setDraft(new Set(allValues));
  const draftDeselectAll = () => setDraft(new Set());

  const applyAndClose = () => {
    if (search) {
      const visibleValues = new Set(filteredOpts.map(o => o.value));
      const selected = [...currentDraft].filter(v => visibleValues.has(v));
      if (selected.length === 0 || selected.length >= allValues.length) setFilter(colKey, '__all__');
      else setFilter(colKey, selected);
    } else {
      if (currentDraft.size >= allValues.length) setFilter(colKey, '__all__');
      else setFilter(colKey, [...currentDraft]);
    }
    setDraft(null); setSearch(''); setOpen(false);
  };
  const cancelAndClose = () => { setDraft(null); setOpen(false); };

  return (
    <th style={{ ...style, position: 'sticky', top: 0, zIndex: open ? 30 : 20, background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (!open) openDropdown(); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: style.textAlign === 'center' ? 'center' : 'flex-start' }}>
        {children || label}
        <ChevronDown size={10} color={hasFilter ? '#1a428a' : '#94a3b8'} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        {hasFilter && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#1a428a', flexShrink: 0 }} />}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }} onClick={e => { e.stopPropagation(); cancelAndClose(); }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, marginTop: '2px', zIndex: 2000, background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 8px 4px' }}>
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1.5px solid #e2e8f0', borderRadius: '6px', outline: 'none', background: '#f8fafc', color: '#1f2937', boxSizing: 'border-box' }} />
            </div>
            <div style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div onClick={() => draftAllSelected ? draftDeselectAll() : draftSelectAll()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#1f2937', textTransform: 'none', letterSpacing: '0' }}>
                <div style={{ width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0, border: draftAllSelected ? '1.5px solid #1a428a' : '1.5px solid #cbd5e1', background: draftAllSelected ? '#1a428a' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {draftAllSelected && <Check size={9} color="white" strokeWidth={3} />}
                </div>
                <span>(Select All)</span>
              </div>
            </div>
            <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '4px 0' }}>
              {filteredOpts.map(opt => {
                const isChecked = currentDraft.has(opt.value);
                return (
                  <div key={opt.value} onClick={() => toggle(opt.value)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', color: '#1f2937', fontWeight: isChecked ? '600' : '400', background: isChecked && !draftAllSelected ? '#f0f5ff' : 'transparent', textTransform: 'none', letterSpacing: '0' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0, border: isChecked ? '1.5px solid #1a428a' : '1.5px solid #cbd5e1', background: isChecked ? '#1a428a' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isChecked && <Check size={9} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label || '\u2014'}</span>
                  </div>
                );
              })}
              {filteredOpts.length === 0 && <div style={{ padding: '10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>No matches</div>}
            </div>
            <div style={{ display: 'flex', gap: '6px', padding: '8px', borderTop: '1.5px solid #e2e8f0' }}>
              <button onClick={applyAndClose} style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: '600', color: 'white', background: '#1a428a', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>OK</button>
              <button onClick={cancelAndClose} style={{ flex: 1, padding: '6px', fontSize: '11px', fontWeight: '600', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </th>
  );
};

const BdmActiveFilterBar = ({ filters, setFilter, clearAll }) => {
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <Filter size={11} color="#94a3b8" />
      <span style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px' }}>FILTERED:</span>
      {entries.map(([col, val]) => {
        const vals = Array.isArray(val) ? val : [val];
        return vals.map((v, i) => (
          <span key={`${col}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600', color: '#1a428a', background: '#e8eef6', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
            {String(v) || '(Blank)'}
            <X size={10} color="#1a428a" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => {
              if (vals.length <= 1) setFilter(col, '__all__');
              else setFilter(col, vals.filter((_, j) => j !== i));
            }} />
          </span>
        ));
      })}
      <button onClick={clearAll} style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', marginLeft: '4px', textDecoration: 'underline' }}>Clear all</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function BDMTrialsView({ currentUser, onLogout }) {
  // ── Data state ──
  const [venues, setVenues] = useState([]);
  const [oilTypes, setOilTypes] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [tpmReadings, setTpmReadings] = useState([]);
  const [trialReasons, setTrialReasons] = useState([]);
  const [systemSettings, setSystemSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState('new');
  // archiveSubTab removed — Successful/Unsuccessful are now separate top-level tabs
  const [bdmView, setBdmView] = useState('desktop'); // 'desktop' | 'mobile'
  const [sortNewest, setSortNewest] = useState(false); // false = A-Z, true = most recent
  const colFilters = useColumnFilters();
  const [readingModal, setReadingModal] = useState(null);
  const [closeTrialModal, setCloseTrialModal] = useState(null);
  const [endTrialModal, setEndTrialModal] = useState(null); // venue object when end trial modal is open
  const [selectedTrialVenue, setSelectedTrialVenue] = useState(null); // venue for detail modal
  const [successMsg, setSuccessMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dashStatusFilter, setDashStatusFilter] = useState([]); // Dashboard status filter

  // ── New Trial form state ──
  const [trialType, setTrialType] = useState('new'); // 'existing' | 'new'
  const [newTrialForm, setNewTrialForm] = useState({
    customerCode: '', venueName: '', city: '',
    trialOilId: '', fryerCount: 1, defaultOil: '', currentPrice: '', offeredPrice: '',
    avgLitresPerWeek: '', notes: '',
  });

  // ── Generate next trial ID (TRL-0001, TRL-0002, etc.) ──
  const nextTrialId = useMemo(() => {
    // Count all trial venues (including other BDMs) for a global sequential number
    const trialCount = venues.length;
    return `TRL-${String(trialCount + 1).padStart(4, '0')}`;
  }, [venues]);

  // ── Generate prospect code (PRS-XXXX) ──
  const nextProspectCode = useMemo(() => {
    const prospectVenues = venues.filter(v => v.customerCode && v.customerCode.startsWith('PRS-'));
    return `PRS-${String(prospectVenues.length + 1).padStart(4, '0')}`;
  }, [venues]);

  // ── Responsive ──
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const theme = getThemeColors(systemSettings?.themeConfig);

  // ── Data loading ──
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: venueData } = await supabase
          .from('venues')
          .select('*')
          .eq('status', 'trial-only');
        const mappedVenues = (venueData || []).map(mapVenue);
        setVenues(mappedVenues);

        const { data: oilData } = await supabase.from('oil_types').select('*');
        setOilTypes((oilData || []).map(mapOilType));

        const { data: compData } = await supabase.from('competitors').select('*');
        setCompetitors((compData || []).map(mapCompetitor));

        const { data: reasonData } = await supabase.from('trial_reasons').select('*');
        setTrialReasons((reasonData || []).map(mapTrialReason));

        const { data: settingsData } = await supabase.from('system_settings').select('*').single();
        if (settingsData) setSystemSettings(mapSystemSettings(settingsData));

        if (mappedVenues.length > 0) {
          const venueIds = mappedVenues.map(v => v.id);
          const { data: readingData } = await supabase
            .from('tpm_readings')
            .select('*')
            .in('venue_id', venueIds);
          setTpmReadings((readingData || []).map(mapReading));
        }
      } catch (err) {
        console.error('BDMTrialsView load error:', err);
      }
      setLoading(false);
    };
    loadData();
  }, [currentUser.id]);

  // ── Refresh helper ──
  const refreshData = async () => {
    try {
      const { data: venueData } = await supabase.from('venues').select('*').eq('status', 'trial-only');
      const mappedVenues = (venueData || []).map(mapVenue);
      setVenues(mappedVenues);

      if (mappedVenues.length > 0) {
        const venueIds = mappedVenues.map(v => v.id);
        const { data: readingData } = await supabase.from('tpm_readings').select('*').in('venue_id', venueIds);
        setTpmReadings((readingData || []).map(mapReading));
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  };

  // ── Derived venue lists ──
  const myVenues = useMemo(() => venues.filter(v => v.bdmId === currentUser.id), [venues, currentUser.id]);
  const activeTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'in-progress'), [myVenues]);
  const pipelineTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'pending'), [myVenues]);
  // Pending outcome = trial ended but no won/lost decision yet
  const pendingOutcomeTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'completed'), [myVenues]);
  // Accepted: marked as won but awaiting customer code
  const acceptedTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'accepted'), [myVenues]);
  // Archive: won and lost
  const wonTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'won'), [myVenues]);
  const lostTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'lost'), [myVenues]);
  // archiveCount removed — tabs are separate now

  // ── Column filter accessors (for table filtering — mirrors admin panel) ──
  const colAccessors = {
    name: v => v.name || '',
    state: v => v.state || '',
    volume: v => {
      const b = VOLUME_BRACKETS.find(x => x.key === v.volumeBracket);
      return b ? b.label : '';
    },
    competitor: v => {
      const oil = oilTypes.find(o => o.id === v.defaultOil);
      return oil?.competitorId ? (competitors.find(c => c.id === oil.competitorId)?.name || '') : '';
    },
    compOil: v => {
      const oil = oilTypes.find(o => o.id === v.defaultOil);
      return oil ? oil.name : '';
    },
    trialOil: v => {
      const oil = oilTypes.find(o => o.id === v.trialOilId);
      return oil ? oil.name : '';
    },
    currentPrice: v => v.currentPricePerLitre ? `$${parseFloat(v.currentPricePerLitre).toFixed(2)}` : '',
    offeredPrice: v => v.offeredPricePerLitre ? `$${parseFloat(v.offeredPricePerLitre).toFixed(2)}` : '',
    soldPrice: v => v.soldPricePerLitre ? `$${parseFloat(v.soldPricePerLitre).toFixed(2)}` : '',
    start: v => v.trialStartDate || '',
    end: v => v.trialEndDate || '',
    closedDate: v => v.outcomeDate || '',
    status: v => v.trialStatus || '',
    reason: v => {
      const r = v.trialReason ? trialReasons.find(x => x.key === v.trialReason) : null;
      return r ? r.label : '';
    },
  };

  // ── Sort helper (used for both views) ──
  const sortList = (list) => {
    const sorted = [...list];
    if (sortNewest) {
      sorted.sort((a, b) => {
        const dateA = a.trialStartDate || a.trialEndDate || '';
        const dateB = b.trialStartDate || b.trialEndDate || '';
        return dateB.localeCompare(dateA);
      });
    } else {
      sorted.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
    }
    return sorted;
  };

  // In desktop mode, column filters are applied via table. In mobile, just sort.
  const getFiltered = (list) => {
    if (bdmView === 'desktop' && colFilters.activeCount > 0) {
      return sortList(colFilters.applyFilters(list, colAccessors));
    }
    return sortList(list);
  };

  // Oil lookups
  const cookerOils = useMemo(() => oilTypes.filter(o => !o.competitorId && o.status === 'active'), [oilTypes]);
  const allOilOptions = useMemo(() => {
    const cookers = oilTypes.filter(o => !o.competitorId && o.status === 'active');
    const compOils = oilTypes.filter(o => o.competitorId && o.status === 'active');
    const compGroups = {};
    compOils.forEach(o => {
      const comp = competitors.find(c => c.id === o.competitorId);
      const compName = comp?.name || 'Other';
      if (!compGroups[compName]) compGroups[compName] = [];
      compGroups[compName].push(o);
    });
    return { cookers, compOils, compGroups };
  }, [oilTypes, competitors]);

  // ── Form validation (must be before any early returns) ──
  const formValid = useMemo(() => {
    if (!newTrialForm.venueName.trim()) return false;
    if (!newTrialForm.city.trim()) return false;
    if (!newTrialForm.trialOilId) return false;
    if (!newTrialForm.defaultOil) return false;
    if (!newTrialForm.currentPrice) return false;
    if (!newTrialForm.offeredPrice) return false;
    if (!newTrialForm.avgLitresPerWeek || isNaN(parseFloat(newTrialForm.avgLitresPerWeek))) return false;
    if (trialType === 'existing' && !newTrialForm.customerCode.trim()) return false;
    return true;
  }, [newTrialForm, trialType]);

  const req = <span style={{ color: '#ef4444' }}>*</span>;

  // ── Venue mutation helpers ──
  const updateVenue = async (venueId, updates) => {
    setSaving(true);
    setVenues(prev => prev.map(v => v.id === venueId ? { ...v, ...updates } : v));
    try {
      const dbUpdates = unMapVenue({ ...venues.find(v => v.id === venueId), ...updates });
      await supabase.from('venues').update(dbUpdates).eq('id', venueId);
    } catch (err) {
      console.error('Update venue error:', err);
    }
    setSaving(false);
  };

  const handleStartTrial = async (venueId) => {
    await updateVenue(venueId, { trialStatus: 'in-progress', trialStartDate: getTodayString() });
    setSuccessMsg('Trial Started');
  };

  const handleEndTrial = async (venueId) => {
    await updateVenue(venueId, { trialStatus: 'completed', trialEndDate: getTodayString() });
    setEndTrialModal(null);
    setSuccessMsg('Trial Ended');
  };

  const handleCloseTrial = (venueId, outcomeData) => {
    setCloseTrialModal(null);
    setSuccessMsg(outcomeData.trialStatus === 'accepted' ? 'Marked as Won — needs cust code' : 'Marked as Lost');
    updateVenue(venueId, outcomeData);
  };

  const handleSaveTrialEdits = async (venueId, updates) => {
    await updateVenue(venueId, updates);
    // Update the selectedTrialVenue with the new data so the modal reflects changes
    setSelectedTrialVenue(prev => prev && prev.id === venueId ? { ...prev, ...updates } : prev);
    setSuccessMsg('Changes Saved');
  };

  const handleSaveCustomerCode = async (venueId, code) => {
    await updateVenue(venueId, { customerCode: code, trialStatus: 'won' });
    setSuccessMsg('Customer Code Saved — moved to Successful');
  };

  // ── Save reading ──
  const handleSaveReading = async (readings) => {
    const localReadings = readings.map((r, idx) => ({ ...r, id: `temp-${Date.now()}-${idx}` }));
    setTpmReadings(prev => [...prev, ...localReadings]);
    setReadingModal(null);
    setSuccessMsg('Reading Saved');

    try {
      const inserts = readings.map(r => unMapReading(r));
      await supabase.from('tpm_readings').insert(inserts);
      const venueId = readings[0]?.venueId;
      const readingDate = readings[0]?.readingDate;
      if (venueId && readingDate) {
        await supabase.from('venues').update({ last_tpm_date: readingDate }).eq('id', venueId);
        setVenues(prev => prev.map(v => v.id === venueId ? { ...v, lastTpmDate: readingDate } : v));
      }
      await refreshData();
    } catch (err) {
      console.error('Save reading error:', err);
    }
  };

  // ── Create new trial ──
  const handleCreateTrial = async (e) => {
    e.preventDefault();
    // All fields required
    if (!newTrialForm.venueName.trim() || !newTrialForm.city.trim()) return;
    if (!newTrialForm.trialOilId || !newTrialForm.defaultOil) return;
    if (!newTrialForm.currentPrice || !newTrialForm.offeredPrice) return;
    if (!newTrialForm.avgLitresPerWeek) return;
    if (trialType === 'existing' && !newTrialForm.customerCode.trim()) return;

    setSaving(true);
    try {
      // Generate codes
      const trialId = nextTrialId;
      const custCode = trialType === 'existing' ? newTrialForm.customerCode.trim() : nextProspectCode;

      const newVenue = {
        name: newTrialForm.venueName.trim(),
        status: 'trial-only',
        customerCode: custCode,
        state: currentUser.region || '',
        fryerCount: parseInt(newTrialForm.fryerCount) || 1,
        defaultOil: newTrialForm.defaultOil || null,
        bdmId: currentUser.id,
        trialStatus: 'pending',
        trialOilId: newTrialForm.trialOilId,
        trialNotes: `${trialId}${newTrialForm.city ? ` | ${newTrialForm.city.trim()}` : ''}${newTrialForm.notes ? `\n${newTrialForm.notes}` : ''}`,
        currentPricePerLitre: parseFloat(newTrialForm.currentPrice),
        offeredPricePerLitre: parseFloat(newTrialForm.offeredPrice),
        volumeBracket: calcVolumeBracket(newTrialForm.avgLitresPerWeek),
        currentWeeklyAvg: parseFloat(newTrialForm.avgLitresPerWeek),
      };
      const dbVenue = unMapVenue(newVenue);
      const { data, error } = await supabase.from('venues').insert(dbVenue).select().single();
      if (error) throw error;
      if (data) {
        setVenues(prev => [...prev, mapVenue(data)]);
      }

      setNewTrialForm({
        customerCode: '', venueName: '', city: '',
        trialOilId: '', fryerCount: 1, defaultOil: '', currentPrice: '', offeredPrice: '',
        avgLitresPerWeek: '', notes: '',
      });
      setTrialType('new');
      setSuccessMsg(`Trial Created — ${trialId}`);
      setActiveTab('pipeline');
    } catch (err) {
      console.error('Create trial error:', err);
    }
    setSaving(false);
  };

  // ─────────────────────────────────────────
  // LOADING SCREEN
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '24px',
        paddingBottom: '20vh', background: '#1a428a',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
      }}>
        <style>{`
          @keyframes cookersPulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.08); opacity: 1; }
          }
          @keyframes dotFlash {
            0%, 20% { opacity: 0; }
            40%, 100% { opacity: 1; }
          }
        `}</style>
        <img src="/images/Cookers drop icon.png" alt="Loading" style={{
          width: '90px', height: '90px', objectFit: 'contain',
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

  // ─────────────────────────────────────────
  // SORT BAR (A-Z / Recent) — shown for mobile card view
  // ─────────────────────────────────────────
  const renderSortBar = (count, label) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', color: COLORS.textMuted }}>{count} {label}{count !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span onClick={() => setSortNewest(false)} style={{ fontSize: '11px', color: !sortNewest ? BLUE : '#94a3b8', cursor: 'pointer', fontWeight: !sortNewest ? '600' : '500', display: 'flex', alignItems: 'center', gap: '3px' }}>{!sortNewest ? <ArrowDown size={11} /> : <ArrowUpDown size={11} />} A–Z</span>
        <span onClick={() => setSortNewest(true)} style={{ fontSize: '11px', color: sortNewest ? BLUE : '#94a3b8', cursor: 'pointer', fontWeight: sortNewest ? '600' : '500', display: 'flex', alignItems: 'center', gap: '3px' }}>{sortNewest ? <ArrowDown size={11} /> : <ArrowUpDown size={11} />} Recent</span>
      </div>
    </div>
  );

  // ─────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────

  // ─────────────────────────────────────────
  // HELPERS for cards
  // ─────────────────────────────────────────
  // Oil badge helper for cards — uses same OilBadge component as tables
  const cardOilBadge = (oilId, label) => {
    const oil = oilTypes.find(o => o.id === oilId);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
        <span style={{ color: COLORS.textMuted, flexShrink: 0 }}>{label}:</span>
        <OilBadge oil={oil} competitors={competitors} compact />
      </div>
    );
  };

  const codeBadges = (venue) => {
    const trialIdFromNotes = venue.trialNotes?.match(/^(TRL-\d+)/)?.[1] || null;
    const isProspect = venue.customerCode?.startsWith('PRS-');
    if (!trialIdFromNotes && !venue.customerCode) return null;
    return (
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {trialIdFromNotes && <span style={{ ...S.pill, background: '#e8eef6', color: BLUE, border: `1px solid ${BLUE}33`, fontSize: '10px' }}>{trialIdFromNotes}</span>}
        {venue.customerCode && <span style={{ ...S.pill, background: isProspect ? '#fef3c7' : '#f0fdf4', color: isProspect ? '#92400e' : '#059669', border: `1px solid ${isProspect ? '#fde68a' : '#bbf7d0'}`, fontSize: '10px' }}>{isProspect ? 'Prospect' : 'Cust'}: {venue.customerCode}</span>}
      </div>
    );
  };

  const pricingRow = (venue) => {
    if (!venue.currentPricePerLitre && !venue.offeredPricePerLitre) return null;
    return (
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
        {venue.currentPricePerLitre && <div><span style={{ color: COLORS.textMuted }}>Curr: </span><span style={{ fontWeight: '600' }}>${parseFloat(venue.currentPricePerLitre).toFixed(2)}/L</span></div>}
        {venue.offeredPricePerLitre && <div><span style={{ color: COLORS.textMuted }}>Offer: </span><span style={{ fontWeight: '600', color: BLUE }}>${parseFloat(venue.offeredPricePerLitre).toFixed(2)}/L</span></div>}
      </div>
    );
  };

  // -- ACTIVE TRIAL CARD --
  const renderActiveCard = (venue) => {
    const daysIn = venue.trialStartDate ? daysBetween(venue.trialStartDate, getTodayString()) : null;
    const venueReadings = tpmReadings.filter(r => r.venueId === venue.id);
    const latestReading = venueReadings.length > 0
      ? venueReadings.sort((a, b) => b.readingDate.localeCompare(a.readingDate))[0]
      : null;
    const totalLitres = venueReadings.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);

    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ ...S.card, borderLeft: `4px solid ${TRIAL_STATUS_COLORS['in-progress'].accent}`, marginBottom: '12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
          <TrialStatusBadge status="in-progress" />
        </div>
        {codeBadges(venue)}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {cardOilBadge(venue.trialOilId, 'Trial')}
          {cardOilBadge(venue.defaultOil, 'Current')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Started</div><div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialStartDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Days</div><div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{daysIn ?? '—'}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Readings</div><div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{venueReadings.length}</div></div>
        </div>
        {latestReading && (
          <div style={{ background: COLORS.bg, borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: COLORS.textMuted }}>Latest TPM</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: latestReading.tpmValue < 18 ? COLORS.good : latestReading.tpmValue < 24 ? COLORS.warning : COLORS.critical }}>{latestReading.tpmValue}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: COLORS.textFaint }}>{displayDate(latestReading.readingDate)}</span>
              <span style={{ fontSize: '11px', color: COLORS.textFaint }}>Total: {totalLitres.toFixed(1)}L</span>
            </div>
          </div>
        )}
        <div style={{ marginBottom: '12px' }}>{pricingRow(venue)}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={(e) => { e.stopPropagation(); setReadingModal(venue); }} style={{ flex: 1, padding: '10px', background: BLUE, border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ClipboardList size={14} /> Log Reading
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEndTrialModal(venue); }} style={{ flex: 1, padding: '10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: COLORS.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <XCircle size={14} /> End Trial
          </button>
        </div>
      </div>
    );
  };

  // -- PIPELINE CARD --
  const renderPipelineCard = (venue) => (
    <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ ...S.card, borderLeft: `4px solid ${TRIAL_STATUS_COLORS['pending'].accent}`, marginBottom: '12px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
        <TrialStatusBadge status="pending" />
      </div>
      {codeBadges(venue)}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {cardOilBadge(venue.trialOilId, 'Trial')}
        {cardOilBadge(venue.defaultOil, 'Current')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Fryers</div><div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{venue.fryerCount || 1}</div></div>
        <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Volume</div><div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{venue.volumeBracket || '—'}</div></div>
      </div>
      <div style={{ marginBottom: '12px' }}>{pricingRow(venue)}</div>
      <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Start trial for ${venue.name}?`)) handleStartTrial(venue.id); }} style={{
        width: '100%', padding: '10px', background: BLUE, border: 'none', borderRadius: '8px',
        fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      }}>
        <Play size={14} /> Start Trial
      </button>
    </div>
  );

  // -- PENDING OUTCOME CARD --
  const renderPendingOutcomeCard = (venue) => {
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ ...S.card, borderLeft: `4px solid ${COLORS.warning}`, marginBottom: '12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
          <span style={{ ...S.pill, background: COLORS.warningBg, color: '#92400e', border: '1px solid #fde68a' }}>Pending</span>
        </div>
        {codeBadges(venue)}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {cardOilBadge(venue.trialOilId, 'Trial')}
          {cardOilBadge(venue.defaultOil, 'Current')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Started</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialStartDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Ended</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialEndDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Duration</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{daysRan != null ? `${daysRan}d` : '—'}</div></div>
        </div>
        <div style={{ marginBottom: '12px' }}>{pricingRow(venue)}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'won' }); }} style={{ flex: 1, padding: '10px', background: '#10b981', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Trophy size={14} /> Won</button>
          <button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'lost' }); }} style={{ flex: 1, padding: '10px', background: '#ef4444', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><XCircle size={14} /> Lost</button>
        </div>
      </div>
    );
  };

  // -- ARCHIVE CARD (for won/lost) --
  const renderArchiveCard = (venue) => {
    const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['completed'];
    const reasonLabel = venue.trialReason ? (trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason) : null;
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || venue.outcomeDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ ...S.card, borderLeft: `4px solid ${statusCfg.accent}`, marginBottom: '12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
          <TrialStatusBadge status={venue.trialStatus} />
        </div>
        {codeBadges(venue)}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {cardOilBadge(venue.trialOilId, 'Trial')}
          {cardOilBadge(venue.defaultOil, 'Current')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Started</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialStartDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Ended</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialEndDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Duration</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{daysRan != null ? `${daysRan}d` : '—'}</div></div>
        </div>
        <div style={{ marginBottom: '10px' }}>{pricingRow(venue)}</div>
        {venue.trialStatus === 'won' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} color="#059669" strokeWidth={3} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#059669' }}>Successful</span>
              {venue.soldPricePerLitre && <><span style={{ color: '#cbd5e1' }}>|</span><span style={{ fontSize: '12px', color: '#065f46' }}>${parseFloat(venue.soldPricePerLitre).toFixed(2)}/L</span></>}
            </div>
            {reasonLabel && <div style={{ fontSize: '11px', color: '#065f46', marginTop: '2px' }}>{reasonLabel}</div>}
          </div>
        )}
        {venue.trialStatus === 'won' && venue.customerCode && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} color="#059669" />
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#065f46' }}>Cust Code: {venue.customerCode}</span>
          </div>
        )}
        {venue.trialStatus === 'lost' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={14} color="#dc2626" strokeWidth={3} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626' }}>Unsuccessful</span>
            </div>
            {reasonLabel && <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '2px' }}>{reasonLabel}</div>}
          </div>
        )}
      </div>
    );
  };

  // ── Accepted card (Awaiting Cust Code) ──
  const renderAcceptedCard = (venue) => {
    const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['completed'];
    const reasonLabel = venue.trialReason ? (trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason) : null;
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || venue.outcomeDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ ...S.card, borderLeft: `4px solid ${statusCfg.accent}`, marginBottom: '12px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>{venue.name}</div>
          <TrialStatusBadge status={venue.trialStatus} />
        </div>
        {codeBadges(venue)}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {cardOilBadge(venue.trialOilId, 'Trial')}
          {cardOilBadge(venue.defaultOil, 'Current')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Started</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialStartDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Ended</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{displayDate(venue.trialEndDate)}</div></div>
          <div><div style={{ fontSize: '10px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Duration</div><div style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, marginTop: '2px' }}>{daysRan != null ? `${daysRan}d` : '—'}</div></div>
        </div>
        <div style={{ marginBottom: '10px' }}>{pricingRow(venue)}</div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} color="#059669" strokeWidth={3} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#059669' }}>Successful</span>
            {venue.soldPricePerLitre && <><span style={{ color: '#cbd5e1' }}>|</span><span style={{ fontSize: '12px', color: '#065f46' }}>${parseFloat(venue.soldPricePerLitre).toFixed(2)}/L</span></>}
          </div>
          {reasonLabel && <div style={{ fontSize: '11px', color: '#065f46', marginTop: '2px' }}>{reasonLabel}</div>}
        </div>
        <CustomerCodeInput venueId={venue.id} onSave={handleSaveCustomerCode} />
      </div>
    );
  };

  // ─────────────────────────────────────────
  // ADMIN-PANEL STYLE TABLE — all columns filterable, matching admin panel exactly
  // (No BDM/NAM since we know who the BDM is, Action column instead of Status)
  // ─────────────────────────────────────────
  const isArchiveTab = (t) => t === 'won' || t === 'lost';

  const renderTrialTable = (allVenues, tabType) => {
    const filtered = colFilters.activeCount > 0 ? colFilters.applyFilters(allVenues, colAccessors) : allVenues;
    const rows = sortList(filtered);
    const showStart = tabType !== 'pipeline';
    const showEnd = tabType === 'pending' || isArchiveTab(tabType);
    const showClosed = isArchiveTab(tabType);
    const showSold = isArchiveTab(tabType);
    const showReason = isArchiveTab(tabType);
    const showAction = !isArchiveTab(tabType);
    return (
      <div>
        <BdmActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'auto' }}>
          <style>{`
            .bdm-table { width: 100%; border-collapse: separate; border-spacing: 0; }
            .bdm-table thead th { position: sticky; top: 0; z-index: 20; padding: 7px 14px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
            .bdm-table tbody tr { transition: background 0.1s; }
            .bdm-table tbody tr:hover { background: #eef2ff; }
            .bdm-table tbody td { padding: 7px 14px; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f1f5f9; vertical-align: middle; white-space: nowrap; }
          `}</style>
          <table className="bdm-table" style={{ width: '100%', tableLayout: 'auto' }}>
            <thead><tr>
              <th style={{ width: '4px', padding: 0 }}></th>
              <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(allVenues, v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
              <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({ value: b.label, label: b.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
              <FilterableTh colKey="competitor" label="Comp." options={getUniqueValues(allVenues, colAccessors.competitor)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
              <FilterableTh colKey="compOil" label="Comp. Oil" options={getUniqueValues(allVenues, colAccessors.compOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
              <FilterableTh colKey="trialOil" label="Trial Oil" options={getUniqueValues(allVenues, colAccessors.trialOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
              <FilterableTh colKey="currentPrice" label="Curr $/L" options={getUniqueValues(allVenues, colAccessors.currentPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
              <FilterableTh colKey="offeredPrice" label="Off $/L" options={getUniqueValues(allVenues, colAccessors.offeredPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
              {showSold && <FilterableTh colKey="soldPrice" label="Sold $/L" options={getUniqueValues(allVenues, colAccessors.soldPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
              {showStart && <FilterableTh colKey="start" label="Start" options={getUniqueValues(allVenues, colAccessors.start)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
              {showEnd && <FilterableTh colKey="end" label="End" options={getUniqueValues(allVenues, colAccessors.end)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
              {showClosed && <FilterableTh colKey="closedDate" label="Closed Date" options={getUniqueValues(allVenues, colAccessors.closedDate)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
              {showReason && <FilterableTh colKey="reason" label="Reason" options={trialReasons.filter(r => allVenues.some(v => v.trialReason === r.key)).map(r => ({ value: r.label, label: r.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
              {showAction && <th style={{ textAlign: 'center', width: '100px' }}>Action</th>}
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px' }}>No trials found</td></tr>
              ) : rows.map((venue) => {
                const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
                const compOil = oilTypes.find(o => o.id === venue.defaultOil);
                const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                const comp = compOil?.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
                const compTier = compOil ? (COMPETITOR_TIER_COLORS[compOil.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                const reasonObj = venue.trialReason ? trialReasons.find(r => r.key === venue.trialReason) : null;
                return (
                  <tr key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ height: '34px', cursor: 'pointer' }}>
                    <td style={{ width: '4px', padding: 0, background: statusCfg.accent }}></td>
                    <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</td>
                    <td style={{ textAlign: 'center' }}><VolumePill bracket={venue.volumeBracket} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{comp ? <CompetitorPill comp={comp} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', paddingLeft: '4px', paddingRight: '4px' }}>{compOil ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '72px', textAlign: 'center', verticalAlign: 'middle' }}>{compOil.name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}><OilBadge oil={cookersOil} competitors={competitors} compact /></td>
                    <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{venue.currentPricePerLitre ? `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', fontWeight: '700', fontSize: '11px', color: '#1a428a', whiteSpace: 'nowrap' }}>{venue.offeredPricePerLitre ? `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    {showSold && <td style={{ fontWeight: '600', color: '#065f46', whiteSpace: 'nowrap' }}>{venue.soldPricePerLitre ? `$${parseFloat(venue.soldPricePerLitre).toFixed(2)}` : '—'}</td>}
                    {showStart && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{displayDate(venue.trialStartDate)}</td>}
                    {showEnd && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{displayDate(venue.trialEndDate)}</td>}
                    {showClosed && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{displayDate(venue.outcomeDate)}</td>}
                    {showReason && <td style={{ color: reasonObj?.type === 'successful' ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>{reasonObj ? reasonObj.label : '—'}</td>}
                    {showAction && (
                      <td style={{ textAlign: 'center' }}>
                        {tabType === 'pipeline' && <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Start trial for ${venue.name}?`)) handleStartTrial(venue.id); }} style={{ padding: '5px 12px', background: BLUE, border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>Start</button>}
                        {tabType === 'active' && <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}><button onClick={(e) => { e.stopPropagation(); setReadingModal(venue); }} style={{ padding: '5px 10px', background: BLUE, border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>Log</button><button onClick={(e) => { e.stopPropagation(); setEndTrialModal(venue); }} style={{ padding: '5px 10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: COLORS.textMuted, cursor: 'pointer' }}>End</button></div>}
                        {tabType === 'pending' && <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}><button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'won' }); }} style={{ padding: '5px 10px', background: '#10b981', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>Won</button><button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'lost' }); }} style={{ padding: '5px 10px', background: '#ef4444', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>Lost</button></div>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // -- NEW TRIAL FORM --
  const renderNewTrialForm = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
    <form onSubmit={handleCreateTrial}>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: COLORS.text, marginBottom: '16px', marginTop: 0 }}>Create New Trial</h3>

      {/* Trial Type Tabs — folder/file style */}
      <div style={{ display: 'flex', marginBottom: '0' }}>
        {[{ val: 'existing', label: 'Existing Customer' }, { val: 'new', label: 'New Prospect' }].map(opt => {
          const isActive = trialType === opt.val;
          return (
            <button key={opt.val} type="button" onClick={() => setTrialType(opt.val)} style={{
              flex: 1, padding: '10px 16px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.15s',
              borderRadius: '8px 8px 0 0',
              border: isActive ? '1.5px solid #cbd5e1' : '1.5px solid transparent',
              borderBottom: isActive ? '1.5px solid white' : '1.5px solid #cbd5e1',
              background: isActive ? 'white' : '#e8eef6',
              color: isActive ? BLUE : '#94a3b8',
              fontSize: isActive ? '13px' : '12px',
              boxShadow: isActive ? '0 -2px 6px rgba(0,0,0,0.06)' : 'none',
              marginBottom: '-1.5px',
              position: 'relative',
              zIndex: isActive ? 1 : 0,
            }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1.5px solid #e2e8f0', paddingTop: '20px' }}></div>

      {/* Customer code — only for existing */}
      {trialType === 'existing' && (
        <div style={S.field}>
          <label style={S.label}>CUSTOMER CODE {req}</label>
          <input type="text" value={newTrialForm.customerCode} onChange={e => setNewTrialForm(f => ({ ...f, customerCode: e.target.value }))}
            placeholder="e.g., CUST001" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      )}

      {/* Venue Name + City — both types, side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
        <div style={S.field}>
          <label style={S.label}>VENUE NAME {req}</label>
          <input type="text" value={newTrialForm.venueName} onChange={e => setNewTrialForm(f => ({ ...f, venueName: e.target.value }))}
            placeholder="e.g., Joe's Fish & Chips" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
        <div style={S.field}>
          <label style={S.label}>CITY {req}</label>
          <input type="text" value={newTrialForm.city} onChange={e => setNewTrialForm(f => ({ ...f, city: e.target.value }))}
            placeholder="e.g., Melbourne" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      </div>

      {/* Current Oil + Current Price — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
        <div style={S.field}>
          <label style={S.label}>CURRENT OIL {req}</label>
          <select value={newTrialForm.defaultOil} onChange={e => setNewTrialForm(f => ({ ...f, defaultOil: e.target.value }))}
            style={{ ...selectStyle, color: newTrialForm.defaultOil ? '#1f2937' : '#94a3b8' }} required>
            <option value="" disabled>Select current oil...</option>
            {Object.entries(allOilOptions.compGroups).sort(([a], [b]) => a.localeCompare(b)).map(([compName, oils]) => (
              <optgroup key={compName} label={compName}>
                {oils.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            ))}
            {allOilOptions.cookers.length > 0 && (
              <optgroup label="── Cookers Oils ──">
                {allOilOptions.cookers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div style={S.field}>
          <label style={S.label}>CURRENT PRICE $/L {req}</label>
          <input type="number" step="0.01" min="0" value={newTrialForm.currentPrice}
            onChange={e => setNewTrialForm(f => ({ ...f, currentPrice: e.target.value }))}
            placeholder="0.00" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      </div>

      {/* Trial Oil + Offered Price — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
        <div style={S.field}>
          <label style={S.label}>TRIAL OIL {req}</label>
          <select value={newTrialForm.trialOilId} onChange={e => setNewTrialForm(f => ({ ...f, trialOilId: e.target.value }))}
            style={{ ...selectStyle, color: newTrialForm.trialOilId ? '#1f2937' : '#94a3b8' }} required>
            <option value="" disabled>Select Cookers oil...</option>
            {cookerOils.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div style={S.field}>
          <label style={S.label}>OFFERED PRICE $/L {req}</label>
          <input type="number" step="0.01" min="0" value={newTrialForm.offeredPrice}
            onChange={e => setNewTrialForm(f => ({ ...f, offeredPrice: e.target.value }))}
            placeholder="0.00" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      </div>

      {/* Avg Litres/Week + Fryer Count — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
        <div style={S.field}>
          <label style={S.label}>CURRENT AVG LITRES/WEEK {req}</label>
          <input type="number" min="0" step="1" value={newTrialForm.avgLitresPerWeek}
            onChange={e => setNewTrialForm(f => ({ ...f, avgLitresPerWeek: e.target.value }))}
            placeholder="e.g. 80" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          {newTrialForm.avgLitresPerWeek && calcVolumeBracket(newTrialForm.avgLitresPerWeek) && (
            <div style={{ marginTop: '6px' }}>
              <VolumePill bracket={calcVolumeBracket(newTrialForm.avgLitresPerWeek)} />
            </div>
          )}
        </div>
        <div style={S.field}>
          <label style={S.label}>FRYER COUNT {req}</label>
          <input type="number" min="1" max="20" value={newTrialForm.fryerCount}
            onChange={e => setNewTrialForm(f => ({ ...f, fryerCount: e.target.value }))}
            style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      </div>

      {/* Notes */}
      <div style={S.field}>
        <label style={S.label}>NOTES</label>
        <textarea value={newTrialForm.notes} onChange={e => setNewTrialForm(f => ({ ...f, notes: e.target.value }))}
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any additional notes..."
          onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
      </div>

      {/* Submit */}
      <button type="submit" disabled={saving || !formValid} style={{
        width: '100%', padding: '12px', background: (saving || !formValid) ? '#94a3b8' : BLUE, border: 'none',
        borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: 'white',
        cursor: (saving || !formValid) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        marginTop: '8px',
      }}>
        <Plus size={16} /> {saving ? 'Creating...' : 'Create Trial'}
      </button>
    </form>
    </div>
  );

  // ─────────────────────────────────────────
  // TAB CONTENT
  // ─────────────────────────────────────────
  const emptyState = (Icon, title, subtitle) => (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.textMuted }}>
      <Icon size={32} color={COLORS.textFaint} style={{ marginBottom: '12px' }} />
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: COLORS.textFaint }}>{subtitle}</div>
    </div>
  );

  const isTableView = bdmView === 'desktop';

  // ─────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────
  const renderDashboard = () => {
    const allTrials = myVenues.filter(v => v.trialStatus && v.trialStatus !== '');
    const activeCount = activeTrials.length;
    const pipelineCount = pipelineTrials.length;
    const pendingCount = pendingOutcomeTrials.length;
    const acceptedCount = acceptedTrials.length;
    const wonCount = wonTrials.length;
    const lostCount = lostTrials.length;
    const decidedCount = wonCount + lostCount;
    const winRate = decidedCount > 0 ? Math.round((wonCount / decidedCount) * 100) : null;

    // Status breakdown for visual bar
    const statusBreakdown = [
      { key: 'pending', label: 'Pipeline', count: pipelineCount, color: '#94a3b8' },
      { key: 'in-progress', label: 'Active', count: activeCount, color: '#3b82f6' },
      { key: 'completed', label: 'Pending', count: pendingCount, color: '#fbbf24' },
      { key: 'accepted', label: 'Awaiting Code', count: acceptedCount, color: '#f59e0b' },
      { key: 'won', label: 'Successful', count: wonCount, color: '#10b981' },
      { key: 'lost', label: 'Unsuccessful', count: lostCount, color: '#ef4444' },
    ];

    // Awaiting recording today — active trials where no reading has been logged today
    const todayStr = getTodayString();
    const awaitingRecording = activeTrials.filter(v => {
      const todayReadings = tpmReadings.filter(r => r.venueId === v.id && r.readingDate === todayStr);
      return todayReadings.length === 0;
    });

    const dashFiltered = dashStatusFilter.length > 0
      ? allTrials.filter(v => dashStatusFilter.includes(v.trialStatus))
      : allTrials;
    const dashRows = [...dashFiltered].sort((a, b) => (b.trialStartDate || '').localeCompare(a.trialStartDate || ''));

    const statCardStyle = {
      background: 'white', borderRadius: '10px', padding: '14px 16px',
      border: '1px solid #e2e8f0', flex: 1, minWidth: '0',
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* ── Stats Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <div style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Active Trials</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6', marginTop: '2px' }}>{activeCount}</div>
              </div>
              <Play size={18} color="#93c5fd" />
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Win Rate</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: winRate !== null ? '#10b981' : COLORS.textFaint, marginTop: '2px' }}>{winRate !== null ? `${winRate}%` : '—'}</div>
              </div>
              <TrendingUp size={18} color="#6ee7b7" />
            </div>
            {decidedCount > 0 && <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: '2px' }}>{wonCount}W · {lostCount}L</div>}
          </div>
          <div style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Pending Decision</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#f59e0b', marginTop: '2px' }}>{pendingCount + acceptedCount}</div>
              </div>
              <AlertTriangle size={18} color="#fde68a" />
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Pipeline</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#64748b', marginTop: '2px' }}>{pipelineCount}</div>
              </div>
              <Clock size={18} color="#cbd5e1" />
            </div>
          </div>
        </div>

        {/* ── Awaiting Recording Today ── */}
        {activeTrials.length > 0 && (
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={14} color={awaitingRecording.length > 0 ? '#f59e0b' : '#10b981'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Awaiting Recording Today</span>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px',
                background: awaitingRecording.length > 0 ? '#fef3c7' : '#d1fae5',
                color: awaitingRecording.length > 0 ? '#92400e' : '#065f46',
              }}>{awaitingRecording.length} / {activeTrials.length}</span>
            </div>
            {awaitingRecording.length > 0 ? (
              <div style={{ padding: '8px 16px 12px' }}>
                {awaitingRecording.map(v => {
                  const daysIn = v.trialStartDate ? daysBetween(v.trialStartDate, todayStr) : null;
                  return (
                    <div key={v.id} onClick={() => setSelectedTrialVenue(v)} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0',
                      borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>{v.name}</span>
                        {daysIn != null && <span style={{ fontSize: '11px', color: COLORS.textMuted, marginLeft: '8px' }}>Day {daysIn}</span>}
                      </div>
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>No reading</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', color: '#059669', fontWeight: '500' }}>
                <Check size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />All active trials have a reading today
              </div>
            )}
          </div>
        )}

        {/* ── Status Filter Strip (admin-panel style) ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', overflowX: 'auto' }}>
          {[
            { key: 'pending', label: 'Pipeline', color: '#64748b', bg: '#f1f5f9', activeBg: '#64748b', activeText: 'white' },
            { key: 'in-progress', label: 'Active', color: '#1e40af', bg: '#dbeafe', activeBg: '#1e40af', activeText: 'white' },
            { key: 'completed', label: 'Pending', color: '#a16207', bg: '#fef3c7', activeBg: '#eab308', activeText: '#78350f' },
            { key: 'accepted', label: 'Awaiting Code', color: '#9a3412', bg: '#ffedd5', activeBg: '#ea580c', activeText: 'white' },
            { key: 'won', label: 'Successful', color: '#065f46', bg: '#d1fae5', activeBg: '#059669', activeText: 'white' },
            { key: 'lost', label: 'Unsuccessful', color: '#991b1b', bg: '#fee2e2', activeBg: '#991b1b', activeText: 'white' },
          ].map(s => {
            const isActive = dashStatusFilter.includes(s.key);
            const count = statusBreakdown.find(b => b.key === s.key)?.count || 0;
            return (
              <div key={s.key} onClick={() => setDashStatusFilter(prev => prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key])} style={{
                flex: '1', minWidth: '56px', padding: '8px 4px', borderRadius: '8px',
                background: isActive ? s.activeBg : s.bg, textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                border: isActive ? `2px solid ${s.activeBg}` : '2px solid transparent',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                transform: isActive ? 'scale(1.02)' : 'scale(1)'
              }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: isActive ? s.activeText : s.color }}>{count}</div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: isActive ? (s.activeText === 'white' ? 'rgba(255,255,255,0.85)' : s.activeText) : s.color, opacity: isActive ? 1 : 0.8, whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* ── All Trials ── */}
        {isDesktop ? (
          /* Desktop: full table */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BdmActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ overflow: 'auto', flex: 1 }}>
              <style>{`
                .bdm-table { width: 100%; border-collapse: separate; border-spacing: 0; }
                .bdm-table thead th { position: sticky; top: 0; z-index: 20; padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
                .bdm-table tbody tr { transition: background 0.1s; }
                .bdm-table tbody tr:hover { background: #eef2ff; }
                .bdm-table tbody td { padding: 6px 8px; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f1f5f9; vertical-align: middle; white-space: nowrap; }
              `}</style>
              <table className="bdm-table" style={{ width: '100%', tableLayout: 'auto' }}>
                <thead><tr>
                  <th style={{ width: '4px', padding: 0 }}></th>
                  <FilterableTh colKey="name" label="Venue" options={getUniqueValues(dashFiltered, v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  <FilterableTh colKey="volume" label="Vol" options={VOLUME_BRACKETS.map(b => ({ value: b.label, label: b.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                  <FilterableTh colKey="competitor" label="Comp." options={getUniqueValues(dashFiltered, colAccessors.competitor)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  <FilterableTh colKey="compOil" label="Comp. Oil" options={getUniqueValues(dashFiltered, colAccessors.compOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                  <FilterableTh colKey="trialOil" label="Trial Oil" options={getUniqueValues(dashFiltered, colAccessors.trialOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                  <FilterableTh colKey="currentPrice" label="Curr $" options={getUniqueValues(dashFiltered, colAccessors.currentPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '52px' }} />
                  <FilterableTh colKey="offeredPrice" label="Off $" options={getUniqueValues(dashFiltered, colAccessors.offeredPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '52px' }} />
                  <FilterableTh colKey="soldPrice" label="Sold $" options={getUniqueValues(dashFiltered, colAccessors.soldPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '52px' }} />
                  <FilterableTh colKey="start" label="Start" options={getUniqueValues(dashFiltered, colAccessors.start)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  <FilterableTh colKey="end" label="End" options={getUniqueValues(dashFiltered, colAccessors.end)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  <FilterableTh colKey="status" label="Status" options={[{value:'pending',label:'Pipeline'},{value:'in-progress',label:'Active'},{value:'completed',label:'Pending'},{value:'accepted',label:'Awaiting'},{value:'won',label:'Successful'},{value:'lost',label:'Unsuccessful'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                </tr></thead>
                <tbody>
                  {(() => {
                    const filtered = colFilters.activeCount > 0 ? colFilters.applyFilters(dashRows, colAccessors) : dashRows;
                    const rows = sortList(filtered);
                    return rows.length === 0 ? (
                      <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px' }}>No trials found</td></tr>
                    ) : rows.map(venue => {
                      const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
                      const compOilObj = oilTypes.find(o => o.id === venue.defaultOil);
                      const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                      const comp = compOilObj?.competitorId ? competitors.find(c => c.id === compOilObj.competitorId) : null;
                      const compTier = compOilObj ? (COMPETITOR_TIER_COLORS[compOilObj.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                      return (
                        <tr key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{ height: '34px', cursor: 'pointer' }}>
                          <td style={{ width: '4px', padding: 0, background: statusCfg.accent }}></td>
                          <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</td>
                          <td style={{ textAlign: 'center' }}><VolumePill bracket={venue.volumeBracket} /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{comp ? <CompetitorPill comp={comp} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ textAlign: 'center', paddingLeft: '2px', paddingRight: '2px' }}>{compOilObj ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '68px', textAlign: 'center' }}>{compOilObj.name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ textAlign: 'center' }}><OilBadge oil={cookersOil} competitors={competitors} compact /></td>
                          <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{venue.currentPricePerLitre ? `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ textAlign: 'center', fontWeight: '700', fontSize: '11px', color: '#1a428a', whiteSpace: 'nowrap' }}>{venue.offeredPricePerLitre ? `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ fontWeight: '600', color: '#065f46', whiteSpace: 'nowrap' }}>{venue.soldPricePerLitre ? `$${parseFloat(venue.soldPricePerLitre).toFixed(2)}` : '—'}</td>
                          <td style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: '11px' }}>{displayDate(venue.trialStartDate)}</td>
                          <td style={{ color: '#64748b', whiteSpace: 'nowrap', fontSize: '11px' }}>{displayDate(venue.trialEndDate)}</td>
                          <td style={{ textAlign: 'center' }}><TrialStatusBadge status={venue.trialStatus} /></td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : (
          /* Mobile: card layout */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(() => {
              const filtered = colFilters.activeCount > 0 ? colFilters.applyFilters(dashRows, colAccessors) : dashRows;
              const rows = sortList(filtered);
              return rows.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>No trials found</div>
              ) : rows.map(venue => {
                const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
                const compOilObj = oilTypes.find(o => o.id === venue.defaultOil);
                const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                const comp = compOilObj?.competitorId ? competitors.find(c => c.id === compOilObj.competitorId) : null;
                return (
                  <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={{
                    background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
                    borderLeft: `4px solid ${statusCfg.accent}`, padding: '12px 14px',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{venue.name}</span>
                      <TrialStatusBadge status={venue.trialStatus} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                      {venue.volumeBracket && <VolumePill bracket={venue.volumeBracket} />}
                      {comp && <CompetitorPill comp={comp} />}
                      {cookersOil && <OilBadge oil={cookersOil} competitors={competitors} compact />}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: '#64748b' }}>
                      {venue.currentPricePerLitre && <span>Curr: <strong>${parseFloat(venue.currentPricePerLitre).toFixed(2)}</strong></span>}
                      {venue.offeredPricePerLitre && <span>Off: <strong style={{ color: '#1a428a' }}>${parseFloat(venue.offeredPricePerLitre).toFixed(2)}</strong></span>}
                      {venue.soldPricePerLitre && <span>Sold: <strong style={{ color: '#065f46' }}>${parseFloat(venue.soldPricePerLitre).toFixed(2)}</strong></span>}
                    </div>
                    {(venue.trialStartDate || venue.trialEndDate) && (
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
                        {venue.trialStartDate && <span>{displayDate(venue.trialStartDate)}</span>}
                        {venue.trialStartDate && venue.trialEndDate && <span> → </span>}
                        {venue.trialEndDate && <span>{displayDate(venue.trialEndDate)}</span>}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'pipeline': {
        const sorted = sortList(pipelineTrials);
        return (
          <div>
            {pipelineTrials.length === 0
              ? emptyState(Clock, 'Pipeline empty', 'Create a new trial to add to your pipeline')
              : isTableView ? renderTrialTable(pipelineTrials, 'pipeline')
              : <>{renderSortBar(sorted.length, 'pipeline trial')}{sorted.map(v => renderPipelineCard(v))}</>
            }
          </div>
        );
      }
      case 'active': {
        const sorted = sortList(activeTrials);
        return (
          <div>
            {activeTrials.length === 0
              ? emptyState(Play, 'No active trials', 'Start a trial from your pipeline')
              : isTableView ? renderTrialTable(activeTrials, 'active')
              : <>{renderSortBar(sorted.length, 'active trial')}{sorted.map(v => renderActiveCard(v))}</>
            }
          </div>
        );
      }
      case 'pending': {
        const sorted = sortList(pendingOutcomeTrials);
        return (
          <div>
            {pendingOutcomeTrials.length === 0
              ? emptyState(Clock, 'No pending outcomes', 'Trials awaiting a won/lost decision will appear here')
              : isTableView ? renderTrialTable(pendingOutcomeTrials, 'pending')
              : <>{renderSortBar(sorted.length, 'pending trial')}{sorted.map(v => renderPendingOutcomeCard(v))}</>
            }
          </div>
        );
      }
      case 'accepted': {
        const sorted = sortList(acceptedTrials);
        return (
          <div>
            {acceptedTrials.length === 0
              ? emptyState(ClipboardList, 'No trials awaiting codes', 'Accepted trials needing a customer code will appear here')
              : <>{renderSortBar(sorted.length, 'accepted trial')}{sorted.map(v => renderAcceptedCard(v))}</>
            }
          </div>
        );
      }
      case 'won': {
        const sorted = sortList(wonTrials);
        return (
          <div>
            {wonTrials.length === 0
              ? emptyState(Trophy, 'No successful trials yet', 'Won trials will appear here')
              : isTableView ? renderTrialTable(wonTrials, 'won')
              : <>{renderSortBar(sorted.length, 'successful trial')}{sorted.map(v => renderArchiveCard(v))}</>
            }
          </div>
        );
      }
      case 'lost': {
        const sorted = sortList(lostTrials);
        return (
          <div>
            {lostTrials.length === 0
              ? emptyState(XCircle, 'No unsuccessful trials', 'Lost trials will appear here')
              : isTableView ? renderTrialTable(lostTrials, 'lost')
              : <>{renderSortBar(sorted.length, 'unsuccessful trial')}{sorted.map(v => renderArchiveCard(v))}</>
            }
          </div>
        );
      }
      case 'new':
        return renderNewTrialForm();
      default:
        return null;
    }
  };

  // ─────────────────────────────────────────
  // NAV ITEMS — Pipeline > Active > Pending > Successful > Unsuccessful
  // ─────────────────────────────────────────
  const NAV_ITEMS = [
    { id: 'pipeline', label: 'Pipeline', icon: Clock, count: pipelineTrials.length },
    { id: 'active', label: 'Active', icon: Play, count: activeTrials.length },
    { id: 'pending', label: 'Pending Outcome', icon: AlertTriangle, count: pendingOutcomeTrials.length },
    { id: 'accepted', label: 'Awaiting', icon: ClipboardList, count: acceptedTrials.length, color: '#f59e0b' },
  ];
  const ARCHIVE_ITEMS = [
    { id: 'won', label: 'Successful', icon: Trophy, count: wonTrials.length, color: '#10b981' },
    { id: 'lost', label: 'Unsuccessful', icon: XCircle, count: lostTrials.length, color: '#ef4444' },
  ];

  // ─────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────
  return (
    <div style={{
      ...(isDesktop
        ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : { minHeight: '100vh' }),
      background: COLORS.bg,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
    }}>
      <style>{`
        button, input, select, textarea { font-family: inherit; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ ...(isDesktop ? { flexShrink: 0 } : {}), zIndex: 200, background: BLUE, padding: isDesktop ? '6px 16px' : '0 0 0 0' }}>
        {isDesktop ? (
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/images/App header.png" alt="Frysmart" style={{ height: '65px' }} />
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                background: 'rgba(16,185,129,0.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.4)',
                letterSpacing: '0.5px',
              }}>OIL TRIALS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Desktop/Mobile view toggle */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.12)', borderRadius: '8px', padding: '2px' }}>
                <button onClick={() => setBdmView('desktop')} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: bdmView === 'desktop' ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color: bdmView === 'desktop' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  fontSize: '11px', fontWeight: '600', transition: 'all 0.15s',
                }}>
                  <Monitor size={13} /> Desktop
                </button>
                <button onClick={() => setBdmView('mobile')} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: bdmView === 'mobile' ? 'rgba(255,255,255,0.25)' : 'transparent',
                  color: bdmView === 'mobile' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  fontSize: '11px', fontWeight: '600', transition: 'all 0.15s',
                }}>
                  <Smartphone size={13} /> Mobile
                </button>
              </div>
              <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '-4px' }}>
              <img src="/images/App header.png" alt="Frysmart" style={{ height: '62px', maxWidth: 'calc(100vw - 16px)', objectFit: 'contain', objectPosition: 'left' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '16px', paddingRight: '12px', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                  background: 'rgba(16,185,129,0.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.4)',
                  letterSpacing: '0.5px',
                }}>OIL TRIALS</span>
                {/* Desktop/Mobile view toggle */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.12)', borderRadius: '6px', padding: '2px' }}>
                  <button onClick={() => setBdmView('desktop')} style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 7px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                    background: bdmView === 'desktop' ? 'rgba(255,255,255,0.25)' : 'transparent',
                    color: bdmView === 'desktop' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    fontSize: '10px', fontWeight: '600', transition: 'all 0.15s',
                  }}>
                    <Monitor size={11} />
                  </button>
                  <button onClick={() => setBdmView('mobile')} style={{
                    display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 7px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                    background: bdmView === 'mobile' ? 'rgba(255,255,255,0.25)' : 'transparent',
                    color: bdmView === 'mobile' ? '#ffffff' : 'rgba(255,255,255,0.5)',
                    fontSize: '10px', fontWeight: '600', transition: 'all 0.15s',
                  }}>
                    <Smartphone size={11} />
                  </button>
                </div>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
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

      {/* ── Desktop: Sidebar + Content ── */}
      {isDesktop ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {/* Sidebar */}
          <div style={{
            width: '210px', flexShrink: 0, background: COLORS.white, borderRight: `1px solid ${COLORS.border}`,
            padding: '20px 12px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              {/* New Trial — prominent CTA */}
              <button onClick={() => { setActiveTab('new'); colFilters.clearAll(); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '11px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                marginBottom: '16px', transition: 'all 0.15s',
                background: activeTab === 'new' ? COLORS.brand : '#f5a623',
                color: 'white',
                fontWeight: '700', fontSize: '13px', letterSpacing: '0.2px',
                boxShadow: activeTab === 'new' ? 'none' : '0 2px 8px rgba(245,166,35,0.3)',
              }}>
                <Plus size={16} strokeWidth={2.5} />
                New Trial
              </button>

              {/* Dashboard */}
              <button onClick={() => { setActiveTab('dashboard'); colFilters.clearAll(); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                marginBottom: '12px', transition: 'all 0.15s', textAlign: 'left',
                background: activeTab === 'dashboard' ? '#e8eef6' : 'transparent',
                color: activeTab === 'dashboard' ? COLORS.brand : '#1f2937',
                fontWeight: activeTab === 'dashboard' ? '700' : '500', fontSize: '13px',
              }}>
                <BarChart3 size={16} />
                Dashboard
              </button>

              {/* Trials section */}
              <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Trials</div>
              {NAV_ITEMS.map(tab => {
                const isActive = activeTab === tab.id;
                const activeColor = tab.color || COLORS.brand;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                    background: isActive ? '#e8eef6' : 'transparent',
                    color: isActive ? activeColor : '#1f2937',
                    fontWeight: isActive ? '600' : '500', fontSize: '13px',
                  }}>
                    <tab.icon size={15} />
                    {tab.label}
                    {tab.count != null && tab.count > 0 && (
                      <span style={{
                        marginLeft: 'auto', background: isActive ? activeColor : '#e2e8f0',
                        color: isActive ? 'white' : COLORS.textMuted,
                        padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                      }}>{tab.count}</span>
                    )}
                  </button>
                );
              })}

              {/* Archive section — Successful / Unsuccessful as own pages */}
              <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginTop: '16px', marginBottom: '2px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>Archive</div>
              {ARCHIVE_ITEMS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                    background: isActive ? '#e8eef6' : 'transparent',
                    color: isActive ? tab.color : '#1f2937',
                    fontWeight: isActive ? '600' : '500', fontSize: '13px',
                  }}>
                    <tab.icon size={15} />
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{
                        marginLeft: 'auto', background: isActive ? tab.color : '#e2e8f0',
                        color: isActive ? 'white' : COLORS.textMuted,
                        padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                      }}>{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Logout */}
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

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              ...(bdmView === 'desktop'
                ? { padding: '24px clamp(16px, 2vw, 32px) 40px' }
                : { maxWidth: '760px', margin: '0 auto', padding: '24px clamp(16px, 2vw, 32px) 40px' }),
              ...(activeTab === 'dashboard' ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}),
            }}>
              {renderTabContent()}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Mobile: Tab bar ── */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 100,
            transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden',
          }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: 'white', gap: '0', padding: '0 2px', overflowX: 'auto' }} className="no-scrollbar">
              {/* Dashboard tab */}
              <button onClick={() => { setActiveTab('dashboard'); colFilters.clearAll(); }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                padding: '11px 8px', border: 'none', background: 'transparent',
                borderBottom: activeTab === 'dashboard' ? `3px solid ${BLUE}` : '3px solid transparent',
                marginBottom: '-1px',
                color: activeTab === 'dashboard' ? BLUE : '#64748b',
                fontSize: '11px', fontWeight: activeTab === 'dashboard' ? '700' : '500',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0,
              }}>
                <BarChart3 size={13} />
              </button>
              {/* New Trial — prominent tab */}
              <button onClick={() => { setActiveTab('new'); colFilters.clearAll(); }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                padding: '9px 10px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderRadius: '8px 8px 0 0', margin: '4px 2px 0',
                background: activeTab === 'new' ? '#f5a623' : '#fff7ed',
                color: activeTab === 'new' ? 'white' : '#f5a623',
                fontSize: '12px', fontWeight: '700', transition: 'all 0.15s', flexShrink: 0,
              }}>
                <Plus size={14} strokeWidth={2.5} />
                New
              </button>
              {NAV_ITEMS.map(tab => {
                const active = activeTab === tab.id;
                const tabColor = tab.color || BLUE;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); }} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    padding: '11px 4px', border: 'none', background: 'transparent',
                    borderBottom: active ? `3px solid ${tabColor}` : '3px solid transparent',
                    marginBottom: '-1px', minWidth: 0,
                    color: active ? tabColor : '#64748b',
                    fontSize: '11px', fontWeight: active ? '700' : '500',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>
                    <tab.icon size={13} />
                    {tab.id === 'pending' ? 'Pending' : tab.id === 'accepted' ? 'Cust Code' : tab.label}
                    {tab.count != null && tab.count > 0 && (
                      <span style={{
                        background: active ? tabColor : '#e2e8f0',
                        color: active ? 'white' : '#64748b',
                        padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: '600',
                      }}>{tab.count}</span>
                    )}
                  </button>
                );
              })}
              {/* Successful & Unsuccessful tabs */}
              {ARCHIVE_ITEMS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); }} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    padding: '11px 4px', border: 'none', background: 'transparent',
                    borderBottom: active ? `3px solid ${tab.color}` : '3px solid transparent',
                    marginBottom: '-1px', minWidth: 0,
                    color: active ? tab.color : '#64748b',
                    fontSize: '11px', fontWeight: active ? '700' : '500',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>
                    <tab.icon size={13} />
                    {tab.id === 'won' ? 'Won' : 'Lost'}
                    {tab.count > 0 && (
                      <span style={{
                        background: active ? tab.color : '#e2e8f0',
                        color: active ? 'white' : '#64748b',
                        padding: '1px 5px', borderRadius: '8px', fontSize: '10px', fontWeight: '600',
                      }}>{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile content */}
          <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
            {renderTabContent()}
          </div>
        </>
      )}

      {/* ── MODALS ── */}
      {readingModal && (
        <LogReadingModal
          venue={readingModal}
          currentUser={currentUser}
          onClose={() => setReadingModal(null)}
          onSave={handleSaveReading}
        />
      )}

      {closeTrialModal && (
        <CloseTrialModal
          venue={closeTrialModal.venue}
          outcome={closeTrialModal.outcome}
          trialReasons={trialReasons}
          onClose={() => setCloseTrialModal(null)}
          onSave={(outcomeData) => handleCloseTrial(closeTrialModal.venue.id, outcomeData)}
        />
      )}

      {endTrialModal && (
        <EndTrialModal
          venue={endTrialModal}
          readings={tpmReadings}
          onClose={() => setEndTrialModal(null)}
          onConfirm={handleEndTrial}
        />
      )}

      {selectedTrialVenue && (
        <TrialDetailModal
          venue={selectedTrialVenue}
          oilTypes={oilTypes}
          competitors={competitors}
          trialReasons={trialReasons}
          readings={tpmReadings}
          VOLUME_BRACKETS={VOLUME_BRACKETS}
          onClose={() => setSelectedTrialVenue(null)}
          onSave={handleSaveTrialEdits}
          onOpenLog={(v, type) => {
            if (type === 'start') {
              if (window.confirm(`Start trial for ${v.name}?`)) handleStartTrial(v.id);
            } else {
              setReadingModal(v);
            }
          }}
          onOpenEnd={(v) => setEndTrialModal(v)}
          onOpenClose={(v, outcome) => setCloseTrialModal({ venue: v, outcome })}
          onSaveCustomerCode={handleSaveCustomerCode}
        />
      )}

      {successMsg && (
        <SuccessToast message={successMsg} onClose={() => setSuccessMsg(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOMER CODE INPUT (inline for won trials)
// ─────────────────────────────────────────────
function CustomerCodeInput({ venueId, onSave }) {
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!code.trim()) return;
    setSaving(true);
    await onSave(venueId, code.trim());
    setSaving(false);
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      background: '#fef3c7', border: '1px solid #fde047', borderRadius: '8px',
      padding: '10px 12px', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <AlertTriangle size={14} color="#a16207" />
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#a16207' }}>Awaiting Customer Code</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input type="text" value={code} onChange={e => setCode(e.target.value)}
          placeholder="Enter customer code"
          style={{ ...inputStyle, fontSize: '13px', flex: 1, padding: '8px 10px' }}
          onFocus={e => e.target.style.borderColor = '#1a428a'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        <button disabled={!code.trim() || saving} onClick={handleSave} style={{
          padding: '8px 14px', background: code.trim() && !saving ? '#1a428a' : '#94a3b8',
          border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
          color: 'white', cursor: code.trim() && !saving ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
        }}>
          {saving ? '...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
