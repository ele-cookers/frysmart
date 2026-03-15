import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { mapVenue, unMapVenue, mapTrial, unMapTrial, mapOilType, mapCompetitor, mapReading, unMapReading, mapTrialReason, mapSystemSettings, mergeTrialIntoVenue, splitTrialFromVenue, TRIAL_FIELDS } from '../lib/mappers';
import {
  TRIAL_STATUS_COLORS, COMPETITOR_TIER_COLORS,
} from '../lib/badgeConfig';
import {
  Plus, X, Check, Clock, AlertTriangle, LogOut,
  ClipboardList, Play, Trophy, Bell,
  XCircle, ChevronDown,
  ArrowUpDown, CheckCircle2,
  ArrowDown, Filter,
  Edit3, Calendar, Save, ChevronRight, BarChart3, RotateCcw, FileText,
  Star, MessageSquare, Target,
  DollarSign, Droplets, Palette, Cog, TrendingUp, TrendingDown, Award, Flame, Activity
} from 'lucide-react';
import { FilterableTh } from '../components/FilterableTh';
import { ColumnToggle } from '../components/ColumnToggle';
import { TrialStatusBadge, OilBadge, StateBadge, VolumePill, CompetitorPill, VOLUME_BRACKETS } from '../components/badges';
import { CustomerCodeInput } from '../components/CustomerCodeInput';
import { TrialDetailModal } from '../components/TrialDetailModal';

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
const FOOD_EMOJIS = {
  'Chips/Fries': '🍟',
  'Crumbed Items': '🍤',
  'Battered Items': '🐟',
  'Plain Proteins': '🥩',
  'Pastries/Donuts': '🥐',
  'High Starch': '🍞',
  'Mixed Service': '🍽️',
};

const inputStyle = {
  width: '100%', maxWidth: '100%', padding: '10px 12px', borderRadius: '8px',
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
    fontSize: '11px', fontWeight: '700', color: '#94a3b8',
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

const MONTHS_SHORT_DISP = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const displayDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_SHORT_DISP[d.getMonth()];
  const yr = String(d.getFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
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

// Badge components imported from ../components/badges

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
const LogReadingModal = ({ venue, currentUser, onClose, onSave, initialDate, initialFryer, existingReadings = [] }) => {
  const fryerCount = venue.fryerCount || 1;
  const fryerNums = Array.from({ length: fryerCount }, (_, i) => i + 1);
  const startIdx = initialFryer ? Math.max(0, fryerNums.indexOf(initialFryer)) : 0;
  const [currentFryerIndex, setCurrentFryerIndex] = useState(startIdx);
  const currentFryerNumber = fryerNums[currentFryerIndex];
  const [date, setDate] = useState(initialDate || getTodayString());
  const [savedReadings, setSavedReadings] = useState([]);

  const makeFryer = (fNum) => {
    const defaultFillType = venue.startingTrial ? 'fresh_fill' : 'top_up';
    const fryerVol = venue.fryerVolumes?.[fNum] ?? venue.fryerVolumes?.[String(fNum)] ?? '';
    const defaultLitres = defaultFillType === 'fresh_fill' ? (fryerVol ? String(fryerVol) : '') : '';
    return {
      fryerNumber: fNum, litresFilled: defaultLitres, tpmValue: '',
      setTemperature: '', actualTemperature: '', foodType: 'Chips/Fries',
      filtered: defaultFillType === 'fresh_fill' ? true : null,
      notes: '', notInUse: false, notInUseReason: '',
      fillType: defaultFillType, // 'fresh_fill' | 'top_up' | 'no_fill'
    };
  };
  const [fryer, setFryerState] = useState(makeFryer(currentFryerNumber));

  useEffect(() => {
    setFryerState(makeFryer(fryerNums[currentFryerIndex]));
  }, [currentFryerIndex]);

  const updateFryer = (field, value) => {
    setFryerState(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'fillType') {
        if (value === 'fresh_fill') {
          next.filtered = true;
          // Auto-populate litres from venue fryer volume if available
          const fryerVol = venue.fryerVolumes?.[prev.fryerNumber] ?? venue.fryerVolumes?.[String(prev.fryerNumber)];
          if (fryerVol) next.litresFilled = String(fryerVol);
        } else {
          next.filtered = null;
        }
      }
      return next;
    });
  };

  const isFreshOil = fryer.fillType === 'fresh_fill';
  const isNoFill = fryer.fillType === 'no_fill';
  const canSave = fryer.notInUse || !!fryer.tpmValue;

  // Calculate running oil age (days since last fresh fill for this fryer)
  const calcOilAge = (fryerNumber) => {
    if (isFreshOil) return 1;
    const lastFresh = existingReadings
      .filter(r => (Number(r.fryerNumber) || 1) === fryerNumber && Number(r.oilAge) === 1 && r.readingDate <= date)
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate))[0];
    if (!lastFresh) return 0;
    const days = Math.round((new Date(date + 'T00:00:00') - new Date(lastFresh.readingDate + 'T00:00:00')) / 86400000);
    return days + 1;
  };

  const inputSt = { width: '100%', maxWidth: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'white', color: '#1f2937' };
  const chevronBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
  const selectSt = { ...inputSt, WebkitAppearance: 'none', appearance: 'none', backgroundImage: chevronBg, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px', cursor: 'pointer' };
  const lbl = { display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '11px', fontWeight: '600' };
  const fld = { marginBottom: '12px' };

  const handleSkip = () => {
    if (currentFryerIndex < fryerNums.length - 1) setCurrentFryerIndex(i => i + 1);
    else onClose();
  };

  const handleSaveAndContinue = (e) => {
    e.preventDefault();
    if (!canSave) return;
    const reading = fryer.notInUse ? {
      venueId: venue.id,
      trialId: venue.trialId || null,
      fryerNumber: fryer.fryerNumber,
      readingDate: date,
      readingNumber: 1,
      takenBy: currentUser?.id || null,
      staffName: currentUser?.name || '',
      oilAge: 0, litresFilled: 0, tpmValue: 0,
      setTemperature: null, actualTemperature: null,
      filtered: null, foodType: null,
      notes: fryer.notInUseReason || 'Not in operation',
      notInUse: true,
    } : {
      venueId: venue.id,
      trialId: venue.trialId || null,
      fryerNumber: fryer.fryerNumber,
      readingDate: date,
      readingNumber: 1,
      takenBy: currentUser?.id || null,
      staffName: currentUser?.name || '',
      oilAge: calcOilAge(fryer.fryerNumber),
      litresFilled: isNoFill ? 0 : (fryer.litresFilled ? parseFloat(fryer.litresFilled) : 0),
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
        width: '100%', maxHeight: '95vh', overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
      }}>
      <div style={{ overflowY: 'auto', maxHeight: '95vh' }}>
        {/* Header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
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

        <form onSubmit={handleSaveAndContinue} style={{ padding: '16px 24px' }}>
          {/* Reading Date */}
          <div style={fld}>
            <label style={lbl}>Reading Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              max={getTodayString()}
              style={inputSt} />
          </div>

          {/* Fryer operation toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px 14px', background: '#f8fafc', borderRadius: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937' }}>Fryer Status</span>
            <button type="button" onClick={() => updateFryer('notInUse', !fryer.notInUse)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '11px', fontWeight: '600',
            }}>
              <span style={{ color: fryer.notInUse ? '#94a3b8' : '#10b981', transition: 'color 0.2s' }}>
                {fryer.notInUse ? 'Not in operation' : 'In operation'}
              </span>
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px',
                background: fryer.notInUse ? '#cbd5e1' : '#10b981',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: 'white', position: 'absolute', top: '2px',
                  left: fryer.notInUse ? '2px' : '18px',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </div>
            </button>
          </div>

          {/* Fill Type — only shown when in operation */}
          {!fryer.notInUse && (
            <div style={fld}>
              <label style={lbl}>Fill Type</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { val: 'fresh_fill', label: 'Fresh Fill', activeColor: '#10b981', activeBg: '#d1fae5', activeText: '#059669' },
                  { val: 'top_up',     label: 'Top Up',     activeColor: '#f59e0b', activeBg: '#fef3c7', activeText: '#d97706' },
                  { val: 'no_fill',    label: 'No Fill',    activeColor: '#94a3b8', activeBg: '#f1f5f9', activeText: '#64748b' },
                ].map(opt => {
                  const isActive = fryer.fillType === opt.val;
                  return (
                    <button key={opt.val} type="button" onClick={() => updateFryer('fillType', opt.val)} style={{
                      flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                      border: isActive ? `1.5px solid ${opt.activeColor}` : '1.5px solid #e2e8f0',
                      background: isActive ? opt.activeBg : 'white',
                      fontSize: '13px', fontWeight: '600',
                      color: isActive ? opt.activeText : '#64748b',
                      transition: 'all 0.15s',
                    }}>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {fryer.notInUse ? (
            <div style={fld}>
              <label style={lbl}>Reason</label>
              <select value={fryer.notInUseReason} onChange={e => updateFryer('notInUseReason', e.target.value)}
                style={selectSt}>
                <option value="">Select reason...</option>
                <option value="Cleaning">Cleaning</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Not needed today">Not needed today</option>
                <option value="Out of order">Out of order</option>
                <option value="Seasonal shutdown">Seasonal shutdown</option>
                <option value="Other">Other</option>
              </select>
              {fryer.notInUseReason === 'Other' && (
                <textarea value={fryer.notes} onChange={e => updateFryer('notes', e.target.value)}
                  rows="1" placeholder="Specify reason..."
                  style={{ ...inputSt, marginTop: '8px', minHeight: '40px', resize: 'none', fontFamily: 'inherit' }} />
              )}
            </div>
          ) : (
          <>
          {/* Litres — hidden for no fill; read-only for fresh fill (auto-populated) */}
          {!isNoFill && (
            <div style={fld}>
              <label style={lbl}>{isFreshOil ? 'Litres (fresh fill)' : 'Litres Topped Up'}</label>
              {isFreshOil ? (
                <div style={{ ...inputSt, background: '#f8fafc', color: '#64748b', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', cursor: 'default' }}>
                  <span style={{ fontWeight: '600', color: '#1f2937' }}>{fryer.litresFilled || '—'}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>L (from fryer volume)</span>
                </div>
              ) : (
                <input type="text" inputMode="decimal" value={fryer.litresFilled}
                  onChange={e => updateFryer('litresFilled', e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0" style={inputSt}
                  onFocus={e => e.target.style.borderColor = '#1a428a'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              )}
            </div>
          )}

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
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
              style={selectSt}
              onFocus={e => e.target.style.borderColor = '#1a428a'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
              {FOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={fld}>
            <label style={lbl}>Notes (optional)</label>
            <textarea value={fryer.notes} onChange={e => updateFryer('notes', e.target.value)}
              placeholder="Add notes..."
              style={{ ...inputSt, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
          </>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {currentFryerIndex > 0 && (
              <button type="button" className="bdm-log-back-btn" onClick={() => setCurrentFryerIndex(i => i - 1)} style={{
                flex: 1, padding: '10px 12px', background: 'white', border: '1.5px solid #e2e8f0',
                borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748b', cursor: 'pointer', transition: 'all 0.15s' }}>
                ← Back
              </button>
            )}
            <button type="submit" disabled={!canSave} className={canSave ? 'bdm-log-save-btn' : ''} style={{
              flex: 1, padding: '10px 12px', background: canSave ? '#1a428a' : '#9ca3af', border: 'none',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: 'white',
              cursor: canSave ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
              {currentFryerIndex < fryerNums.length - 1 ? 'Save & Next' : 'Save'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// CLOSE TRIAL MODAL (Won / Lost)
// ─────────────────────────────────────────────
const CloseTrialModal = ({ venue, outcome, trialReasons, onClose, onSave }) => {
  const isWon = outcome === 'successful';
  const reasons = trialReasons.filter(r => r.type === (isWon ? 'successful' : 'unsuccessful'));
  const [form, setForm] = useState({ reason: '', outcomeDate: getTodayString(), soldPrice: '', notes: '' });
  const canSubmit = form.reason && form.outcomeDate && (isWon ? form.soldPrice : true);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderLeft: `4px solid ${isWon ? '#10b981' : '#ef4444'}`, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{isWon ? 'Mark as Successful' : 'Mark as Unsuccessful'}</div>
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
              trialStatus: outcome === 'successful' ? 'accepted' : outcome,
              trialReason: form.reason,
              outcomeDate: form.outcomeDate,
              trialNotes: [venue.trialNotes, form.notes ? `[${outcome === 'successful' ? 'Successful' : 'Unsuccessful'} ${form.outcomeDate}] ${form.notes}` : ''].filter(Boolean).join('\n'),
              ...(isWon ? { soldPricePerLitre: parseFloat(form.soldPrice) } : {}),
            })} style={{ flex: 1, padding: '10px', background: canSubmit ? (isWon ? '#10b981' : '#ef4444') : '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {isWon ? 'Mark as Successful' : 'Mark as Unsuccessful'}
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
const EndTrialModal = ({ venue, readings, oilTypes, competitors, onClose, onConfirm }) => {
  const venueReadings = readings.filter(r => r.venueId === venue.id && r.readingDate >= (venue.trialStartDate || ''));
  const freshFills = venueReadings.filter(r => r.oilAge === 1 && r.litresFilled > 0);
  const freshLitres = freshFills.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
  const topUps = venueReadings.filter(r => r.oilAge > 1 && r.litresFilled > 0);
  const topUpLitres = topUps.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
  const systemTotal = freshLitres + topUpLitres;
  const startDate = venue.trialStartDate ? new Date(venue.trialStartDate + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysElapsed = startDate ? Math.max(1, Math.floor((today - startDate) / 86400000)) : 0;
  const litresPerWeek = daysElapsed > 0 ? Math.round((systemTotal / daysElapsed) * 7 * 10) / 10 : 0;
  const offeredPrice = parseFloat(venue.offeredPricePerLitre) || 0;
  const currentPrice = parseFloat(venue.currentPricePerLitre) || 0;
  const spendPerWeek = litresPerWeek * offeredPrice;
  const preTrialAvg = parseFloat(venue.currentWeeklyAvg) || 0;
  const litresSaved = preTrialAvg > 0 ? Math.round((preTrialAvg - litresPerWeek) * 10) / 10 : null;
  const dollarsSaved = litresSaved !== null && currentPrice > 0 ? Math.round((preTrialAvg * currentPrice - litresPerWeek * offeredPrice) * 100) / 100 : null;
  const totalNum = systemTotal;

  // Pre-trial oil lifespan — parse [FryerChanges: X] from trialNotes
  const fryerChangesLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[FryerChanges:')) || '';
  const preTrialLifespan = fryerChangesLine ? parseInt(fryerChangesLine.replace(/^\[FryerChanges:\s*/, '').replace(/\]$/, '')) || null : null;

  // Trial findings text (new field)
  const [trialFindings, setTrialFindings] = useState('');

  // Trial goals — parse from trialNotes
  const GOAL_OPTIONS = [
    { key: 'save-money',     label: 'Save money',          icon: DollarSign },
    { key: 'reduce-waste',   label: 'Reduce oil waste',    icon: Droplets   },
    { key: 'food-quality',   label: 'Better food quality', icon: Award      },
    { key: 'food-colour',    label: 'Improve food colour', icon: Palette    },
    { key: 'reduce-changes', label: 'Fewer fryer changes', icon: Cog        },
    { key: 'extend-life',    label: 'Extend oil life',     icon: TrendingUp },
  ];
  const goalsLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[Goals:')) || '';
  const trialGoals = goalsLine ? goalsLine.replace(/^\[Goals:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : [];
  const [achievedGoals, setAchievedGoals] = useState(trialGoals); // default: all ticked

  const toggleGoal = (key) => {
    setAchievedGoals(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Mini trial calendar — show up to yesterday (trial hasn't ended yet, so today is day N+1)
  const modalCalDays = (() => {
    if (!venue.trialStartDate) return [];
    const start = new Date(venue.trialStartDate + 'T00:00:00');
    const end = new Date(); end.setHours(0, 0, 0, 0); // today midnight
    const days = []; const d = new Date(start);
    while (d < end) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  })();

  // Oil lifespan per fryer: days between consecutive fresh fills
  // Oil lifespan: fill-to-fill intervals + current run (last fill → today, the actual trial end)
  const oilLifespans = (() => {
    const spans = [];
    const fc = Math.max(1, venue.fryerCount || 1);
    const trialEnd = new Date(); trialEnd.setHours(0, 0, 0, 0); // today = actual end being confirmed
    for (let fn = 1; fn <= fc; fn++) {
      const fills = venueReadings
        .filter(r => (r.fryerNumber || 1) === fn && Number(r.oilAge) === 1)
        .sort((a, b) => a.readingDate.localeCompare(b.readingDate));
      for (let i = 0; i < fills.length - 1; i++) {
        const d1 = new Date(fills[i].readingDate + 'T00:00:00');
        const d2 = new Date(fills[i + 1].readingDate + 'T00:00:00');
        const days = Math.round((d2 - d1) / 86400000);
        if (days > 0) spans.push(days);
      }
      // Include current run: last fill → today (trial ending now, so this is a real completed interval)
      if (fills.length > 0) {
        const lastFresh = new Date(fills[fills.length - 1].readingDate + 'T00:00:00');
        const days = Math.round((trialEnd - lastFresh) / 86400000);
        if (days > 0) spans.push(days);
      }
    }
    return spans;
  })();
  const lifespanMin = oilLifespans.length > 0 ? Math.min(...oilLifespans) : null;
  const lifespanMax = oilLifespans.length > 0 ? Math.max(...oilLifespans) : null;
  const lifespanAvg = oilLifespans.length > 0 ? Math.round(oilLifespans.reduce((a, b) => a + b, 0) / oilLifespans.length) : null;

  // Trial oil badge
  const trialOilObj = oilTypes?.find(o => o.id === venue.trialOilId) || null;
  const modalReadingsByDate = {};
  venueReadings.forEach(r => {
    if (!modalReadingsByDate[r.readingDate]) modalReadingsByDate[r.readingDate] = [];
    modalReadingsByDate[r.readingDate].push(r);
  });
  const modalFryerList = Array.from({ length: Math.max(1, venue.fryerCount || 1) }, (_, i) => i + 1);
  const cellBg = tpm => tpm <= 14 ? '#d1fae5' : tpm <= 18 ? '#fef3c7' : '#fee2e2';
  const cellCol = tpm => tpm <= 14 ? '#059669' : tpm <= 18 ? '#d97706' : '#dc2626';

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderLeft: '4px solid #f59e0b', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>End Trial</div>
              {trialOilObj && <OilBadge oil={trialOilObj} competitors={competitors || []} compact />}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{venue.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
        </div>
        <div style={{ padding: '12px 20px 12px 14px', overflowY: 'auto', flex: 1 }}>
          {/* Start / End / Duration — evenly distributed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {[
              { label: 'Start', value: displayDate(venue.trialStartDate) },
              { label: 'End', value: displayDate(getTodayString()) },
              { label: 'Duration', value: daysElapsed > 0 ? `${daysElapsed} days` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Oil usage + Oil lifespan — side by side */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {/* Oil usage table */}
            <div style={{ flex: 1, borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: '50%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /></colgroup>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Oil Usage</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Count</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Litres</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Fresh fills</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{freshFills.length}</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{Math.round(freshLitres)}L</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Top-ups</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{topUps.length}</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{Math.round(topUpLitres)}L</td>
                  </tr>
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Total</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', textAlign: 'center' }}></td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937', textAlign: 'center' }}>{Math.round(systemTotal)}L</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Trial oil lifespan table */}
            <div style={{ flex: 1, borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: '50%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /></colgroup>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Oil Lifespan</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>Days</th>
                    <th style={{ padding: '7px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #e2e8f0' }}>+/−</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const lifespanDelta = (val) => {
                      if (val === null || preTrialLifespan === null) return null;
                      return val - preTrialLifespan;
                    };
                    const deltaCell = (delta, bold) => {
                      if (delta === null) return <td style={{ padding: '6px 10px', fontSize: '11px', textAlign: 'center', color: '#94a3b8' }}>—</td>;
                      const pos = delta >= 0;
                      return <td style={{ padding: '6px 10px', fontSize: bold ? '12px' : '11px', fontWeight: bold ? '700' : '500', textAlign: 'center', color: pos ? '#059669' : '#dc2626', borderBottom: bold ? 'none' : '1px solid #f1f5f9' }}>{pos ? '+' : ''}{delta}d</td>;
                    };
                    return (<>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Min</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{lifespanMin !== null ? `${lifespanMin}d` : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    {deltaCell(lifespanDelta(lifespanMin), false)}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', borderBottom: '1px solid #f1f5f9' }}>Max</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{lifespanMax !== null ? `${lifespanMax}d` : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    {deltaCell(lifespanDelta(lifespanMax), false)}
                  </tr>
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Avg</td>
                    <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: '700', color: '#1f2937', textAlign: 'center' }}>{lifespanAvg !== null ? `${lifespanAvg}d` : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                    {deltaCell(lifespanDelta(lifespanAvg), true)}
                  </tr>
                    </>);
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trial calendar */}
          {modalCalDays.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ paddingBottom: '16px' }}>
                <table style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '2px', minWidth: `${60 + modalCalDays.length * 30}px` }}>
                  <colgroup>
                    <col style={{ width: '60px' }} />
                    {modalCalDays.map((_, i) => <col key={i} style={{ width: '28px' }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      {modalCalDays.map((_, idx) => (
                        <th key={idx} style={{ textAlign: 'center', fontSize: '8px', fontWeight: '700', color: '#94a3b8', padding: '2px 1px' }}>{idx + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modalFryerList.map(fn => (
                      <tr key={fn}>
                        <td style={{ fontSize: '10px', fontWeight: '700', color: '#1a428a', paddingRight: '4px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          {(venue.fryerCount || 1) > 1 ? `Fryer ${fn}` : 'TPM'}
                        </td>
                        {modalCalDays.map((day, idx) => {
                          const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
                          const dayRecs = (modalReadingsByDate[dateStr] || []).filter(r => (r.fryerNumber || 1) === fn);
                          const r = dayRecs[dayRecs.length - 1] || null;
                          const isFresh = r?.oilAge === 1;
                          const isTopUp = r && r.litresFilled > 0 && !isFresh;
                          const border = isFresh ? '2px solid #10b981' : isTopUp ? '2px solid #f59e0b' : '1px solid #e2e8f0';
                          return (
                            <td key={idx} style={{
                              height: '32px', width: '28px',
                              background: r?.tpmValue != null ? cellBg(r.tpmValue) : 'white',
                              border, borderRadius: '4px',
                              textAlign: 'center', verticalAlign: 'middle',
                            }}>
                              {r?.tpmValue != null ? (
                                <span style={{ fontSize: '10px', fontWeight: '800', color: cellCol(r.tpmValue) }}>{r.tpmValue}</span>
                              ) : r ? null : (
                                <span style={{ fontSize: '7px', color: '#e2e8f0' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              {/* Calendar legend */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                {[
                  { bg: '#d1fae5', color: '#059669', label: '≤14' },
                  { bg: '#fef3c7', color: '#d97706', label: '15–18' },
                  { bg: '#fee2e2', color: '#dc2626', label: '>18' },
                  { border: '2px solid #10b981', label: 'Fresh fill' },
                  { border: '2px solid #f59e0b', label: 'Top-up' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: l.bg || 'white', border: l.border || `1px solid ${l.color}44` }} />
                    <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '500' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trial Goals Achieved */}
          {trialGoals.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Trial Goals Achieved</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {GOAL_OPTIONS.filter(g => trialGoals.includes(g.key)).map((goal) => {
                  const GoalIcon = goal.icon;
                  const achieved = achievedGoals.includes(goal.key);
                  return (
                    <div key={goal.key} onClick={() => toggleGoal(goal.key)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px',
                      cursor: 'pointer', borderRadius: '8px',
                      background: achieved ? '#dbeafe' : '#f8fafc',
                      border: `1px solid ${achieved ? '#93c5fd' : '#e2e8f0'}`,
                      transition: 'all 0.1s',
                    }}>
                      <GoalIcon size={13} color={achieved ? '#1a428a' : '#94a3b8'} />
                      <span style={{ flex: 1, fontSize: '11px', fontWeight: '600', color: achieved ? '#1e3a5f' : '#64748b', lineHeight: '1.2' }}>{goal.label}</span>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${achieved ? '#f59e0b' : '#d1d5db'}`,
                        background: achieved ? '#f59e0b' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.1s',
                      }}>
                        {achieved && <Check size={9} color="white" strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trial Findings */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>Trial Findings</label>
            <textarea
              value={trialFindings}
              onChange={e => setTrialFindings(e.target.value)}
              placeholder="What happened? Key observations, outcomes, things that stood out, customer feedback, oil performance notes…"
              rows={3}
              style={{ width: '100%', padding: '9px 10px', fontSize: '12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', resize: 'vertical', fontFamily: 'inherit', color: '#1f2937', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onConfirm(venue.id, totalNum, achievedGoals, trialFindings, null)} style={{ flex: 1, padding: '10px', background: '#f59e0b', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
              Confirm End Trial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// TrialDetailModal imported from ../components/TrialDetailModal
// ─────────────────────────────────────────────
// COMPARISON VIEW (for successful/unsuccessful/pending outcome trials)
// ─────────────────────────────────────────────
// FILTERABLE TABLE HEADER (ported from admin panel)
// ─────────────────────────────────────────────
// FilterableTh imported from ../components/FilterableTh

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
  const [activeTab, setActiveTab] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'dashboard' : 'actions'
  );
  // archiveSubTab removed — Successful/Unsuccessful are now separate top-level tabs
  // bdmView removed — responsive design uses isDesktop (window.innerWidth >= 768)
  const [sortNewest, setSortNewest] = useState(false); // false = A-Z, true = most recent
  const colFilters = useColumnFilters();
  const [readingModal, setReadingModal] = useState(null);
  const [closeTrialModal, setCloseTrialModal] = useState(null);
  const [endTrialModal, setEndTrialModal] = useState(null); // venue object when end trial modal is open
  const [selectedTrialVenue, setSelectedTrialVenue] = useState(null); // venue for detail modal
  const [successMsg, setSuccessMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dashStatusFilter, setDashStatusFilter] = useState([]); // Dashboard status filter
  const [manageVenueId, setManageVenueId] = useState(null); // Manage Trial screen
  const [manageSubTab, setManageSubTab] = useState('details'); // Sub-tab within manage trial
  const [calFryerTab, setCalFryerTab] = useState(1); // Fryer tab within calendar sub-tab
  const [manageNoteText, setManageNoteText] = useState(''); // Notes textarea in Notes tab
  const [manageNoteSaving, setManageNoteSaving] = useState(false);
  const [summaryCustCode, setSummaryCustCode] = useState(''); // inline cust code input in summary report
  const [summaryEditMode, setSummaryEditMode] = useState(false); // edit mode for trial findings in summary
  const [summaryFindingsText, setSummaryFindingsText] = useState(''); // editable findings text
  const [summaryOutcomeEditMode, setSummaryOutcomeEditMode] = useState(false); // edit mode for outcome notes
  const [summaryOutcomeText, setSummaryOutcomeText] = useState(''); // editable outcome notes text
  const [manageStatusFilter, setManageStatusFilter] = useState([]); // Manage screen status filter pills
  const [manageSearchQuery, setManageSearchQuery] = useState(''); // Manage screen keyword search
  const [decisionModal, setDecisionModal] = useState(null); // venue object for won/lost decision popup
  const [custCodeModal, setCustCodeModal] = useState(null); // venue object for cust code popup
  const [rowActionVenue, setRowActionVenue] = useState(null); // { venue, tabType } for pipeline row-click popup
  const [showTrialTableModal, setShowTrialTableModal] = useState(false); // mobile: trial results table full-screen modal
  // ── Column toggle state ──
  const BDM_TRIAL_COLS = [
    { key: 'name', label: 'Venue Name', locked: true },
    { key: 'volume', label: 'Vol Bracket' },
    { key: 'competitor', label: 'Competitor' },
    { key: 'compOil', label: 'Current Oil' },
    { key: 'trialOil', label: 'Trial Oil' },
    { key: 'currentPrice', label: 'Current $/L' },
    { key: 'offeredPrice', label: 'Offered $/L' },
    { key: 'soldPrice', label: 'Sold $/L' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'today', label: 'Today' },
    { key: 'days', label: 'Days' },
    { key: 'closedDate', label: 'Closed' },
    { key: 'reason', label: 'Reason' },
    { key: 'customerCode', label: 'Cust Code' },
    { key: 'status', label: 'Status' },
  ];
  const MANAGE_TRIAL_COLS = [
    { key: 'name', label: 'Venue Name', locked: true },
    { key: 'volume', label: 'Vol Bracket' },
    { key: 'competitor', label: 'Current Supplier' },
    { key: 'compOil', label: 'Current Oil' },
    { key: 'trialOil', label: 'Trial Oil' },
    { key: 'currentPrice', label: 'Current $/L' },
    { key: 'offeredPrice', label: 'Offered $/L' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'status', label: 'Status' },
  ];
  const [trialVisibleCols, setTrialVisibleCols] = useState(() => BDM_TRIAL_COLS.map(c => c.key));
  const [manageVisibleCols, setManageVisibleCols] = useState(() => MANAGE_TRIAL_COLS.map(c => c.key));

  const [manageEditing, setManageEditing] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageEditForm, setManageEditForm] = useState({});

  // ── New Trial form state ──
  const [trialType, setTrialType] = useState('new'); // 'existing' | 'new'
  const [newTrialForm, setNewTrialForm] = useState({
    customerCode: '', venueName: '',
    competitor: '',
    trialOilId: '', fryerCount: 1, fryerVolumes: {}, defaultOil: '', currentPrice: '', offeredPrice: '',
    avgLitresPerWeek: '', fryerChangesPerWeek: '', notes: '', trialGoals: [], estStartDate: '', estEndDate: '', endDateManual: false,
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

  const todayStr = getTodayString();

  // Reset manage sub-tab and init notes text when venue changes
  useEffect(() => {
    if (manageVenueId) {
      setManageSubTab('details');
      setCalFryerTab(1);
      setManageEditing(false);
      setManageEditForm({});
      const v = venues.find(x => x.id === manageVenueId);
      setManageNoteText(v?.trialNotes || '');
    }
  }, [manageVenueId]); // eslint-disable-line

  // Reset manage trial venue when switching away from the manage tab
  useEffect(() => {
    if (activeTab !== 'manage') setManageVenueId(null);
  }, [activeTab]); // eslint-disable-line

  // ── Data loading ──
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load venues + trials in parallel, then merge
        const [{ data: venueData }, { data: trialData }] = await Promise.all([
          supabase.from('venues').select('*').eq('status', 'trial-only'),
          supabase.from('trials').select('*'),
        ]);
        const mappedVenues = (venueData || []).map(mapVenue);
        const mappedTrials = (trialData || []).map(mapTrial);
        const merged = mappedVenues.map(v => {
          const trial = mappedTrials.find(t => t.venueId === v.id);
          return mergeTrialIntoVenue(v, trial);
        });
        setVenues(merged);

        const { data: oilData } = await supabase.from('oil_types').select('*');
        setOilTypes((oilData || []).map(mapOilType));

        const { data: compData } = await supabase.from('competitors').select('*');
        setCompetitors((compData || []).map(mapCompetitor));

        const { data: reasonData } = await supabase.from('trial_reasons').select('*');
        setTrialReasons((reasonData || []).map(mapTrialReason));

        const { data: settingsData } = await supabase.from('system_settings').select('*').single();
        if (settingsData) setSystemSettings(mapSystemSettings(settingsData));

        if (merged.length > 0) {
          const venueIds = merged.map(v => v.id);
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
      const [{ data: venueData }, { data: trialData }] = await Promise.all([
        supabase.from('venues').select('*').eq('status', 'trial-only'),
        supabase.from('trials').select('*'),
      ]);
      const mappedVenues = (venueData || []).map(mapVenue);
      const mappedTrials = (trialData || []).map(mapTrial);
      const merged = mappedVenues.map(v => {
        const trial = mappedTrials.find(t => t.venueId === v.id);
        return mergeTrialIntoVenue(v, trial);
      });
      setVenues(merged);

      if (merged.length > 0) {
        const venueIds = merged.map(v => v.id);
        const { data: readingData } = await supabase.from('tpm_readings').select('*').in('venue_id', venueIds);
        setTpmReadings((readingData || []).map(mapReading));
      }
    } catch (err) {
      console.error('Refresh error:', err);
    }
  };

  // ── Derived venue lists ──
  const myVenues = useMemo(() => venues.filter(v => v.bdmId === currentUser.id), [venues, currentUser.id]);
  const activeTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'active'), [myVenues]);
  const pipelineTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'pipeline'), [myVenues]);
  // Pending outcome = trial ended but no won/lost decision yet
  const pendingOutcomeTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'pending'), [myVenues]);
  // Accepted: marked as won but awaiting customer code
  const acceptedTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'accepted'), [myVenues]);
  // Archive: won and lost
  const wonTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'successful'), [myVenues]);
  const lostTrials = useMemo(() => myVenues.filter(v => v.trialStatus === 'unsuccessful'), [myVenues]);
  // archiveCount removed — tabs are separate now
  const awaitingRecordingToday = useMemo(() => activeTrials.filter(v => !tpmReadings.some(r => r.venueId === v.id && r.readingDate === todayStr)), [activeTrials, tpmReadings, todayStr]);

  // ── Column filter accessors (for table filtering — mirrors admin panel) ──
  const colAccessors = {
    name: v => v.name || '',
    city: v => { const m = v.trialNotes?.match(/^TRL-\d+\s*\|\s*([^\n]*)/); return m ? m[1].trim() : ''; },
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
    customerCode: v => v.customerCode || '',
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
    if (trialType === 'new' && !newTrialForm.competitor) return false;
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
    // Optimistic UI update (merged object)
    setVenues(prev => prev.map(v => v.id === venueId ? { ...v, ...updates } : v));
    try {
      const venue = venues.find(v => v.id === venueId);

      // Split updates: venue fields vs trial fields
      const venueUpdates = {};
      const trialUpdates = {};
      for (const [key, val] of Object.entries(updates)) {
        if (TRIAL_FIELDS.includes(key)) {
          trialUpdates[key] = val;
        } else {
          venueUpdates[key] = val;
        }
      }

      // Update venues table if venue fields changed
      if (Object.keys(venueUpdates).length > 0) {
        const dbVenue = unMapVenue({ ...venue, ...venueUpdates });
        await supabase.from('venues').update(dbVenue).eq('id', venueId);
      }

      // Update trials table if trial fields changed
      if (Object.keys(trialUpdates).length > 0 && venue?.trialId) {
        const currentTrial = splitTrialFromVenue(venue);
        const dbTrial = unMapTrial({ ...currentTrial, ...trialUpdates });
        await supabase.from('trials').update(dbTrial).eq('id', venue.trialId);
      }
    } catch (err) {
      console.error('Update venue error:', err);
    }
    setSaving(false);
  };

  const handleStartTrial = async (venueId) => {
    // Open recording form first — trial status changes after saving the first reading
    const venue = venues.find(v => v.id === venueId);
    if (venue) {
      setReadingModal({ ...venue, startingTrial: true, trialStartDate: venue.trialStartDate || getTodayString() });
    }
  };

  const handleEndTrial = (venueId, _totalLitres, achievedGoalsList = [], trialFindingsText = '', trialOutcomeKey = null) => {
    const v = venues.find(x => x.id === venueId);
    // Preserve existing trialNotes, replacing or appending metadata lines
    const existingNotes = v?.trialNotes || '';
    const lines = existingNotes.split('\n')
      .filter(l => !l.trim().startsWith('[GoalsAchieved:'))
      .filter(l => !l.trim().startsWith('[TrialFindings:'))
      .filter(l => !l.trim().startsWith('[TrialOutcome:'));
    if (achievedGoalsList.length > 0) {
      lines.push(`[GoalsAchieved: ${achievedGoalsList.join(', ')}]`);
    }
    if (trialFindingsText.trim()) {
      lines.push(`[TrialFindings: ${trialFindingsText.trim()}]`);
    }
    if (trialOutcomeKey) {
      lines.push(`[TrialOutcome: ${trialOutcomeKey}]`);
    }
    const newTrialNotes = lines.filter(Boolean).join('\n');
    // Close immediately (optimistic), fire update in background
    setEndTrialModal(null);
    setSuccessMsg('Trial Ended');
    updateVenue(venueId, { trialStatus: 'pending', trialEndDate: getTodayString(), trialNotes: newTrialNotes });
  };

  const handleCloseTrial = (venueId, outcomeData) => {
    setCloseTrialModal(null);
    setSuccessMsg(outcomeData.trialStatus === 'accepted' ? 'Marked as Accepted — needs cust code' : 'Marked as Unsuccessful');
    updateVenue(venueId, outcomeData);
  };

  const handleSaveTrialEdits = async (venueId, updates) => {
    await updateVenue(venueId, updates);
    // Update the selectedTrialVenue with the new data so the modal reflects changes
    setSelectedTrialVenue(prev => prev && prev.id === venueId ? { ...prev, ...updates } : prev);
    setSuccessMsg('Changes Saved');
  };

  const handleAddTrialComment = async (venueId, text) => {
    const v = venues.find(x => x.id === venueId);
    const today = getTodayString();
    const newLine = `[Note ${today}] ${text}`;
    const updatedNotes = v?.trialNotes ? `${v.trialNotes}\n${newLine}` : newLine;
    await updateVenue(venueId, { trialNotes: updatedNotes });
    setSelectedTrialVenue(prev => prev && prev.id === venueId ? { ...prev, trialNotes: updatedNotes } : prev);
    setSuccessMsg('Comment saved');
  };

  const handleSaveCustomerCode = async (venueId, code) => {
    await updateVenue(venueId, { customerCode: code, customerCodeSavedAt: new Date().toISOString(), trialStatus: 'successful' });
    setSuccessMsg('Customer Code Saved — Successful');
  };

  const handlePushBack = (venueId, targetStatus) => {
    const labels = { 'pipeline': 'Pipeline', 'active': 'Active', 'pending': 'Pending' };
    const clearFields = targetStatus === 'pending'
      ? { trialStatus: targetStatus, outcomeDate: null, trialReason: null, soldPricePerLitre: null, customerCode: null }
      : targetStatus === 'active'
      ? { trialStatus: targetStatus, trialEndDate: null, outcomeDate: null, trialReason: null, soldPricePerLitre: null, customerCode: null }
      : { trialStatus: targetStatus };
    setSelectedTrialVenue(null);
    setSuccessMsg(`Moved back to ${labels[targetStatus] || targetStatus}`);
    updateVenue(venueId, clearFields);
  };

  // ── Save reading ──
  const handleSaveReading = async (readings) => {
    const wasStartingTrial = readingModal?.startingTrial;
    const startVenueId = readingModal?.id;
    const localReadings = readings.map((r, idx) => ({ ...r, id: `temp-${Date.now()}-${idx}` }));
    setTpmReadings(prev => [...prev, ...localReadings]);
    setReadingModal(null);

    // Immediate feedback — optimistic venue update fires in background (no await)
    if (wasStartingTrial && startVenueId) {
      updateVenue(startVenueId, { trialStatus: 'active', trialStartDate: getTodayString() });
      setSuccessMsg('Trial Started');
      setActiveTab('active');
    }

    try {
      const inserts = readings.map(r => unMapReading(r));
      const { error: upsertErr } = await supabase.from('tpm_readings').upsert(inserts, { onConflict: 'venue_id,fryer_number,reading_date,reading_number' });
      if (upsertErr) {
        // Revert optimistic update and show visible error (no dev tools needed)
        setTpmReadings(prev => prev.filter(r => !String(r.id).startsWith('temp-')));
        setSuccessMsg(`Save failed: ${upsertErr.message}`);
      } else {
        if (!wasStartingTrial) setSuccessMsg('Reading Saved');
        const venueId = readings[0]?.venueId;
        const readingDate = readings[0]?.readingDate;
        if (venueId && readingDate) {
          await supabase.from('venues').update({ last_tpm_date: readingDate }).eq('id', venueId);
          setVenues(prev => prev.map(v => v.id === venueId ? { ...v, lastTpmDate: readingDate } : v));
        }
        // Full refresh first (updates venues/trials), then targeted re-fetch runs last
        // so the new reading is guaranteed to be the final tpmReadings value
        await refreshData();
        if (venueId) {
          const { data: freshReadings } = await supabase.from('tpm_readings').select('*').eq('venue_id', venueId);
          if (freshReadings) {
            setTpmReadings(prev => [
              ...prev.filter(r => r.venueId !== venueId && !String(r.id).startsWith('temp-')),
              ...freshReadings.map(mapReading),
            ]);
          }
        }
      }
    } catch (err) {
      setSuccessMsg(`Save error: ${err.message}`);
      console.error('Save reading error:', err);
    }
  };

  // ── Create new trial ──
  const handleCreateTrial = async (e) => {
    e.preventDefault();
    // All fields required
    if (!newTrialForm.venueName.trim()) return;
    if (!newTrialForm.trialOilId || !newTrialForm.defaultOil) return;
    if (!newTrialForm.currentPrice || !newTrialForm.offeredPrice) return;
    if (!newTrialForm.avgLitresPerWeek) return;
    if (trialType === 'existing' && !newTrialForm.customerCode.trim()) return;

    setSaving(true);
    try {
      // Generate codes
      const trialId = nextTrialId;
      const custCode = trialType === 'existing' ? newTrialForm.customerCode.trim() : nextProspectCode;

      // 1. Insert venue (venue-only fields)
      const newVenue = {
        name: newTrialForm.venueName.trim(),
        status: 'trial-only',
        customerCode: custCode,
        state: currentUser.region || '',
        fryerCount: parseInt(newTrialForm.fryerCount) || 1,
        fryerVolumes: newTrialForm.fryerVolumes,
        defaultOil: newTrialForm.defaultOil || null,
        bdmId: currentUser.id,
        volumeBracket: calcVolumeBracket(newTrialForm.avgLitresPerWeek),
      };
      const dbVenue = unMapVenue(newVenue);
      const { data: venueRow, error: venueErr } = await supabase.from('venues').insert(dbVenue).select().single();
      if (venueErr) throw venueErr;

      // 2. Insert trial linked to that venue
      const goalsLine = newTrialForm.trialGoals.length > 0 ? `[Goals: ${newTrialForm.trialGoals.join(', ')}]` : '';
      const fryerChangesLine = newTrialForm.fryerChangesPerWeek ? `[FryerChanges: ${newTrialForm.fryerChangesPerWeek}]` : '';
      const newTrialObj = {
        venueId: venueRow.id,
        trialStatus: 'pipeline',
        trialOilId: newTrialForm.trialOilId,
        trialNotes: [trialId, goalsLine, fryerChangesLine, newTrialForm.notes].filter(Boolean).join('\n'),
        currentPricePerLitre: parseFloat(newTrialForm.currentPrice),
        offeredPricePerLitre: parseFloat(newTrialForm.offeredPrice),
        currentWeeklyAvg: parseFloat(newTrialForm.avgLitresPerWeek),
        trialStartDate: newTrialForm.estStartDate || null,
        trialEndDate: newTrialForm.estEndDate || null,
      };
      const dbTrial = unMapTrial(newTrialObj);
      const { data: trialRow, error: trialErr } = await supabase.from('trials').insert(dbTrial).select().single();
      if (trialErr) throw trialErr;

      // 3. Merge for local state
      const mappedVenue = mapVenue(venueRow);
      const mappedTrial = trialRow ? mapTrial(trialRow) : null;
      const merged = mergeTrialIntoVenue(mappedVenue, mappedTrial);
      setVenues(prev => [...prev, merged]);

      setNewTrialForm({
        customerCode: '', venueName: '',
        competitor: '',
        trialOilId: '', fryerCount: 1, fryerVolumes: {}, defaultOil: '', currentPrice: '', offeredPrice: '',
        avgLitresPerWeek: '', notes: '', trialGoals: [], estStartDate: '', estEndDate: '', endDateManual: false,
      });
      setTrialType('new');
      setSuccessMsg(`Trial Created — ${trialId}`);
      setActiveTab('pipeline');
    } catch (err) {
      console.error('Create trial error:', err);
      alert('Failed to create trial: ' + (err.message || 'Unknown error'));
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

  // Oil comparison row — matches trial detail modal format
  const cardOilRow = (venue) => {
    const compOil = oilTypes.find(o => o.id === venue.defaultOil);
    const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
    const comp = compOil?.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {comp && <CompetitorPill comp={comp} />}
        <OilBadge oil={compOil} competitors={competitors} compact />
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>vs</span>
        <OilBadge oil={cookersOil} competitors={competitors} compact />
      </div>
    );
  };

  const pricingRow = (venue, showSold) => {
    if (!venue.currentPricePerLitre && !venue.offeredPricePerLitre) return null;
    return (
      <div style={{ display: 'flex', gap: '14px', fontSize: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {venue.currentPricePerLitre && <div><span style={{ color: COLORS.textMuted }}>Comp: </span><span style={{ fontWeight: '600' }}>${parseFloat(venue.currentPricePerLitre).toFixed(2)}/L</span></div>}
        {venue.offeredPricePerLitre && <div><span style={{ color: COLORS.textMuted }}>Offer: </span><span style={{ fontWeight: '600', color: BLUE }}>${parseFloat(venue.offeredPricePerLitre).toFixed(2)}/L</span></div>}
        {showSold && venue.soldPricePerLitre && <div><span style={{ color: COLORS.textMuted }}>Sold: </span><span style={{ fontWeight: '600', color: '#059669' }}>${parseFloat(venue.soldPricePerLitre).toFixed(2)}/L</span></div>}
      </div>
    );
  };

  // Date info row — inline flex instead of grid
  const dateRow = (items) => (
    <div style={{ display: 'flex', gap: '14px', fontSize: '11px', marginBottom: '10px', flexWrap: 'wrap' }}>
      {items.map(([label, value]) => (
        <div key={label}><span style={{ color: COLORS.textMuted, fontWeight: '600' }}>{label}: </span><span style={{ fontWeight: '600', color: COLORS.text }}>{value}</span></div>
      ))}
    </div>
  );

  // Card header — name + volume pill + status badge
  const cardHeader = (venue, statusOverride) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue.name}</div>
        {venue.volumeBracket && <VolumePill bracket={venue.volumeBracket} />}
      </div>
      {statusOverride || <TrialStatusBadge status={venue.trialStatus} />}
    </div>
  );

  // Action button styles
  const btnPrimary = (bg = BLUE) => ({
    flex: 1, padding: '8px 12px', background: bg, border: 'none', borderRadius: '20px',
    fontSize: '12px', fontWeight: '600', color: 'white', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  });
  const btnSecondary = () => ({
    flex: 1, padding: '8px 12px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '20px',
    fontSize: '12px', fontWeight: '600', color: '#94a3b8', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  });

  // Card base style
  const cardBase = (accent) => ({ ...S.card, borderLeft: `4px solid ${accent}`, marginBottom: '10px', cursor: 'pointer' });

  // -- ACTIVE TRIAL CARD --
  const renderActiveCard = (venue) => {
    const daysIn = venue.trialStartDate ? daysBetween(venue.trialStartDate, getTodayString()) : null;
    const venueReadings = tpmReadings.filter(r => r.venueId === venue.id);
    const totalLitres = venueReadings.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);

    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={cardBase(TRIAL_STATUS_COLORS['active'].accent)}>
        {cardHeader(venue)}
        {cardOilRow(venue)}
        {pricingRow(venue)}
        {dateRow([['Start', displayDate(venue.trialStartDate)], ['Days', daysIn ?? '—'], ['Readings', venueReadings.length], ['Litres', `${totalLitres.toFixed(0)}L`]])}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={(e) => { e.stopPropagation(); setReadingModal(venue); }} style={btnPrimary()}>
            <ClipboardList size={13} /> Log Reading
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEndTrialModal(venue); }} style={btnSecondary()}>
            <XCircle size={13} /> End Trial
          </button>
        </div>
      </div>
    );
  };

  // -- PIPELINE CARD --
  const renderPipelineCard = (venue) => (
    <div key={venue.id} style={{ ...cardBase(TRIAL_STATUS_COLORS['pipeline'].accent), cursor: 'default' }}>
      {cardHeader(venue)}
      {cardOilRow(venue)}
      {pricingRow(venue)}
      {dateRow([['Fryers', venue.fryerCount || 1], ['Created', venue.trialCreatedAt ? displayDate(venue.trialCreatedAt.split('T')[0]) : '—']])}
      <button onClick={() => setReadingModal({ ...venue, startingTrial: true, trialStartDate: venue.trialStartDate || getTodayString() })} style={{ ...btnPrimary(), width: '100%', flex: 'none' }}>
        <Play size={13} /> Start Trial
      </button>
    </div>
  );

  // -- PENDING OUTCOME CARD --
  const renderPendingOutcomeCard = (venue) => {
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={cardBase(COLORS.warning)}>
        {cardHeader(venue, <span style={{ ...S.pill, background: COLORS.warningBg, color: '#92400e', border: '1px solid #fde68a' }}>Pending</span>)}
        {cardOilRow(venue)}
        {pricingRow(venue)}
        {dateRow([['Start', displayDate(venue.trialStartDate)], ['End', displayDate(venue.trialEndDate)], ['Duration', daysRan != null ? `${daysRan}d` : '—']])}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'successful' }); }} style={btnPrimary('#10b981')}><Trophy size={13} /> Won</button>
          <button onClick={(e) => { e.stopPropagation(); setCloseTrialModal({ venue, outcome: 'unsuccessful' }); }} style={btnPrimary('#ef4444')}><XCircle size={13} /> Lost</button>
        </div>
      </div>
    );
  };

  // -- ARCHIVE CARD (for won/lost) --
  const renderArchiveCard = (venue) => {
    const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
    const reasonLabel = venue.trialReason ? (trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason) : null;
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || venue.outcomeDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={cardBase(statusCfg.accent)}>
        {cardHeader(venue)}
        {cardOilRow(venue)}
        {pricingRow(venue, true)}
        {dateRow([['Start', displayDate(venue.trialStartDate)], ['End', displayDate(venue.trialEndDate)], ['Duration', daysRan != null ? `${daysRan}d` : '—']])}
        {venue.trialStatus === 'successful' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <Check size={13} color="#059669" strokeWidth={3} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#059669' }}>Successful</span>
              {reasonLabel && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '11px', color: '#065f46' }}>{reasonLabel}</span></>}
            </div>
          </div>
        )}
        {venue.trialStatus === 'successful' && venue.customerCode && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={13} color="#059669" />
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#065f46' }}>Cust Code: {venue.customerCode}</span>
          </div>
        )}
        {venue.trialStatus === 'unsuccessful' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={13} color="#dc2626" strokeWidth={3} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#dc2626' }}>Unsuccessful</span>
              {reasonLabel && <><span style={{ color: '#fecaca' }}>·</span><span style={{ fontSize: '11px', color: '#991b1b' }}>{reasonLabel}</span></>}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Accepted card (Awaiting Cust Code) ──
  const renderAcceptedCard = (venue) => {
    const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
    const reasonLabel = venue.trialReason ? (trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason) : null;
    const daysRan = daysBetween(venue.trialStartDate, venue.trialEndDate || venue.outcomeDate || getTodayString());
    return (
      <div key={venue.id} onClick={() => setSelectedTrialVenue(venue)} style={cardBase(statusCfg.accent)}>
        {cardHeader(venue)}
        {cardOilRow(venue)}
        {pricingRow(venue, true)}
        {dateRow([['Start', displayDate(venue.trialStartDate)], ['End', displayDate(venue.trialEndDate)], ['Duration', daysRan != null ? `${daysRan}d` : '—']])}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={13} color="#059669" strokeWidth={3} />
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#059669' }}>Accepted</span>
            {reasonLabel && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '11px', color: '#065f46' }}>{reasonLabel}</span></>}
          </div>
        </div>
        <CustomerCodeInput venueId={venue.id} onSave={handleSaveCustomerCode} />
      </div>
    );
  };

  // ─────────────────────────────────────────
  // ADMIN-PANEL STYLE TABLE — all columns filterable, matching admin panel exactly
  // (No BDM/NAM since we know who the BDM is, Action column instead of Status)
  // ─────────────────────────────────────────
  const isArchiveTab = (t) => t === 'successful' || t === 'unsuccessful';

  // Extract city from trialNotes (format: "TRL-XXXX | CityName\nnotes...")
  const getCity = (v) => { const m = v.trialNotes?.match(/^TRL-\d+\s*\|\s*([^\n]*)/); return m ? m[1].trim() : ''; };

  const renderTrialTable = (allVenues, tabType) => {
    const filtered = colFilters.activeCount > 0 ? colFilters.applyFilters(allVenues, colAccessors) : allVenues;
    const rows = sortList(filtered);
    const isAccepted = tabType === 'accepted';
    const showStart = true;
    const showEnd = true;
    const showClosed = isArchiveTab(tabType);
    const showSold = tabType === 'successful' || isAccepted; // only successful + accepted (not unsuccessful)
    const showReason = isArchiveTab(tabType);
    const showCustomerCode = false; // removed from accepted tab
    const tc = (key) => trialVisibleCols.includes(key);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ marginBottom: '8px' }}>
          <BdmActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
        </div>
        <div className="bdm-scroll" style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'auto', flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 200px)' }}>
          <table className={`bdm-table${isArchiveTab(tabType) ? ' bdm-table-archive' : ''}`} style={{ width: '100%', tableLayout: 'auto' }}>
            <thead><tr>
              <th style={{ width: '4px', padding: 0 }}></th>
              <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(allVenues, v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
              {tc('volume') && <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({ value: b.label, label: b.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '78px' }} />}
              {tc('competitor') && <FilterableTh colKey="competitor" label="Supplier" options={getUniqueValues(allVenues, colAccessors.competitor)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '106px' }} />}
              {tc('compOil') && <FilterableTh colKey="compOil" label="Current Oil" options={getUniqueValues(allVenues, colAccessors.compOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '90px' }} />}
              {tc('trialOil') && <FilterableTh colKey="trialOil" label="Trial Oil" options={getUniqueValues(allVenues, colAccessors.trialOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '90px' }} />}
              {tc('currentPrice') && <FilterableTh colKey="currentPrice" label="Current $/L" options={getUniqueValues(allVenues, colAccessors.currentPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '46px' }} />}
              {tc('offeredPrice') && <FilterableTh colKey="offeredPrice" label="Offered $/L" options={getUniqueValues(allVenues, colAccessors.offeredPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '46px' }} />}
              {showSold && tc('soldPrice') && <FilterableTh colKey="soldPrice" label="Sold $/L" options={getUniqueValues(allVenues, colAccessors.soldPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '44px' }} />}
              {showStart && tc('start') && <FilterableTh colKey="start" label={tabType === 'pipeline' ? 'Est. Start' : 'Start'} options={getUniqueValues(allVenues, colAccessors.start)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', ...(isArchiveTab(tabType) ? { width: '64px' } : {}) }} />}
              {showEnd && tc('end') && <FilterableTh colKey="end" label={(tabType === 'pipeline' || tabType === 'active') ? 'Est. End' : 'End'} options={getUniqueValues(allVenues, colAccessors.end)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', ...(isArchiveTab(tabType) ? { width: '64px' } : {}) }} />}
              {(tabType === 'pending' || isAccepted) && tc('days') && <th style={{ textAlign: 'center', width: '50px' }}>Days</th>}
              {tabType === 'active' && tc('today') && <th style={{ textAlign: 'center', width: '50px' }}>Today</th>}
              {showClosed && tc('closedDate') && <FilterableTh colKey="closedDate" label="Closed" options={getUniqueValues(allVenues, colAccessors.closedDate)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '64px' }} />}
              {showReason && tc('reason') && <FilterableTh colKey="reason" label="Reason" options={trialReasons.filter(r => allVenues.some(v => v.trialReason === r.key)).map(r => ({ value: r.label, label: r.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '110px' }} />}
              {showCustomerCode && tc('customerCode') && <FilterableTh colKey="customerCode" label="Cust Code" options={getUniqueValues(allVenues, colAccessors.customerCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
              <FilterableTh colKey="status" label="Status" options={[{value:'pipeline',label:'Pipeline'},{value:'active',label:'Active'},{value:'pending',label:'Pending'},{value:'accepted',label:'Accepted'},{value:'successful',label:'Successful'},{value:'unsuccessful',label:'Unsuccessful'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '94px' }} />
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px' }}>No trials found</td></tr>
              ) : rows.map((venue) => {
                const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pipeline'];
                const compOil = oilTypes.find(o => o.id === venue.defaultOil);
                const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                const comp = compOil?.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
                const compTier = compOil ? (COMPETITOR_TIER_COLORS[compOil.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                const reasonObj = venue.trialReason ? trialReasons.find(r => r.key === venue.trialReason) : null;
                return (
                  <tr key={venue.id} onClick={() => setRowActionVenue({ venue, tabType })} style={{ height: '34px', cursor: 'pointer' }}>
                    <td style={{ width: '4px', padding: 0, background: statusCfg.accent }}></td>
                    <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</td>
                    {tc('volume') && <td style={{ textAlign: 'center' }}><VolumePill bracket={venue.volumeBracket} /></td>}
                    {tc('competitor') && <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>{comp ? <CompetitorPill comp={comp} table /> : <CompetitorPill comp={{ name: 'Cookers', color: '#1a428a' }} table />}</td>}
                    {tc('compOil') && <td style={{ textAlign: 'center', paddingLeft: '4px', paddingRight: '4px' }}>{compOil ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '88px', textAlign: 'center', verticalAlign: 'middle' }}>{compOil.name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {tc('trialOil') && <td style={{ textAlign: 'center' }}><OilBadge oil={cookersOil} competitors={competitors} compact /></td>}
                    {tc('currentPrice') && <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{venue.currentPricePerLitre ? `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {tc('offeredPrice') && <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{venue.offeredPricePerLitre ? `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {showSold && tc('soldPrice') && <td style={{ fontWeight: '600', color: '#065f46', whiteSpace: 'nowrap', textAlign: 'center' }}>{venue.soldPricePerLitre ? `$${parseFloat(venue.soldPricePerLitre).toFixed(2)}` : '—'}</td>}
                    {showStart && tc('start') && <td style={{ color: tabType === 'pipeline' ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', fontStyle: tabType === 'pipeline' ? 'italic' : 'normal', textAlign: 'center' }}>{displayDate(venue.trialStartDate) || '—'}</td>}
                    {showEnd && tc('end') && <td style={{ color: tabType === 'pipeline' ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', fontStyle: tabType === 'pipeline' ? 'italic' : 'normal', textAlign: 'center' }}>{displayDate(venue.trialEndDate) || '—'}</td>}
                    {tabType === 'active' && tc('today') && (() => {
                      const recorded = tpmReadings.some(r => r.venueId === venue.id && r.readingDate === todayStr);
                      return <td style={{ textAlign: 'center' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: recorded ? '#10b981' : '#ef4444', margin: '0 auto' }} title={recorded ? 'Recorded today' : 'Not yet recorded'} /></td>;
                    })()}
                    {tabType === 'pending' && tc('days') && <td style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{venue.trialEndDate ? daysBetween(venue.trialEndDate, todayStr) : '—'}</td>}
                    {isAccepted && tc('days') && <td style={{ textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{venue.outcomeDate ? daysBetween(venue.outcomeDate, todayStr) : '—'}</td>}
                    {showClosed && tc('closedDate') && <td style={{ color: '#64748b', whiteSpace: 'nowrap', textAlign: 'center' }}>{displayDate(venue.outcomeDate)}</td>}
                    {showReason && tc('reason') && <td style={{ color: reasonObj?.type === 'successful' ? '#065f46' : '#991b1b', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{reasonObj ? reasonObj.label : '—'}</td>}
                    {showCustomerCode && tc('customerCode') && <td style={{ fontWeight: '600', color: venue.customerCode ? '#1a428a' : '#cbd5e1', whiteSpace: 'nowrap', textAlign: 'center' }}>{venue.customerCode || '—'}</td>}
                    <td style={{ textAlign: 'center', paddingLeft: '2px', paddingRight: '2px' }}><TrialStatusBadge status={venue.trialStatus} /></td>
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
      <h3 style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, marginBottom: '12px', marginTop: 0 }}>Create New Trial</h3>

      {/* Trial Type — segmented control */}
      <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '3px', marginBottom: '12px' }}>
        {[{ val: 'existing', label: 'Existing Customer' }, { val: 'new', label: 'New Prospect' }].map(opt => {
          const isActive = trialType === opt.val;
          return (
            <button key={opt.val} type="button" onClick={() => setTrialType(opt.val)} style={{
              flex: 1, padding: '9px 16px', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.15s',
              borderRadius: '8px', border: 'none',
              background: isActive ? 'white' : 'transparent',
              color: isActive ? BLUE : '#64748b',
              fontSize: '13px',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {opt.label}
            </button>
          );
        })}
      </div>

    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <style>{`.new-trial-form input::placeholder, .new-trial-form textarea::placeholder { color: #94a3b8; } .new-trial-form input:not([type=submit]):not([type=button]):not([type=radio]):not([type=checkbox]), .new-trial-form select, .new-trial-form textarea { background: white !important; } .new-trial-form input:focus, .new-trial-form select:focus, .new-trial-form textarea:focus { background: white !important; } .new-trial-form .ntf-grid { gap: 16px !important; }`}</style>
    <form className="new-trial-form" onSubmit={handleCreateTrial}>

      {/* Customer code — only for existing */}
      {trialType === 'existing' && (
        <div style={S.field}>
          <label style={S.label}>CUSTOMER CODE {req}</label>
          <input type="text" value={newTrialForm.customerCode} onChange={e => setNewTrialForm(f => ({ ...f, customerCode: e.target.value }))}
            placeholder="e.g., CUST001" style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      )}

      {/* Venue Name */}
      <div style={S.field}>
        <label style={S.label}>VENUE NAME {req}</label>
        <input type="text" value={newTrialForm.venueName} onChange={e => setNewTrialForm(f => ({ ...f, venueName: e.target.value }))}
          placeholder="e.g., Joe's Fish & Chips" style={inputStyle} required
          onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
      </div>

      {/* Competitor — new prospect only */}
      {trialType === 'new' && (
        <div style={S.field}>
          <label style={S.label}>COMPETITOR {req}</label>
          <select
            value={newTrialForm.competitor}
            onChange={e => setNewTrialForm(f => ({ ...f, competitor: e.target.value, defaultOil: '' }))}
            style={{ ...selectStyle, color: newTrialForm.competitor ? '#1f2937' : '#94a3b8' }}
            required
          >
            <option value="" disabled>Select competitor...</option>
            {competitors.filter(c => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Current Oil + Current Price — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px' }}>
        <div style={S.field}>
          <label style={S.label}>CURRENT OIL {req}</label>
          <select
            value={newTrialForm.defaultOil}
            onChange={e => setNewTrialForm(f => ({ ...f, defaultOil: e.target.value }))}
            style={{ ...selectStyle, color: newTrialForm.defaultOil ? '#1f2937' : '#94a3b8' }}
            required>
            <option value="" disabled>
              {trialType === 'existing' ? 'Select Cookers oil...' : (trialType === 'new' && !newTrialForm.competitor) ? 'Select competitor first…' : 'Select current oil...'}
            </option>
            {trialType === 'existing' ? (
              allOilOptions.cookers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)
            ) : (trialType === 'new' && newTrialForm.competitor) ? (
              (allOilOptions.compGroups[competitors.find(c => c.id === newTrialForm.competitor)?.name] || [])
                .map(o => <option key={o.id} value={o.id}>{o.name}</option>)
            ) : null}
          </select>
        </div>
        <div style={S.field}>
          <label style={S.label}>CURRENT PRICE $/L {req}</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
            <input type="number" step="0.01" min="0" value={newTrialForm.currentPrice}
              onChange={e => setNewTrialForm(f => ({ ...f, currentPrice: e.target.value }))}
              placeholder="0.00" style={{ ...inputStyle, paddingLeft: '22px' }} required
              onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
        </div>
      </div>

      {/* Trial Oil + Offered Price — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px' }}>
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
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
            <input type="number" step="0.01" min="0" value={newTrialForm.offeredPrice}
              onChange={e => setNewTrialForm(f => ({ ...f, offeredPrice: e.target.value }))}
              placeholder="0.00" style={{ ...inputStyle, paddingLeft: '22px' }} required
              onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          </div>
        </div>
      </div>

      {/* Row 1: Avg Litres/Week | No. of Fryer Changes/Week */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', alignItems: 'start' }}>
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
          <label style={S.label}>AVG OIL LIFESPAN (DAYS)</label>
          <input type="number" min="0" step="1" value={newTrialForm.fryerChangesPerWeek}
            onChange={e => setNewTrialForm(f => ({ ...f, fryerChangesPerWeek: e.target.value }))}
            placeholder="e.g. 7" style={inputStyle}
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
      </div>

      {/* Row 2: Fryer Count | Fryer Volumes */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', alignItems: 'start' }}>
        {/* Left: Fryer Count */}
        <div style={S.field}>
          <label style={S.label}>FRYER COUNT {req}</label>
          <input type="number" min="1" max="20" value={newTrialForm.fryerCount}
            onChange={e => {
              const count = parseInt(e.target.value) || 1;
              setNewTrialForm(f => {
                const vols = { ...f.fryerVolumes };
                for (let i = 1; i <= count; i++) { if (!vols[i]) vols[i] = ''; }
                Object.keys(vols).forEach(k => { if (parseInt(k) > count) delete vols[k]; });
                return { ...f, fryerCount: e.target.value, fryerVolumes: vols };
              });
            }}
            style={inputStyle} required
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
        {/* Right: Fryer Volumes */}
        {parseInt(newTrialForm.fryerCount) > 0 && (
          <div style={S.field}>
            <label style={S.label}>FRYER VOLUMES</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Array.from({ length: parseInt(newTrialForm.fryerCount) || 1 }, (_, i) => i + 1).map(fn => (
                <div key={fn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', width: '64px', paddingRight: '12px', flexShrink: 0 }}>Fryer {fn}</div>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number" min="1" step="1"
                      value={newTrialForm.fryerVolumes[fn] ?? ''}
                      onChange={e => setNewTrialForm(f => ({ ...f, fryerVolumes: { ...f.fryerVolumes, [fn]: e.target.value } }))}
                      placeholder="20"
                      style={{ ...inputStyle, paddingRight: '28px', width: '100%', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>L</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Est. Start Date + Est. End Date — side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '16px', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ ...S.field, minWidth: 0 }}>
          <label style={S.label}>EST. START DATE</label>
          <input type="date" value={newTrialForm.estStartDate}
            onChange={e => {
              const start = e.target.value;
              setNewTrialForm(f => {
                const updated = { ...f, estStartDate: start };
                if (start && !f.endDateManual) {
                  const d = new Date(start);
                  d.setDate(d.getDate() + (systemSettings?.trialDuration || 7));
                  updated.estEndDate = d.toISOString().split('T')[0];
                }
                if (!start && !f.endDateManual) updated.estEndDate = '';
                return updated;
              });
            }}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        </div>
        <div style={{ ...S.field, minWidth: 0 }}>
          <label style={S.label}>EST. END DATE</label>
          <input type="date" value={newTrialForm.estEndDate}
            onChange={e => setNewTrialForm(f => ({ ...f, estEndDate: e.target.value, endDateManual: true }))}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          {newTrialForm.estEndDate && !newTrialForm.endDateManual && (
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Auto-set: {systemSettings?.trialDuration || 7}-day trial</div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div style={S.field}>
        <label style={S.label}>WHAT DO WE KNOW GOING INTO THIS TRIAL?</label>
        <textarea value={newTrialForm.notes} onChange={e => setNewTrialForm(f => ({ ...f, notes: e.target.value }))}
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="E.g. competitor pricing pressure, key contact notes, food quality concerns, things to watch…"
          onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
      </div>

      {/* Trial Goals */}
      {(() => {
        const GOAL_OPTIONS = [
          { key: 'save-money',      label: 'Save money',          icon: DollarSign },
          { key: 'reduce-waste',    label: 'Reduce oil waste',    icon: Droplets   },
          { key: 'food-quality',    label: 'Better food quality', icon: Award      },
          { key: 'food-colour',     label: 'Improve food colour', icon: Palette    },
          { key: 'reduce-changes',  label: 'Fewer fryer changes', icon: Cog        },
          { key: 'extend-life',     label: 'Extend oil life',     icon: TrendingUp },
        ];
        const toggleGoal = (key) => setNewTrialForm(f => ({
          ...f,
          trialGoals: f.trialGoals.includes(key)
            ? f.trialGoals.filter(g => g !== key)
            : [...f.trialGoals, key],
        }));
        return (
          <div style={S.field}>
            <label style={S.label}>TRIAL GOALS <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(select all that apply)</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {GOAL_OPTIONS.map(opt => {
                const selected = newTrialForm.trialGoals.includes(opt.key);
                return (
                  <button key={opt.key} type="button" onClick={() => toggleGoal(opt.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', borderRadius: '8px', width: '100%', textAlign: 'left',
                    cursor: 'pointer', transition: 'all 0.15s',
                    border: selected ? '1.5px solid #1a428a' : '1.5px solid #e2e8f0',
                    background: selected ? '#eff6ff' : 'white',
                    color: selected ? '#1a428a' : '#64748b',
                    fontSize: '13px', fontWeight: selected ? '600' : '500',
                  }}>
                    <div style={{
                      width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0,
                      background: selected ? '#1a428a' : 'white',
                      border: `2px solid ${selected ? '#1a428a' : '#cbd5e1'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Check size={10} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    <opt.icon size={13} style={{ flexShrink: 0, opacity: selected ? 0.8 : 0.4 }} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

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

  const isTableView = isDesktop;

  // ─────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────
  const renderDashboard = (section = 'all') => {
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
      { key: 'pipeline', label: 'Pipeline', count: pipelineCount, color: '#94a3b8' },
      { key: 'active', label: 'Active', count: activeCount, color: '#3b82f6' },
      { key: 'pending', label: 'Pending', count: pendingCount, color: '#fbbf24' },
      { key: 'accepted', label: 'Accepted', count: acceptedCount, color: '#f59e0b' },
      { key: 'successful', label: 'Successful', count: wonCount, color: '#10b981' },
      { key: 'unsuccessful', label: 'Unsuccessful', count: lostCount, color: '#ef4444' },
    ];

    // Awaiting recording today — use component-level memoized value
    const awaitingRecording = awaitingRecordingToday;

    const dashFiltered = dashStatusFilter.length > 0
      ? allTrials.filter(v => dashStatusFilter.includes(v.trialStatus))
      : allTrials;
    const dashRows = [...dashFiltered].sort((a, b) => (b.trialStartDate || '').localeCompare(a.trialStartDate || ''));

    // ── Last 30 days (top 3 KPIs) ──
    const todayFmt = formatDate(new Date());
    const d30ago = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return formatDate(d); })();
    const d60ago = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return formatDate(d); })();
    const d90ago = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return formatDate(d); })();
    const inRange = (v, from) => { const ref = v.outcomeDate || v.trialEndDate || v.trialStartDate || ''; return ref >= from; };
    const last30 = allTrials.filter(v => inRange(v, d30ago));
    const last90 = allTrials.filter(v => inRange(v, d90ago));

    const l30Won = last30.filter(v => v.trialStatus === 'successful' || v.trialStatus === 'accepted');
    const l30Lost = last30.filter(v => v.trialStatus === 'unsuccessful');
    const l30Decided = l30Won.length + l30Lost.length;
    const l30WinRate = l30Decided > 0 ? Math.round((l30Won.length / l30Decided) * 100) : null;

    // ── Delta calculations (last 30d vs prev 30d) ──
    const inDeltaRange = (v, from, to) => { const s = v.outcomeDate || v.trialStartDate || ''; return s >= from && s <= to; };
    const prev30 = allTrials.filter(v => inDeltaRange(v, d60ago, d30ago));
    const p30Won = prev30.filter(v => v.trialStatus === 'successful' || v.trialStatus === 'accepted').length;
    const p30Lost = prev30.filter(v => v.trialStatus === 'unsuccessful').length;
    const deltaWon = l30Won.length - p30Won;
    const deltaLost = l30Lost.length - p30Lost;
    const p30Closed = prev30.filter(v => v.trialStatus === 'successful' || v.trialStatus === 'accepted' || v.trialStatus === 'unsuccessful');
    const p30WR = p30Closed.length > 0 ? Math.round((p30Won / p30Closed.length) * 100) : null;
    const deltaWinRate = l30WinRate !== null && p30WR !== null ? l30WinRate - p30WR : null;

    // ── Last 90 days KPIs ──
    const l90Won = last90.filter(v => v.trialStatus === 'successful' || v.trialStatus === 'accepted');
    const l90Lost = last90.filter(v => v.trialStatus === 'unsuccessful');
    const calcAvgDec = (arr) => {
      const decided = arr.filter(v => (v.trialStatus === 'successful' || v.trialStatus === 'unsuccessful') && v.trialEndDate && v.outcomeDate);
      if (decided.length === 0) return null;
      return Math.round(decided.reduce((sum, v) => sum + daysBetween(v.trialEndDate, v.outcomeDate), 0) / decided.length);
    };
    const avgDecision = calcAvgDec(last90);
    const avgCustCodeDays = (() => {
      const today = new Date();
      const waiting = last90.filter(v => v.trialStatus === 'accepted' && v.outcomeDate);
      const days = waiting.map(v => Math.round((today - new Date(v.outcomeDate + 'T00:00:00')) / 86400000));
      return days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
    })();
    const avgSoldXLFRY = (() => {
      const xlfryIds = oilTypes.filter(o => (o.name && o.name.toUpperCase().includes('XLFRY')) || (o.code && o.code.toUpperCase().includes('XLFRY'))).map(o => o.id);
      const xlfryWon = last90.filter(v => (v.trialStatus === 'successful' || v.trialStatus === 'accepted') && v.soldPricePerLitre && xlfryIds.includes(v.trialOilId));
      return xlfryWon.length > 0 ? (xlfryWon.reduce((sum, v) => sum + parseFloat(v.soldPricePerLitre), 0) / xlfryWon.length).toFixed(2) : null;
    })();

    // Delta for 90d KPIs (still 30d vs prev 30d)
    const r30AvgDec = calcAvgDec(last30);
    const p30AvgDec = calcAvgDec(prev30);
    const deltaDec = r30AvgDec !== null && p30AvgDec !== null ? r30AvgDec - p30AvgDec : null;

    // Delta component
    const Delta = ({ value, invert, suffix }) => {
      if (value === null || value === undefined) return null;
      const good = invert ? value < 0 : value > 0;
      const neutral = value === 0;
      return (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: neutral ? '#94a3b8' : good ? '#059669' : '#dc2626' }}>{value > 0 ? '+' : ''}{value}{suffix || ''}</span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>vs prev 30d</span>
        </div>
      );
    };

    // ── Competitor data (last 90 days) ──
    const compDetail = {};
    last90.forEach(v => {
      if (!v.defaultOil) return;
      const oil = oilTypes.find(o => o.id === v.defaultOil);
      const comp = oil?.competitorId ? competitors.find(c => c.id === oil.competitorId) : null;
      if (!comp) return;
      if (!compDetail[comp.name]) compDetail[comp.name] = { total: 0, successful: 0, unsuccessful: 0 };
      compDetail[comp.name].total += 1;
      if (v.trialStatus === 'successful' || v.trialStatus === 'accepted') compDetail[comp.name].successful += 1;
      if (v.trialStatus === 'unsuccessful') compDetail[comp.name].unsuccessful += 1;
    });
    const topCompetitorData = Object.entries(compDetail).sort((a, b) => b[1].total - a[1].total).slice(0, 3);

    // ── Reason data (last 90 days) ──
    const wonReasonMap = {};
    l90Won.forEach(v => { if (v.trialReason) wonReasonMap[v.trialReason] = (wonReasonMap[v.trialReason] || 0) + 1; });
    const wonReasonData = Object.entries(wonReasonMap).sort((a, b) => b[1] - a[1]);
    const lostReasonMap = {};
    l90Lost.forEach(v => { if (v.trialReason) lostReasonMap[v.trialReason] = (lostReasonMap[v.trialReason] || 0) + 1; });
    const lostReasonData = Object.entries(lostReasonMap).sort((a, b) => b[1] - a[1]);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {section !== 'actions' && <>
        {/* ── Top 3 KPIs — Last 30 days ── */}
        <div style={{ fontSize: '9px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Last 30 days</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {[
            { label: 'Win Rate', icon: Target, iconColor: '#1a428a', value: l30WinRate !== null ? `${l30WinRate}%` : '—', delta: deltaWinRate, deltaSuffix: '%' },
            { label: 'Successful', icon: Trophy, iconColor: '#10b981', value: l30Won.length, delta: deltaWon },
            { label: 'Unsuccessful', icon: AlertTriangle, iconColor: '#ef4444', value: l30Lost.length, delta: deltaLost, invert: true },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: '12px', padding: isDesktop ? '16px' : '10px 8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <s.icon size={13} color={s.iconColor} />
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: isDesktop ? '28px' : '22px', fontWeight: '700', color: '#1f2937' }}>{s.value}</div>
              <Delta value={s.delta} suffix={s.deltaSuffix} invert={s.invert} />
            </div>
          ))}
        </div>
        </>}

        {section !== 'stats' && <>
        {/* ── Action Items ── */}
        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ClipboardList size={14} color="#64748b" />
          Action Items
        </div>

        {/* ── Awaiting Start + Awaiting Recording + Awaiting Decision + Awaiting Cust Code — 4 columns ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr 1fr 1fr' : '1fr', gap: '10px', marginBottom: '16px' }}>
          {/* Awaiting Start */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Play size={12} color={pipelineCount > 0 ? '#3b82f6' : '#10b981'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Awaiting Start</span>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px',
                background: pipelineCount > 0 ? '#dbeafe' : '#d1fae5',
                color: pipelineCount > 0 ? '#1e40af' : '#065f46',
              }}>{pipelineCount}</span>
            </div>
            {pipelineCount > 0 ? (
              <div style={{ padding: '6px 14px 10px' }}>
                {pipelineTrials.slice(0, 3).map(v => (
                  <div key={v.id} onClick={() => setReadingModal({ ...v, startingTrial: true, trialStartDate: v.trialStartDate || getTodayString() })} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                  </div>
                ))}
                {pipelineTrials.length > 3 && (
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', padding: '4px 0 0', textAlign: 'center' }}>+{pipelineTrials.length - 3} more</div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '10px', color: '#059669', fontWeight: '500' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />All started
              </div>
            )}
          </div>

          {/* Awaiting Recording Today */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={12} color={awaitingRecording.length > 0 ? '#f59e0b' : '#10b981'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Awaiting Recording Today</span>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px',
                background: awaitingRecording.length > 0 ? '#fef3c7' : '#d1fae5',
                color: awaitingRecording.length > 0 ? '#92400e' : '#065f46',
              }}>{awaitingRecording.length}</span>
            </div>
            {awaitingRecording.length > 0 ? (
              <div style={{ padding: '6px 14px 10px' }}>
                {awaitingRecording.slice(0, 3).map(v => {
                  const daysIn = v.trialStartDate ? daysBetween(v.trialStartDate, todayStr) : null;
                  return (
                    <div key={v.id} onClick={() => setReadingModal(v)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                              </div>
                  );
                })}
                {awaitingRecording.length > 3 && (
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', padding: '4px 0 0', textAlign: 'center' }}>+{awaitingRecording.length - 3} more</div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '10px', color: '#059669', fontWeight: '500' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />All recorded
              </div>
            )}
          </div>

          {/* Awaiting Decision */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={12} color={pendingCount > 0 ? '#eab308' : '#10b981'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Awaiting Decision</span>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px',
                background: pendingCount > 0 ? '#fef3c7' : '#d1fae5',
                color: pendingCount > 0 ? '#92400e' : '#065f46',
              }}>{pendingCount}</span>
            </div>
            {pendingCount > 0 ? (
              <div style={{ padding: '6px 14px 10px' }}>
                {pendingOutcomeTrials.slice(0, 3).map(v => {
                  const daysSinceEnd = v.trialEndDate ? daysBetween(v.trialEndDate, todayStr) : null;
                  return (
                    <div key={v.id} onClick={() => setDecisionModal(v)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                              </div>
                  );
                })}
                {pendingOutcomeTrials.length > 3 && (
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', padding: '4px 0 0', textAlign: 'center' }}>+{pendingOutcomeTrials.length - 3} more</div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '10px', color: '#059669', fontWeight: '500' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />All decided
              </div>
            )}
          </div>

          {/* Awaiting Customer Code */}
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <ClipboardList size={12} color={acceptedCount > 0 ? '#f59e0b' : '#10b981'} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Awaiting Cust Code</span>
              </div>
              <span style={{
                fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px',
                background: acceptedCount > 0 ? '#ffedd5' : '#d1fae5',
                color: acceptedCount > 0 ? '#9a3412' : '#065f46',
              }}>{acceptedCount}</span>
            </div>
            {acceptedCount > 0 ? (
              <div style={{ padding: '6px 14px 10px' }}>
                {acceptedTrials.slice(0, 3).map(v => {
                  const daysSinceAccepted = v.outcomeDate ? daysBetween(v.outcomeDate, todayStr) : null;
                  return (
                  <div key={v.id} onClick={() => setCustCodeModal(v)} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0',
                    borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                  }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: COLORS.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                  </div>
                  );
                })}
                {acceptedTrials.length > 3 && (
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', padding: '4px 0 0', textAlign: 'center' }}>+{acceptedTrials.length - 3} more</div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '10px', color: '#059669', fontWeight: '500' }}>
                <Check size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />All assigned
              </div>
            )}
          </div>
        </div>
        </>}

        {section !== 'actions' && <>
        {/* ── Insight Tables — Last 90 days ── */}
        <div style={{ fontSize: '9px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Last 90 days</div>
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: '8px', marginBottom: '10px' }}>
          {/* Competitors */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Competitors Trialled</div>
            {topCompetitorData.length > 0 ? (() => {
              const maxWon = Math.max(...topCompetitorData.map(([, d]) => d.won), 1);
              const maxLost = Math.max(...topCompetitorData.map(([, d]) => d.lost), 1);
              const maxTotal = Math.max(...topCompetitorData.map(([, d]) => d.total), 1);
              return (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Competitor</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#10b981', borderBottom: '2px solid #e2e8f0' }}>Won</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#ef4444', borderBottom: '2px solid #e2e8f0' }}>Lost</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#7c3aed', borderBottom: '2px solid #e2e8f0' }}>Total</th>
                    <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompetitorData.map(([name, d]) => {
                    const wonOp = d.won ? Math.max(0.1, (d.won / maxWon) * 0.4) : 0;
                    const lostOp = d.lost ? Math.max(0.08, (d.lost / maxLost) * 0.35) : 0;
                    const totalOp = Math.max(0.1, (d.total / maxTotal) * 0.35);
                    const decided = d.won + d.lost;
                    const wp = decided > 0 ? Math.round((d.won / decided) * 100) : null;
                    return (
                    <tr key={name}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontSize: '10px', fontWeight: '700', color: '#e53e3e', background: 'rgba(229,62,62,0.08)', padding: '2px 8px', borderRadius: '20px' }}>{name}</span></td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.won ? <span style={{ fontSize: '11px', fontWeight: '700', color: '#065f46', background: `rgba(16, 185, 129, ${wonOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{d.won}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.lost ? <span style={{ fontSize: '11px', fontWeight: '700', color: '#991b1b', background: `rgba(239, 68, 68, ${lostOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{d.lost}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontSize: '11px', fontWeight: '700', color: '#6d28d9', background: `rgba(139, 92, 246, ${totalOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{d.total}</span></td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{wp !== null ? <span style={{ fontSize: '11px', fontWeight: '700', color: wp >= 60 ? '#059669' : wp >= 40 ? '#ca8a04' : '#dc2626' }}>{wp}%</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              );
            })() : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
          </div>
          {/* Top Successful Reasons */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Trophy size={14} color="#10b981" />
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Top Successful Reasons</span>
            </div>
            {wonReasonData.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {wonReasonData.slice(0, 3).map(([key, count]) => {
                  const reason = trialReasons.find(r => r.key === key);
                  const pct = l90Won.length > 0 ? Math.round((count / l90Won.length) * 100) : 0;
                  const opacity = Math.max(0.12, pct / 100 * 0.6);
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{reason ? reason.label : key}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#065f46', background: `rgba(16, 185, 129, ${opacity})`, padding: '4px 12px', borderRadius: '20px', flexShrink: 0, minWidth: '48px', textAlign: 'center' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
          </div>
          {/* Top Unsuccessful Reasons */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <AlertTriangle size={14} color="#ef4444" />
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Top Unsuccessful Reasons</span>
            </div>
            {lostReasonData.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {lostReasonData.slice(0, 3).map(([key, count]) => {
                  const reason = trialReasons.find(r => r.key === key);
                  const pct = l90Lost.length > 0 ? Math.round((count / l90Lost.length) * 100) : 0;
                  const opacity = Math.max(0.12, pct / 100 * 0.6);
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{reason ? reason.label : key}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b', background: `rgba(239, 68, 68, ${opacity})`, padding: '4px 12px', borderRadius: '20px', flexShrink: 0, minWidth: '48px', textAlign: 'center' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
          </div>
        </div>

        </>}


      </div>
    );
  };

  // ─────────────────────────────────────────────
  // MANAGE TABLE — desktop table for manage trial list
  // ─────────────────────────────────────────────
  const renderManageTable = (allTrials) => {
    // Apply status pill filter
    const statusFiltered = manageStatusFilter.length > 0
      ? allTrials.filter(v => manageStatusFilter.includes(v.trialStatus))
      : allTrials;
    // Apply keyword search
    const q = manageSearchQuery.trim().toLowerCase();
    const searchFiltered = q
      ? statusFiltered.filter(v => {
          const compOilObj = oilTypes.find(o => o.id === v.defaultOil);
          const cookersOilObj = oilTypes.find(o => o.id === v.trialOilId);
          const compObj = compOilObj?.competitorId ? competitors.find(c => c.id === compOilObj.competitorId) : null;
          const haystack = [
            v.name, v.trialStatus, v.state, v.volumeBracket,
            compObj?.name, compOilObj?.name, cookersOilObj?.name,
            v.currentPricePerLitre, v.offeredPricePerLitre, v.customerCode,
            v.trialStartDate, v.trialEndDate,
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(q);
        })
      : statusFiltered;
    // Apply column filters
    const colFiltered = colFilters.activeCount > 0 ? colFilters.applyFilters(searchFiltered, colAccessors) : searchFiltered;
    const rows = sortList(colFiltered);

    // Status counts from allTrials (pre-filter) for the pill strip
    const statusCounts = {};
    allTrials.forEach(v => { statusCounts[v.trialStatus] = (statusCounts[v.trialStatus] || 0) + 1; });

    // Name column fixed; narrower for price/date, wider for status
    const NAME_W = '86px';
    const VOL_W = '63px';    // Vol bracket — 82px badge
    const COL_W = '67px';    // OIL×2 — 88px badge
    const SUPP_W = '75px';   // Supplier — 104px badge
    const PRICE_W = '46px';  // Current $/L, Offered $/L
    const DATE_W = '50px';   // Start, End
    const STATUS_W = '64px'; // Status — extra width keeps badge from scrollbar edge

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingRight: '2px' }}>
          {[
            { key: 'pipeline', label: 'Pipeline', color: '#64748b', bg: '#f1f5f9', activeBg: '#64748b', activeText: 'white' },
            { key: 'active', label: 'Active', color: '#1e40af', bg: '#dbeafe', activeBg: '#1e40af', activeText: 'white' },
            { key: 'pending', label: 'Pending', color: '#a16207', bg: '#fef3c7', activeBg: '#eab308', activeText: '#78350f' },
            { key: 'accepted', label: 'Accepted', color: '#9a3412', bg: '#ffedd5', activeBg: '#ea580c', activeText: 'white' },
            { key: 'successful', label: 'Successful', color: '#065f46', bg: '#d1fae5', activeBg: '#059669', activeText: 'white' },
            { key: 'unsuccessful', label: 'Unsuccessful', color: '#991b1b', bg: '#fee2e2', activeBg: '#991b1b', activeText: 'white' },
          ].map(s => {
            const isActive = manageStatusFilter.includes(s.key);
            const count = statusCounts[s.key] || 0;
            return (
              <div key={s.key} onClick={() => setManageStatusFilter(prev => prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key])} style={{
                flex: '1', minWidth: '56px', padding: '8px 4px', borderRadius: '8px',
                background: isActive ? s.activeBg : s.bg, textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                border: isActive ? `2px solid ${s.activeBg}` : '2px solid transparent',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
              }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: isActive ? s.activeText : s.color }}>{count}</div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: isActive ? (s.activeText === 'white' ? 'rgba(255,255,255,0.85)' : s.activeText) : s.color, opacity: isActive ? 1 : 0.8, whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Keyword search bar */}
        <div style={{ marginBottom: '10px', position: 'relative' }}>
          <input
            type="text"
            value={manageSearchQuery}
            onChange={e => setManageSearchQuery(e.target.value)}
            placeholder="Search by venue, supplier, oil, status…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 32px',
              borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px',
              outline: 'none', background: 'white', color: '#1f2937', fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = '#1a428a'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
          <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {manageSearchQuery && (
            <button onClick={() => setManageSearchQuery('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>

        {(() => { const mc = (key) => manageVisibleCols.includes(key); return (<>
        <div style={{ marginBottom: '8px' }}>
          <BdmActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
        </div>
        <div className="bdm-scroll" style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'auto', flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 320px)' }}>
          <style>{`
            .bdm-table { width: 100%; border-collapse: separate; border-spacing: 0; }
            .bdm-table thead th { position: sticky; top: 0; z-index: 20; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
            .bdm-table tbody tr { transition: background 0.1s; }
            .bdm-table tbody tr:hover { background: #eef2ff; }
            .bdm-table tbody td { padding: 7px 8px; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f1f5f9; vertical-align: middle; white-space: nowrap; }
          `}</style>
          <table className="bdm-table" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead><tr>
              <th style={{ width: '4px', padding: 0 }}></th>
              <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(statusFiltered, v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ width: NAME_W }} />
              {mc('volume') && <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({ value: b.label, label: b.label }))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: VOL_W }} />}
              {mc('competitor') && <FilterableTh colKey="competitor" label="Supplier" options={getUniqueValues(statusFiltered, colAccessors.competitor)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: SUPP_W }} />}
              {mc('compOil') && <FilterableTh colKey="compOil" label="Current Oil" options={getUniqueValues(statusFiltered, colAccessors.compOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: COL_W }} />}
              {mc('trialOil') && <FilterableTh colKey="trialOil" label="Trial Oil" options={getUniqueValues(statusFiltered, colAccessors.trialOil)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: COL_W }} />}
              {mc('currentPrice') && <FilterableTh colKey="currentPrice" label="Current $/L" options={getUniqueValues(statusFiltered, colAccessors.currentPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: PRICE_W }} />}
              {mc('offeredPrice') && <FilterableTh colKey="offeredPrice" label="Offered $/L" options={getUniqueValues(statusFiltered, colAccessors.offeredPrice)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: PRICE_W }} />}
              {mc('start') && <FilterableTh colKey="start" label="Start" options={getUniqueValues(statusFiltered, colAccessors.start)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: DATE_W }} />}
              {mc('end') && <FilterableTh colKey="end" label="End" options={getUniqueValues(statusFiltered, colAccessors.end)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: DATE_W }} />}
              {mc('status') && <FilterableTh colKey="status" label="Status" options={[{value:'pipeline',label:'Pipeline'},{value:'active',label:'Active'},{value:'pending',label:'Pending'},{value:'accepted',label:'Accepted'},{value:'successful',label:'Successful'},{value:'unsuccessful',label:'Unsuccessful'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: STATUS_W }} />}
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px' }}>
                  {q ? `No results for "${manageSearchQuery}"` : 'No trials found'}
                </td></tr>
              ) : rows.map((venue) => {
                const statusCfg = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pipeline'];
                const vCompOil = oilTypes.find(o => o.id === venue.defaultOil);
                const vCookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                const vComp = vCompOil?.competitorId ? competitors.find(c => c.id === vCompOil.competitorId) : null;
                const compTier = vCompOil ? (COMPETITOR_TIER_COLORS[vCompOil.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                return (
                  <tr key={venue.id} onClick={() => setManageVenueId(venue.id)} style={{ height: '34px', cursor: 'pointer' }}>
                    <td style={{ width: '4px', padding: 0, background: statusCfg.accent }}></td>
                    <td style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue.name}</td>
                    {mc('volume') && <td style={{ textAlign: 'center' }}><VolumePill bracket={venue.volumeBracket} /></td>}
                    {mc('competitor') && <td style={{ textAlign: 'center' }}>
                      {vComp
                        ? <CompetitorPill comp={vComp} table />
                        : vCompOil && !vCompOil.competitorId
                          ? <CompetitorPill comp={{ name: 'Cookers', color: '#1a428a' }} table />
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>}
                    {mc('compOil') && <td style={{ textAlign: 'center', paddingLeft: '4px', paddingRight: '4px' }}>
                      {vCompOil && compTier ? (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '88px', textAlign: 'center', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vCompOil.name}</span>
                      ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>}
                    {mc('trialOil') && <td style={{ textAlign: 'center' }}>
                      <OilBadge oil={vCookersOil} competitors={competitors} compact />
                    </td>}
                    {mc('currentPrice') && <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b' }}>{venue.currentPricePerLitre ? `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {mc('offeredPrice') && <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b' }}>{venue.offeredPricePerLitre ? `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {mc('start') && <td style={{ textAlign: 'center', color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>{venue.trialStartDate ? displayDate(venue.trialStartDate) : '—'}</td>}
                    {mc('end') && <td style={{ textAlign: 'center', color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap' }}>{venue.trialEndDate ? displayDate(venue.trialEndDate) : '—'}</td>}
                    {mc('status') && <td style={{ textAlign: 'center', paddingLeft: '2px', paddingRight: '2px' }}><TrialStatusBadge status={venue.trialStatus} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>); })()}
      </div>
    );
  };

  // ─────────────────────────────────────────────
  // MANAGE TRIAL — full-page trial management screen
  // ─────────────────────────────────────────────
  const renderManageTrial = () => {
    const allTrials = myVenues.filter(v => v.trialStatus);
    const venue = manageVenueId ? myVenues.find(v => v.id === manageVenueId) : null;

    // If no venue selected, show select UI
    if (!venue) {
      const sorted = [...allTrials].sort((a, b) => (b.trialStartDate || '').localeCompare(a.trialStartDate || ''));

      return (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: '0 0 16px' }}>Manage Trial</h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>Select a venue to manage its trial details, edit information, or change its status.</p>
          {/* Results */}
          {isTableView ? renderManageTable(allTrials) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '700px' }}>
              {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '13px' }}>
                  No trials found
                </div>
              ) : sorted.map(v => {
                const sc = TRIAL_STATUS_COLORS[v.trialStatus] || TRIAL_STATUS_COLORS['pipeline'];
                const isWonOrAccepted = v.trialStatus === 'successful' || v.trialStatus === 'accepted';
                return (
                  <div key={v.id} onClick={() => setManageVenueId(v.id)} style={cardBase(sc.accent)}>
                    {cardHeader(v)}
                    {cardOilRow(v)}
                    {pricingRow(v, isWonOrAccepted)}
                    {dateRow([
                      ['Start', v.trialStartDate ? displayDate(v.trialStartDate) : '—'],
                      ['End', v.trialEndDate ? displayDate(v.trialEndDate) : '—'],
                      ...(v.customerCode && !v.customerCode.startsWith('PRS-') ? [['Code', v.customerCode]] : []),
                    ])}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ── Venue selected — show full management screen ──
    const statusConfig = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pipeline'];
    const compOil = oilTypes.find(o => o.id === venue.defaultOil);
    const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
    const comp = compOil && compOil.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
    const cookerOilsList = oilTypes.filter(o => o.category !== 'competitor');
    const venueReadings = tpmReadings.filter(r => r.venueId === venue.id);
    const fc = venue.fryerCount || 1;
    const liveTrialAvg = calcTrialWeeklyAvg(venue.id, venue.trialStartDate, tpmReadings, venue.trialEndDate);
    const preTrialAvg = venue.currentWeeklyAvg;
    const weekLitres = preTrialAvg && liveTrialAvg ? Math.round((preTrialAvg - liveTrialAvg) * 10) / 10 : null;
    const annualLitres = weekLitres !== null ? Math.round(weekLitres * 52) : null;
    const trialPrice = venue.offeredPricePerLitre || venue.currentPricePerLitre;
    const currentPrice = venue.currentPricePerLitre;
    const weekSpend = weekLitres !== null && currentPrice && trialPrice ? Math.round((preTrialAvg * currentPrice - liveTrialAvg * trialPrice) * 100) / 100 : null;
    const annualSpend = weekSpend !== null ? Math.round(weekSpend * 52) : null;
    const isReadOnly = venue.trialStatus === 'successful' || venue.trialStatus === 'unsuccessful' || venue.trialStatus === 'accepted';

    // Build calendar data
    const calDays = (() => {
      if (!venue.trialStartDate || venue.trialStatus === 'pipeline') return [];
      const start = new Date(venue.trialStartDate + 'T00:00:00');
      const end = venue.trialEndDate ? new Date(venue.trialEndDate + 'T00:00:00') : new Date();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cap = venue.trialEndDate ? end : today;
      const days = []; const d = new Date(start);
      while (d <= cap) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
      return days;
    })();
    const readingsByDate = {};
    venueReadings.forEach(r => {
      if (r.readingDate >= (venue.trialStartDate || '')) {
        if (!readingsByDate[r.readingDate]) readingsByDate[r.readingDate] = [];
        readingsByDate[r.readingDate].push(r);
      }
    });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const fryerList = Array.from({ length: fc }, (_, i) => i + 1);

    // TPM stats (used across multiple sub-tabs)
    const allTrialReadings = venueReadings.filter(r => r.readingDate >= (venue.trialStartDate || ''));
    const tpmVals = allTrialReadings.filter(r => r.tpmValue != null).map(r => r.tpmValue);
    const oilAgeVals = allTrialReadings.filter(r => r.oilAge != null && r.oilAge > 0).map(r => r.oilAge);
    const statsAvg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const avgTPM = statsAvg(tpmVals);
    const minTPM = tpmVals.length > 0 ? Math.min(...tpmVals) : null;
    const maxTPM = tpmVals.length > 0 ? Math.max(...tpmVals) : null;
    const avgOilAge = statsAvg(oilAgeVals);
    const tpmColor = (v) => v != null ? (v <= 14 ? '#059669' : v <= 18 ? '#d97706' : '#dc2626') : '#94a3b8';

    // Parsed metadata from trialNotes — available to all sub-tabs
    const _fryerChangesLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[FryerChanges:')) || '';
    const fryerChangesPerWeek = _fryerChangesLine ? _fryerChangesLine.replace(/^\[FryerChanges:\s*/, '').replace(/\]$/, '').trim() : null;
    const _goalsLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[Goals:')) || '';
    const trialGoalsList = _goalsLine ? _goalsLine.replace(/^\[Goals:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : [];
    const _achievedLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[GoalsAchieved:')) || '';
    const achievedGoals = _achievedLine ? _achievedLine.replace(/^\[GoalsAchieved:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : [];

    // Summary report computed values
    const compObj = competitors.find(c => c.id === venue.competitor);
    const compName = compObj?.name || '';
    const compOilObj = oilTypes.find(o => o.id === venue.defaultOil);
    const compOilName = compOilObj?.name || '';
    const trialOilObj = oilTypes.find(o => o.id === venue.trialOilId);
    const trialOilName = trialOilObj?.name || '';
    const trialDuration = calDays.length;
    const totalTrialLitres = allTrialReadings.reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0);
    const compWeeklySpend = preTrialAvg && currentPrice ? Math.round(preTrialAvg * currentPrice * 100) / 100 : null;
    const trialWeeklySpend = liveTrialAvg !== null && trialPrice ? Math.round(liveTrialAvg * trialPrice * 100) / 100 : null;
    const compYearlySpend = compWeeklySpend !== null ? Math.round(compWeeklySpend * 52 * 100) / 100 : null;
    const trialYearlySpend = trialWeeklySpend !== null ? Math.round(trialWeeklySpend * 52 * 100) / 100 : null;
    const pctLitresReduced = weekLitres !== null && preTrialAvg ? Math.round((weekLitres / preTrialAvg) * 1000) / 10 : null;
    const pctCostSaved = weekSpend !== null && compWeeklySpend ? Math.round((weekSpend / compWeeklySpend) * 1000) / 10 : null;
    const maxOilLifespan = oilAgeVals.length > 0 ? Math.max(...oilAgeVals) : null;
    const maxOilLifespanByFryer = {};
    fryerList.forEach(fn => {
      const ages = allTrialReadings.filter(r => (r.fryerNumber || 1) === fn && r.oilAge != null && r.oilAge > 0).map(r => r.oilAge);
      maxOilLifespanByFryer[fn] = ages.length > 0 ? Math.max(...ages) : null;
    });

    // Shared notes parser
    const parseNotes = () => {
      const notes = [];
      if (venue.trialNotes) {
        venue.trialNotes.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const tagMatch = trimmed.match(/^\[(Won|Lost)\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)/);
          const noteMatch = trimmed.match(/^\[Note\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)/);
          if (tagMatch) {
            notes.push({ date: tagMatch[2], type: tagMatch[1] === 'Won' ? 'outcome-won' : 'outcome-lost', text: tagMatch[3] || `Marked as ${tagMatch[1]}` });
          } else if (noteMatch) {
            notes.push({ date: noteMatch[1], type: 'comment', text: noteMatch[2] || 'Comment added' });
          } else if (trimmed.startsWith('TRL-')) {
            const afterId = trimmed.replace(/^TRL-\d+(\s*\|[^|]*)?/, '').trim();
            if (afterId) notes.push({ date: venue.trialStartDate || venue.createdAt?.slice(0, 10) || '', type: 'creation', text: afterId });
          } else {
            notes.push({ date: venue.trialStartDate || '', type: 'creation', text: trimmed });
          }
        });
      }
      venueReadings.filter(r => r.notes && r.notes.trim()).forEach(r => {
        notes.push({ date: r.readingDate, type: 'reading', text: r.notes.trim(), fryer: r.fryerNumber });
      });
      const typePriority = { creation: 0, reading: 1, 'outcome-won': 2, 'outcome-lost': 2 };
      notes.sort((a, b) => (typePriority[a.type] ?? 1) - (typePriority[b.type] ?? 1) || (a.date || '').localeCompare(b.date || ''));
      return notes;
    };
    const noteTypeConfig = {
      creation: { label: 'Trial Created', color: '#1a428a', bg: 'rgba(26,66,138,0.06)' },
      reading: { label: 'Recording Note', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
      comment: { label: 'Comment', color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
      'outcome-won': { label: venue.trialStatus === 'accepted' ? 'Accepted' : 'Successful', color: '#059669', bg: 'rgba(5,150,105,0.06)' },
      'outcome-lost': { label: 'Unsuccessful', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
    };
    const renderNotesTimeline = (notes) => notes.length > 0 ? notes.map((n, i) => {
      const cfg = noteTypeConfig[n.type] || noteTypeConfig.creation;
      return (
        <div key={i} style={{ marginBottom: '10px', position: 'relative', paddingLeft: '14px' }}>
          <div style={{ position: 'absolute', left: 0, top: '4px', width: '8px', height: '8px', borderRadius: '50%', background: cfg.color, border: '2px solid white', boxShadow: '0 0 0 1px ' + cfg.color }} />
          {i < notes.length - 1 && <div style={{ position: 'absolute', left: '3px', top: '14px', bottom: '-6px', width: '2px', background: '#e2e8f0' }} />}
          <div style={{ background: cfg.bg, borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '9px', fontWeight: '700', color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{cfg.label}</span>
              {n.date && <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '500' }}>{displayDate(n.date)}</span>}
            </div>
            <div style={{ fontSize: '11px', color: '#1f2937', lineHeight: '1.4' }}>{n.text}</div>
            {n.fryer && <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Fryer {n.fryer}</div>}
          </div>
        </div>
      );
    }) : (
      <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '12px' }}>
        <MessageSquare size={16} color="#cbd5e1" style={{ marginBottom: '4px' }} />
        <div>No notes yet</div>
      </div>
    );

    const manageTabs = [
      { key: 'details',  label: 'Pre-trial Details', icon: ClipboardList },
      { key: 'calendar', label: 'Trial Results',     icon: BarChart3 },
      { key: 'tpcal',    label: 'Trial Calendar',    icon: Calendar },
      { key: 'notes',    label: 'TPM Chart',          icon: TrendingUp },
      ...(['pending', 'accepted', 'successful', 'unsuccessful'].includes(venue.trialStatus) ? [{ key: 'summary', label: 'Summary Report', icon: FileText }] : []),
    ];

    // Use outer state for edit form
    const mEditForm = manageEditForm;
    const setMEditForm = setManageEditForm;
    const mEditing = manageEditing;
    const setMEditing = (val) => {
      setManageEditing(val);
      if (val) {
        // Reset form to current venue values when entering edit mode
        const initNotesText = (venue.trialNotes || '').split('\n')
          .filter(l => { const t = l.trim(); return t && !t.match(/^\[/) && !/TRL-\d+/.test(t); }).join('\n');
        const initCompOil = oilTypes.find(o => o.id === venue.defaultOil);
        const initGoalsLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[Goals:')) || '';
        const initGoals = initGoalsLine ? initGoalsLine.replace(/^\[Goals:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : [];
        const initFCLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[FryerChanges:')) || '';
        const initFryerChanges = initFCLine ? initFCLine.replace(/^\[FryerChanges:\s*/, '').replace(/\]$/, '').trim() : '';
        setManageEditForm({
          name: venue.name || '',
          notesText: initNotesText,
          trialType: initCompOil?.competitorId ? 'new' : 'existing',
          trialGoals: initGoals,
          fryerChangesPerWeek: initFryerChanges,
          currentPricePerLitre: venue.currentPricePerLitre ? String(venue.currentPricePerLitre) : '',
          offeredPricePerLitre: venue.offeredPricePerLitre ? String(venue.offeredPricePerLitre) : '',
          trialStartDate: venue.trialStartDate || '', trialEndDate: venue.trialEndDate || '',
          trialOilId: venue.trialOilId || '', defaultOil: venue.defaultOil || '',
          competitor: initCompOil?.competitorId || '',
          fryerCount: venue.fryerCount || 1, avgLitresPerWeek: venue.currentWeeklyAvg ? String(venue.currentWeeklyAvg) : '',
          fryerVolumes: { ...(venue.fryerVolumes || {}) },
        });
      }
    };
    const mSaving = manageSaving;
    const initNotesForDirty = (venue.trialNotes || '').split('\n')
      .filter(l => { const t = l.trim(); return t && !t.match(/^\[/) && !/TRL-\d+/.test(t); }).join('\n');
    const mDirty = mEditing && (
      mEditForm.name !== (venue.name || '') ||
      mEditForm.notesText !== initNotesForDirty ||
      mEditForm.currentPricePerLitre !== (venue.currentPricePerLitre ? String(venue.currentPricePerLitre) : '') ||
      mEditForm.offeredPricePerLitre !== (venue.offeredPricePerLitre ? String(venue.offeredPricePerLitre) : '') ||
      mEditForm.trialStartDate !== (venue.trialStartDate || '') || mEditForm.trialEndDate !== (venue.trialEndDate || '') ||
      mEditForm.trialOilId !== (venue.trialOilId || '') || mEditForm.defaultOil !== (venue.defaultOil || '') ||
      String(mEditForm.fryerCount) !== String(venue.fryerCount || 1) ||
      mEditForm.avgLitresPerWeek !== (venue.currentWeeklyAvg ? String(venue.currentWeeklyAvg) : '') ||
      JSON.stringify(mEditForm.fryerVolumes) !== JSON.stringify(venue.fryerVolumes || {}) ||
      JSON.stringify(mEditForm.trialGoals || []) !== JSON.stringify((() => { const gl = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[Goals:')); return gl ? gl.replace(/^\[Goals:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : []; })())
    );
    const handleMSave = async () => {
      setManageSaving(true);
      const avgL = mEditForm.avgLitresPerWeek ? parseFloat(mEditForm.avgLitresPerWeek) : null;
      // Reconstruct trialNotes: keep TRL-ID, rebuild Goals/FryerChanges, preserve GoalsAchieved + [Note...] lines
      const trialIdLines = (venue.trialNotes || '').split('\n').filter(l => /TRL-\d+/.test(l.trim()));
      const noteCommentLines = (venue.trialNotes || '').split('\n').filter(l => l.trim().match(/^\[Note /));
      const savedAchievedLine = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[GoalsAchieved:')) || '';
      const newGoalsLine = (mEditForm.trialGoals || []).length > 0 ? `[Goals: ${mEditForm.trialGoals.join(', ')}]` : '';
      const newFryerChangesLine = mEditForm.fryerChangesPerWeek ? `[FryerChanges: ${mEditForm.fryerChangesPerWeek}]` : '';
      const newTrialNotes = [...trialIdLines, newGoalsLine, newFryerChangesLine, savedAchievedLine, mEditForm.notesText, ...noteCommentLines].filter(Boolean).join('\n');
      await handleSaveTrialEdits(venue.id, {
        name: mEditForm.name.trim() || venue.name,
        trialNotes: newTrialNotes,
        currentPricePerLitre: mEditForm.currentPricePerLitre ? parseFloat(mEditForm.currentPricePerLitre) : null,
        offeredPricePerLitre: mEditForm.offeredPricePerLitre ? parseFloat(mEditForm.offeredPricePerLitre) : null,
        trialStartDate: mEditForm.trialStartDate || null, trialEndDate: mEditForm.trialEndDate || null,
        trialOilId: mEditForm.trialOilId || null, defaultOil: mEditForm.defaultOil || null,
        fryerCount: parseInt(mEditForm.fryerCount) || 1, currentWeeklyAvg: avgL,
        volumeBracket: avgL ? calcVolumeBracket(avgL) : null,
        fryerVolumes: mEditForm.fryerVolumes && Object.keys(mEditForm.fryerVolumes).length > 0 ? mEditForm.fryerVolumes : null,
      });
      setManageSaving(false); setManageEditing(false);
    };

    // Calendar renderer for a single fryer
    const renderFryerCal = (fryerNum) => {
      if (calDays.length === 0) return null;
      const cols = 7;
      const padBefore = calDays[0].getDay();
      return (
        <div key={fryerNum} style={{ marginBottom: fryerNum < fc ? '16px' : '0' }}>
          {fc > 1 && <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a428a', padding: '0 0 4px', letterSpacing: '0.3px' }}>Fryer {fryerNum}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2px', marginBottom: '2px' }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', padding: '3px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2px' }}>
            {Array.from({ length: padBefore }).map((_, i) => (
              <div key={`p-${i}`} style={{ background: '#fafafa', borderRadius: '4px', minHeight: '80px' }} />
            ))}
            {calDays.map((day, idx) => {
              const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
              const allRecs = readingsByDate[dateStr] || [];
              const recs = allRecs.filter(r => (r.fryerNumber || 1) === fryerNum);
              const isFuture = day > today;
              const isToday = day.getTime() === today.getTime();
              const latest = recs.length > 0 ? recs[recs.length - 1] : null;
              const hasFresh = recs.some(r => r.oilAge === 1);
              const hasFiltered = recs.some(r => r.filtered === true);
              const hasNotes = recs.some(r => r.notes);
              const cellBg = isFuture ? 'white' : recs.length > 0 ? '#d1fae5' : '#fee2e2';
              const tpmColor = latest ? (latest.tpmValue <= 14 ? '#059669' : latest.tpmValue <= 18 ? '#d97706' : '#dc2626') : '#cbd5e1';
              return (
                <div key={idx} style={{
                  background: cellBg, borderRadius: '6px', padding: '3px 2px', minHeight: '80px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  border: isToday ? '2px solid #1a428a' : '1px solid #e2e8f0', opacity: isFuture ? 0.4 : 1,
                }}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#1f2937', marginBottom: '1px' }}>{day.getDate()}</div>
                  {latest ? (
                    <>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: tpmColor, lineHeight: '1.1', marginBottom: '1px' }}>{latest.tpmValue}</div>
                      <div style={{ fontSize: '9px', fontWeight: '600', color: hasFresh ? '#059669' : '#64748b' }}>{hasFresh ? 'Fresh' : `${latest.oilAge}d`}</div>
                      <div style={{ fontSize: '8px', color: '#64748b', lineHeight: '1.2', textAlign: 'center' }}>
                        {latest.setTemperature && <span>S:{latest.setTemperature}° </span>}
                        {latest.actualTemperature && <span>A:{latest.actualTemperature}°</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1px' }}>
                        {hasFiltered && <Filter size={8} color="#1e40af" strokeWidth={2.5} />}
                        {hasFresh && <Star size={8} color="#92400e" fill="#92400e" />}
                        {hasNotes && <MessageSquare size={8} color="#475569" strokeWidth={2.5} />}
                      </div>
                      {latest.litresFilled > 0 && <div style={{ fontSize: '7px', color: '#1f2937', fontWeight: '600', marginTop: '1px' }}>{latest.litresFilled}L</div>}
                    </>
                  ) : !isFuture ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><span style={{ fontSize: '9px', color: '#dc2626', fontWeight: '600' }}>Missed</span></div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div>
        {/* Back button + header + action buttons */}
        <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', alignItems: isDesktop ? 'flex-end' : 'stretch', gap: isDesktop ? '12px' : '8px', marginBottom: '16px' }}>
          <button onClick={() => setManageVenueId(null)} style={{
            background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '6px 10px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', fontWeight: '600', color: '#64748b', flexShrink: 0,
          }}>
            <ChevronDown size={12} style={{ transform: 'rotate(90deg)' }} /> Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937', margin: 0, lineHeight: 1 }}>{venue.name}</h2>
          </div>
          {/* Inline action buttons */}
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            {venue.trialStatus === 'pipeline' && (
              <button onClick={() => { if (window.confirm(`Start trial for ${venue.name}?`)) handleStartTrial(venue.id); }} style={{
                padding: '5px 10px', background: '#1a428a', border: 'none', borderRadius: '6px',
                fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}><Play size={12} /> Start</button>
            )}
            {venue.trialStatus === 'active' && (<>
              <button onClick={() => setReadingModal(venue)} style={{
                padding: '5px 10px', background: '#1a428a', border: 'none', borderRadius: '6px',
                fontSize: '11px', fontWeight: '600', color: 'white', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}><ClipboardList size={12} /> Log</button>
              <button onClick={() => setEndTrialModal(venue)} style={{
                padding: '5px 10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '6px',
                fontSize: '11px', fontWeight: '600', color: '#475569', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}><Check size={12} /> End</button>
              <button onClick={() => { if (window.confirm(`Move "${venue.name}" back to Pipeline?`)) handlePushBack(venue.id, 'pipeline'); }} style={{
                padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '6px',
                fontSize: '11px', fontWeight: '600', color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}><RotateCcw size={10} /> Back to Pipeline</button>
            </>)}
            {((venue.trialStatus === 'unsuccessful' || venue.trialStatus === 'accepted') || (venue.trialStatus === 'successful' && !venue.customerCode)) && (
              <button onClick={() => { if (window.confirm(`Reopen "${venue.name}" and move back to Pending?`)) handlePushBack(venue.id, 'pending'); }} style={{
                padding: '5px 10px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '6px',
                fontSize: '11px', fontWeight: '600', color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}><RotateCcw size={10} /> Reopen</button>
            )}
          </div>
        </div>

        {/* Top sub-tab panel */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Top tab bar */}
          <div style={{ overflowX: 'auto', borderBottom: '2px solid #d1dce8', background: '#eef2f8' }}>
            <div style={{ display: 'flex', minWidth: 'fit-content' }}>
            {manageTabs.map(tab => {
              const TabIcon = tab.icon;
              const isActive = manageSubTab === tab.key;
              const shortLabels = { details: 'Details', calendar: 'Results', tpcal: 'Calendar', notes: 'Chart', summary: 'Summary' };
              return (
                <button key={tab.key} onClick={() => setManageSubTab(tab.key)} style={{
                  flex: isDesktop ? 1 : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  padding: isDesktop ? '12px 8px' : '11px 14px', border: 'none',
                  background: isActive ? '#1a428a' : 'transparent',
                  color: isActive ? 'white' : '#64748b',
                  fontSize: isDesktop ? '12px' : '11px', fontWeight: isActive ? '700' : '500',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}>
                  <TabIcon size={13} />
                  {isDesktop ? tab.label : shortLabels[tab.key] || tab.label}
                </button>
              );
            })}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ padding: isDesktop ? '20px' : '14px 12px' }}>

            {/* ── Pre-trial Details ── */}
            {manageSubTab === 'details' && (() => {
              // Trial ID — handle both "TRL-0001" and "WA-TRL-0009" formats
              const trialIdLine = venue.trialNotes?.split('\n').find(l => /TRL-\d+/.test(l.trim())) || '';
              const trialId = trialIdLine.match(/[A-Z]+-TRL-\d+|TRL-\d+/)?.[0] || '';
              const initialNote = venue.trialNotes
                ? venue.trialNotes.split('\n')
                    .filter(l => { const t = l.trim(); return t && !t.match(/^\[/) && !/TRL-\d+/.test(t); })
                    .join('\n')
                : '';
              const hasStarted = venue.trialStatus !== 'pipeline';
              const hasEnded = venue.trialStatus === 'successful' || venue.trialStatus === 'unsuccessful' || venue.trialStatus === 'accepted';
              const trialCreatedDate = venue.trialCreatedAt ? venue.trialCreatedAt.split('T')[0] : null;
              const goalsLine = venue.trialNotes?.split('\n').find(l => l.trim().startsWith('[Goals:')) || '';
              const parsedGoals = goalsLine ? goalsLine.replace(/^\[Goals:\s*/, '').replace(/\]$/, '').split(',').map(g => g.trim()).filter(Boolean) : [];
              const GOAL_LABELS = { 'save-money': 'Save money', 'reduce-waste': 'Reduce oil waste', 'reduce-consumption': 'Reduce oil waste', 'food-quality': 'Better food quality', 'food-colour': 'Improve food colour', 'reduce-changes': 'Fewer fryer changes', 'simplify-ops': 'Fewer fryer changes', 'extend-life': 'Extend oil life' };
              const GOAL_ICONS = { 'save-money': DollarSign, 'reduce-waste': Droplets, 'reduce-consumption': Droplets, 'food-quality': Award, 'food-colour': Palette, 'reduce-changes': Cog, 'simplify-ops': Cog, 'extend-life': TrendingUp };
              // fryerChangesPerWeek and achievedGoals are available from the outer scope
              // Type: new prospect (vs competitor) or existing customer
              const isNewProspect = !!comp;
              const typeBadge = isNewProspect
                ? <span style={{ fontSize: '11px', fontWeight: '700', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '6px', padding: '3px 8px' }}>New prospect</span>
                : <span style={{ fontSize: '11px', fontWeight: '700', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 8px' }}>Existing customer</span>;
              const currentSupplierEl = comp ? <CompetitorPill comp={comp} /> : <span style={{ color: '#1a428a', fontWeight: '700' }}>Cookers</span>;
              // Last recording date from tpm readings
              const lastRecDate = venueReadings.length > 0 ? venueReadings.reduce((max, r) => r.readingDate > max ? r.readingDate : max, venueReadings[0].readingDate) : null;
              // Last edited (venue record updated_at)
              const lastEditedDate = venue.updatedAt ? venue.updatedAt.split('T')[0] : null;
              // Clean label-value field helper
              const fld = (label, value) => (
                <div>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: isDesktop ? '13px' : '11px', color: '#1f2937', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                </div>
              );
              const sectionLabel = (text) => (
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#b0bac9', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '10px' }}>{text}</div>
              );
              const fldGrid = (children) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>{children}</div>
              );
              return (
                <div style={{ padding: isDesktop ? '0 24px' : '0' }}>
                  {/* Header row: "Pre-Trial Details" title + edit/save buttons on same line */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>Pre-Trial Details</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!isReadOnly && !mEditing && (
                        <button onClick={() => setMEditing(true)} style={{
                          background: 'none', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px',
                          fontSize: '11px', fontWeight: '600', color: '#1a428a', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                          <Edit3 size={12} /> Edit
                        </button>
                      )}
                      {mEditing && (
                        <button onClick={() => setMEditing(false)} style={{
                          background: 'none', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px',
                          fontSize: '11px', fontWeight: '600', color: '#64748b', cursor: 'pointer',
                        }}>Cancel</button>
                      )}
                    </div>
                  </div>

                  {!mEditing ? (
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '0', alignItems: 'start' }}>

                      {/* ── Left: 3-column detail grid ── */}
                      <div style={{
                        paddingRight: isDesktop ? '28px' : '0',
                        borderRight: isDesktop ? '1px solid #f0f4f8' : 'none',
                        borderBottom: isDesktop ? 'none' : '1px solid #f0f4f8',
                        paddingBottom: isDesktop ? '0' : '20px',
                        marginBottom: isDesktop ? '0' : '20px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px' }}>
                          {/* Row 1: Type | Venue name (spans 2 cols) */}
                          {fld('Type', typeBadge)}
                          <div style={{ gridColumn: 'span 2' }}>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Venue name</div>
                            <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '600' }}>{venue.name || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                          </div>
                          {/* Row 2: Current supplier | Current oil | Current price/L */}
                          {fld('Current supplier', currentSupplierEl)}
                          {fld('Current oil', compOil ? <OilBadge oil={compOil} competitors={competitors} compact /> : null)}
                          {fld('Current price / L', venue.currentPricePerLitre ? `$${parseFloat(venue.currentPricePerLitre).toFixed(2)}` : null)}
                          {/* Row 3: Fryer count | Trial oil | Offered price */}
                          {fld('Fryer count', fc ? String(fc) : null)}
                          {fld('Trial oil', cookersOil ? <OilBadge oil={cookersOil} competitors={competitors} compact /> : null)}
                          {fld('Offered price / L', venue.offeredPricePerLitre ? `$${parseFloat(venue.offeredPricePerLitre).toFixed(2)}` : null)}
                          {/* Row 4: Vol bracket | Pre-trial weekly avg | Avg oil lifespan */}
                          {fld('Vol bracket', venue.volumeBracket ? <VolumePill bracket={venue.volumeBracket} /> : null)}
                          {fld('Pre-trial weekly avg', venue.currentWeeklyAvg ? `${venue.currentWeeklyAvg} L` : null)}
                          {fld('Pre-trial oil lifespan', fryerChangesPerWeek ? `${fryerChangesPerWeek} days` : null)}
                          {/* Row 5: Start date | End date — desktop only (moved to bottom on mobile), with dashed separator */}
                          {isDesktop && <div style={{ gridColumn: 'span 3', borderTop: '1.5px dashed #e2e8f0', marginTop: '6px' }} />}
                          {isDesktop && fld(hasStarted ? 'Start' : 'Est. start', venue.trialStartDate ? displayDate(venue.trialStartDate) : null)}
                          {isDesktop && fld(hasEnded ? 'End date' : 'Est. end', venue.trialEndDate ? displayDate(venue.trialEndDate) : null)}
                          {isDesktop && <div />}
                        </div>
                        {/* Per-fryer volumes if recorded */}
                        {fc > 0 && Object.values(venue.fryerVolumes || {}).some(Boolean) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 16px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f0f4f8' }}>
                            {Array.from({ length: fc }, (_, i) => i + 1).map(fn => {
                              const vol = (venue.fryerVolumes || {})[fn] ?? (venue.fryerVolumes || {})[String(fn)];
                              return vol ? fld(`Fryer ${fn}`, `${vol} L`) : null;
                            })}
                          </div>
                        )}
                        {/* Start/End dates — mobile only, in fld-style 3-col grid */}
                        {!isDesktop && (venue.trialStartDate || venue.trialEndDate) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px', marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                            {fld(hasStarted ? 'Start' : 'Est. start', venue.trialStartDate ? displayDate(venue.trialStartDate) : null)}
                            {fld(hasEnded ? 'End date' : 'Est. end', venue.trialEndDate ? displayDate(venue.trialEndDate) : null)}
                            <div />
                          </div>
                        )}
                        {/* Bottom metadata strip — desktop only (mobile version rendered after goals below) */}
                        {isDesktop && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '18px', paddingTop: '12px', borderTop: '1px solid #f0f4f8' }}>
                            {trialCreatedDate && (
                              <span style={{ fontSize: '10px', color: '#b0bac9' }}>Created {displayDate(trialCreatedDate)}</span>
                            )}
                            {lastRecDate && (
                              <span style={{ fontSize: '10px', color: '#b0bac9' }}>Last recording {displayDate(lastRecDate)}</span>
                            )}
                            {lastEditedDate && (
                              <span style={{ fontSize: '10px', color: '#b0bac9' }}>Last edited {displayDate(lastEditedDate)}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── Right: notes + goals ── */}
                      <div style={{ paddingLeft: isDesktop ? '28px' : '0', paddingTop: isDesktop ? '0' : '4px', paddingBottom: isDesktop ? '0' : '20px', marginBottom: isDesktop ? '0' : '20px', borderBottom: isDesktop ? 'none' : '1px solid #f0f4f8' }}>
                        {sectionLabel('What do we know going into this trial?')}
                        {initialNote
                          ? <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', margin: '0 0 20px 0', whiteSpace: 'pre-wrap' }}>{initialNote}</p>
                          : <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0 0 16px 0' }}>No notes entered.</p>
                        }
                        {sectionLabel('Trial goals')}
                        {parsedGoals.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {parsedGoals.map(g => {
                              const GoalIcon = GOAL_ICONS[g];
                              return (
                                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: '#f0f7ff', border: '1px solid #dbeafe' }}>
                                  <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {GoalIcon ? <GoalIcon size={14} color="#1a428a" /> : null}
                                  </div>
                                  <span style={{ fontSize: '12px', fontWeight: '500', color: '#1e3a6e' }}>{GOAL_LABELS[g] || g}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0' }}>No goals selected.</p>
                        )}
                      </div>

                      {/* Mobile-only metadata strip — rendered AFTER goals so it appears at bottom on mobile */}
                      {!isDesktop && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', paddingTop: '16px', borderTop: '1px solid #f0f4f8' }}>
                          {trialCreatedDate && (
                            <span style={{ fontSize: '10px', color: '#b0bac9' }}>Created {displayDate(trialCreatedDate)}</span>
                          )}
                          {lastRecDate && (
                            <span style={{ fontSize: '10px', color: '#b0bac9' }}>Last recording {displayDate(lastRecDate)}</span>
                          )}
                          {lastEditedDate && (
                            <span style={{ fontSize: '10px', color: '#b0bac9' }}>Last edited {displayDate(lastEditedDate)}</span>
                          )}
                        </div>
                      )}

                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                      {/* Venue name */}
                      <div style={S.field}>
                        <label style={S.label}>VENUE NAME</label>
                        <input type="text" value={mEditForm.name}
                          onChange={e => setMEditForm(p => ({ ...p, name: e.target.value }))}
                          style={inputStyle}
                          onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                      </div>

                      {/* Competitor — new prospect only */}
                      {mEditForm.trialType === 'new' && (
                        <div style={S.field}>
                          <label style={S.label}>COMPETITOR</label>
                          <select value={mEditForm.competitor}
                            onChange={e => setMEditForm(p => ({ ...p, competitor: e.target.value, defaultOil: '' }))}
                            style={{ ...selectStyle, color: mEditForm.competitor ? '#1f2937' : '#94a3b8' }}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
                            <option value="" disabled>Select competitor...</option>
                            {competitors.filter(c => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Current oil | Current price/L */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
                        <div style={S.field}>
                          <label style={S.label}>CURRENT OIL</label>
                          <select value={mEditForm.defaultOil}
                            onChange={e => setMEditForm(p => ({ ...p, defaultOil: e.target.value }))}
                            style={{ ...selectStyle, color: mEditForm.defaultOil ? '#1f2937' : '#94a3b8' }}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
                            <option value="" disabled>{mEditForm.trialType === 'existing' ? 'Select Cookers oil...' : 'Select current oil...'}</option>
                            {mEditForm.trialType === 'existing' ? (
                              allOilOptions.cookers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)
                            ) : mEditForm.competitor ? (
                              (allOilOptions.compGroups[competitors.find(c => c.id === mEditForm.competitor)?.name] || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)
                            ) : (
                              Object.entries(allOilOptions.compGroups).sort(([a], [b]) => a.localeCompare(b)).map(([compName, oils]) => (
                                <optgroup key={compName} label={compName}>{oils.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                              ))
                            )}
                          </select>
                        </div>
                        <div style={S.field}>
                          <label style={S.label}>CURRENT PRICE / L</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                            <input type="number" step="0.01" min="0" value={mEditForm.currentPricePerLitre}
                              onChange={e => setMEditForm(p => ({ ...p, currentPricePerLitre: e.target.value }))}
                              style={{ ...inputStyle, paddingLeft: '24px' }} placeholder="0.00"
                              onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                          </div>
                        </div>
                      </div>

                      {/* Trial oil | Offered price/L */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
                        <div style={S.field}>
                          <label style={S.label}>TRIAL OIL</label>
                          <select value={mEditForm.trialOilId}
                            onChange={e => setMEditForm(p => ({ ...p, trialOilId: e.target.value }))}
                            style={selectStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
                            <option value="">—</option>
                            {cookerOilsList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                        <div style={S.field}>
                          <label style={S.label}>OFFERED PRICE / L</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                            <input type="number" step="0.01" min="0" value={mEditForm.offeredPricePerLitre}
                              onChange={e => setMEditForm(p => ({ ...p, offeredPricePerLitre: e.target.value }))}
                              style={{ ...inputStyle, paddingLeft: '24px' }} placeholder="0.00"
                              onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                          </div>
                        </div>
                      </div>

                      {/* Row 1: Avg litres/week (left) | Fryer changes/week (right) */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px', alignItems: 'start' }}>
                        <div style={S.field}>
                          <label style={S.label}>CURRENT AVG LITRES / WEEK</label>
                          <input type="number" min="0" step="1" value={mEditForm.avgLitresPerWeek}
                            onChange={e => setMEditForm(p => ({ ...p, avgLitresPerWeek: e.target.value }))}
                            placeholder="e.g. 80" style={inputStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                          {mEditForm.avgLitresPerWeek && calcVolumeBracket(mEditForm.avgLitresPerWeek) && (
                            <div style={{ marginTop: '6px' }}><VolumePill bracket={calcVolumeBracket(mEditForm.avgLitresPerWeek)} /></div>
                          )}
                        </div>
                        <div style={S.field}>
                          <label style={S.label}>AVG OIL LIFESPAN (DAYS)</label>
                          <input type="number" min="0" step="1" value={mEditForm.fryerChangesPerWeek ?? ''}
                            onChange={e => setMEditForm(p => ({ ...p, fryerChangesPerWeek: e.target.value }))}
                            placeholder="e.g. 7" style={inputStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                        </div>
                      </div>

                      {/* Row 2: Fryer count (left) | Fryer volumes (right) */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px', alignItems: 'start' }}>
                        <div style={S.field}>
                          <label style={S.label}>FRYER COUNT</label>
                          <input type="number" min="1" max="20" value={mEditForm.fryerCount}
                            onChange={e => {
                              const count = parseInt(e.target.value) || 1;
                              setMEditForm(p => {
                                const vols = { ...p.fryerVolumes };
                                for (let i = 1; i <= count; i++) { if (!vols[i]) vols[i] = ''; }
                                Object.keys(vols).forEach(k => { if (parseInt(k) > count) delete vols[k]; });
                                return { ...p, fryerCount: e.target.value, fryerVolumes: vols };
                              });
                            }}
                            style={inputStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                        </div>
                        {parseInt(mEditForm.fryerCount) > 0 && (
                          <div style={S.field}>
                            <label style={S.label}>FRYER VOLUMES</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {Array.from({ length: parseInt(mEditForm.fryerCount) || 1 }, (_, i) => i + 1).map(fn => (
                                <div key={fn} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', width: '64px', paddingRight: '12px', flexShrink: 0 }}>Fryer {fn}</div>
                                  <div style={{ position: 'relative', flex: 1 }}>
                                    <input type="number" min="1" step="1"
                                      value={mEditForm.fryerVolumes?.[fn] ?? ''}
                                      onChange={e => setMEditForm(p => ({ ...p, fryerVolumes: { ...p.fryerVolumes, [fn]: e.target.value } }))}
                                      placeholder="20"
                                      style={{ ...inputStyle, paddingRight: '28px', width: '100%', boxSizing: 'border-box' }}
                                      onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>L</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Start date | End date */}
                      <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '12px' }}>
                        <div style={S.field}>
                          <label style={S.label}>START DATE</label>
                          <input type="date" value={mEditForm.trialStartDate}
                            onChange={e => setMEditForm(p => ({ ...p, trialStartDate: e.target.value }))}
                            style={inputStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                        </div>
                        <div style={S.field}>
                          <label style={S.label}>END DATE</label>
                          <input type="date" value={mEditForm.trialEndDate}
                            onChange={e => setMEditForm(p => ({ ...p, trialEndDate: e.target.value }))}
                            style={inputStyle}
                            onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                        </div>
                      </div>

                      {/* Notes */}
                      <div style={S.field}>
                        <label style={S.label}>WHAT DO WE KNOW GOING INTO THIS TRIAL?</label>
                        <textarea value={mEditForm.notesText}
                          onChange={e => setMEditForm(p => ({ ...p, notesText: e.target.value }))}
                          rows={3} style={{ ...inputStyle, resize: 'vertical' }}
                          placeholder="E.g. competitor pricing pressure, key contact notes, food quality concerns, things to watch…"
                          onFocus={e => e.target.style.borderColor = BLUE} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                      </div>

                      {/* Trial Goals — same as create form */}
                      {(() => {
                        const GOAL_OPTIONS = [
                          { key: 'save-money',     label: 'Save money',          icon: DollarSign },
                          { key: 'reduce-waste',   label: 'Reduce oil waste',    icon: Droplets   },
                          { key: 'food-quality',   label: 'Better food quality', icon: Award      },
                          { key: 'food-colour',    label: 'Improve food colour', icon: Palette    },
                          { key: 'reduce-changes', label: 'Fewer fryer changes', icon: Cog        },
                          { key: 'extend-life',    label: 'Extend oil life',     icon: TrendingUp },
                        ];

                        const toggleGoal = (key) => setMEditForm(p => ({
                          ...p,
                          trialGoals: (p.trialGoals || []).includes(key)
                            ? (p.trialGoals || []).filter(g => g !== key)
                            : [...(p.trialGoals || []), key],
                        }));
                        return (
                          <div style={S.field}>
                            <label style={S.label}>TRIAL GOALS <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(select all that apply)</span></label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                              {GOAL_OPTIONS.map(opt => {
                                const selected = (mEditForm.trialGoals || []).includes(opt.key);
                                return (
                                  <button key={opt.key} type="button" onClick={() => toggleGoal(opt.key)} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '9px 12px', borderRadius: '8px', width: '100%', textAlign: 'left',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    border: selected ? '1.5px solid #1a428a' : '1.5px solid #e2e8f0',
                                    background: selected ? '#eff6ff' : 'white',
                                    color: selected ? '#1a428a' : '#64748b',
                                    fontSize: '13px', fontWeight: selected ? '600' : '500',
                                  }}>
                                    <div style={{
                                      width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0,
                                      background: selected ? '#1a428a' : 'white',
                                      border: `2px solid ${selected ? '#1a428a' : '#cbd5e1'}`,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      {selected && <Check size={10} color="white" strokeWidth={3} />}
                                    </div>
                                    <span style={{ flex: 1 }}>{opt.label}</span>
                                    <opt.icon size={13} style={{ flexShrink: 0, opacity: selected ? 0.8 : 0.4 }} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Save button — bottom of edit form */}
                      <button onClick={handleMSave} disabled={mSaving || !mDirty} style={{
                        width: '100%', padding: '11px', borderRadius: '8px', border: 'none',
                        background: mDirty ? '#1a428a' : '#e2e8f0', fontSize: '13px', fontWeight: '600',
                        color: mDirty ? 'white' : '#94a3b8',
                        cursor: mDirty ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        marginTop: '4px',
                      }}>
                        {mSaving ? 'Saving…' : 'Save Changes'}
                      </button>

                    </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Trial Results (table) ── */}
            {manageSubTab === 'calendar' && (() => {
              if (calDays.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <BarChart3 size={32} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{venue.trialStatus === 'pipeline' ? 'Results will appear once the trial starts' : 'No readings recorded yet'}</div>
                </div>
              );
              const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const activeFryer = calFryerTab;
              const EQ_W = '44px';
              const thBase = { padding: '6px 10px', fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', background: '#f8fafc' };
              const tdBase = { padding: '6px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'center', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', overflow: 'hidden', whiteSpace: 'nowrap' };
              const badge = (label, bg, color) => (
                <span style={{ fontSize: '11px', fontWeight: '700', background: bg, color, borderRadius: '4px', padding: '4px 0', whiteSpace: 'nowrap', display: 'inline-block', minWidth: '60px', textAlign: 'center' }}>{label}</span>
              );
              return (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', marginBottom: fc > 1 ? '10px' : '0' }}>Trial Results</div>
                    {fc > 1 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {fryerList.map(fn => (
                          <button key={fn} onClick={() => setCalFryerTab(fn)} style={{
                            padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                            border: '1.5px solid', borderColor: activeFryer === fn ? '#1a428a' : '#e2e8f0',
                            background: activeFryer === fn ? '#1a428a' : 'white',
                            color: activeFryer === fn ? 'white' : '#64748b',
                          }}>Fryer {fn}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!isDesktop && !showTrialTableModal ? (
                    <button onClick={() => { setShowTrialTableModal(true); screen?.orientation?.lock?.('landscape').catch(()=>{}); }} style={{
                      width: '100%', padding: '14px 16px', borderRadius: '10px',
                      background: '#eff6ff', border: '1.5px solid #bfdbfe',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '8px',
                      fontSize: '14px', fontWeight: '600', color: '#1a428a'
                    }}>
                      📊 Tap to View Full Trial Table
                    </button>
                  ) : (
                    <div style={(!isDesktop && showTrialTableModal) ? {
                      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                      zIndex: 9999, background: 'rgba(0,0,0,0.88)',
                      display: 'flex', flexDirection: 'column'
                    } : {}}>
                      {(!isDesktop && showTrialTableModal) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1a428a', flexShrink: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: 'white' }}>Trial Results</div>
                          <button onClick={() => { setShowTrialTableModal(false); screen?.orientation?.unlock?.(); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '22px', lineHeight: '1', padding: '4px 8px' }}>✕</button>
                        </div>
                      )}
                    <div style={{ overflowX: 'auto', ...( (!isDesktop && showTrialTableModal) ? { flex: 1, background: 'white', overflowY: 'auto' } : {}) }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px', fontSize: '11px', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '32px' }} />  {/* # */}
                        <col style={{ width: '50px' }} />  {/* Day */}
                        <col style={{ width: '92px' }} />  {/* Date */}
                        <col style={{ width: '60px' }} />  {/* TPM */}
                        <col style={{ width: '60px' }} />  {/* Set°C */}
                        <col style={{ width: '70px' }} />  {/* Actual°C */}
                        <col style={{ width: '60px' }} />  {/* -/+°C */}
                        <col style={{ width: '82px' }} />  {/* Fill Type */}
                        <col style={{ width: '46px' }} />  {/* Litres */}
                        <col style={{ width: '82px' }} />  {/* Filtered */}
                        <col style={{ width: '123px' }} /> {/* Food */}
                        <col />                            {/* Notes: auto */}
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={thBase}>#</th>
                          <th style={thBase}>Day</th>
                          <th style={thBase}>Date</th>
                          <th style={thBase}>TPM</th>
                          <th style={thBase}>Set °C</th>
                          <th style={thBase}>Actual °C</th>
                          <th style={thBase}>-/+ °C</th>
                          <th style={thBase}>Fill Type</th>
                          <th style={thBase}>Litres</th>
                          <th style={thBase}>Filtered</th>
                          <th style={{ ...thBase, textAlign: 'center' }}>Food</th>
                          <th style={{ ...thBase, textAlign: 'left' }}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calDays.map((day, idx) => {
                          const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
                          const dayRecs = (readingsByDate[dateStr] || []).filter(r => (r.fryerNumber || 1) === activeFryer);
                          const r = dayRecs.length > 0 ? dayRecs[dayRecs.length - 1] : null;
                          const isFuture = day > today;
                          const isFresh = r?.oilAge === 1;
                          const isToppedUp = r && r.litresFilled > 0 && !isFresh;
                          const variance = (r?.actualTemperature != null && r?.setTemperature != null) ? (r.actualTemperature - r.setTemperature) : null;
                          const tpmCol = r?.tpmValue != null ? tpmColor(r.tpmValue) : '#1f2937';
                          const tpmBg = r?.tpmValue != null ? (r.tpmValue <= 14 ? '#d1fae5' : r.tpmValue <= 18 ? '#fef3c7' : '#fee2e2') : 'transparent';
                          const missed = !r && !isFuture;
                          const varZero = variance === 0;
                          const varInRange = variance != null && variance !== 0 && Math.abs(variance) <= 5;
                          const varOutRange = variance != null && Math.abs(variance) > 5;
                          const dash = missed ? '' : '—'; // blank for missed days, dash for future
                          const dateLabel = `${String(day.getDate()).padStart(2,'0')}-${MONTHS[day.getMonth()]}-${String(day.getFullYear()).slice(-2)}`;
                          return (
                            <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa', opacity: isFuture ? 0.4 : 1, height: '44px' }}>
                              <td style={{ ...tdBase, fontWeight: '500', color: '#64748b' }}>{idx + 1}</td>
                              <td style={{ ...tdBase, color: '#64748b', fontWeight: '500' }}>{DAYS[day.getDay()]}</td>
                              <td style={{ ...tdBase, fontWeight: '500', whiteSpace: 'nowrap' }}>{dateLabel}</td>
                              <td style={{ ...tdBase, fontWeight: '700', color: missed ? '#94a3b8' : tpmCol, background: r ? tpmBg : 'transparent' }}>
                                {r ? (r.tpmValue ?? '—') : missed ? 'Missed' : '—'}
                              </td>
                              <td style={tdBase}>{r ? (r.setTemperature ?? '—') : dash}</td>
                              <td style={tdBase}>{r ? (r.actualTemperature ?? '—') : dash}</td>
                              <td style={{
                                ...tdBase, fontWeight: '600',
                                background: varZero ? '#d1fae5' : varInRange ? '#fef3c7' : varOutRange ? '#fee2e2' : 'transparent',
                                color: varZero ? '#059669' : varInRange ? '#d97706' : varOutRange ? '#dc2626' : '#94a3b8',
                              }}>
                                {variance != null ? (variance > 0 ? '+' : '') + variance : dash}
                              </td>
                              <td style={tdBase}>
                                {isFresh ? badge('Fresh Fill', '#d1fae5', '#059669')
                                  : isToppedUp ? badge('Top Up', '#fef3c7', '#d97706')
                                  : ''}
                              </td>
                              <td style={tdBase}>{r && r.litresFilled > 0 ? `${r.litresFilled}L` : ''}</td>
                              <td style={tdBase}>
                                {r?.filtered ? badge('Filtered', '#dbeafe', '#1d4ed8') : ''}
                              </td>
                              <td style={{ ...tdBase, textAlign: 'left', whiteSpace: 'nowrap' }}>
                                {r?.foodType ? `${FOOD_EMOJIS[r.foodType] || ''} ${r.foodType}` : dash}
                              </td>
                              <td style={{ ...tdBase, textAlign: 'left', color: '#64748b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'visible' }}>{r?.notes || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Trial Calendar (fryer × day matrix) ── */}
            {manageSubTab === 'tpcal' && (() => {
              if (calDays.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <Calendar size={32} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{venue.trialStatus === 'pipeline' ? 'Calendar will appear once the trial starts' : 'No readings recorded yet'}</div>
                </div>
              );

              const cellTpmBg = tpm => tpm <= 14 ? '#d1fae5' : tpm <= 18 ? '#fef3c7' : '#fee2e2';
              const cellTpmCol = tpm => tpm <= 14 ? '#059669' : tpm <= 18 ? '#d97706' : '#dc2626';
              // Min cell width: 32px each + 68px label col; allow horizontal scroll if needed
              const MIN_CELL = 32;
              const ROW_LABEL_W = 60;
              const minTableWidth = ROW_LABEL_W + calDays.length * MIN_CELL;

              return (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>Trial Calendar</div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: `${minTableWidth}px`, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '2px' }}>
                      <colgroup>
                        <col style={{ width: `${ROW_LABEL_W}px` }} />
                        {calDays.map((_, i) => <col key={i} />)}
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{ width: `${ROW_LABEL_W}px` }} />
                          {calDays.map((_, idx) => (
                            <th key={idx} style={{
                              textAlign: 'center', fontSize: '9px', fontWeight: '700',
                              color: '#94a3b8', padding: '3px 1px', letterSpacing: '0.2px',
                            }}>{idx + 1}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fryerList.map(fn => (
                          <tr key={fn}>
                            <td style={{
                              fontSize: '11px', fontWeight: '700', color: '#1a428a',
                              paddingRight: '6px', whiteSpace: 'nowrap', verticalAlign: 'middle',
                            }}>
                              {fc > 1 ? `Fryer ${fn}` : 'TPM'}
                            </td>
                            {calDays.map((day, idx) => {
                              const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
                              const dayRecs = (readingsByDate[dateStr] || []).filter(r => (r.fryerNumber || 1) === fn);
                              const r = dayRecs[dayRecs.length - 1] || null;
                              const isFuture = day > today;
                              const missed = !r && !isFuture;
                              const cellIsFresh = r?.oilAge === 1;
                              const cellIsTopUp = r && r.litresFilled > 0 && !cellIsFresh;
                              const cellBorder = cellIsFresh ? '2px solid #10b981' : cellIsTopUp ? '2px solid #f59e0b' : '1px solid #e2e8f0';
                              return (
                                <td key={idx} style={{
                                  height: '40px',
                                  background: r?.tpmValue != null ? cellTpmBg(r.tpmValue) : isFuture ? '#f8fafc' : 'white',
                                  border: cellBorder, borderRadius: '5px',
                                  textAlign: 'center', verticalAlign: 'middle',
                                  opacity: isFuture ? 0.3 : 1,
                                }}>
                                  {r?.tpmValue != null ? (
                                    <span style={{ fontSize: '13px', fontWeight: '800', color: cellTpmCol(r.tpmValue) }}>{r.tpmValue}</span>
                                  ) : missed ? (
                                    <span style={{ fontSize: '8px', color: '#cbd5e1' }}>—</span>
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend — centered */}
                  <div style={{ display: 'flex', gap: '14px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {[
                      { bg: '#d1fae5', color: '#059669', label: '≤14 TPM' },
                      { bg: '#fef3c7', color: '#d97706', label: '15–18 TPM' },
                      { bg: '#fee2e2', color: '#dc2626', label: '>18 TPM' },
                      { border: '2px solid #10b981', label: 'Fresh fill' },
                      { border: '2px solid #f59e0b', label: 'Top-up' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '10px', height: '10px', background: l.bg || 'white', border: l.border || `1px solid ${l.color}44`, borderRadius: '2px' }} />
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── TPM Chart ── */}
            {manageSubTab === 'notes' && (() => {
              const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const activeFryer = calFryerTab;

              if (calDays.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <TrendingUp size={32} color="#cbd5e1" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{venue.trialStatus === 'pipeline' ? 'Chart will appear once the trial starts' : 'No readings recorded yet'}</div>
                </div>
              );

              // Build per-day data for the active fryer
              const chartData = calDays.map(day => {
                const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
                const dayRecs = (readingsByDate[dateStr] || []).filter(r => (r.fryerNumber || 1) === activeFryer);
                const r = dayRecs[dayRecs.length - 1] || null;
                const isFuture = day > today;
                const isFresh = r?.oilAge === 1;
                const litres = r?.litresFilled > 0 ? r.litresFilled : 0;
                return { day, dateStr, r, isFuture, missed: !r && !isFuture, tpm: r?.tpmValue ?? null, litres, isFresh };
              });

              const recordedTPMs = chartData.filter(d => d.tpm != null).map(d => d.tpm);
              const yMax = recordedTPMs.length > 0 ? Math.max(Math.ceil(Math.max(...recordedTPMs) / 5) * 5 + 3, 24) : 24;

              // SVG layout constants — fills container width proportionally
              const CHART_H = 185;
              const TOP_PAD = 44;
              const BOT_PAD = 56;
              const LEFT_PAD = 48;
              const RIGHT_PAD = 24;
              const BAR_W = 40;
              const STEP = 54;
              // On mobile, trim future days so the chart stays compact (no large empty right side)
              const visibleChartData = isDesktop ? chartData : (() => {
                const todayIdx = chartData.findIndex(d => d.dateStr === todayStr);
                const cutoff = todayIdx >= 0 ? Math.min(chartData.length, todayIdx + 3) : chartData.length;
                return chartData.slice(0, cutoff);
              })();
              const N = visibleChartData.length;
              const SVG_W = LEFT_PAD + N * STEP + RIGHT_PAD;
              const SVG_H = TOP_PAD + CHART_H + BOT_PAD;

              const toY = val => TOP_PAD + CHART_H - (val / yMax) * CHART_H;
              const barColor = tpm => tpm == null ? '#e2e8f0' : tpm <= 14 ? '#d1fae5' : tpm <= 18 ? '#fef3c7' : '#fee2e2';
              const barTextColor = tpm => tpm == null ? '#94a3b8' : tpm <= 14 ? '#059669' : tpm <= 18 ? '#d97706' : '#dc2626';

              const yTicks = [];
              for (let v = 0; v <= yMax; v += 5) yTicks.push(v);

              const labelStep = N <= 14 ? 1 : 7;

              return (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', marginBottom: fc > 1 ? '10px' : '0' }}>TPM Chart</div>
                    {fc > 1 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {fryerList.map(fn => (
                          <button key={fn} onClick={() => setCalFryerTab(fn)} style={{
                            padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                            border: '1.5px solid', borderColor: activeFryer === fn ? '#1a428a' : '#e2e8f0',
                            background: activeFryer === fn ? '#1a428a' : 'white',
                            color: activeFryer === fn ? 'white' : '#64748b',
                          }}>Fryer {fn}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chart + Notes panel side by side */}
                  {(() => {
                    const daysWithNotes = chartData
                      .map((d, idx) => ({ idx, note: d.r?.notes, isFuture: d.isFuture, day: d.day }))
                      .filter(d => d.note && !d.isFuture);
                    return (
                  <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: '12px', alignItems: isDesktop ? 'flex-start' : 'stretch' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {/* Legend — centered above chart */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          { bg: '#d1fae5', border: '#059669', label: '≤14 (Good)' },
                          { bg: '#fef3c7', border: '#d97706', label: '15–18 (Caution)' },
                          { bg: '#fee2e2', border: '#dc2626', label: '>18 (Replace)' },
                        ].map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: l.bg, border: `1px solid ${l.border}44`, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
                        {[
                          { color: '#10b981', label: 'Fresh fill' },
                          { color: '#f59e0b', label: 'Top-up' },
                        ].map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', fontFamily: 'Inter, -apple-system, sans-serif', overflow: 'visible', width: '100%' }}>

                      {/* Y-axis gridlines + labels */}
                      {yTicks.map(v => {
                        const y = toY(v);
                        return (
                          <g key={v}>
                            <line x1={LEFT_PAD} y1={y} x2={SVG_W - RIGHT_PAD} y2={y}
                              stroke={v === 0 ? '#d1d5db' : '#f1f5f9'} strokeWidth={1}
                              strokeDasharray={v > 0 ? '3 3' : ''} />
                            <text x={LEFT_PAD - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight="500">{v}</text>
                          </g>
                        );
                      })}

                      {/* TPM threshold reference lines */}
                      <line x1={LEFT_PAD} y1={toY(14)} x2={SVG_W - RIGHT_PAD} y2={toY(14)}
                        stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
                      <line x1={LEFT_PAD} y1={toY(18)} x2={SVG_W - RIGHT_PAD} y2={toY(18)}
                        stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />

                      {/* Bars + bubbles + x-labels */}
                      {visibleChartData.map((d, idx) => {
                        const x = LEFT_PAD + idx * STEP;
                        const cx = x + BAR_W / 2;
                        const barH = d.tpm != null ? Math.max((d.tpm / yMax) * CHART_H, 3) : 0;
                        const barY = TOP_PAD + CHART_H - barH;
                        const color = barColor(d.tpm);
                        const showLabel = idx === 0 || idx === N - 1 || idx % labelStep === 0;
                        const dateLabel = `${d.day.getDate()} ${MONTHS_SHORT[d.day.getMonth()]}`;
                        const BUBBLE_R = 14;

                        return (
                          <g key={idx}>
                            {/* Bar (skip future days) */}
                            {!d.isFuture && (d.tpm != null || d.missed) && (() => {
                              const barIsFresh = d.isFresh;
                              const barIsTopUp = d.litres > 0 && !d.isFresh;
                              const barStroke = barIsFresh ? '#10b981' : barIsTopUp ? '#f59e0b' : 'none';
                              const barSW = (barIsFresh || barIsTopUp) ? 2 : 0;
                              return (
                                <rect
                                  x={x} y={d.missed ? TOP_PAD + CHART_H - 3 : barY}
                                  width={BAR_W} height={d.missed ? 3 : barH}
                                  fill={d.missed ? '#e2e8f0' : color} rx={3}
                                  stroke={barStroke} strokeWidth={barSW}
                                />
                              );
                            })()}

                            {/* TPM value inside tall bars, above short ones */}
                            {d.tpm != null && !d.isFuture && barH > 26 && (
                              <text x={cx} y={barY + 14} textAnchor="middle" fontSize={9} fill={barTextColor(d.tpm)} fontWeight="700">{d.tpm}</text>
                            )}
                            {d.tpm != null && !d.isFuture && barH <= 26 && barH > 0 && (
                              <text x={cx} y={barY - 4} textAnchor="middle" fontSize={9} fill={barTextColor(d.tpm)} fontWeight="700">{d.tpm}</text>
                            )}

                            {/* Litres bubble — single line e.g. "12L" */}
                            {d.litres > 0 && !d.isFuture && (() => {
                              const bubbleY = d.tpm != null ? barY - BUBBLE_R - 5 : TOP_PAD - BUBBLE_R - 2;
                              const bColor = d.isFresh ? '#10b981' : '#f59e0b';
                              return (
                                <g>
                                  <circle cx={cx} cy={bubbleY} r={BUBBLE_R} fill={bColor} />
                                  <text x={cx} y={bubbleY + 3.5} textAnchor="middle" fontSize={9} fill="white" fontWeight="700">{d.litres}L</text>
                                </g>
                              );
                            })()}

                            {/* X-axis date label (rotated) */}
                            {showLabel && (
                              <text
                                x={cx} y={TOP_PAD + CHART_H + 12}
                                textAnchor="end" fontSize={9} fill="#64748b"
                                transform={`rotate(-40, ${cx}, ${TOP_PAD + CHART_H + 12})`}
                              >{dateLabel}</text>
                            )}
                            {/* Day number under date */}
                            <text
                              x={cx} y={TOP_PAD + CHART_H + BOT_PAD - 6}
                              textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight="500"
                            >{idx + 1}</text>
                          </g>
                        );
                      })}

                      {/* Axes */}
                      <line x1={LEFT_PAD} y1={TOP_PAD + CHART_H} x2={SVG_W - RIGHT_PAD} y2={TOP_PAD + CHART_H} stroke="#d1d5db" strokeWidth={1} />
                      <line x1={LEFT_PAD} y1={TOP_PAD} x2={LEFT_PAD} y2={TOP_PAD + CHART_H} stroke="#d1d5db" strokeWidth={1} />
                      {/* Y-axis label */}
                      <text
                        x={10} y={TOP_PAD + CHART_H / 2}
                        textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight="600"
                        transform={`rotate(-90, 10, ${TOP_PAD + CHART_H / 2})`}
                      >TPM</text>
                    </svg>
                    </div>
                    </div>
                    {/* Notes panel */}
                    <div style={{ width: isDesktop ? '300px' : '100%', flexShrink: 0 }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Notes</div>
                      {daysWithNotes.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#cbd5e1', fontStyle: 'italic' }}>No notes recorded</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {daysWithNotes.map(({ idx, note, day }, ni) => {
                            const MNTHS_N = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const dateLabel = day ? `${String(day.getDate()).padStart(2,'0')}-${MNTHS_N[day.getMonth()]}-${String(day.getFullYear()).slice(-2)}` : `D${idx + 1}`;
                            return (
                            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '7px 10px', borderRadius: '7px', background: ni % 2 === 0 ? '#f8fafc' : 'white', border: `1px solid ${ni % 2 === 0 ? '#e8edf3' : '#f1f5f9'}` }}>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: '#1a428a', background: '#eff6ff', borderRadius: '4px', padding: '2px 6px', flexShrink: 0, lineHeight: '1.5', whiteSpace: 'nowrap' }}>{dateLabel}</span>
                              <span style={{ fontSize: '10px', color: '#374151', lineHeight: '1.55', wordBreak: 'break-word' }}>{note}</span>
                            </div>
                          );})}
                        </div>
                      )}
                    </div>
                  </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ── (old Notes tab preserved for reference) ── */}
            {false && manageSubTab === '__notes_disabled' && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px' }}>Notes Timeline</div>
                {renderNotesTimeline(parseNotes())}
                {!isReadOnly && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add Note</div>
                    <textarea
                      value={manageNoteText}
                      onChange={e => setManageNoteText(e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '13px', padding: '8px 10px', width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}
                      placeholder="Add a note..."
                    />
                    <button
                      onClick={async () => {
                        if (!manageNoteText.trim()) return;
                        setManageNoteSaving(true);
                        const todayNote = getTodayString();
                        const newLine = `[Note ${todayNote}] ${manageNoteText.trim()}`;
                        const updatedNotes = venue.trialNotes ? `${venue.trialNotes}\n${newLine}` : newLine;
                        await updateVenue(venue.id, { trialNotes: updatedNotes });
                        setManageNoteText('');
                        setManageNoteSaving(false);
                        setSuccessMsg('Note saved');
                      }}
                      disabled={manageNoteSaving || !manageNoteText.trim()}
                      style={{
                        padding: '6px 14px', background: manageNoteText.trim() ? '#1a428a' : '#e2e8f0',
                        border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                        color: manageNoteText.trim() ? 'white' : '#94a3b8',
                        cursor: manageNoteText.trim() ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      <Save size={12} /> {manageNoteSaving ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Summary Report ── */}
            {manageSubTab === 'summary' && (() => {
              const GOAL_LABELS = {
                'save-money': 'Save money', 'reduce-waste': 'Reduce oil waste',
                'reduce-consumption': 'Reduce consumption',
                'food-quality': 'Better food quality', 'food-colour': 'Improve food colour',
                'reduce-changes': 'Fewer fryer changes', 'simplify-ops': 'Simplify operations',
                'extend-life': 'Extend oil life',
              };
              const GOAL_ICONS = {
                'save-money': DollarSign, 'reduce-waste': Droplets, 'reduce-consumption': Droplets,
                'food-quality': Award, 'food-colour': Palette, 'reduce-changes': Cog,
                'simplify-ops': Cog, 'extend-life': TrendingUp,
              };
              const initialNote = venue.trialNotes
                ? venue.trialNotes.split('\n')
                    .filter(l => { const t = l.trim(); return t && !t.match(/^\[/) && !/TRL-\d+/.test(t); })
                    .join('\n')
                : '';
              const compWklyAvg = preTrialAvg || null;
              // Comma-formatted helpers
              const fmtNum = (v, decimals = 2) => v != null ? parseFloat(v).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : null;
              const fmt$ = v => v != null ? `$${fmtNum(v, 2)}` : '—';
              const fmt$nd = v => v != null ? `$${fmtNum(v, 0)}` : '—';
              const fmtL = v => v != null ? `${parseFloat(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} L` : '—';

              // Shared helpers matching pre-trial tab style
              const secLabel = (text) => (
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '10px', marginTop: '18px' }}>{text}</div>
              );
              const sfld = (label, value, valueColor) => (
                <div key={label}>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: isDesktop ? '13px' : '11px', color: valueColor || '#1f2937', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {(value !== null && value !== undefined && value !== '') ? value : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </div>
                </div>
              );

              // Badge values (same as pretrial tab)
              const compPill = comp ? <CompetitorPill comp={comp} /> : null;
              const compOilBadge = compOil ? <OilBadge oil={compOil} competitors={competitors} compact /> : null;
              const trialOilBadge = cookersOil ? <OilBadge oil={cookersOil} competitors={competitors} compact /> : null;
              const volBadge = venue.volumeBracket ? <VolumePill bracket={venue.volumeBracket} /> : null;

              // Mini calendar helpers (same colour logic as Trial Calendar tab)
              const miniCalBg = tpm => tpm <= 14 ? '#d1fae5' : tpm <= 18 ? '#fef3c7' : '#fee2e2';
              const miniCalCol = tpm => tpm <= 14 ? '#059669' : tpm <= 18 ? '#d97706' : '#dc2626';

              // Yearly litres (kept for comparison table savings row)
              const compYearlyLitres = compWklyAvg ? compWklyAvg * 52 : null;
              const trialYearlyLitres = liveTrialAvg !== null ? liveTrialAvg * 52 : null;

              // Type badge (same as pre-trial tab)
              const isNewProspect = !!comp;
              const typeBadge = isNewProspect
                ? <span style={{ fontSize: '11px', fontWeight: '700', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '6px', padding: '3px 8px' }}>New prospect</span>
                : <span style={{ fontSize: '11px', fontWeight: '700', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 8px' }}>Existing customer</span>;

              // Outcome reason label
              const reasonLabel = venue.trialReason ? (trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason) : null;

              // Trial findings: only [TrialFindings: text] lines (from End Trial modal)
              const trialFindings = venue.trialNotes
                ? venue.trialNotes.split('\n')
                    .flatMap(l => {
                      const t = l.trim();
                      if (t.match(/^\[TrialFindings:/)) {
                        return [t.replace(/^\[TrialFindings:\s*/, '').replace(/\]\s*$/, '').trim()];
                      }
                      return [];
                    })
                    .filter(Boolean)
                    .join('\n')
                : '';

              // Outcome notes: [Successful DATE] / [Unsuccessful DATE] lines (from Close as Successful/Unsuccessful modal)
              // — shown in the Internal Use section, not Trial Findings
              const outcomeNotes = venue.trialNotes
                ? venue.trialNotes.split('\n')
                    .flatMap(l => {
                      const t = l.trim();
                      if (t.match(/^\[(Successful|Unsuccessful)\s+\d{4}-\d{2}-\d{2}\]/)) {
                        return [t.replace(/^\[(?:Successful|Unsuccessful)\s+\d{4}-\d{2}-\d{2}\]\s*/, '').trim()];
                      }
                      return [];
                    })
                    .filter(Boolean)
                    .join('\n')
                : '';

              // Trial outcome: [TrialOutcome: KEY] from trialNotes
              const trialOutcomeValue = (() => {
                const line = (venue.trialNotes || '').split('\n').find(l => l.trim().startsWith('[TrialOutcome:'));
                if (!line) return null;
                return line.replace(/^\[TrialOutcome:\s*/, '').replace(/\].*$/, '').trim();
              })();

              // Section label helper (no top margin — use marginTop inline when needed)
              const rSecLabel = (text, mt = 20) => (
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '10px', marginTop: `${mt}px` }}>{text}</div>
              );

              // Internal use metadata
              const trialCreatedDate = venue.trialCreatedAt ? venue.trialCreatedAt.split('T')[0] : null;
              const lastRecDate = venueReadings.length > 0
                ? venueReadings.reduce((max, r) => r.readingDate > max ? r.readingDate : max, venueReadings[0].readingDate)
                : null;
              const lastEditedDate = venue.updatedAt ? venue.updatedAt.split('T')[0] : null;
              const daysToDecision = venue.trialEndDate && venue.outcomeDate
                ? daysBetween(venue.trialEndDate, venue.outcomeDate)
                : (venue.trialEndDate && venue.trialStatus === 'pending' ? daysBetween(venue.trialEndDate, todayStr) : null);
              const customerCodeSavedDate = venue.customerCodeSavedAt ? venue.customerCodeSavedAt.split('T')[0] : null;
              const daysToCustCode = venue.outcomeDate && customerCodeSavedDate
                ? daysBetween(venue.outcomeDate, customerCodeSavedDate)
                : (venue.outcomeDate && venue.trialStatus === 'accepted' ? daysBetween(venue.outcomeDate, todayStr) : null);

              return (
                <div style={{ padding: isDesktop ? '0 24px' : '0' }}>

                  {/* ── Title ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>Summary Report</div>
                    {trialOutcomeValue && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '8px',
                        background: trialOutcomeValue === 'successful' ? '#d1fae5' : '#fee2e2',
                        border: `1px solid ${trialOutcomeValue === 'successful' ? '#6ee7b7' : '#fca5a5'}`,
                        fontSize: '12px', fontWeight: '700',
                        color: trialOutcomeValue === 'successful' ? '#059669' : '#dc2626',
                      }}>
                        {trialOutcomeValue === 'successful' ? <Trophy size={12} /> : <AlertTriangle size={12} />}
                        {trialOutcomeValue.charAt(0).toUpperCase() + trialOutcomeValue.slice(1)}
                      </div>
                    )}
                  </div>

                  {/* ── GRID 1: details left | notes + findings right ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '0' }}>

                    {/* Left: details grid */}
                    <div style={{
                      paddingRight: isDesktop ? '28px' : '0',
                      borderRight: isDesktop ? '1px solid #f0f4f8' : 'none',
                      borderBottom: isDesktop ? 'none' : '1px solid #f0f4f8',
                      paddingBottom: isDesktop ? '0' : '20px',
                      marginBottom: isDesktop ? '0' : '20px',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px' }}>
                        {/* Row 1: Venue name (spans all 3 cols) */}
                        <div style={{ gridColumn: 'span 3' }}>
                          <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Venue name</div>
                          <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '600' }}>{venue.name || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                        </div>
                        {/* Row 2: Current supplier | Current oil | Trial oil */}
                        {sfld('Current supplier', compPill || <span style={{ color: '#1a428a', fontWeight: '700' }}>Cookers</span>)}
                        {sfld('Current oil', compOilBadge)}
                        {sfld('Trial oil', trialOilBadge)}
                        {/* Row 3: Fryer count | Current price/L | Offered price/L */}
                        {sfld('Fryer count', fc ? String(fc) : null)}
                        {sfld('Current price / L', venue.currentPricePerLitre ? fmt$(venue.currentPricePerLitre) : null)}
                        {sfld('Offered price / L', venue.offeredPricePerLitre ? fmt$(venue.offeredPricePerLitre) : null)}
                        {/* Row 4: Vol bracket | Pre-trial weekly avg | Trial weekly avg */}
                        {sfld('Vol bracket', volBadge)}
                        {sfld('Pre-trial weekly avg', preTrialAvg ? fmtL(preTrialAvg) : null)}
                        {sfld('Trial weekly avg', liveTrialAvg !== null ? fmtL(liveTrialAvg) : null)}
                        {/* Row 5: Total trial litres | Pre-trial oil lifespan | Trial oil lifespan */}
                        {sfld('Total trial litres', totalTrialLitres > 0 ? fmtL(Math.round(totalTrialLitres * 10) / 10) : null)}
                        {sfld('Pre-trial oil lifespan', fryerChangesPerWeek ? `${fryerChangesPerWeek} days` : null)}
                        {sfld('Trial oil lifespan', maxOilLifespan ? `${maxOilLifespan} days` : null)}
                      </div>
                      {/* Row 6: Start / End / Duration — temporal context, visually separated */}
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1.5px dashed #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px' }}>
                        {[
                          { label: 'Start', value: displayDate(venue.trialStartDate) },
                          { label: 'End', value: venue.trialEndDate ? displayDate(venue.trialEndDate) : 'Ongoing' },
                          { label: 'Duration', value: trialDuration > 0 ? `${trialDuration} days` : null },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
                            <div style={{ fontSize: isDesktop ? '13px' : '11px', color: '#1f2937', fontWeight: '600' }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: what we know + findings */}
                    <div style={{ paddingLeft: isDesktop ? '28px' : '0', paddingTop: isDesktop ? '0' : '4px' }}>
                      {rSecLabel('What do we know going into this trial?', 0)}
                      {initialNote
                        ? <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', margin: '0 0 4px 0', whiteSpace: 'pre-wrap' }}>{initialNote}</p>
                        : <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0 0 4px 0' }}>No notes entered.</p>
                      }
                      {rSecLabel('Trial Findings')}
                      {summaryEditMode ? (
                        <>
                          <textarea
                            value={summaryFindingsText}
                            onChange={e => setSummaryFindingsText(e.target.value)}
                            rows={6}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '7px', fontSize: '13px', color: '#1f2937', resize: 'vertical', lineHeight: 1.6 }}
                            placeholder="Trial findings..."
                          />
                          <button onClick={async () => {
                            const existingLines = (venue.trialNotes || '').split('\n');
                            const nonFindingLines = existingLines.filter(l => !l.trim().match(/^\[TrialFindings:/));
                            const newFindingLines = summaryFindingsText.trim()
                              ? summaryFindingsText.split('\n').filter(l => l.trim()).map(t => `[TrialFindings: ${t.trim()}]`)
                              : [];
                            const newNotes = [...nonFindingLines, ...newFindingLines].join('\n').trim();
                            await updateVenue(venue.id, { trialNotes: newNotes });
                            setSummaryEditMode(false);
                          }} style={{ marginTop: '8px', padding: '6px 14px', background: '#1a428a', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                            Save Findings
                          </button>
                        </>
                      ) : (
                        trialFindings
                          ? <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', margin: '0 0 4px 0', whiteSpace: 'pre-wrap' }}>{trialFindings}</p>
                          : <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0 0 4px 0' }}>No trial findings recorded.</p>
                      )}
                    </div>
                  </div>

                  {/* ── Divider ── */}
                  <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0 20px 0' }} />

                  {/* ── GRID 2: comparison left | goals right ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '0' }}>

                    {/* Left: comparison table — on mobile appears SECOND (after goals) */}
                    <div style={{
                      paddingRight: isDesktop ? '28px' : '0',
                      borderRight: isDesktop ? '1px solid #f0f4f8' : 'none',
                      borderBottom: 'none',
                      paddingBottom: '0',
                      marginBottom: '0',
                      order: isDesktop ? 0 : 1,
                    }}>
                      {(compWklyAvg || liveTrialAvg !== null) ? (
                        !isDesktop ? (
                          /* ── Mobile: transposed table (metrics as rows) ── */
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Metric</th>
                                  <th style={{ padding: '6px 8px', fontSize: '9px', fontWeight: '700', color: '#64748b', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                                    {compOilBadge ? <span style={{ display: 'inline-block', transform: 'scale(0.85)', transformOrigin: 'center' }}>{compOilBadge}</span> : <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{compOilName || 'Current'}</span>}
                                  </th>
                                  <th style={{ padding: '6px 8px', fontSize: '9px', fontWeight: '700', color: '#1d4ed8', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: '#eff6ff' }}>
                                    {trialOilBadge ? <span style={{ display: 'inline-block', transform: 'scale(0.85)', transformOrigin: 'center' }}>{trialOilBadge}</span> : <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{trialOilName || 'Trial'}</span>}
                                  </th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Difference</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: 'Price / L',   comp: currentPrice ? fmt$(currentPrice) : '—',       trial: trialPrice ? fmt$(trialPrice) : '—',                              diff: null, diffColor: null },
                                  { label: 'Litres / Wk', comp: compWklyAvg ? fmtL(compWklyAvg) : '—',          trial: liveTrialAvg !== null ? fmtL(liveTrialAvg) : '—',                 diff: weekLitres != null ? `${Math.round(Math.abs(weekLitres)).toLocaleString('en-AU')} L` : '—',   diffColor: weekLitres != null ? (weekLitres >= 0 ? '#059669' : '#dc2626') : '#94a3b8' },
                                  { label: 'Litres / Yr', comp: compYearlyLitres ? fmtL(compYearlyLitres) : '—', trial: trialYearlyLitres !== null ? fmtL(trialYearlyLitres) : '—',      diff: annualLitres != null ? `${Math.round(Math.abs(annualLitres)).toLocaleString('en-AU')} L` : '—', diffColor: annualLitres != null ? (annualLitres >= 0 ? '#059669' : '#dc2626') : '#94a3b8' },
                                  { label: 'Cost / Wk',   comp: compWeeklySpend != null ? fmt$nd(compWeeklySpend) : '—', trial: trialWeeklySpend != null ? fmt$nd(trialWeeklySpend) : '—',   diff: weekSpend != null ? `$${Math.round(Math.abs(weekSpend)).toLocaleString('en-AU')}` : '—', diffColor: weekSpend != null ? (weekSpend >= 0 ? '#059669' : '#dc2626') : '#94a3b8' },
                                  { label: 'Cost / Yr',   comp: compYearlySpend != null ? fmt$nd(compYearlySpend) : '—', trial: trialYearlySpend != null ? fmt$nd(trialYearlySpend) : '—',   diff: annualSpend != null ? `$${Math.round(Math.abs(annualSpend)).toLocaleString('en-AU')}` : '—', diffColor: annualSpend != null ? (annualSpend >= 0 ? '#059669' : '#dc2626') : '#94a3b8' },
                                ].map((row, i, arr) => (
                                  <tr key={row.label} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                                    <td style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '600', color: '#64748b', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>{row.label}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>{row.comp}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>{row.trial}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none', color: row.diffColor || '#94a3b8' }}>{row.diff ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          /* ── Desktop: original wide table ── */
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', tableLayout: 'fixed' }}>
                              <colgroup>
                                <col style={{ width: '115px' }} />
                                <col /><col /><col /><col /><col />
                              </colgroup>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th colSpan={2} style={{ padding: '4px 10px', borderBottom: '1px solid #f0f4f8' }} />
                                  <th colSpan={2} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', borderBottom: '1px solid #f0f4f8', borderLeft: '1px solid #e2e8f0' }}>Weekly</th>
                                  <th colSpan={2} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', borderBottom: '1px solid #f0f4f8', borderLeft: '1px solid #e2e8f0' }}>Yearly</th>
                                </tr>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Comparison</th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Price / L</th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0' }}>Litres</th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Cost</th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', borderLeft: '1px solid #e2e8f0' }}>Litres</th>
                                  <th style={{ padding: '8px 10px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ background: 'white' }}>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                    {compOilBadge || <span style={{ fontSize: '11px', color: '#64748b' }}>{compOilName || '—'}</span>}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{currentPrice ? fmt$(currentPrice) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f0f4f8' }}>{compWklyAvg ? fmtL(compWklyAvg) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{compWeeklySpend != null ? fmt$nd(compWeeklySpend) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f0f4f8' }}>{compYearlyLitres ? fmtL(compYearlyLitres) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{compYearlySpend != null ? fmt$nd(compYearlySpend) : '—'}</td>
                                </tr>
                                <tr style={{ background: 'white' }}>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                                    {trialOilBadge || <span style={{ fontSize: '11px', color: '#1f2937' }}>{trialOilName || '—'}</span>}
                                  </td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{trialPrice ? fmt$(trialPrice) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f0f4f8' }}>{liveTrialAvg !== null ? fmtL(liveTrialAvg) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{trialWeeklySpend != null ? fmt$nd(trialWeeklySpend) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f0f4f8' }}>{trialYearlyLitres !== null ? fmtL(trialYearlyLitres) : '—'}</td>
                                  <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{trialYearlySpend != null ? fmt$nd(trialYearlySpend) : '—'}</td>
                                </tr>
                                {weekSpend !== null && (
                                  <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={2} style={{ padding: '8px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Difference</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', color: weekLitres >= 0 ? '#059669' : '#dc2626', borderLeft: '1px solid #f0f4f8' }}>
                                      {weekLitres != null ? `${Math.round(Math.abs(weekLitres)).toLocaleString('en-AU')} L` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', color: weekSpend >= 0 ? '#059669' : '#dc2626' }}>
                                      {weekSpend != null ? `$${Math.round(Math.abs(weekSpend)).toLocaleString('en-AU')}` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', color: annualLitres >= 0 ? '#059669' : '#dc2626', borderLeft: '1px solid #f0f4f8' }}>
                                      {annualLitres != null ? `${Math.round(Math.abs(annualLitres)).toLocaleString('en-AU')} L` : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', fontWeight: '700', textAlign: 'right', color: annualSpend >= 0 ? '#059669' : '#dc2626' }}>
                                      {annualSpend != null ? `$${Math.round(Math.abs(annualSpend)).toLocaleString('en-AU')}` : '—'}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Comparison data will appear once readings are recorded.</div>
                      )}
                    </div>

                    {/* Right: goals — on mobile appears FIRST (above comparison) */}
                    <div style={{ paddingLeft: isDesktop ? '28px' : '0', paddingTop: isDesktop ? '0' : '4px', paddingBottom: isDesktop ? '0' : '20px', marginBottom: isDesktop ? '0' : '20px', borderBottom: isDesktop ? 'none' : '1px solid #f0f4f8', order: isDesktop ? 0 : 0 }}>
                      {rSecLabel('Trial Goals Achieved', 0)}
                      {trialGoalsList.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          {trialGoalsList.map(g => {
                            const GoalIcon = GOAL_ICONS[g];
                            const achieved = achievedGoals.includes(g);
                            return (
                              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: '#f0f7ff', border: '1px solid #dbeafe' }}>
                                <div style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {GoalIcon ? <GoalIcon size={14} color="#1a428a" /> : null}
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: '500', color: '#1e3a6e', flex: 1 }}>{GOAL_LABELS[g] || g}</span>
                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, background: achieved ? '#f59e0b' : 'transparent', border: achieved ? '2px solid #f59e0b' : '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {achieved && <Check size={11} color="white" strokeWidth={3} />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: '0' }}>No goals selected.</p>
                      )}
                    </div>
                  </div>

                  {/* ── Second divider ── */}
                  <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0 20px 0' }} />

                  {/* ── Per-Fryer Trial Stats ── */}
                  {allTrialReadings.length > 0 && (() => {
                    const fc2 = Math.max(1, venue.fryerCount || 1);
                    const pfRows = Array.from({ length: fc2 }, (_, i) => {
                      const fn = i + 1;
                      const fryerVol = (venue.fryerVolumes || {})[fn] ?? (venue.fryerVolumes || {})[String(fn)];
                      const frdgs = allTrialReadings.filter(r => (Number(r.fryerNumber) || 1) === fn);

                      const freshRdgs = frdgs.filter(r => Number(r.oilAge) === 1);
                      const freshCount = freshRdgs.length;
                      const freshLitres = freshRdgs.reduce((s, r) => s + (parseFloat(r.litresFilled) || 0), 0);

                      const topUpRdgs = frdgs.filter(r => Number(r.oilAge) > 1 && (parseFloat(r.litresFilled) || 0) > 0);
                      const topUpCount = topUpRdgs.length;
                      const topUpLitres = topUpRdgs.reduce((s, r) => s + (parseFloat(r.litresFilled) || 0), 0);
                      const totalLitres = freshLitres + topUpLitres;

                      const tpmVals = frdgs.filter(r => parseFloat(r.tpmValue) > 0).map(r => parseFloat(r.tpmValue));
                      const minTPM = tpmVals.length > 0 ? Math.min(...tpmVals) : null;
                      const maxTPM = tpmVals.length > 0 ? Math.max(...tpmVals) : null;
                      const avgTPM = tpmVals.length > 0 ? Math.round(tpmVals.reduce((a, b) => a + b, 0) / tpmVals.length * 10) / 10 : null;

                      const varVals = frdgs
                        .filter(r => r.setTemperature != null && r.actualTemperature != null && String(r.setTemperature) !== '' && String(r.actualTemperature) !== '')
                        .map(r => Math.abs(parseFloat(r.setTemperature) - parseFloat(r.actualTemperature)));
                      const avgTempVar = varVals.length > 0 ? Math.round(varVals.reduce((a, b) => a + b, 0) / varVals.length * 10) / 10 : null;

                      // Oil lifespan: group readings into runs (each run starts at oilAge===1),
                      // then take max oilAge per run = duration of that oil load.
                      // This matches how the top-section "Trial Oil Lifespan" is calculated.
                      const frdgsSorted = [...frdgs].sort((a, b) => a.readingDate.localeCompare(b.readingDate));
                      const runs = [];
                      let curRun = [];
                      for (const r of frdgsSorted) {
                        const age = Number(r.oilAge);
                        if (age === 1 && curRun.length > 0) { runs.push(curRun); curRun = [r]; }
                        else if (age >= 1) curRun.push(r);
                      }
                      if (curRun.length > 0) runs.push(curRun);
                      const lifespans = runs.map(run => Math.max(...run.map(r => Number(r.oilAge))));
                      const minLife = lifespans.length > 0 ? Math.min(...lifespans) : null;
                      const maxLife = lifespans.length > 0 ? Math.max(...lifespans) : null;
                      const avgLife = lifespans.length > 0 ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) : null;

                      const minTempVar = varVals.length > 0 ? Math.round(Math.min(...varVals) * 10) / 10 : null;
                      const maxTempVar = varVals.length > 0 ? Math.round(Math.max(...varVals) * 10) / 10 : null;

                      return { fn, fryerVol, freshCount, freshLitres, topUpCount, topUpLitres, totalLitres, minTPM, maxTPM, avgTPM, minTempVar, maxTempVar, avgTempVar, minLife, maxLife, avgLife };
                    });

                    const pfTh = (extra = {}) => ({ padding: '4px 6px', fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', whiteSpace: 'nowrap', ...extra });
                    const pfTd = (hasVal, extra = {}) => ({ padding: '5px 6px', textAlign: 'center', fontSize: '11px', borderBottom: '1px solid #f1f5f9', color: hasVal ? '#374151' : '#cbd5e1', ...extra });
                    const pfN = (v, d = 0, suffix = '') => v != null ? `${d > 0 ? Number(v).toFixed(d) : Math.round(v)}${suffix}` : '—';
                    const pfL = (v) => v > 0 ? `${Math.round(v * 10) / 10}L` : '—';
                    const tpmCol = (v) => v == null ? '#cbd5e1' : v <= 14 ? '#059669' : v <= 18 ? '#d97706' : '#dc2626';
                    const varCol = (v) => v == null ? '#cbd5e1' : v === 0 ? '#059669' : v <= 5 ? '#d97706' : '#dc2626';

                    return (
                      <>
                        {rSecLabel('Fryer Trial Stats', 0)}
                        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', tableLayout: 'fixed' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc' }}>
                                <th rowSpan={2} style={{ ...pfTh({ textAlign: 'left', verticalAlign: 'bottom', borderBottom: '1px solid #e2e8f0', paddingLeft: '10px' }) }}>Fryer</th>
                                <th rowSpan={2} style={{ ...pfTh({ verticalAlign: 'bottom', borderBottom: '1px solid #e2e8f0' }) }}>Vol</th>
                                <th colSpan={5} style={{ ...pfTh({ color: '#64748b', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e8edf2', paddingBottom: '2px' }) }}>Fills</th>
                                <th colSpan={3} style={{ ...pfTh({ color: '#64748b', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e8edf2', paddingBottom: '2px' }) }}>TPM</th>
                                <th colSpan={3} style={{ ...pfTh({ color: '#64748b', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e8edf2', paddingBottom: '2px' }) }}>Temp Variance</th>
                                <th colSpan={3} style={{ ...pfTh({ color: '#64748b', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e8edf2', paddingBottom: '2px' }) }}>Oil Lifespan (days)</th>
                              </tr>
                              <tr style={{ background: '#f8fafc' }}>
                                <th style={{ ...pfTh({ borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }) }}>Fresh #</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Fresh L</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Top Up #</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Top Up L</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Total L</th>
                                <th style={{ ...pfTh({ borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }) }}>Min</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Max</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Avg</th>
                                <th style={{ ...pfTh({ borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }) }}>Min</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Max</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Avg</th>
                                <th style={{ ...pfTh({ borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }) }}>Min</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Max</th>
                                <th style={{ ...pfTh({ borderBottom: '1px solid #e2e8f0' }) }}>Avg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pfRows.map((row, i) => (
                                <tr key={row.fn} style={{ background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                                  <td style={{ padding: '5px 10px', color: '#374151', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Fryer {row.fn}</td>
                                  <td style={pfTd(!!row.fryerVol)}>{row.fryerVol ? `${row.fryerVol}L` : '—'}</td>
                                  <td style={pfTd(row.freshCount > 0, { borderLeft: '1px solid #f0f4f8' })}>{row.freshCount > 0 ? row.freshCount : '—'}</td>
                                  <td style={pfTd(row.freshLitres > 0)}>{pfL(row.freshLitres)}</td>
                                  <td style={pfTd(row.topUpCount > 0)}>{row.topUpCount > 0 ? row.topUpCount : '—'}</td>
                                  <td style={pfTd(row.topUpLitres > 0)}>{pfL(row.topUpLitres)}</td>
                                  <td style={{ ...pfTd(row.totalLitres > 0), fontWeight: row.totalLitres > 0 ? '600' : '400' }}>{pfL(row.totalLitres)}</td>
                                  <td style={{ ...pfTd(row.minTPM != null, { borderLeft: '1px solid #f0f4f8' }), color: tpmCol(row.minTPM), fontWeight: row.minTPM != null ? '600' : '400' }}>{pfN(row.minTPM)}</td>
                                  <td style={{ ...pfTd(row.maxTPM != null), color: tpmCol(row.maxTPM), fontWeight: row.maxTPM != null ? '600' : '400' }}>{pfN(row.maxTPM)}</td>
                                  <td style={{ ...pfTd(row.avgTPM != null), color: tpmCol(row.avgTPM), fontWeight: row.avgTPM != null ? '700' : '400' }}>{pfN(row.avgTPM)}</td>
                                  <td style={{ ...pfTd(row.minTempVar != null, { borderLeft: '1px solid #f0f4f8' }), color: varCol(row.minTempVar), fontWeight: row.minTempVar != null ? '600' : '400' }}>{pfN(row.minTempVar, 1, '°')}</td>
                                  <td style={{ ...pfTd(row.maxTempVar != null), color: varCol(row.maxTempVar), fontWeight: row.maxTempVar != null ? '600' : '400' }}>{pfN(row.maxTempVar, 1, '°')}</td>
                                  <td style={{ ...pfTd(row.avgTempVar != null), color: varCol(row.avgTempVar), fontWeight: row.avgTempVar != null ? '700' : '400' }}>{pfN(row.avgTempVar, 1, '°')}</td>
                                  <td style={pfTd(row.minLife != null, { borderLeft: '1px solid #f0f4f8' })}>{pfN(row.minLife)}</td>
                                  <td style={pfTd(row.maxLife != null)}>{pfN(row.maxLife)}</td>
                                  <td style={{ ...pfTd(row.avgLife != null), fontWeight: row.avgLife != null ? '600' : '400' }}>{pfN(row.avgLife)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}

                  {/* ── Bottom: Internal Use section ── */}
                  <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
                    {/* Header row — edit button on right */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '12px' }}>
                      <button
                        onClick={() => { if (!summaryEditMode) setSummaryFindingsText(trialFindings); setSummaryEditMode(prev => !prev); }}
                        style={{ background: 'none', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: '600', color: summaryEditMode ? '#dc2626' : '#1a428a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Edit3 size={12} /> {summaryEditMode ? 'Cancel Edit' : 'Edit Findings'}
                      </button>
                    </div>

                    {/* Metadata grid — 4 columns, 2 rows */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 20px' }}>
                      {[
                        { label: 'Type', value: typeBadge },
                        { label: 'Status', value: <TrialStatusBadge status={venue.trialStatus} /> },
                        { label: 'Decision date', value: venue.outcomeDate ? displayDate(venue.outcomeDate) : null },
                        { label: 'Days to decision', value: daysToDecision !== null ? `${daysToDecision} days` : null },
                        { label: 'Sold price / L', value: venue.soldPricePerLitre ? `$${parseFloat(venue.soldPricePerLitre).toFixed(2)}` : null },
                        { label: 'Outcome reason', value: reasonLabel || null },
                        { label: 'Customer code', value: venue.customerCode || null },
                        { label: 'Days to cust code', value: daysToCustCode !== null ? `${daysToCustCode} days` : null },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
                          <div style={{ fontSize: isDesktop ? '13px' : '11px', fontWeight: '600', color: '#1f2937', display: 'flex', alignItems: 'center' }}>
                            {value !== null && value !== undefined ? value : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Outcome notes — from Close as Successful/Unsuccessful modal */}
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f0f4f8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Outcome Notes</div>
                        <button
                          onClick={() => { if (!summaryOutcomeEditMode) setSummaryOutcomeText(outcomeNotes); setSummaryOutcomeEditMode(prev => !prev); }}
                          style={{ background: 'none', border: '1.5px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', fontWeight: '600', color: summaryOutcomeEditMode ? '#dc2626' : '#1a428a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                        >
                          <Edit3 size={10} /> {summaryOutcomeEditMode ? 'Cancel' : 'Edit'}
                        </button>
                      </div>
                      {summaryOutcomeEditMode ? (
                        <>
                          <textarea
                            value={summaryOutcomeText}
                            onChange={e => setSummaryOutcomeText(e.target.value)}
                            rows={3}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '7px', fontSize: '13px', color: '#1f2937', resize: 'vertical', lineHeight: 1.6 }}
                            placeholder="Outcome notes..."
                          />
                          <button onClick={async () => {
                            const existingLines = (venue.trialNotes || '').split('\n');
                            const existingOutcomeLine = existingLines.find(l => l.trim().match(/^\[(Successful|Unsuccessful)\s+\d{4}-\d{2}-\d{2}\]/));
                            const outcomePrefix = existingOutcomeLine
                              ? existingOutcomeLine.trim().match(/^\[(?:Successful|Unsuccessful)\s+\d{4}-\d{2}-\d{2}\]/)[0]
                              : `[${venue.trialStatus === 'accepted' ? 'Successful' : 'Unsuccessful'} ${getTodayString()}]`;
                            const nonOutcomeLines = existingLines.filter(l => !l.trim().match(/^\[(Successful|Unsuccessful)\s+\d{4}-\d{2}-\d{2}\]/));
                            const newOutcomeLines = summaryOutcomeText.trim()
                              ? summaryOutcomeText.split('\n').filter(l => l.trim()).map(t => `${outcomePrefix} ${t.trim()}`)
                              : [];
                            const newNotes = [...nonOutcomeLines, ...newOutcomeLines].join('\n').trim();
                            await updateVenue(venue.id, { trialNotes: newNotes });
                            setSummaryOutcomeEditMode(false);
                          }} style={{ marginTop: '6px', padding: '5px 12px', background: '#1a428a', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                            Save Notes
                          </button>
                        </>
                      ) : outcomeNotes ? (
                        <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{outcomeNotes}</div>
                      ) : (
                        <p style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', margin: 0 }}>No outcome notes.</p>
                      )}
                    </div>

                    {/* Customer code input — only for accepted status */}
                    {venue.trialStatus === 'accepted' && (
                      <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Enter Customer Code</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input type="text" value={summaryCustCode} onChange={e => setSummaryCustCode(e.target.value)} placeholder="e.g. CKR-0123"
                            style={{ width: '180px', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', fontWeight: '600', color: '#1f2937', outline: 'none' }} />
                          <button onClick={() => { if (summaryCustCode.trim()) { handleSaveCustomerCode(venue.id, summaryCustCode.trim()); setSummaryCustCode(''); } }}
                            style={{ padding: '7px 14px', background: summaryCustCode.trim() ? '#1a428a' : '#e2e8f0', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: summaryCustCode.trim() ? 'white' : '#94a3b8', cursor: summaryCustCode.trim() ? 'pointer' : 'not-allowed' }}>
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Footer — created / last recording / last edited as small grey text */}
                    <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f0f4f8', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'Created', value: trialCreatedDate ? displayDate(trialCreatedDate) : null },
                        { label: 'Last recording', value: lastRecDate ? displayDate(lastRecDate) : null },
                        { label: 'Last edited', value: lastEditedDate ? displayDate(lastEditedDate) : null },
                      ].filter(f => f.value).map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>{label}:</span>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ height: '20px' }} />
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard(isDesktop ? 'all' : 'stats');
      case 'actions':
        return renderDashboard('actions');
      case 'pipeline': {
        const sorted = sortList(pipelineTrials);
        return (
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
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
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
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
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
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
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
            {acceptedTrials.length === 0
              ? emptyState(ClipboardList, 'No trials awaiting codes', 'Accepted trials needing a customer code will appear here')
              : isTableView ? renderTrialTable(acceptedTrials, 'accepted')
              : <>{renderSortBar(sorted.length, 'accepted trial')}{sorted.map(v => renderAcceptedCard(v))}</>
            }
          </div>
        );
      }
      case 'successful': {
        const sorted = sortList(wonTrials);
        return (
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
            {wonTrials.length === 0
              ? emptyState(Trophy, 'No successful trials yet', 'Won trials will appear here')
              : isTableView ? renderTrialTable(wonTrials, 'successful')
              : <>{renderSortBar(sorted.length, 'successful trial')}{sorted.map(v => renderArchiveCard(v))}</>
            }
          </div>
        );
      }
      case 'unsuccessful': {
        const sorted = sortList(lostTrials);
        return (
          <div style={isTableView ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}}>
            {lostTrials.length === 0
              ? emptyState(XCircle, 'No unsuccessful trials', 'Lost trials will appear here')
              : isTableView ? renderTrialTable(lostTrials, 'unsuccessful')
              : <>{renderSortBar(sorted.length, 'unsuccessful trial')}{sorted.map(v => renderArchiveCard(v))}</>
            }
          </div>
        );
      }
      case 'new':
        return renderNewTrialForm();
      case 'manage':
        return renderManageTrial();
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
    { id: 'pending', label: 'Pending', icon: AlertTriangle, count: pendingOutcomeTrials.length },
    { id: 'accepted', label: 'Accepted', icon: ClipboardList, count: acceptedTrials.length, color: '#f59e0b' },
  ];
  const ARCHIVE_ITEMS = [
    { id: 'successful', label: 'Successful', icon: Trophy, count: wonTrials.length, color: '#10b981' },
    { id: 'unsuccessful', label: 'Unsuccessful', icon: XCircle, count: lostTrials.length, color: '#ef4444' },
  ];

  // ── Mobile nav helpers ──
  const TRIAL_TAB_IDS = ['pipeline', 'active', 'pending', 'accepted', 'successful', 'unsuccessful'];
  const isTrialsTab = TRIAL_TAB_IDS.includes(activeTab);
  const totalTrialsCount = pipelineTrials.length + activeTrials.length + pendingOutcomeTrials.length + acceptedTrials.length + wonTrials.length + lostTrials.length;
  const TRIAL_SUB_TABS = [
    { id: 'pipeline', label: 'Pipeline', icon: Clock, count: pipelineTrials.length },
    { id: 'active', label: 'Active', icon: Play, count: activeTrials.length },
    { id: 'pending', label: 'Pending', icon: AlertTriangle, count: pendingOutcomeTrials.length },
    { id: 'accepted', label: 'Accepted', icon: ClipboardList, count: acceptedTrials.length, color: '#f59e0b' },
    { id: 'successful', label: 'Successful', icon: Trophy, count: wonTrials.length, color: '#10b981' },
    { id: 'unsuccessful', label: 'Unsuccessful', icon: XCircle, count: lostTrials.length, color: '#ef4444' },
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
        @keyframes cookersPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.92; }
        }
        button, input, select, textarea { font-family: inherit; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .bdm-scroll::-webkit-scrollbar { width: 4px; }
        .bdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .bdm-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; transition: background 0.2s; }
        .bdm-scroll:hover::-webkit-scrollbar-thumb { background: #d1d5db; }
        .bdm-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
        .bdm-scroll:hover { scrollbar-color: #d1d5db transparent; }
        .bdm-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .bdm-table thead th { position: sticky; top: 0; z-index: 20; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.3px; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
        .bdm-table tbody tr { transition: background 0.1s; }
        .bdm-table tbody tr:hover { background: #eef2ff; }
        .bdm-table tbody td { padding: 7px 8px; font-size: 12px; color: #1f2937; border-bottom: 1px solid #f1f5f9; vertical-align: middle; white-space: nowrap; }
        .bdm-table-sm thead th { padding: 5px 4px !important; font-size: 9px !important; }
        .bdm-table-sm tbody td { padding: 5px 4px !important; font-size: 10px !important; }
        .bdm-table-sm tbody td .bdm-badge-wrap { transform: scale(0.82); transform-origin: center; display: inline-block; }
        .bdm-table-sm tbody td .bdm-badge-wrap-supplier { transform: scale(0.72); transform-origin: center; display: inline-block; }
        .bdm-table-archive thead th { padding: 4px 5px !important; font-size: 9px !important; }
        .bdm-table-archive tbody td { padding: 4px 5px !important; font-size: 10px !important; }
        .bdm-table-archive thead th:first-child { padding: 0 !important; width: 6px !important; min-width: 6px !important; max-width: 6px !important; }
        .bdm-table-archive tbody td:first-child { padding: 0 !important; width: 6px !important; min-width: 6px !important; max-width: 6px !important; }
        .bdm-table-archive tbody td > span { display: inline-block; transform: scale(0.82); transform-origin: center; }
        .bdm-row-btn { padding: 10px 16px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; background: white; width: 100%; transition: all 0.15s; }
        .bdm-row-btn:hover { background: #eef2ff; color: #1a428a; border-color: #c7d2fe; }
        .bdm-log-back-btn:hover { background: #f1f5f9; color: #374151; border-color: #cbd5e1; }
        .bdm-log-save-btn:hover { background: #143270 !important; }
        .bdm-row-btn.green:hover { background: #10b981; color: white; border-color: #10b981; }
        .bdm-row-btn.red:hover { background: #ef4444; color: white; border-color: #ef4444; }
        .bdm-undo-btn { padding: 4px 8px; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: 11px; font-weight: 600; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 4px; background: white; transition: all 0.15s; }
        .bdm-undo-btn:hover { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
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
              }}>BDM</span>
            </div>
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
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
                }}>BDM</span>
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
              {/* Core section — New Trial + Dashboard */}
              <div style={{ background: '#f0f4fa', borderRadius: '10px', padding: '6px', marginBottom: '14px' }}>
                {/* New Trial — prominent CTA */}
                <button onClick={() => { setActiveTab('new'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px',
                  padding: '11px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  marginBottom: '4px', transition: 'all 0.15s',
                  background: activeTab === 'new' ? COLORS.brand : '#f5a623',
                  color: 'white',
                  fontWeight: '700', fontSize: '13px', letterSpacing: '0.2px',
                  boxShadow: activeTab === 'new' ? 'none' : '0 2px 8px rgba(245,166,35,0.3)',
                }}>
                  <Plus size={16} strokeWidth={2.5} />
                  New Trial
                </button>

                {/* Dashboard */}
                {(() => {
                  const isActive = activeTab === 'dashboard';
                  return (
                    <button onClick={() => { setActiveTab('dashboard'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '2px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#1a428a' : 'transparent',
                      color: isActive ? 'white' : '#1a428a',
                      fontWeight: '600', fontSize: '13px',
                    }}>
                      <BarChart3 size={17} color={isActive ? 'white' : '#1a428a'} />
                      Dashboard
                    </button>
                  );
                })()}
                {/* Manage Trial */}
                {(() => {
                  const isActive = activeTab === 'manage';
                  return (
                    <button onClick={() => { setActiveTab('manage'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '2px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#1a428a' : 'transparent',
                      color: isActive ? 'white' : '#1a428a',
                      fontWeight: '600', fontSize: '13px',
                    }}>
                      <Edit3 size={17} color={isActive ? 'white' : '#1a428a'} />
                      Manage Trial
                    </button>
                  );
                })()}
              </div>

              {/* Trials section */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Trials</div>
                {NAV_ITEMS.map(tab => {
                  const isActive = activeTab === tab.id;
                  const activeColor = tab.color || COLORS.brand;
                  return (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
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
              </div>

              {/* Archive section */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>Archive</div>
                {ARCHIVE_ITEMS.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
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
          <div className="bdm-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              ...(isDesktop
                ? { padding: '20px 16px 40px' }
                : { maxWidth: '760px', margin: '0 auto', padding: '20px 16px 40px' }),
              ...(['dashboard', 'actions', 'pipeline', 'active', 'pipeline', 'accepted', 'manage', 'successful', 'unsuccessful'].includes(activeTab) ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}),
            }}>
              {renderTabContent()}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Mobile: Row 1 — Main tabs ── */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 100,
            transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden',
            width: '100%', background: 'white', borderBottom: isTrialsTab ? 'none' : '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', borderBottom: isTrialsTab ? '1px solid #f1f5f9' : 'none' }}>
              {/* + New */}
              <button onClick={() => { setActiveTab('new'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '10px 4px 8px', border: 'none', background: 'transparent',
                borderBottom: activeTab === 'new' ? '3px solid #f5a623' : '3px solid transparent',
                color: activeTab === 'new' ? '#f5a623' : '#94a3b8',
                fontSize: '10px', fontWeight: activeTab === 'new' ? '700' : '500',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <Plus size={18} strokeWidth={2.5} />
                <span>New</span>
              </button>
              {/* Actions */}
              <button onClick={() => { setActiveTab('actions'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '10px 4px 8px', border: 'none', background: 'transparent',
                borderBottom: activeTab === 'actions' ? `3px solid ${BLUE}` : '3px solid transparent',
                color: activeTab === 'actions' ? BLUE : '#94a3b8',
                fontSize: '10px', fontWeight: activeTab === 'actions' ? '700' : '500',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <Bell size={18} />
                <span>Actions</span>
              </button>
              {/* Trials */}
              <button onClick={() => { if (!isTrialsTab) setActiveTab('pipeline'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '10px 4px 8px', border: 'none', background: 'transparent',
                borderBottom: isTrialsTab ? `3px solid ${BLUE}` : '3px solid transparent',
                color: isTrialsTab ? BLUE : '#94a3b8',
                fontSize: '10px', fontWeight: isTrialsTab ? '700' : '500',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <ClipboardList size={18} />
                <span>Trials</span>
              </button>
              {/* Manage */}
              <button onClick={() => { setActiveTab('manage'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '10px 4px 8px', border: 'none', background: 'transparent',
                borderBottom: activeTab === 'manage' ? `3px solid ${BLUE}` : '3px solid transparent',
                color: activeTab === 'manage' ? BLUE : '#94a3b8',
                fontSize: '10px', fontWeight: activeTab === 'manage' ? '700' : '500',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <Edit3 size={18} />
                <span>Manage</span>
              </button>
              {/* Dashboard */}
              <button onClick={() => { setActiveTab('dashboard'); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                padding: '10px 4px 8px', border: 'none', background: 'transparent',
                borderBottom: activeTab === 'dashboard' ? `3px solid ${BLUE}` : '3px solid transparent',
                color: activeTab === 'dashboard' ? BLUE : '#94a3b8',
                fontSize: '10px', fontWeight: activeTab === 'dashboard' ? '700' : '500',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <BarChart3 size={18} />
                <span>Dashboard</span>
              </button>
            </div>

            {/* ── Mobile: Row 2 — Trial sub-tabs (pill bar) ── */}
            {isTrialsTab && (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }} className="no-scrollbar">
                <div style={{ display: 'inline-flex', gap: '6px', padding: '8px 12px', minWidth: '100%' }}>
                  {TRIAL_SUB_TABS.map(tab => {
                    const active = activeTab === tab.id;
                    const tabColor = tab.color || BLUE;
                    return (
                      <button key={tab.id} onClick={() => { setActiveTab(tab.id); colFilters.clearAll(); setManageStatusFilter([]); }} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', border: active ? 'none' : '1px solid #e2e8f0',
                        borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap',
                        background: active ? tabColor : 'white',
                        color: active ? 'white' : '#64748b',
                        fontSize: '12px', fontWeight: active ? '600' : '500',
                        transition: 'all 0.15s', flexShrink: 0,
                      }}>
                        <tab.icon size={13} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
          existingReadings={tpmReadings.filter(r => r.venueId === readingModal.id)}
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
          oilTypes={oilTypes}
          competitors={competitors}
          onClose={() => setEndTrialModal(null)}
          onConfirm={handleEndTrial}
        />
      )}

      {decisionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937', marginBottom: '4px' }}>Record Outcome</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>{decisionModal.name}</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button onClick={() => { setCloseTrialModal({ venue: decisionModal, outcome: 'won' }); setDecisionModal(null); }} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: '#d1fae5', color: '#065f46', fontSize: '13px', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Trophy size={14} /> Won
              </button>
              <button onClick={() => { setCloseTrialModal({ venue: decisionModal, outcome: 'lost' }); setDecisionModal(null); }} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: '#fee2e2', color: '#991b1b', fontSize: '13px', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <XCircle size={14} /> Lost
              </button>
            </div>
            <button onClick={() => setDecisionModal(null)} style={{
              width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {custCodeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937', marginBottom: '4px' }}>Assign Customer Code</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>{custCodeModal.name}</div>
            <CustomerCodeInput
              venueId={custCodeModal.id}
              onSave={async (venueId, code) => { await handleSaveCustomerCode(venueId, code); setCustCodeModal(null); }}
            />
            <button onClick={() => setCustCodeModal(null)} style={{
              width: '100%', marginTop: '10px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#64748b', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {rowActionVenue && (() => {
        const { venue: rv, tabType: rt } = rowActionVenue;
        const stageCfg = TRIAL_STATUS_COLORS[rt] || TRIAL_STATUS_COLORS['pipeline'];
        const close = () => setRowActionVenue(null);
        // Undo: revert to previous stage
        const prevStage = { active: 'pipeline', pending: 'active', accepted: 'pending', successful: 'pending', unsuccessful: 'pending' }[rt];
        const handleUndo = () => {
          if (!prevStage) return;
          const undoUpdates = { trialStatus: prevStage };
          if (rt === 'active') { undoUpdates.trialStartDate = null; }
          if (rt === 'pending') { undoUpdates.trialEndDate = null; }
          if (rt === 'accepted' || rt === 'successful' || rt === 'unsuccessful') { undoUpdates.outcomeDate = null; undoUpdates.trialReason = null; }
          close();
          updateVenue(rv.id, undoUpdates);
        };
        return (
          <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '320px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              {/* Header: venue name + stage badge + undo button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rv.name}</div>
                  <span style={{ fontSize: '10px', fontWeight: '700', background: stageCfg.bg, color: stageCfg.text, border: `1px solid ${stageCfg.border}`, borderRadius: '6px', padding: '2px 8px', textTransform: 'capitalize', whiteSpace: 'nowrap', display: 'inline-block', marginTop: '3px' }}>{rt}</span>
                </div>
                {prevStage && (
                  <button className="bdm-undo-btn" onClick={handleUndo} title={`Revert to ${prevStage}`} style={{ marginLeft: '10px', flexShrink: 0 }}>
                    <RotateCcw size={11} /> Rollback
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Manage trial — all tabs */}
                <button className="bdm-row-btn" onClick={() => { close(); setManageVenueId(rv.id); setActiveTab('manage'); }}>
                  <ClipboardList size={14} /> Manage trial
                </button>
                {/* Pipeline: Start trial */}
                {rt === 'pipeline' && (
                  <button className="bdm-row-btn" onClick={() => { close(); setReadingModal({ ...rv, startingTrial: true, trialStartDate: rv.trialStartDate || getTodayString() }); }}>
                    <Play size={14} /> Start trial
                  </button>
                )}
                {/* Active: Log reading + End trial */}
                {rt === 'active' && (<>
                  <button className="bdm-row-btn" onClick={() => { close(); setReadingModal(rv); }}>
                    <Edit3 size={14} /> Log reading
                  </button>
                  <button className="bdm-row-btn" onClick={() => { close(); setEndTrialModal(rv); }}>
                    <CheckCircle2 size={14} /> End trial
                  </button>
                </>)}
                {/* Pending: Successful + Unsuccessful */}
                {rt === 'pending' && (<>
                  <button className="bdm-row-btn green" onClick={() => { close(); setCloseTrialModal({ venue: rv, outcome: 'successful' }); }}>
                    <Trophy size={14} /> Successful
                  </button>
                  <button className="bdm-row-btn red" onClick={() => { close(); setCloseTrialModal({ venue: rv, outcome: 'unsuccessful' }); }}>
                    <XCircle size={14} /> Unsuccessful
                  </button>
                </>)}
                {/* Accepted: Enter cust code */}
                {rt === 'accepted' && (
                  <button className="bdm-row-btn green" onClick={() => { close(); setCustCodeModal(rv); }}>
                    <Award size={14} /> Enter cust code
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedTrialVenue && (
        <TrialDetailModal
          venue={selectedTrialVenue}
          oilTypes={oilTypes}
          competitors={competitors}
          trialReasons={trialReasons}
          readings={tpmReadings}
          onClose={() => setSelectedTrialVenue(null)}
          onSaveCustomerCode={handleSaveCustomerCode}
          onManage={(v) => { setSelectedTrialVenue(null); setManageVenueId(v.id); setActiveTab('manage'); }}
          onLogReading={(v) => { setSelectedTrialVenue(null); setReadingModal(v); }}
          onEndTrial={(v) => { setSelectedTrialVenue(null); setEndTrialModal(v); }}
          onAddComment={handleAddTrialComment}
        />
      )}

      {successMsg && (
        <SuccessToast message={successMsg} onClose={() => setSuccessMsg(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOMER CODE INPUT (inline for successful trials)
// ─────────────────────────────────────────────
// CustomerCodeInput imported from ../components/CustomerCodeInput
