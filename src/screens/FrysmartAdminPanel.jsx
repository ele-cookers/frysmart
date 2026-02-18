import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  mapCompetitor, unMapCompetitor,
  mapOilType, unMapOilType,
  mapProfile, unMapProfile,
  mapGroup, unMapGroup,
  mapVenue, unMapVenue,
  mapReading, unMapReading,
  mapTrialReason, mapVolumeBracket,
  mapSystemSettings, unMapSystemSettings,
} from '../lib/mappers';
import { ChevronDown, Plus, Trash2, X, Check, AlertTriangle, Edit3, Settings, Building, Eye, ArrowLeft, Users, Shield, Droplets, Archive, Filter, Copy, Layers, UserPlus, CheckCircle, BarChart3, Globe, Lock, RefreshCw, Zap, AlertCircle, ArrowUpDown, ArrowDown, Trophy, Clock, Target, Calendar, ChevronLeft, ChevronRight, LogOut, Repeat2 } from 'lucide-react';

const hideScrollbarCSS = `
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  @media (min-width: 768px) {
    .breakdown-grid-4 { grid-template-columns: 1fr 1fr !important; }
  }
  @media (min-width: 1024px) {
    .breakdown-grid-4 { grid-template-columns: repeat(4, 1fr) !important; }
  }
  .admin-table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .admin-table thead th {
    position: sticky; top: 0; z-index: 20;
    padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700;
    color: #64748b; letter-spacing: 0.3px; text-transform: uppercase;
    background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap;
  }
  .admin-table tbody tr { transition: background 0.1s; }
  .admin-table tbody tr:hover { background: #eef2ff; }
  .admin-table tbody td {
    padding: 6px 10px; font-size: 12px; color: #1f2937;
    border-bottom: 1px solid #f1f5f9; vertical-align: middle;
    white-space: nowrap;
  }
  .admin-table tbody tr.inactive-row { opacity: 0.5; }
  .admin-table tbody tr.inactive-row:hover { opacity: 0.7; }
  .admin-table.trials-compact thead th { padding: 6px 7px; font-size: 9px; }
  .admin-table.trials-compact tbody td { padding: 5px 7px; font-size: 11px; line-height: 1.3; }
`;

// ==================== SHARED UTILITIES ====================
const formatDate = (d) => { if (!d) return '—'; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }); };
const relativeDate = (d) => {
  if (!d) return '';
  const days = Math.floor((new Date() - new Date(d + 'T00:00:00')) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(d);
};
// Calculates the live trial weekly average from logged oil fills.
// Formula: total litres filled across all fryers ÷ days elapsed × 7
// Returns null if no fills have been logged yet.
const calcTrialWeeklyAvg = (venueId, trialStartDate, readings, trialEndDate) => {
  if (!venueId || !trialStartDate || !readings) return null;
  const fills = readings.filter(r => r.venueId === venueId && r.oilAge === 1 && r.litresFilled > 0);
  if (fills.length === 0) return null;
  const totalLitres = fills.reduce((sum, r) => sum + r.litresFilled, 0);
  const start = new Date(trialStartDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Cap at trial end date for completed/won/lost trials so avg doesn't shrink over time
  const cap = trialEndDate ? new Date(Math.min(today.getTime(), new Date(trialEndDate + 'T00:00:00').getTime())) : today;
  const daysElapsed = Math.max(1, Math.floor((cap - start) / 86400000));
  return Math.round((totalLitres / daysElapsed) * 7 * 10) / 10;
};

const makeGetUserName = (users, firstOnly = false) => (id) => {
  const u = users.find(u => u.id === id);
  if (!u) return '—';
  return firstOnly ? u.name.split(' ')[0] : u.name;
};
const makeGetGroupName = (groups) => (id) => groups.find(g => g.id === id)?.name || '—';

// Role keys used throughout: 'admin' | 'bdm' | 'nam' | 'state_manager' | 'mgt'
// These are the canonical values stored on user records AND used as currentView IDs
// in the role switcher — keep them identical in both places to avoid mapping bugs.
const ROLE_LABELS = {
  bdm: 'BDM',
  nam: 'NAM',
  state_manager: 'STATE MGR',
  mgt: 'MGT',
  admin: 'ADMIN',
};

const ROLE_COLORS = {
  mgt: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },             // red
  admin: { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },           // pink
  state_manager: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },   // yellow
  nam: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },             // blue
  bdm: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },             // green
  staff: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },           // orange
};

const ROLE_PERMISSIONS = {
  bdm: 'Own assigned venues & trials',
  nam: 'BDM & venue data for their groups',
  state_manager: 'All BDMs, venues & trials in state',
  mgt: 'All data nationally',
  admin: 'Everything — full system access',
};

const OIL_TIER_COLORS = {
  elite: { bg: '#e6f9ff', text: '#0a8a9e', border: '#33ccff' },
  premium: { bg: '#fff0eb', text: '#cc4400', border: '#ff6633' },
  standard: { bg: '#f0f9e8', text: '#5a7a1a', border: '#99cc33' },
};

const STATE_BADGE_COLORS = {
  VIC: { color: '#0369a1', bg: '#e0f2fe' },
  NSW: { color: '#dc2626', bg: '#fee2e2' },
  QLD: { color: '#7c3aed', bg: '#ede9fe' },
  SA: { color: '#a16207', bg: '#fef9c3' },
  WA: { color: '#ea580c', bg: '#fff7ed' },
  TAS: { color: '#15803d', bg: '#dcfce7' },
  NT: { color: '#64748b', bg: '#f1f5f9' },
  ACT: { color: '#64748b', bg: '#f1f5f9' },
};

const STATE_COLOURS = {
  VIC: '#0ea5e9',
  NSW: '#ef4444',
  QLD: '#8b5cf6',
  SA: '#eab308',
  WA: '#f97316',
  TAS: '#22c55e',
  NT: '#64748b',
  ACT: '#64748b',
};

// ==================== SHARED COMPONENTS ====================
const COMPETITOR_TIER_COLORS = {
  standard: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
  premium: { bg: '#e2e8f0', text: '#64748b', border: '#94a3b8' },
  elite: { bg: '#cbd5e1', text: '#1f2937', border: '#64748b' },
};

const PACK_SIZES = [
  { key: 'bulk', label: 'BULK' },
  { key: '20l', label: '20L TIN' },
  { key: '15l', label: '15L DRUM' },
  { key: '10l', label: '10L PAIL' },
  { key: '4l', label: '4L BOTTLE' },
];

const FOOD_TYPES = [
  'Chips/Fries', 'Crumbed Items', 'Battered Items',
  'Plain Proteins', 'Pastries/Donuts', 'High Starch', 'Mixed Service',
];

const VOLUME_BRACKETS = [
  { key: 'under-60', label: 'UNDER 60L', color: '#10b981' },
  { key: '60-100', label: '60 - 100L', color: '#eab308' },
  { key: '100-150', label: '100 - 150L', color: '#f97316' },
  { key: '150-plus', label: '150L+', color: '#ef4444' },
];

const OilBadge = ({ oil, competitors, compact }) => {
  if (!oil) return <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>;
  const isCompetitor = oil.category === 'competitor';
  const s = isCompetitor
    ? (COMPETITOR_TIER_COLORS[oil.tier] || COMPETITOR_TIER_COLORS.standard)
    : (OIL_TIER_COLORS[oil.tier] || OIL_TIER_COLORS.standard);
  const comp = isCompetitor && competitors ? competitors.find(c => c.id === oil.competitorId) : null;
  if (compact) {
    // Table cell — single pill, oil name only
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', display: 'inline-block', minWidth: '68px', textAlign: 'center'
      }}>{oil.name}</span>
    );
  }
  // Full — competitor name above, oil name pill below
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {comp && <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>{comp.name}</span>}
      <span style={{
        padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
        background: s.bg, color: s.text, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', display: 'inline-block', alignSelf: 'flex-start'
      }}>{oil.name}</span>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const configs = {
    active: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'ACTIVE' },
    inactive: { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1', label: 'INACTIVE' },
  };
  const c = configs[status] || configs.active;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '68px', textAlign: 'center'
    }}>{c.label}</span>
  );
};

const RoleBadge = ({ role }) => {
  const c = ROLE_COLORS[role] || ROLE_COLORS.staff;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '90px', textAlign: 'center'
    }}>{ROLE_LABELS[role] || role}</span>
  );
};

const CODE_BADGE_COLORS = {
  default: { color: '#1a428a', background: '#e8eef6' },
  charcoal: { color: '#64748b', background: '#f1f5f9' },
};

const CodeBadge = ({ code, minWidth = '42px', variant = 'default' }) => {
  if (!code) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const c = CODE_BADGE_COLORS[variant] || CODE_BADGE_COLORS.default;
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', color: c.color, background: c.background,
      padding: '2px 0', borderRadius: '8px', whiteSpace: 'nowrap',
      display: 'inline-block', minWidth, textAlign: 'center'
    }}>{code}</span>
  );
};

const StateBadge = ({ state }) => {
  if (!state) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const c = STATE_BADGE_COLORS[state] || { color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      fontSize: '10px', fontWeight: '700', color: c.color, background: c.bg,
      padding: '2px 0', borderRadius: '6px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '42px', textAlign: 'center', letterSpacing: '0.3px'
    }}>{state}</span>
  );
};

const VolumePill = ({ bracket, brackets }) => {
  const b = (brackets || VOLUME_BRACKETS).find(v => v.key === bracket);
  if (!b) return <span style={{ color: '#cbd5e1' }}>—</span>;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}40`,
      letterSpacing: '0.3px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '82px', textAlign: 'center'
    }}>{b.label}</span>
  );
};

const ColumnToggle = ({ columns, visible, setVisible }) => {
  const [open, setOpen] = useState(false);
  const allVisible = columns.every(c => visible.includes(c.key));
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
        background: open ? '#1a428a' : '#f1f5f9', color: open ? 'white' : '#64748b',
        border: '1.5px solid', borderColor: open ? '#1a428a' : '#e2e8f0',
        borderRadius: '8px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'all 0.15s'
      }}>
        <Settings size={12} /> Columns
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 2000,
            background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '8px 0', minWidth: '200px',
            maxHeight: '320px', overflowY: 'auto'
          }}>
            <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid #f1f5f9' }}>
              <button onClick={() => setVisible(allVisible ? columns.filter(c => c.locked).map(c => c.key) : columns.map(c => c.key))} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px',
                fontWeight: '600', color: '#1a428a', padding: '2px 0'
              }}>{allVisible ? 'Hide optional' : 'Show all'}</button>
            </div>
            {columns.map(col => (
              <label key={col.key} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
                cursor: col.locked ? 'default' : 'pointer', fontSize: '12px', color: '#1f2937',
                opacity: col.locked ? 0.5 : 1
              }}>
                <input
                  type="checkbox"
                  checked={visible.includes(col.key)}
                  disabled={col.locked}
                  onChange={() => {
                    if (col.locked) return;
                    setVisible(prev => prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key]);
                  }}
                  style={{ accentColor: '#1a428a', width: '14px', height: '14px' }}
                />
                <span style={{ fontWeight: '500' }}>{col.label}</span>
                {col.locked && <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '600' }}>REQUIRED</span>}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ==================== COLUMN FILTER HOOK & COMPONENT ====================
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
      const itemVal = String(accessor(item));
      if (Array.isArray(val)) {
        if (val.length === 0) return false;
        return val.some(v => itemVal === v || itemVal.split(', ').includes(v));
      }
      return itemVal === String(val) || itemVal.split(', ').includes(String(val));
    })
  );
  return { filters, setFilter, clearAll, activeCount, applyFilters };
};

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

  const openDropdown = () => {
    const initial = hasFilter ? new Set(Array.isArray(activeVal) ? activeVal : [activeVal]) : new Set(allValues);
    setDraft(initial);
    setSearch('');
    setOpen(true);
  };

  const toggle = (val) => {
    const next = new Set(currentDraft);
    if (next.has(val)) { next.delete(val); } else { next.add(val); }
    setDraft(next);
  };
  const draftSelectAll = () => setDraft(new Set(allValues));
  const draftDeselectAll = () => setDraft(new Set());

  const applyAndClose = () => {
    if (search) {
      // When search is active, only keep items that are both in the filtered view AND checked
      const visibleValues = new Set(filteredOpts.map(o => o.value));
      const selected = [...currentDraft].filter(v => visibleValues.has(v));
      if (selected.length === 0 || selected.length >= allValues.length) { setFilter(colKey, '__all__'); }
      else { setFilter(colKey, selected); }
    } else {
      if (currentDraft.size >= allValues.length) { setFilter(colKey, '__all__'); }
      else { setFilter(colKey, [...currentDraft]); }
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
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '2px', zIndex: 2000,
            background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '200px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ padding: '8px 8px 4px' }}>
              <input type="text" placeholder="Search..." value={search}
                onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', border: '1.5px solid #e2e8f0', borderRadius: '6px', outline: 'none', background: '#f8fafc', color: '#1f2937' }}
              />
            </div>
            <div style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div onClick={() => draftAllSelected ? draftDeselectAll() : draftSelectAll()} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#1f2937', textTransform: 'none', letterSpacing: '0'
              }}>
                <div style={{
                  width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
                  border: draftAllSelected ? '1.5px solid #1a428a' : '1.5px solid #cbd5e1',
                  background: draftAllSelected ? '#1a428a' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {draftAllSelected && <Check size={9} color="white" strokeWidth={3} />}
                </div>
                <span>(Select All)</span>
              </div>
            </div>
            <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '4px 0' }}>
              {filteredOpts.map(opt => {
                const isChecked = currentDraft.has(opt.value);
                return (
                  <div key={opt.value} onClick={() => toggle(opt.value)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px',
                    cursor: 'pointer', fontSize: '11px', color: '#1f2937', fontWeight: isChecked ? '600' : '400',
                    background: isChecked && !draftAllSelected ? '#f0f5ff' : 'transparent', textTransform: 'none', letterSpacing: '0'
                  }}>
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
                      border: isChecked ? '1.5px solid #1a428a' : '1.5px solid #cbd5e1',
                      background: isChecked ? '#1a428a' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isChecked && <Check size={9} color="white" strokeWidth={3} />}
                    </div>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label || '\u2014'}</span>
                  </div>
                );
              })}
              {filteredOpts.length === 0 && (
                <div style={{ padding: '10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>No matches</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', padding: '8px', borderTop: '1.5px solid #e2e8f0' }}>
              <button onClick={applyAndClose} style={{
                flex: 1, padding: '6px', fontSize: '11px', fontWeight: '600', color: 'white',
                background: '#1a428a', border: 'none', borderRadius: '6px', cursor: 'pointer'
              }}>OK</button>
              <button onClick={cancelAndClose} style={{
                flex: 1, padding: '6px', fontSize: '11px', fontWeight: '600', color: '#64748b',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer'
              }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </th>
  );
};

const ActiveFilterBar = ({ filters, setFilter, clearAll }) => {
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <Filter size={11} color="#94a3b8" />
      <span style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px' }}>FILTERED:</span>
      {entries.map(([col, val]) => {
        const vals = Array.isArray(val) ? val : [val];
        return vals.map((v, i) => (
          <span key={`${col}-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', fontWeight: '600', color: '#1a428a', background: '#e8eef6',
            padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe',
            whiteSpace: 'nowrap'
          }}>
            {String(v) || '(Blank)'}
            <X size={10} color="#1a428a" style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => {
              if (vals.length <= 1) { setFilter(col, '__all__'); }
              else { setFilter(col, vals.filter((_, j) => j !== i)); }
            }} />
          </span>
        ));
      })}
      <button onClick={clearAll} style={{
        fontSize: '10px', fontWeight: '600', color: '#64748b', background: 'none',
        border: 'none', cursor: 'pointer', marginLeft: '4px', textDecoration: 'underline'
      }}>Clear all</button>
    </div>
  );
};

const getUniqueValues = (data, accessor) => {
  const raw = data.map(accessor);
  const hasBlank = raw.some(v => v == null || v === '' || v === '—');
  const vals = raw.filter(v => v != null && v !== '' && v !== '—');
  const sorted = [...new Set(vals)].sort((a, b) => String(a).localeCompare(String(b)));
  if (hasBlank) sorted.push({ value: '', label: '(Blank)' });
  return sorted;
};

const SectionHeader = ({ icon: Icon, title, count, onAdd, addLabel }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', background: '#1a428a',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={18} color="white" />
      </div>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{title}</h2>
        {count !== undefined && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{count} total</div>}
      </div>
    </div>
    {onAdd && (
      <button onClick={onAdd} style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
        background: '#1a428a', color: 'white', border: 'none', borderRadius: '10px',
        fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
        whiteSpace: 'nowrap', flexShrink: 0
      }}
        onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
        onMouseOut={e => e.currentTarget.style.opacity = '1'}
      >
        <Plus size={16} /> {addLabel || 'Add'}
      </button>
    )}
  </div>
);

const EmptyState = ({ icon: Icon, title, subtitle }) => (
  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
    <div style={{
      width: '56px', height: '56px', borderRadius: '16px', background: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
    }}>
      <Icon size={24} color="#94a3b8" />
    </div>
    <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>{title}</div>
    <div style={{ fontSize: '13px', color: '#64748b' }}>{subtitle}</div>
  </div>
);

const FormField = ({ label, required, children }) => (
  <div style={{ marginBottom: '12px' }}>
    <label style={{ display: 'block', marginBottom: '4px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
    </label>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #e2e8f0',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'white', fontFamily: 'inherit'
};

const selectStyle = { ...inputStyle, appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' };

// ==================== OIL TYPE CONFIGURATION ====================
const CompetitorPill = ({ comp, table }) => {
  if (!comp) return null;
  const color = comp.color || '#64748b';
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  const bgColor = `rgba(${r},${g},${b},0.15)`;
  const textColor = luminance > 0.75 ? '#1f2937' : color;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      background: bgColor, color: textColor,
      fontSize: '11px', fontWeight: '600', letterSpacing: '0.2px',
      ...(table ? {
        width: '68px', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', textAlign: 'center'
      } : { whiteSpace: 'nowrap' })
    }} title={comp.name}>{comp.name}</span>
  );
};

const OilTypeConfig = ({ oilTypes, setOilTypes, competitors, oilTypeOptions }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', category: 'cookers', tier: 'standard', oilType: '', packSize: 'bulk', status: 'active' });
  const colFilters = useColumnFilters();

  const filtered = (() => {
    let data = oilTypes.filter(o =>
      o.category === 'cookers' &&
      (o.name.toLowerCase().includes(search.toLowerCase()) || o.code.toLowerCase().includes(search.toLowerCase()))
    );
    data = colFilters.applyFilters(data, {
      name: o => o.name || '',
      code: o => o.code || '',
      tier: o => o.tier || '',
      oilType: o => o.oilType || '',
      packSize: o => o.packSize || '',
      status: o => o.status || '',
    });
    return data;
  })();

  const handleSave = () => {
    if (!form.name || !form.code) return;
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), code: form.code.trim().toUpperCase() };
    if (editing) {
      setOilTypes(prev => prev.map(o => o.id === editing ? { ...o, ...cleaned } : o));
    } else {
      setOilTypes(prev => [...prev, { ...cleaned, id: `oil-${Date.now()}`, category: 'cookers' }]);
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', code: '', category: 'cookers', tier: 'standard', oilType: '', packSize: 'bulk', status: 'active' });
  };

  const handleEdit = (oil) => {
    setForm({ name: oil.name, code: oil.code, category: 'cookers', tier: oil.tier, oilType: oil.oilType || '', packSize: oil.packSize || '', status: oil.status || 'active' });
    setEditing(oil.id);
    setShowForm(true);
  };

  const toggleStatus = (id) => {
    const oil = oilTypes.find(o => o.id === id);
    if (!oil) return;
    const action = oil.status === 'active' ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${oil.name}"?`)) return;
    setOilTypes(prev => prev.map(o => o.id === id ? { ...o, status: o.status === 'active' ? 'inactive' : 'active' } : o));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Droplets} title="Cookers Oils" count={filtered.length} onAdd={() => { setForm({ name: '', code: '', category: 'cookers', tier: 'standard', oilType: '', packSize: 'bulk', status: 'active' }); setEditing(null); setShowForm(true); }} addLabel="Add Oil" />
      <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />

      {filtered.length === 0 ? (
        <EmptyState icon={Droplets} title="No oils found" subtitle={search ? 'Try a different search term' : 'Add Cookers oils to get started'} />
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <FilterableTh colKey="name" label="Oil Name" options={getUniqueValues(oilTypes.filter(o => o.category === 'cookers'), o => o.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                <FilterableTh colKey="code" label="Code" options={getUniqueValues(oilTypes.filter(o => o.category === 'cookers'), o => o.code)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                <FilterableTh colKey="tier" label="Tier" options={['standard','premium','elite'].map(t => ({value:t,label:t.charAt(0).toUpperCase()+t.slice(1)}))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                <FilterableTh colKey="oilType" label="Oil Type" options={getUniqueValues(oilTypes.filter(o => o.category === 'cookers'), o => o.oilType).map(o => typeof o === 'string' ? {value:o,label:o.charAt(0).toUpperCase()+o.slice(1)} : o)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                <FilterableTh colKey="packSize" label="Pack Size" options={PACK_SIZES.map(p => ({value:p.key,label:p.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                <FilterableTh colKey="status" label="Status" options={[{value:'active',label:'Active'},{value:'inactive',label:'Inactive'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />
                <th style={{ width: '80px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(oil => {
                const tierStyle = OIL_TIER_COLORS[oil.tier] || OIL_TIER_COLORS.standard;
                return (
                  <tr key={oil.id} style={{ height: '36px', opacity: oil.status === 'inactive' ? 0.55 : 1 }}>
                    <td style={{ fontWeight: '600' }}>{oil.name}</td>
                    <td style={{ fontWeight: '600', color: '#64748b', fontSize: '11px' }}>{oil.code || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: tierStyle.bg, color: tierStyle.text, border: `1px solid ${tierStyle.border}`, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-block', minWidth: '68px', textAlign: 'center' }}>{oil.tier}</span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#64748b', textTransform: 'uppercase' }}>{oil.oilType || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{oil.packSize ? (PACK_SIZES.find(p => p.key === oil.packSize)?.label || oil.packSize) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={oil.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => handleEdit(oil)} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                        <button onClick={() => toggleStatus(oil.id)} style={{ padding: '6px', background: oil.status === 'active' ? '#fee2e2' : '#d1fae5', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {oil.status === 'active' ? <Archive size={13} color="#ef4444" /> : <RefreshCw size={13} color="#10b981" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{editing ? 'Edit Oil Type' : 'New Oil Type'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
              <FormField label="Oil Name" required>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="XLFRY" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <FormField label="Oil Code" required>
                <input style={inputStyle} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="XLFRY" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                {form.code && oilTypes.some(o => o.code === form.code && o.id !== editing) && (
                  <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>⚠ Code "{form.code}" already exists</div>
                )}
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Tier">
                  <select style={selectStyle} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}>
                    <option value="standard">STANDARD</option>
                    <option value="premium">PREMIUM</option>
                    <option value="elite">ELITE</option>
                  </select>
                </FormField>
                <FormField label="Oil Type">
                  <select style={selectStyle} value={form.oilType} onChange={e => setForm(f => ({ ...f, oilType: e.target.value }))}>
                    <option value="">— SELECT —</option>
                    {oilTypeOptions.map(b => (
                      <option key={b} value={b}>{b.toUpperCase()}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Pack Size">
                  <select style={selectStyle} value={form.packSize} onChange={e => setForm(f => ({ ...f, packSize: e.target.value }))}>
                    {PACK_SIZES.map(p => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Status">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                    <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                    }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                    </button>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                  </div>
                </FormField>
              </div>
              <button onClick={handleSave} disabled={!form.name.trim() || !form.code.trim()} style={{
                width: '100%', padding: '10px', background: form.name.trim() && form.code.trim() ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: form.name.trim() && form.code.trim() ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{editing ? 'Save Changes' : 'Create Oil Type'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== COMPETITOR MANAGEMENT ====================
const CompetitorManagement = ({ competitors, setCompetitors, oilTypes, setOilTypes, oilTypeOptions }) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', status: 'active', type: 'direct', states: [], color: '' });
  const [expanded, setExpanded] = useState(null);
  const [showOilForm, setShowOilForm] = useState(false);
  const [editingOil, setEditingOil] = useState(null);
  const [oilForm, setOilForm] = useState({ name: '', code: '', tier: 'standard', oilType: '', packSize: '', status: 'active' });
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByRecent, setSortByRecent] = useState(false);
  const colFilters = useColumnFilters();

  const COMP_COLS = [
    { key: 'competitor', label: 'Competitor', locked: true },
    { key: 'code', label: 'Code' },
    { key: 'type', label: 'Type' },
    { key: 'states', label: 'States' },
    { key: 'oils', label: 'Oils' },
    { key: 'status', label: 'Status' },
  ];
  const [visibleCols, setVisibleCols] = useState(COMP_COLS.map(c => c.key));
  const colVis = (k) => visibleCols.includes(k);

  const ALL_STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
  const toggleState = (st) => setForm(f => ({ ...f, states: f.states.includes(st) ? f.states.filter(s => s !== st) : [...f.states, st] }));

  const startEdit = (comp) => { setForm({ name: comp.name, code: comp.code || '', status: comp.status, type: comp.type || 'direct', states: comp.states || [], color: comp.color || '' }); setEditing(comp.id); setShowForm(true); };
  const save = () => {
    if (!form.name.trim()) return;
    const now = new Date().toISOString().split('T')[0];
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), code: form.code ? form.code.trim().toUpperCase() : '' };
    if (editing) { setCompetitors(prev => prev.map(c => c.id === editing ? { ...c, ...cleaned, updatedAt: now } : c)); }
    else { setCompetitors(prev => [...prev, { id: `comp-${Date.now()}`, ...cleaned, createdAt: now, updatedAt: now }]); }
    setShowForm(false); setEditing(null); setForm({ name: '', code: '', status: 'active', type: 'direct', states: [], color: '' });
  };

  const startOilEdit = (oil) => { setOilForm({ name: oil.name, code: oil.code || '', tier: oil.tier || 'standard', oilType: oil.oilType || '', packSize: oil.packSize || '', status: oil.status }); setEditingOil(oil.id); setShowOilForm(true); };
  const saveOil = (compId) => {
    if (!oilForm.name.trim()) return;
    const cleanedName = oilForm.name.trim().toUpperCase();
    const cleanedCode = oilForm.code ? oilForm.code.trim().toUpperCase() : '';
    if (editingOil) { setOilTypes(prev => prev.map(o => o.id === editingOil ? { ...o, name: cleanedName, code: cleanedCode, tier: oilForm.tier, oilType: oilForm.oilType, packSize: oilForm.packSize, status: oilForm.status } : o)); }
    else { setOilTypes(prev => [...prev, { id: `oil-${Date.now()}`, name: cleanedName, code: cleanedCode, category: 'competitor', competitorId: compId, tier: oilForm.tier, oilType: oilForm.oilType, packSize: oilForm.packSize, status: oilForm.status }]); }
    setShowOilForm(false); setEditingOil(null); setOilForm({ name: '', code: '', tier: 'standard', oilType: '', packSize: '', status: 'active' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Globe} title="Competitors" count={competitors.length} onAdd={() => { setForm({ name: '', code: '', status: 'active', type: 'direct', states: [] }); setEditing(null); setShowForm(true); }} addLabel="Add Competitor" />
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ key: 'all', label: 'All', count: competitors.length }, { key: 'active', label: 'Active', count: competitors.filter(c => c.status === 'active').length }, { key: 'inactive', label: 'Inactive', count: competitors.filter(c => c.status === 'inactive').length }].map(f => {
          const selectedColor = f.key === 'active' ? { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' } : f.key === 'inactive' ? { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } : { bg: '#e8eef6', text: '#1a428a', border: '#1a428a' };
          const isActive = statusFilter === f.key;
          return (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            border: `1.5px solid ${isActive ? selectedColor.border : '#e2e8f0'}`,
            background: isActive ? selectedColor.bg : 'white',
            color: isActive ? selectedColor.text : '#64748b'
          }}>{f.label} ({f.count})</button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span onClick={() => { setSortByRecent(false); }} style={{
            fontSize: '11px', color: !sortByRecent ? '#1a428a' : '#94a3b8', cursor: 'pointer',
            fontWeight: !sortByRecent ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
          }}>{!sortByRecent ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} A–Z</span>
          <span onClick={() => setSortByRecent(true)} style={{
            fontSize: '11px', color: sortByRecent ? '#1a428a' : '#94a3b8', cursor: 'pointer',
            fontWeight: sortByRecent ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
          }}>{sortByRecent ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} Recent</span>
          <ColumnToggle columns={COMP_COLS} visible={visibleCols} setVisible={setVisibleCols} />
        </div>
      </div>
      <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'auto', flex: 1 }}>
        <table className="admin-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <FilterableTh colKey="competitor" label="Competitor" options={getUniqueValues(competitors, c => c.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
              {colVis('code') && <FilterableTh colKey="code" label="Code" options={getUniqueValues(competitors, c => c.code)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
              {colVis('type') && <FilterableTh colKey="type" label="Type" options={[{value:'direct',label:'Direct'},{value:'indirect',label:'Indirect'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
              {colVis('states') && <FilterableTh colKey="states" label="States" options={['VIC','NSW','QLD','SA','WA','TAS'].map(s => ({value:s,label:s}))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
              {colVis('oils') && <th style={{ textAlign: 'center' }}>Oils</th>}
              {colVis('status') && <FilterableTh colKey="status" label="Status" options={[{value:'active',label:'Active'},{value:'inactive',label:'Inactive'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
        {(() => {
          let data = competitors.filter(c => statusFilter === 'all' || c.status === statusFilter);
          data = colFilters.applyFilters(data, {
            competitor: c => c.name || '',
            code: c => c.code || '',
            type: c => c.type || 'direct',
            states: c => (c.states || []).join(', '),
            status: c => c.status || '',
          });
          return data.sort((a, b) => {
            if (sortByRecent) return (b.updatedAt || '').localeCompare(a.updatedAt || '');
            return a.name.localeCompare(b.name);
          });
        })() .reduce((acc, comp) => {
          if (acc.__empty && acc.__empty === true) return acc;
          return [...acc, comp];
        }, competitors.filter(c => statusFilter === 'all' || c.status === statusFilter).length === 0 ? [{ __empty: true }] : []).map(comp => {
          if (comp.__empty) return (
            <tr key="empty"><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏭</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No competitors yet</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Add competitor oil brands to track what your prospects are currently using.</div>
              </div>
            </td></tr>
          );
          const compOils = oilTypes.filter(o => o.competitorId === comp.id);
          const isExpanded = expanded === comp.id;
          const visColCount = visibleCols.length + 1;
          return (
            <React.Fragment key={comp.id}>
              <tr style={{ cursor: 'pointer', height: '36px', opacity: comp.status === 'inactive' ? 0.55 : 1 }} onClick={() => setExpanded(isExpanded ? null : comp.id)}>
                <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={comp.name}>{comp.name}</td>
                {colVis('code') && <td style={{ textAlign: 'center' }}><CodeBadge code={comp.code} /></td>}
                {colVis('type') && <td style={{ textAlign: 'center' }}><span style={{
                  padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                  background: (comp.type || 'direct') === 'direct' ? '#fee2e2' : '#fff7ed',
                  color: (comp.type || 'direct') === 'direct' ? '#991b1b' : '#9a3412',
                  border: `1px solid ${(comp.type || 'direct') === 'direct' ? '#fca5a5' : '#fdba74'}`,
                  letterSpacing: '0.3px',
                  display: 'inline-block', minWidth: '68px', textAlign: 'center'
                }}>{(comp.type || 'direct') === 'direct' ? 'DIRECT' : 'INDIRECT'}</span></td>}
                {colVis('states') && <td>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'].map(st => (
                      <span key={st} style={{ fontSize: '10px', fontWeight: '700', textAlign: 'center', color: (comp.states || []).includes(st) ? (STATE_COLOURS[st] || '#64748b') : '#e2e8f0', width: '28px', flexShrink: 0 }}>{st}</span>
                    ))}
                  </div>
                </td>}
                {colVis('oils') && <td style={{ textAlign: 'center', fontWeight: '600', color: '#1f2937' }}>{compOils.length}</td>}
                {colVis('status') && <td style={{ textAlign: 'center' }}><StatusBadge status={comp.status} /></td>}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(comp); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500', whiteSpace: 'nowrap' }}>{isExpanded ? 'Hide' : 'Oils'}</span>
                    <ChevronDown size={14} color="#94a3b8" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                  </div>
                </td>
              </tr>
              {isExpanded && (
                <tr><td colSpan={visColCount} style={{ padding: '0', background: '#eef2f9', borderLeft: '3px solid #1a428a', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ padding: '12px 16px' }}>
                    {compOils.length === 0 ? (
                      <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>No oils added yet</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '12px', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>OIL NAME</th>
                            <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>CODE</th>
                            <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>TIER</th>
                            <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>OIL TYPE</th>
                            <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>PACK SIZE</th>
                            <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', borderBottom: '1.5px solid #e2e8f0' }}>STATUS</th>
                            <th style={{ width: '36px', borderBottom: '1.5px solid #e2e8f0' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {compOils.map(oil => {
                            const tc = COMPETITOR_TIER_COLORS[oil.tier] || COMPETITOR_TIER_COLORS.standard;
                            const isInactive = oil.status === 'inactive';
                            return (
                              <tr key={oil.id} style={{ opacity: isInactive ? 0.55 : 1 }}>
                                <td style={{ padding: '7px 10px', fontWeight: '600', color: isInactive ? '#94a3b8' : '#1f2937', textDecoration: isInactive ? 'line-through' : 'none', borderBottom: '1px solid #f1f5f9' }}>{oil.name}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748b', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}>{oil.code || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                  <span style={{ padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'inline-block', minWidth: '68px', textAlign: 'center' }}>{oil.tier || 'standard'}</span>
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{oil.oilType || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>{oil.packSize ? (PACK_SIZES.find(p => p.key === oil.packSize)?.label || oil.packSize) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}><StatusBadge status={oil.status} /></td>
                                <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9' }}>
                                  <button onClick={() => startOilEdit(oil)} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={12} color="#94a3b8" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <button onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26, 66, 138, 0.10)'; e.currentTarget.style.borderColor = '#1a428a'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26, 66, 138, 0.04)'; e.currentTarget.style.borderColor = '#93a8d0'; }} onClick={() => { setOilForm({ name: '', code: '', tier: 'standard', oilType: '', packSize: '', status: 'active' }); setEditingOil(null); setShowOilForm(true); }} style={{
                      width: '100%', padding: '8px', borderRadius: '8px', border: '1.5px dashed #93a8d0',
                      background: 'rgba(26, 66, 138, 0.04)', fontSize: '12px', fontWeight: '600', color: '#1a428a',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                      transition: 'all 0.15s'
                    }}><Plus size={14} /> Add Oil Type</button>
                  </div>
                </td></tr>
              )}
            </React.Fragment>
          );
        })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Competitor form modal */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>{editing ? 'Edit Competitor' : 'Add Competitor'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <FormField label="Competitor Name" required>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="OIL2U" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
            </FormField>
            <FormField label="Code" required>
              <input style={inputStyle} maxLength={5} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="O2U" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
            </FormField>
            </div>
            {form.code && competitors.some(c => c.code === form.code && c.id !== editing) && (
              <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '-8px', marginBottom: '8px' }}>⚠ Code "{form.code}" already in use</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: '10px' }}>
              <FormField label="Type" required>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[{ key: 'direct', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }, { key: 'indirect', bg: '#fff7ed', color: '#9a3412', border: '#fdba74' }].map(t => (
                    <button key={t.key} type="button" onClick={() => setForm(f => ({ ...f, type: t.key }))} style={{
                      flex: 1, padding: '7px 0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
                      border: form.type === t.key ? `1.5px solid ${t.border}` : '1.5px solid #e2e8f0',
                      background: form.type === t.key ? t.bg : 'white',
                      color: form.type === t.key ? t.color : '#94a3b8'
                    }}>{t.key.toUpperCase()}</button>
                  ))}
                </div>
              </FormField>
              {editing && (
                <FormField label="Status">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                    width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                    background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                  }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                    </div>
                </FormField>
              )}
            </div>
            <FormField label="States">
              <div style={{ display: 'flex', gap: '6px' }}>
                {ALL_STATES.map(st => {
                  const selected = form.states.includes(st);
                  const sc = STATE_BADGE_COLORS[st] || { color: '#64748b', bg: '#f1f5f9' };
                  return (
                    <button key={st} onClick={() => toggleState(st)} style={{
                      flex: 1, padding: '6px 0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', textAlign: 'center',
                      border: selected ? `1.5px solid ${sc.color}44` : '1.5px solid #e2e8f0',
                      background: selected ? sc.bg : 'white',
                      color: selected ? sc.color : '#64748b',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}>{st}</button>
                  );
                })}
              </div>
              {form.states.length > 0 && (
                <button onClick={() => setForm(f => ({ ...f, states: [] }))} style={{
                  background: 'none', border: 'none', fontSize: '11px', color: '#64748b',
                  cursor: 'pointer', marginTop: '6px', padding: 0
                }}>Clear all</button>
              )}
            </FormField>
            <FormField label="Colour">
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#319795', '#3182ce', '#5a67d8', '#805ad5', '#d53f8c', '#718096', '#2d3748', '#c05621', '#276749', '#2c7a7b', '#2b6cb0', '#553c9a', '#97266d', '#4a5568'].map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                    width: '24px', height: '24px', borderRadius: '6px', background: c, border: form.color === c ? '3px solid #1a428a' : '2px solid transparent',
                    cursor: 'pointer', outline: 'none', flexShrink: 0
                  }} />
                ))}
              </div>
              {form.color && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CompetitorPill comp={{ name: form.name || 'PREVIEW', color: form.color }} />
                  <button type="button" onClick={() => setForm(f => ({ ...f, color: '' }))} style={{ background: 'none', border: 'none', fontSize: '11px', color: '#64748b', cursor: 'pointer', padding: 0 }}>Clear</button>
                </div>
              )}
            </FormField>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={!form.name.trim()} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: form.name.trim() ? '#1a428a' : '#94a3b8', fontSize: '13px', fontWeight: '600', color: 'white', cursor: form.name.trim() ? 'pointer' : 'not-allowed' }}>{editing ? 'Save Changes' : 'Add Competitor'}</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Oil form modal */}
      {showOilForm && (() => {
        const parentComp = competitors.find(c => c.id === expanded);
        const codePrefix = parentComp?.code ? parentComp.code + '-' : '';
        return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1f2937' }}>{editingOil ? 'Edit Oil' : `Add Oil — ${parentComp?.name || ''}`}</h3>
              <button onClick={() => { setShowOilForm(false); setEditingOil(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
            <FormField label="Oil Name" required>
              <input style={inputStyle} value={oilForm.name} onChange={e => setOilForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="FRY MAX" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
            </FormField>
            <FormField label="Oil Code">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                {codePrefix && <span style={{ padding: '10px 0 10px 14px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRight: 'none', borderRadius: '10px 0 0 10px', fontSize: '13px', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap' }}>{codePrefix}</span>}
                <input style={{ ...inputStyle, borderRadius: codePrefix ? '0 10px 10px 0' : '10px', flex: 1 }} value={oilForm.code.startsWith(codePrefix) ? oilForm.code.slice(codePrefix.length) : oilForm.code} onChange={e => setOilForm(f => ({ ...f, code: codePrefix + e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="FM" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </div>
              {(() => {
                const isDupe = oilForm.code && oilTypes.some(o => o.code === oilForm.code && o.id !== editingOil);
                return (
                  <div style={{ fontSize: '10px', marginTop: '4px', color: isDupe ? '#dc2626' : '#94a3b8' }}>
                    {isDupe ? `⚠ Code "${oilForm.code}" already exists` : `Will generate: ${oilForm.code || `${codePrefix}...`}`}
                  </div>
                );
              })()}
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Tier">
                <select style={selectStyle} value={oilForm.tier} onChange={e => setOilForm(f => ({ ...f, tier: e.target.value }))}>
                  <option value="standard">STANDARD</option>
                  <option value="premium">PREMIUM</option>
                  <option value="elite">ELITE</option>
                </select>
              </FormField>
              <FormField label="Oil Type">
                <select style={selectStyle} value={oilForm.oilType} onChange={e => setOilForm(f => ({ ...f, oilType: e.target.value }))}>
                  <option value="">— SELECT —</option>
                  {oilTypeOptions.map(b => (
                    <option key={b} value={b}>{b.toUpperCase()}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Pack Size">
                <select style={selectStyle} value={oilForm.packSize} onChange={e => setOilForm(f => ({ ...f, packSize: e.target.value }))}>
                  <option value="">— SELECT —</option>
                  {PACK_SIZES.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                    <button type="button" onClick={() => setOilForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      background: oilForm.status === 'active' ? '#10b981' : '#cbd5e1'
                    }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: oilForm.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                    </button>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: oilForm.status === 'active' ? '#059669' : '#94a3b8' }}>{oilForm.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                  </div>
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => { setShowOilForm(false); setEditingOil(null); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => saveOil(expanded)} disabled={!oilForm.name.trim()} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: oilForm.name.trim() ? '#1a428a' : '#94a3b8', fontSize: '13px', fontWeight: '600', color: 'white', cursor: oilForm.name.trim() ? 'pointer' : 'not-allowed' }}>{editingOil ? 'Save' : 'Add'}</button>
            </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// ==================== VENUE MANAGEMENT ====================
const VenueManagement = ({ venues, setVenues, oilTypes, groups, competitors, users, setActiveSection, isDesktop, autoOpenForm, clearAutoOpen }) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByTpm, setSortByTpm] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [form, setForm] = useState({ name: '', fryerCount: 4, defaultOil: '', groupId: '', status: 'active', customerCode: '', volumeBracket: '', state: '', bdmId: '' });

  useEffect(() => {
    if (autoOpenForm) { setForm({ name: '', fryerCount: 4, defaultOil: '', groupId: '', status: 'active', customerCode: '', volumeBracket: '', state: '', bdmId: '' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
  }, [autoOpenForm]);
  const colFilters = useColumnFilters();

  const VENUE_COLS = [
    { key: 'name', label: 'Venue Name', locked: true },
    { key: 'code', label: 'Cust Code' },
    { key: 'group', label: 'Group Name' },
    { key: 'groupCode', label: 'Group Code' },
    { key: 'state', label: 'State' },
    { key: 'oil', label: 'Main Oil' },
    { key: 'volume', label: 'Vol Bracket' },
    { key: 'fryers', label: 'Fryers' },
    { key: 'tpm', label: 'Last TPM' },
  ];
  const [visibleCols, setVisibleCols] = useState(VENUE_COLS.filter(c => c.key !== 'groupCode').map(c => c.key));
  const colVis = (key) => visibleCols.includes(key);

  const filtered = (() => {
    let data = venues.filter(v => {
      if (v.status === 'trial-only') return false;
      const matchStatus = statusFilter === 'all' || v.status === statusFilter;
      return matchStatus;
    });
    data = colFilters.applyFilters(data, {
      name: v => v.name || '',
      code: v => v.customerCode || '',
      group: v => v.groupId ? (groups.find(g => g.id === v.groupId)?.name || '') : '',
      groupCode: v => v.groupId ? (groups.find(g => g.id === v.groupId)?.groupCode || '') : '',
      state: v => v.state || '',
      oil: v => oilTypes.find(o => o.id === v.defaultOil)?.name || '',
      volume: v => VOLUME_BRACKETS.find(b => b.key === v.volumeBracket)?.label || '',
      fryers: v => String(v.fryerCount || ''),
      tpm: v => relativeDate(v.lastTpmDate),
    });
    return data.sort((a, b) => {
      if (sortByTpm) return (b.lastTpmDate || '').localeCompare(a.lastTpmDate || '');
      return a.name.localeCompare(b.name);
    });
  })();

  const isFormValid = form.name.trim() && form.defaultOil && form.state;

  const handleSave = () => {
    if (!isFormValid) return;
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), customerCode: form.customerCode ? form.customerCode.trim().toUpperCase() : '' };
    // Duplicate customer code check
    if (cleaned.customerCode) {
      const dupCode = venues.find(v => v.customerCode && v.customerCode === cleaned.customerCode && v.id !== editing);
      if (dupCode) { alert(`Customer code "${cleaned.customerCode}" is already used by ${dupCode.name}`); return; }
    }
    // Duplicate name check
    const dupName = venues.find(v => v.name === cleaned.name && v.id !== editing);
    if (dupName) { alert(`A venue named "${cleaned.name}" already exists`); return; }
    if (editing) {
      setVenues(prev => prev.map(v => v.id === editing ? { ...v, ...cleaned, groupId: cleaned.groupId || null } : v));
    } else {
      setVenues(prev => [...prev, { ...cleaned, id: `v-${Date.now()}`, groupId: cleaned.groupId || null }]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (venue) => {
    setForm({ name: venue.name, fryerCount: venue.fryerCount, defaultOil: venue.defaultOil, groupId: venue.groupId || '', status: venue.status, customerCode: venue.customerCode || '', volumeBracket: venue.volumeBracket || '', state: venue.state || '', bdmId: venue.bdmId || '' });
    setEditing(venue.id);
    setShowForm(true);
  };

  const getOilName = (id) => oilTypes.find(o => o.id === id)?.name || '—';
  const getGroupName = makeGetGroupName(groups);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Building} title="Venue Management" count={venues.filter(v => v.status !== 'trial-only').length} onAdd={() => { setForm({ name: '', fryerCount: 4, defaultOil: '', groupId: '', status: 'active', customerCode: '', volumeBracket: '', state: '', bdmId: '' }); setEditing(null); setShowForm(true); }} addLabel="Add Venue" />

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ key: 'all', label: 'All', count: venues.filter(v => v.status !== 'trial-only').length }, { key: 'active', label: 'Active', count: venues.filter(v => v.status === 'active').length }, { key: 'inactive', label: 'Inactive', count: venues.filter(v => v.status === 'inactive').length }].map(f => {
          const selectedColor = f.key === 'active' ? { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' } : f.key === 'inactive' ? { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } : { bg: '#e8eef6', text: '#1a428a', border: '#1a428a' };
          const isActive = statusFilter === f.key;
          return (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            border: `1.5px solid ${isActive ? selectedColor.border : '#e2e8f0'}`,
            background: isActive ? selectedColor.bg : 'white',
            color: isActive ? selectedColor.text : '#64748b', transition: 'all 0.2s'
          }}>{f.label} ({f.count})</button>
          );
        })}
        <span onClick={() => { setSortByTpm(false); }} style={{
          fontSize: '11px', color: !sortByTpm ? '#1a428a' : '#94a3b8', cursor: 'pointer', marginLeft: 'auto',
          fontWeight: !sortByTpm ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{!sortByTpm ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} A–Z</span>
        <span onClick={() => setSortByTpm(true)} style={{
          fontSize: '11px', color: sortByTpm ? '#1a428a' : '#94a3b8', cursor: 'pointer',
          fontWeight: sortByTpm ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{sortByTpm ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} Last TPM</span>
        <ColumnToggle columns={VENUE_COLS} visible={visibleCols} setVisible={setVisibleCols} />
      </div>

      <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />

        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  {colVis('code') && <FilterableTh colKey="code" label="Cust Code" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.customerCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('group') && <FilterableTh colKey="group" label="Group Name" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.groupId ? (groups.find(g => g.id === v.groupId)?.name || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('groupCode') && <FilterableTh colKey="groupCode" label="Group Code" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.groupId ? (groups.find(g => g.id === v.groupId)?.groupCode || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('state') && <FilterableTh colKey="state" label="State" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.state)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('oil') && <FilterableTh colKey="oil" label="Main Oil" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => oilTypes.find(o => o.id === v.defaultOil)?.name || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('volume') && <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({value:b.label,label:b.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('fryers') && <FilterableTh colKey="fryers" label="Fryers" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => String(v.fryerCount))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('tpm') && <FilterableTh colKey="tpm" label="Last TPM" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => relativeDate(v.lastTpmDate))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    {venues.filter(v => v.status !== 'trial-only').length === 0 ? (
                      <div>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏪</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No venues yet</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Click "Add Venue" to add your first venue, or load demo data to explore.</div>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '13px' }}>No venues match your filters</span>
                    )}
                  </td></tr>
                ) : filtered.map(venue => {
                  const grp = venue.groupId ? groups.find(g => g.id === venue.groupId) : null;
                  return (
                  <tr key={venue.id} className={venue.status === 'inactive' ? 'inactive-row' : ''} onClick={() => setSelectedVenue(venue)} style={{ cursor: 'pointer', height: '36px' }}>
                    <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={venue.name}>{venue.name}</td>
                    {colVis('code') && <td style={{ textAlign: 'center' }}>{<CodeBadge code={venue.customerCode} minWidth="76px" />}</td>}
                    {colVis('group') && <td style={{ color: '#1f2937', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={grp ? grp.name : 'STREET'}>{grp ? grp.name : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: '400' }}>STREET</span>}</td>}
                    {colVis('groupCode') && <td style={{ textAlign: 'center' }}>{<CodeBadge code={grp?.groupCode} variant="charcoal" />}</td>}
                    {colVis('state') && <td><StateBadge state={venue.state} /></td>}
                    {colVis('oil') && <td style={{ textAlign: 'center' }}><OilBadge oil={oilTypes.find(o => o.id === venue.defaultOil)} competitors={competitors} compact /></td>}
                    {colVis('volume') && <td style={{ textAlign: "center" }}><VolumePill bracket={venue.volumeBracket} /></td>}
                    {colVis('fryers') && <td style={{ textAlign: 'center', fontWeight: '600' }}>{venue.fryerCount}</td>}
                    {colVis('tpm') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(venue.lastTpmDate) || '—'}</td>}
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(venue); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                        <ChevronDown size={14} color="#94a3b8" style={{ transform: 'rotate(-90deg)' }} />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {/* Venue Detail Popup */}
      {selectedVenue && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }} onClick={() => setSelectedVenue(null)}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px',
            maxHeight: '85vh', overflow: 'auto', padding: '20px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: '0 0 6px' }}>{selectedVenue.name}</h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {selectedVenue.customerCode && (
                    <CodeBadge code={selectedVenue.customerCode} minWidth="76px" />
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedVenue(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>

            {[
              
              { label: 'State', value: selectedVenue.state || '—', color: STATE_COLOURS[selectedVenue.state] },
              { label: 'Group', value: selectedVenue.groupId ? getGroupName(selectedVenue.groupId) : 'STREET VENUE' },
              { label: 'Fryers', value: selectedVenue.fryerCount },
              { label: 'Volume', value: VOLUME_BRACKETS.find(b => b.key === selectedVenue.volumeBracket)?.label || '—' },
              
              
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{row.label}</span>
                <span style={{ fontSize: '13px', fontWeight: row.color ? '700' : '500', color: row.color || '#1f2937', textAlign: 'right' }}>{row.value}</span>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Oil</span>
              <OilBadge oil={oilTypes.find(o => o.id === selectedVenue.defaultOil)} competitors={competitors} />
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginBottom: '8px' }}>PEOPLE</div>
              {(() => {
                const group = selectedVenue.groupId ? groups.find(g => g.id === selectedVenue.groupId) : null;
                const nam = group?.namId ? users.find(u => u.id === group.namId) : null;
                const bdm = selectedVenue.bdmId ? users.find(u => u.id === selectedVenue.bdmId) : null;
                const people = [
                  nam && { role: 'nam', name: nam.name },
                  bdm && { role: 'bdm', name: bdm.name },
                ].filter(Boolean);
                if (people.length === 0) return <div style={{ fontSize: '13px', color: '#64748b', padding: '8px 0' }}>No assigned personnel</div>;
                return people.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <RoleBadge role={p.role} />
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937' }}>{p.name}</span>
                  </div>
                ));
              })()}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => { const v = selectedVenue; setSelectedVenue(null); handleEdit(v); }} style={{
                flex: 1, padding: '14px', background: '#1a428a', color: 'white',
                border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}>Edit Venue</button>
              <button onClick={() => setSelectedVenue(null)} style={{
                flex: 1, padding: '14px', background: 'white', color: '#64748b',
                border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Venue Add/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{editing ? 'Edit Venue' : 'New Venue'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
              <FormField label="Venue Name" required>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="TRUE SOUTH" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Cust Code">
                  <input style={inputStyle} value={form.customerCode} onChange={e => setForm(f => ({ ...f, customerCode: e.target.value.toUpperCase() }))} placeholder="TRUSOUV0" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
                <FormField label="Fryers" required>
                  <input
                    type="number" min="1" max="20" placeholder="4" style={inputStyle}
                    value={form.fryerCount === 0 ? '' : form.fryerCount}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') { setForm(f => ({ ...f, fryerCount: 0 })); return; }
                      const v = parseInt(raw);
                      if (!isNaN(v) && v >= 1 && v <= 20) setForm(f => ({ ...f, fryerCount: v }));
                    }}
                    onBlur={e => { if (!form.fryerCount || form.fryerCount < 1) setForm(f => ({ ...f, fryerCount: 1 })); e.target.style.borderColor = '#e2e8f0'; }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'}
                  />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Main Oil" required>
                  <select style={selectStyle} value={form.defaultOil} onChange={e => setForm(f => ({ ...f, defaultOil: e.target.value }))}>
                    <option value="">SELECT OIL...</option>
                    {oilTypes.filter(o => o.category === 'cookers' && o.status === 'active').map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Volume Bracket">
                  <select style={selectStyle} value={form.volumeBracket} onChange={e => setForm(f => ({ ...f, volumeBracket: e.target.value }))}>
                    <option value="">SELECT...</option>
                    {VOLUME_BRACKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                  </select>
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Customer Group">
                  <select style={selectStyle} value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}>
                    <option value="">STREET VENUE</option>
                    {groups.filter(g => g.status === 'active').map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="State" required>
                  <select style={selectStyle} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                    <option value="">SELECT...</option>
                    {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: '10px' }}>
                <FormField label="Assigned BDM">
                  <select style={selectStyle} value={form.bdmId} onChange={e => setForm(f => ({ ...f, bdmId: e.target.value }))}>
                    <option value="">UNASSIGNED</option>
                    {users.filter(u => u.role === 'bdm' && u.status === 'active').map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </FormField>
                {editing && (
                  <FormField label="Status">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                      <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                      }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                    </div>
                  </FormField>
                )}
              </div>
              <button onClick={handleSave} disabled={!isFormValid} style={{
                width: '100%', padding: '10px', background: isFormValid ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: isFormValid ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{editing ? 'Save Changes' : 'Create Venue'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== GROUP MANAGEMENT ====================
const GroupManagement = ({ groups, setGroups, venues, setVenues, users, oilTypes, competitors, autoOpenForm, clearAutoOpen }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByActive, setSortByActive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [form, setForm] = useState({ name: '', groupCode: '', username: '', namId: '', status: 'active' });
  const colFilters = useColumnFilters();

  const GROUP_COLS = [
    { key: 'username', label: 'Username', locked: true },
    { key: 'name', label: 'Group Name', locked: true },
    { key: 'code', label: 'Group Code' },
    { key: 'states', label: 'States' },
    { key: 'venues', label: 'Venues' },
    { key: 'nam', label: 'NAM' },
    { key: 'oil', label: 'Main Oil' },
    { key: 'tpm', label: 'Last TPM' },
  ];
  const [visibleCols, setVisibleCols] = useState(GROUP_COLS.map(c => c.key));
  const colVis = (key) => visibleCols.includes(key);

  useEffect(() => {
    if (autoOpenForm) { setForm({ name: '', groupCode: '', username: '', namId: '', status: 'active' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
  }, [autoOpenForm]);

  const filtered = (() => {
    let data = groups.filter(g => statusFilter === 'all' || g.status === statusFilter);
    data = colFilters.applyFilters(data, {
      username: g => g.username || '',
      name: g => g.name || '',
      code: g => g.groupCode || '',
      states: g => { const gv = venues.filter(v => v.groupId === g.id); return [...new Set(gv.map(v => v.state))].join(', '); },
      venues: g => String(venues.filter(v => v.groupId === g.id).length),
      nam: g => g.namId ? (users.find(u => u.id === g.namId)?.name || '') : '',
      oil: g => { const gv = venues.filter(v => v.groupId === g.id); return [...new Set(gv.map(v => oilTypes.find(o => o.id === v.defaultOil)?.name).filter(Boolean))].join(', '); },
      tpm: g => relativeDate(g.lastTpmDate),
    });
    return data.sort((a, b) => {
      if (sortByActive) return (b.lastTpmDate || '').localeCompare(a.lastTpmDate || '');
      return a.name.localeCompare(b.name);
    });
  })();
  const nams = users.filter(u => u.role === 'nam' && u.status === 'active');

  const handleSave = () => {
    if (!form.name) return;
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), groupCode: form.groupCode ? form.groupCode.trim().toUpperCase() : '', username: form.username ? form.username.trim().toUpperCase() : '' };
    // Duplicate checks
    if (cleaned.groupCode) {
      const dupCode = groups.find(g => g.groupCode === cleaned.groupCode && g.id !== editing);
      if (dupCode) { alert(`Group code "${cleaned.groupCode}" is already used by ${dupCode.name}`); return; }
    }
    if (cleaned.username) {
      const dupUser = groups.find(g => g.username === cleaned.username && g.id !== editing);
      if (dupUser) { alert(`Username "${cleaned.username}" is already used by ${dupUser.name}`); return; }
    }
    const dupName = groups.find(g => g.name === cleaned.name && g.id !== editing);
    if (dupName) { alert(`A group named "${cleaned.name}" already exists`); return; }
    if (editing) {
      setGroups(prev => prev.map(g => g.id === editing ? { ...g, ...cleaned } : g));
    } else {
      const newId = `g-${Date.now()}`;
      setGroups(prev => [...prev, { ...cleaned, id: newId, status: 'active' }]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (group) => {
    setForm({ name: group.name, groupCode: group.groupCode || '', username: group.username || '', namId: group.namId || '', status: group.status || 'active' });
    setEditing(group.id);
    setShowForm(true);
  };

  const getGroupVenues = (groupId) => venues.filter(v => v.groupId === groupId);
  const getUserName = makeGetUserName(users);
  const getPrimaryOil = (groupId) => {
    const gv = venues.filter(v => v.groupId === groupId && v.status === 'active');
    if (gv.length === 0) return null;
    const counts = {};
    gv.forEach(v => { counts[v.defaultOil] = (counts[v.defaultOil] || 0) + 1; });
    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return oilTypes.find(o => o.id === topId) || null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Layers} title="Customer Group Management" count={groups.length} onAdd={() => { setForm({ name: '', groupCode: '', username: '', namId: '', status: 'active' }); setEditing(null); setShowForm(true); }} addLabel="Add Group" />
      
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ key: 'all', label: 'All', count: groups.length }, { key: 'active', label: 'Active', count: groups.filter(g => g.status === 'active').length }, { key: 'inactive', label: 'Inactive', count: groups.filter(g => g.status === 'inactive').length }].map(f => {
          const selectedColor = f.key === 'active' ? { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' } : f.key === 'inactive' ? { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } : { bg: '#e8eef6', text: '#1a428a', border: '#1a428a' };
          const isActive = statusFilter === f.key;
          return (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            border: `1.5px solid ${isActive ? selectedColor.border : '#e2e8f0'}`,
            background: isActive ? selectedColor.bg : 'white',
            color: isActive ? selectedColor.text : '#64748b'
          }}>{f.label} ({f.count})</button>
          );
        })}
        <span onClick={() => { setSortByActive(false); }} style={{
          fontSize: '11px', color: !sortByActive ? '#1a428a' : '#94a3b8', cursor: 'pointer', marginLeft: 'auto',
          fontWeight: !sortByActive ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{!sortByActive ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} A–Z</span>
        <span onClick={() => setSortByActive(true)} style={{
          fontSize: '11px', color: sortByActive ? '#1a428a' : '#94a3b8', cursor: 'pointer',
          fontWeight: sortByActive ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{sortByActive ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} Last TPM</span>
        <ColumnToggle columns={GROUP_COLS} visible={visibleCols} setVisible={setVisibleCols} />
      </div>

        <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <FilterableTh colKey="username" label="Username" options={getUniqueValues(groups, g => g.username)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  <FilterableTh colKey="name" label="Group Name" options={getUniqueValues(groups, g => g.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  {colVis('code') && <FilterableTh colKey="code" label="Group Code" options={getUniqueValues(groups, g => g.groupCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('states') && <FilterableTh colKey="states" label="States" options={['VIC','NSW','QLD','SA','WA','TAS'].map(s => ({value:s,label:s}))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('venues') && <FilterableTh colKey="venues" label="Venues" options={getUniqueValues(groups, g => String(venues.filter(v => v.groupId === g.id).length))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('nam') && <FilterableTh colKey="nam" label="NAM" options={getUniqueValues(groups, g => g.namId ? (users.find(u => u.id === g.namId)?.name || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('oil') && <FilterableTh colKey="oil" label="Main Oil" options={getUniqueValues(groups.filter(g => g.status === 'active'), g => { const gv = venues.filter(v => v.groupId === g.id); const oils = [...new Set(gv.map(v => oilTypes.find(o => o.id === v.defaultOil)?.name).filter(Boolean))]; return oils.join(', ') || ''; })} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('tpm') && <FilterableTh colKey="tpm" label="Last TPM" options={getUniqueValues(groups, g => relativeDate(g.lastTpmDate))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    {groups.length === 0 ? (
                      <div>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏢</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No groups yet</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Groups link multiple venues under one account. Click "Add Group" to get started.</div>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '13px' }}>No groups match your filters</span>
                    )}
                  </td></tr>
                ) : filtered.map(group => {
                  const gVenues = getGroupVenues(group.id);
                  const activeVenues = gVenues.filter(v => v.status !== 'trial-only');
                  const states = [...new Set(activeVenues.map(v => v.state))].sort();
                  return (
                    <tr key={group.id} className={group.status === 'inactive' ? 'inactive-row' : ''} onClick={() => setSelectedGroup(group)} style={{ cursor: 'pointer', height: '36px' }}>
                      <td><CodeBadge code={group.username} minWidth="90px" /></td>
                      <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={group.name}>{group.name}</td>
                      {colVis('code') && <td style={{ textAlign: 'center' }}>{<CodeBadge code={group.groupCode} variant="charcoal" />}</td>}
                      {colVis('states') && <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '3px', height: '20px', alignItems: 'center' }}>
                          {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'].map(st => (
                            <span key={st} style={{ fontSize: '10px', fontWeight: '700', textAlign: 'center', color: states.includes(st) ? (STATE_COLOURS[st] || '#64748b') : '#e2e8f0', letterSpacing: '0.2px', width: '24px', flexShrink: 0 }}>{st}</span>
                          ))}
                        </div>
                      </td>}
                      {colVis('venues') && <td style={{ textAlign: 'center', fontWeight: '600' }}>{activeVenues.length}</td>}
                      {colVis('nam') && <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{getUserName(group.namId)}</td>}
                      {colVis('oil') && <td style={{ textAlign: 'center' }}><OilBadge oil={getPrimaryOil(group.id)} competitors={competitors} compact /></td>}
                      {colVis('tpm') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(group.lastTpmDate) || '—'}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(group); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                          <ChevronDown size={14} color="#94a3b8" style={{ transform: 'rotate(-90deg)' }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      {selectedGroup && (() => {
        const group = selectedGroup;
        const gVenues = getGroupVenues(group.id);
        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
            overflowY: 'auto', WebkitOverflowScrolling: 'touch'
          }} onClick={() => setSelectedGroup(null)}>
            <div style={{
              background: 'white', borderRadius: '16px', width: '100%', maxWidth: '560px',
              maxHeight: '85vh', overflow: 'auto', padding: '20px', marginTop: '40px'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: '0 0 6px' }}>{group.name}</h3>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {group.groupCode && <CodeBadge code={group.groupCode} variant="charcoal" />}
                    {group.status === 'inactive' && <StatusBadge status="inactive" />}
                  </div>
                </div>
                <button onClick={() => setSelectedGroup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
              </div>

              {/* Summary row */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px', fontSize: '12px', color: '#64748b' }}>
                {group.username && <span>Login: <strong style={{ color: '#64748b' }}>{group.username}</strong></span>}
                <span>NAM: <strong style={{ color: '#1f2937' }}>{getUserName(group.namId)}</strong></span>
                <span>Venues: <strong style={{ color: '#1f2937' }}>{gVenues.filter(v => v.status !== 'trial-only').length}</strong></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Main Oil: <OilBadge oil={getPrimaryOil(group.id)} competitors={competitors} /></span>
              </div>

              {/* Linked Venues */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.5px', marginBottom: '8px' }}>LINKED VENUES</div>
                {gVenues.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#64748b', padding: '12px 0' }}>No venues linked to this group yet</div>
                ) : (
                  gVenues.filter(v => v.status !== 'trial-only').map(v => (
                    <div key={v.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>{v.name}</span>
                          <StateBadge state={v.state} />
                        </div>
                        {v.customerCode && <CodeBadge code={v.customerCode} minWidth="76px" />}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', fontSize: '11px', color: '#64748b' }}>
                        <span>Fryers: <strong style={{ color: '#1f2937' }}>{v.fryerCount}</strong></span>
                        {v.lastTpmDate && <>
                          <span style={{ color: '#cbd5e1' }}>·</span>
                          <span>Last TPM: {relativeDate(v.lastTpmDate)}</span>
                        </>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{editing ? 'Edit Group' : 'New Group'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
              <FormField label="Group Name" required>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="JBS HOSPITALITY GROUP" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <FormField label="Group Code">
                <input style={inputStyle} value={form.groupCode} onChange={e => setForm(f => ({ ...f, groupCode: e.target.value.toUpperCase() }))} placeholder="JBS" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <FormField label="Login Username">
                <div style={{ display: 'flex' }}>
                  <span style={{ padding: '8px 0 8px 10px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: '13px', fontWeight: '600', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>FRYSMRT-</span>
                  <input style={{ ...inputStyle, borderRadius: '0 8px 8px 0', fontFamily: 'monospace', flex: 1 }} value={form.username.startsWith('FRYSMRT-') ? form.username.slice(8) : form.username} onChange={e => setForm(f => ({ ...f, username: 'FRYSMRT-' + e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="JBS" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: '10px' }}>
                <FormField label="Assign NAM">
                  <select style={selectStyle} value={form.namId} onChange={e => setForm(f => ({ ...f, namId: e.target.value }))}>
                    <option value="">UNASSIGNED</option>
                    {nams.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </FormField>
                {editing && (
                  <FormField label="Status">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                      <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                      }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                    </div>
                  </FormField>
                )}
              </div>
              <button onClick={handleSave} disabled={!form.name.trim()} style={{
                width: '100%', padding: '10px', background: form.name.trim() ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: form.name.trim() ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{editing ? 'Save Changes' : 'Create Group'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== USER MANAGEMENT ====================
const UserManagement = ({ users, setUsers, venues, groups, autoOpenForm, clearAutoOpen }) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByActive, setSortByActive] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '' });
  const colFilters = useColumnFilters();

  const USER_COLS = [
    { key: 'name', label: 'Name', locked: true },
    { key: 'role', label: 'Role' },
    { key: 'username', label: 'Username' },
    { key: 'region', label: 'State' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'lastActive', label: 'Last Active' },
    { key: 'repCode', label: 'Rep Code' },
  ];
  const [visibleCols, setVisibleCols] = useState(USER_COLS.filter(c => c.key !== 'repCode').map(c => c.key));
  const colVis = (key) => visibleCols.includes(key);

  useEffect(() => {
    if (autoOpenForm) { setForm({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
  }, [autoOpenForm]);

  const filtered = (() => {
    let data = users.filter(u => {
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchStatus;
    });
    data = colFilters.applyFilters(data, {
      name: u => u.name || '',
      role: u => ROLE_LABELS[u.role] || u.role,
      username: u => u.username || '',
      region: u => u.region || '',
      permissions: u => ROLE_PERMISSIONS[u.role] || '',
      lastActive: u => relativeDate(u.lastActive),
      repCode: u => u.repCode || '',
    });
    return data.sort((a, b) => {
      if (sortByActive) return (b.lastActive || '').localeCompare(a.lastActive || '');
      return a.name.localeCompare(b.name);
    });
  })();

  const handleSave = () => {
    if (!form.name) return;
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), repCode: form.repCode ? form.repCode.trim().toUpperCase() : '', username: form.username ? form.username.trim() : '' };
    // Duplicate checks
    if (cleaned.username) {
      const dupUser = users.find(u => u.username && u.username.toLowerCase() === cleaned.username.toLowerCase() && u.id !== editing);
      if (dupUser) { alert(`Username "${cleaned.username}" is already taken by ${dupUser.name}`); return; }
    }
    if (cleaned.repCode) {
      const dupRep = users.find(u => u.repCode && u.repCode === cleaned.repCode && u.id !== editing);
      if (dupRep) { alert(`Rep code "${cleaned.repCode}" is already used by ${dupRep.name}`); return; }
    }
    if (editing) {
      setUsers(prev => prev.map(u => u.id === editing ? { ...u, ...cleaned, venueId: cleaned.venueId || null, groupId: cleaned.groupId || null } : u));
    } else {
      setUsers(prev => [...prev, { ...cleaned, id: `u-${Date.now()}`, venueId: cleaned.venueId || null, groupId: cleaned.groupId || null }]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (user) => {
    setForm({ name: user.name, role: user.role, venueId: user.venueId || '', groupId: user.groupId || '', region: user.region || '', status: user.status, crmCode: user.crmCode || '', repCode: user.repCode || '', username: user.username || '' });
    setEditing(user.id);
    setShowForm(true);
  };

  const getGroupName = makeGetGroupName(groups);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Users} title="User Management" count={users.length} onAdd={() => { setForm({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '' }); setEditing(null); setShowForm(true); }} addLabel="Add User" />

      {/* Status filter + sort + column toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[{ key: 'all', label: 'All', count: users.length }, { key: 'active', label: 'Active', count: users.filter(u => u.status === 'active').length }, { key: 'inactive', label: 'Inactive', count: users.filter(u => u.status === 'inactive').length }].map(f => {
          const selectedColor = f.key === 'active' ? { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' } : f.key === 'inactive' ? { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' } : { bg: '#e8eef6', text: '#1a428a', border: '#1a428a' };
          const isActive = statusFilter === f.key;
          return (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
            border: `1.5px solid ${isActive ? selectedColor.border : '#e2e8f0'}`,
            background: isActive ? selectedColor.bg : 'white',
            color: isActive ? selectedColor.text : '#64748b'
          }}>{f.label} ({f.count})</button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span onClick={() => { setSortByActive(false); }} style={{
          fontSize: '11px', color: !sortByActive ? '#1a428a' : '#94a3b8', cursor: 'pointer',
          fontWeight: !sortByActive ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{!sortByActive ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} A–Z</span>
        <span onClick={() => setSortByActive(true)} style={{
          fontSize: '11px', color: sortByActive ? '#1a428a' : '#94a3b8', cursor: 'pointer',
          fontWeight: sortByActive ? '600' : '500', display: 'flex', alignItems: 'center', gap: '4px'
        }}>{sortByActive ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />} Last Active</span>
        <ColumnToggle columns={USER_COLS} visible={visibleCols} setVisible={setVisibleCols} />
      </div>

      <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />

        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <FilterableTh colKey="name" label="Name" options={getUniqueValues(users, u => u.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  {colVis('role') && <FilterableTh colKey="role" label="Role" options={getUniqueValues(users, u => ROLE_LABELS[u.role] || u.role)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('username') && <FilterableTh colKey="username" label="Username" options={getUniqueValues(users, u => u.username)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('region') && <FilterableTh colKey="region" label="State" options={getUniqueValues(users, u => u.region)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('permissions') && <FilterableTh colKey="permissions" label="Permissions" options={getUniqueValues(users, u => ROLE_PERMISSIONS[u.role] || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('lastActive') && <FilterableTh colKey="lastActive" label="Last Active" options={getUniqueValues(users, u => relativeDate(u.lastActive))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('repCode') && <FilterableTh colKey="repCode" label="Rep Code" options={getUniqueValues(users, u => u.repCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    {users.length === 0 ? (
                      <div>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No users yet</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Add BDMs, NAMs, and admins here. Click "Add User" to create the first account.</div>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '13px' }}>No users match your filters</span>
                    )}
                  </td></tr>
                ) : filtered.map(user => (
                  <tr key={user.id} className={user.status === 'inactive' ? 'inactive-row' : ''} style={{ height: '36px' }}>
                    <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.name}>{user.name}</td>
                    {colVis('role') && <td style={{ textAlign: "center" }}><RoleBadge role={user.role} /></td>}
                    {colVis('username') && <td style={{ fontSize: '12px', color: '#64748b' }}>{user.username ? user.username.toLowerCase() : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    {colVis('region') && <td><StateBadge state={user.region} /></td>}
                    {colVis('permissions') && <td style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'normal', maxWidth: '220px', lineHeight: '1.4' }}>{ROLE_PERMISSIONS[user.role] || '—'}</td>}
                    {colVis('lastActive') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(user.lastActive) || '—'}</td>}
                    {colVis('repCode') && <td style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{user.repCode || <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                    <td><button onClick={() => handleEdit(user)} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, padding: '20px',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }} onClick={() => { setShowForm(false); setEditing(null); }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{editing ? 'Edit User' : 'New User'}</h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
            </div>
            <div style={{ padding: '16px' }}>
              <FormField label="Full Name" required>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="DAVID ANGELKOVSKI" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Role" required>
                  <select style={selectStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </FormField>
                {editing && (
                  <FormField label="Status">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '33px' }}>
                      <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                        width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                        background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                      }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                    </div>
                  </FormField>
                )}
              </div>
              {(form.role === 'bdm' || form.role === 'state_manager') && (
                <FormField label="State">
                  <select style={selectStyle} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                    <option value="">SELECT STATE...</option>
                    {['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FormField>
              )}
              {form.role === 'bdm' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <FormField label="Rep Code">
                    <input style={inputStyle} value={form.repCode} onChange={e => setForm(f => ({ ...f, repCode: e.target.value.toUpperCase() }))} placeholder="V16" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    {form.repCode && users.some(u => u.repCode === form.repCode && u.id !== editing) && (
                      <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>⚠ Rep code "{form.repCode}" already assigned</div>
                    )}
                  </FormField>
                  <FormField label="Username">
                    <input style={inputStyle} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} placeholder="dangelkovski" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  </FormField>
                </div>
              )}
              {form.role !== 'bdm' && (
                <FormField label="Username">
                  <input style={inputStyle} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} placeholder="dangelkovski" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
              )}
              <button onClick={handleSave} disabled={!form.name.trim()} style={{
                width: '100%', padding: '10px', background: form.name.trim() ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: form.name.trim() ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{editing ? 'Save Changes' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== CONTACT MANAGEMENT ====================

// ==================== PERMISSIONS & ACCESS ====================

const TRIAL_STATUS_CONFIGS = {
  'pending': { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1', label: 'Pipeline', accent: '#94a3b8' },
  'in-progress': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', label: 'Active', accent: '#3b82f6' },
  'completed': { bg: '#fef3c7', text: '#a16207', border: '#fde047', label: 'Pending', accent: '#fbbf24' },
  'won': { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'Successful', accent: '#10b981' },
  'lost': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Unsuccessful', accent: '#ef4444' },
};

const TrialStatusBadge = ({ status }) => {
  const c = TRIAL_STATUS_CONFIGS[status] || TRIAL_STATUS_CONFIGS['pending'];
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px', whiteSpace: 'nowrap',
      display: 'inline-block', width: '82px', textAlign: 'center'
    }}>{c.label}</span>
  );
};

// ==================== CALENDAR ICON PICKER ====================
const CalendarIconPicker = ({ dateFrom, dateTo, setDateFrom, setDateTo, setAllTime, externalLabel }) => {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date());
  const [selecting, setSelecting] = useState(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fmtDisplay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';

  const handleDayClick = (day) => {
    const dateStr = fmt(year, month, day);
    setAllTime(false);
    if (!dateFrom || selecting === 'from' || (dateFrom && dateTo)) {
      setDateFrom(dateStr);
      setDateTo('');
      setSelecting('to');
    } else {
      if (dateStr < dateFrom) { setDateTo(dateFrom); setDateFrom(dateStr); }
      else { setDateTo(dateStr); }
      setSelecting(null);
      setOpen(false);
    }
  };

  const isInRange = (day) => { if (!dateFrom || !dateTo) return false; const d = fmt(year, month, day); return d >= dateFrom && d <= dateTo; };
  const isStart = (day) => fmt(year, month, day) === dateFrom;
  const isEnd = (day) => fmt(year, month, day) === dateTo;
  const isToday = (day) => fmt(year, month, day) === new Date().toISOString().split('T')[0];

  const hasRange = dateFrom || dateTo || externalLabel;
  const rangeLabel = externalLabel || (dateFrom ? `${fmtDisplay(dateFrom)}${dateTo ? ` – ${fmtDisplay(dateTo)}` : ' – Today'}` : null);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '30px', height: '30px', borderRadius: '7px', border: '1.5px solid',
        borderColor: hasRange ? '#1a428a' : '#e2e8f0',
        background: hasRange ? '#e8eef6' : 'white',
        color: hasRange ? '#1a428a' : '#94a3b8',
        cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
      }}>
        <Calendar size={14} />
      </button>
      {hasRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#1a428a', whiteSpace: 'nowrap' }}>{rangeLabel}</span>
          <span onClick={() => { setDateFrom(''); setDateTo(''); setAllTime(true); setSelecting(null); }} style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8'
          }}><X size={11} /></span>
        </div>
      )}
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 2000,
            background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '14px', width: '280px'
          }}>
            {/* Start / End indicator */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => setSelecting('from')} style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1.5px solid',
                borderColor: selecting === 'from' || (!selecting && !dateFrom) ? '#1a428a' : '#e2e8f0',
                background: selecting === 'from' || (!selecting && !dateFrom) ? '#eef2ff' : '#f8fafc',
                fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                color: selecting === 'from' || (!selecting && !dateFrom) ? '#1a428a' : '#64748b', textAlign: 'center'
              }}>
                <div style={{ fontSize: '9px', fontWeight: '500', color: '#94a3b8', marginBottom: '1px' }}>Start</div>
                {dateFrom ? fmtDisplay(dateFrom) : '—'}
              </button>
              <button onClick={() => setSelecting('to')} style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1.5px solid',
                borderColor: selecting === 'to' ? '#1a428a' : '#e2e8f0',
                background: selecting === 'to' ? '#eef2ff' : '#f8fafc',
                fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                color: selecting === 'to' ? '#1a428a' : '#64748b', textAlign: 'center'
              }}>
                <div style={{ fontSize: '9px', fontWeight: '500', color: '#94a3b8', marginBottom: '1px' }}>End</div>
                {dateTo ? fmtDisplay(dateTo) : '—'}
              </button>
            </div>
            {/* Month nav */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}><ChevronLeft size={16} color="#64748b" /></button>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>{monthName}</span>
              <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}><ChevronRight size={16} color="#64748b" /></button>
            </div>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#94a3b8', padding: '2px 0' }}>{d}</div>
              ))}
            </div>
            {/* Days */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const start = isStart(day); const end = isEnd(day); const inRange = isInRange(day); const today = isToday(day);
                return (
                  <button key={day} onClick={() => handleDayClick(day)} style={{
                    width: '100%', aspectRatio: '1', borderRadius: (start || end) ? '50%' : inRange ? '4px' : '50%',
                    border: today && !start && !end && !inRange ? '1.5px solid #1a428a' : 'none',
                    background: (start || end) ? '#1a428a' : inRange ? '#dbeafe' : 'transparent',
                    color: (start || end) ? 'white' : inRange ? '#1e40af' : '#1f2937',
                    fontSize: '12px', fontWeight: (start || end || today) ? '700' : '400',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>{day}</button>
                );
              })}
            </div>
            {selecting === 'to' && <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>Now select end date</div>}
          </div>
        </>
      )}
    </div>
  );
};

const TrialManagement = ({ venues, setVenues, oilTypes, competitors, users, groups, trialReasons, volumeBrackets, isDesktop, tpmReadings, setTpmReadings, dateFrom, setDateFrom, dateTo, setDateTo, allTime, setAllTime, currentUser }) => {
  const [statusFilters, setStatusFilters] = useState([]);
  const [search, setSearch] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [expandedFryers, setExpandedFryers] = useState([1]);
  const [closeTrialModal, setCloseTrialModal] = useState(null);
  const [closeForm, setCloseForm] = useState({ reason: '', soldPrice: '', outcomeDate: new Date().toISOString().split('T')[0], notes: '' });
  const [addReadingModal, setAddReadingModal] = useState(null);
  // readingForm: { date, fryers: { [fryerNum]: { oilAge, litresFilled, tpmValue, setTemperature, actualTemperature, filtered, foodType, notes, notInUse } } }
  const [readingForm, setReadingForm] = useState({ date: new Date().toISOString().split('T')[0], fryers: { 1: { oilAge: '', litresFilled: '', tpmValue: '', setTemperature: '', actualTemperature: '', filtered: null, foodType: '', notes: '', notInUse: false } } });
  const [activeFryerTab, setActiveFryerTab] = useState(1);
  const colFilters = useColumnFilters();

  const TRIAL_COLS = [
    { key: 'name', label: 'Venue Name', locked: true },
    { key: 'group', label: 'Group Name' },
    { key: 'state', label: 'State' },
    { key: 'bdm', label: 'BDM' },
    { key: 'volume', label: 'Vol Bracket' },
    { key: 'competitor', label: 'Competitor' },
    { key: 'compOil', label: 'Competitor Oil' },
    { key: 'trialOil', label: 'Trial Oil' },
    { key: 'currentPrice', label: 'Current $/L' },
    { key: 'offeredPrice', label: 'Offered $/L' },
    { key: 'soldPrice', label: 'Sold $/L' },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'closedDate', label: 'Closed Date' },
    { key: 'status', label: 'Status' },
    { key: 'reason', label: 'Reason' },
  ];
  const defaultTrialCols = TRIAL_COLS.map(c => c.key).filter(k => !['soldPrice', 'closedDate', 'reason', 'group'].includes(k));
  const [visibleCols, setVisibleCols] = useState(defaultTrialCols);
  const colVis = (key) => visibleCols.includes(key);

  // Lock body scroll when popup is open, preserve scroll position
  const scrollPosRef = React.useRef(0);
  React.useEffect(() => {
    if (selectedTrial) {
      scrollPosRef.current = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollPosRef.current}px`;
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollPosRef.current);
    }
    return () => { document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = ''; };
  }, [selectedTrial]);

  const trials = venues.filter(v => v.status === 'trial-only');

  const getUserName = makeGetUserName(users, true);
  const getGroupName = makeGetGroupName(groups);

  // Get unique states and BDMs from trial data
  const trialStates = [...new Set(trials.map(v => v.state))].sort();
  
  // BDMs filtered by selected state
  const stateFilteredTrials = trials;
  const filteredBdmIds = [...new Set(stateFilteredTrials.map(v => v.bdmId).filter(Boolean))];

  // Base filtered by state + BDM (before status filter)
  const baseFiltered = trials.filter(v => {
    const matchDateFrom = allTime || !dateFrom || (v.trialStartDate && v.trialStartDate >= dateFrom);
    const matchDateTo = allTime || !dateTo || (v.trialStartDate && v.trialStartDate <= dateTo);
    return matchDateFrom && matchDateTo;
  });

  const statusCounts = {
    all: baseFiltered.length,
    pending: baseFiltered.filter(v => v.trialStatus === 'pending').length,
    'in-progress': baseFiltered.filter(v => v.trialStatus === 'in-progress').length,
    completed: baseFiltered.filter(v => v.trialStatus === 'completed').length,
    won: baseFiltered.filter(v => v.trialStatus === 'won').length,
    lost: baseFiltered.filter(v => v.trialStatus === 'lost').length,
  };

  const filtered = (() => {
    let data = baseFiltered.filter(v => {
      const matchStatus = statusFilters.length === 0 || statusFilters.includes(v.trialStatus);
      return matchStatus;
    });
    data = colFilters.applyFilters(data, {
      name: v => v.name || '',
      group: v => v.groupId ? (groups.find(g => g.id === v.groupId)?.name || '') : '',
      state: v => v.state || '',
      bdm: v => v.bdmId ? (users.find(u => u.id === v.bdmId)?.name || '') : '',
      volume: v => VOLUME_BRACKETS.find(b => b.key === v.volumeBracket)?.label || '',
      competitor: v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil?.competitorId ? (competitors.find(c => c.id === oil.competitorId)?.name || '') : ''; },
      compOil: v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil ? oil.name : ''; },
      trialOil: v => { const oil = oilTypes.find(o => o.id === v.trialOilId); return oil ? oil.name : ''; },
      currentPrice: v => v.currentPricePerLitre ? `$${v.currentPricePerLitre.toFixed(2)}` : '',
      offeredPrice: v => v.offeredPricePerLitre ? `$${v.offeredPricePerLitre.toFixed(2)}` : '',
      soldPrice: v => v.soldPricePerLitre ? `$${v.soldPricePerLitre.toFixed(2)}` : '',
      start: v => v.trialStartDate || '',
      end: v => v.trialEndDate || '',
      closedDate: v => v.outcomeDate || '',
      status: v => v.trialStatus || '',
      reason: v => v.trialReason || '',
    });
    return data.sort((a, b) => {
      if (!sortNewest) return a.name.localeCompare(b.name);
      const dateA = a.trialStartDate || '';
      const dateB = b.trialStartDate || '';
      return dateB.localeCompare(dateA);
    });
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={AlertTriangle} title="Trials" count={trials.length} />

      {/* Summary count strip - tappable as primary filter */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', overflowX: 'auto' }}>
        {[
          { key: 'pending', label: 'Pipeline', color: '#64748b', bg: '#f1f5f9', activeBg: '#64748b', activeText: 'white' },
          { key: 'in-progress', label: 'Active', color: '#1e40af', bg: '#dbeafe', activeBg: '#1e40af', activeText: 'white' },
          { key: 'completed', label: 'Pending', color: '#a16207', bg: '#fef3c7', activeBg: '#eab308', activeText: '#78350f' },
          { key: 'won', label: 'Successful', color: '#065f46', bg: '#d1fae5', activeBg: '#059669', activeText: 'white' },
          { key: 'lost', label: 'Unsuccessful', color: '#991b1b', bg: '#fee2e2', activeBg: '#991b1b', activeText: 'white' },
        ].map(s => {
          const isActive = statusFilters.includes(s.key);
          return (
            <div key={s.key} onClick={() => setStatusFilters(prev => prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key])} style={{
              flex: '1', minWidth: '56px', padding: '8px 4px', borderRadius: '8px',
              background: isActive ? s.activeBg : s.bg, textAlign: 'center',
              cursor: 'pointer', transition: 'all 0.2s',
              border: isActive ? `2px solid ${s.activeBg}` : '2px solid transparent',
              boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              transform: isActive ? 'scale(1.02)' : 'scale(1)'
            }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: isActive ? s.activeText : s.color }}>{statusCounts[s.key]}</div>
              <div style={{ fontSize: '9px', fontWeight: '600', color: isActive ? (s.activeText === 'white' ? 'rgba(255,255,255,0.85)' : s.activeText) : s.color, opacity: isActive ? 1 : 0.8, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '0', flexWrap: 'wrap', rowGap: '8px' }}>
        {/* Presets group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#f8fafc', borderRadius: '8px', padding: '3px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
          {[
            { key: 'mtd', label: 'MTD' },
            { key: '30d', label: '1M' },
            { key: '90d', label: '3M' },
            { key: 'ytd', label: 'YTD' },
            { key: 'all', label: 'All' },
          ].map(p => {
            const now = new Date();
            const isActive = (() => {
              if (p.key === 'all') return allTime;
              if (allTime) return false;
              const cutoff = (() => {
                const d = new Date(now);
                if (p.key === 'mtd') { d.setDate(1); return d; }
                if (p.key === '30d') { d.setDate(d.getDate() - 30); return d; }
                if (p.key === '90d') { d.setDate(d.getDate() - 90); return d; }
                if (p.key === 'ytd') { d.setMonth(0); d.setDate(1); return d; }
                return d;
              })();
              const fmt = d => d.toISOString().split('T')[0];
              return dateFrom === fmt(cutoff) && !dateTo;
            })();
            const handleClick = () => {
              if (p.key === 'all') { setAllTime(true); setDateFrom(''); setDateTo(''); return; }
              const d = new Date(now);
              if (p.key === 'mtd') d.setDate(1);
              else if (p.key === '30d') d.setDate(d.getDate() - 30);
              else if (p.key === '90d') d.setDate(d.getDate() - 90);
              else if (p.key === 'ytd') { d.setMonth(0); d.setDate(1); }
              setDateFrom(d.toISOString().split('T')[0]);
              setDateTo('');
              setAllTime(false);
            };
            return (
              <button key={p.key} onClick={handleClick} style={{
                padding: '4px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                border: 'none', minWidth: '36px', textAlign: 'center',
                background: isActive ? '#1a428a' : 'transparent',
                color: isActive ? 'white' : '#64748b', transition: 'all 0.15s',
                whiteSpace: 'nowrap', lineHeight: '1.3'
              }}>{p.label}</button>
            );
          })}
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 10px', flexShrink: 0 }} />

        {/* Custom date range picker */}
        <CalendarIconPicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} setAllTime={setAllTime} />

        {/* Spacer pushes sort + columns to the right */}
        <div style={{ flex: 1, minWidth: '12px' }} />

        {/* Sort toggle */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0, marginRight: '10px' }}>
          <span onClick={() => setSortNewest(false)} style={{
            fontSize: '11px', color: !sortNewest ? '#1a428a' : '#94a3b8', cursor: 'pointer',
            fontWeight: !sortNewest ? '600' : '500', display: 'flex', alignItems: 'center', gap: '3px'
          }}>{!sortNewest ? <ArrowDown size={11} /> : <ArrowUpDown size={11} />} A–Z</span>
          <span onClick={() => setSortNewest(true)} style={{
            fontSize: '11px', color: sortNewest ? '#1a428a' : '#94a3b8', cursor: 'pointer',
            fontWeight: sortNewest ? '600' : '500', display: 'flex', alignItems: 'center', gap: '3px'
          }}>{sortNewest ? <ArrowDown size={11} /> : <ArrowUpDown size={11} />} Recent</span>
        </div>

        {/* Column toggle */}
        <ColumnToggle columns={TRIAL_COLS} visible={visibleCols} setVisible={setVisibleCols} />
      </div>

      <ActiveFilterBar filters={colFilters.filters} setFilter={colFilters.setFilter} clearAll={colFilters.clearAll} />

        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table className="admin-table trials-compact" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ width: '4px', padding: '0' }}></th>
                  <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(trials, v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                  {colVis('group') && <FilterableTh colKey="group" label="Group Name" options={getUniqueValues(trials, v => v.groupId ? (groups.find(g => g.id === v.groupId)?.name || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('state') && <FilterableTh colKey="state" label="State" options={getUniqueValues(trials, v => v.state)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('bdm') && <FilterableTh colKey="bdm" label="BDM" options={getUniqueValues(trials, v => v.bdmId ? (users.find(u => u.id === v.bdmId)?.name || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('volume') && <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({value:b.label,label:b.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('competitor') && <FilterableTh colKey="competitor" label="Comp." options={getUniqueValues(trials, v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil?.competitorId ? (competitors.find(c => c.id === oil.competitorId)?.name || '') : ''; })} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('compOil') && <FilterableTh colKey="compOil" label="Comp. Oil" options={getUniqueValues(trials, v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil ? oil.name : ''; })} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('trialOil') && <FilterableTh colKey="trialOil" label="Trial Oil" options={getUniqueValues(trials, v => { const oil = oilTypes.find(o => o.id === v.trialOilId); return oil ? oil.name : ''; })} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('currentPrice') && <FilterableTh colKey="currentPrice" label="Curr $/L" options={getUniqueValues(trials, v => v.currentPricePerLitre ? `$${v.currentPricePerLitre.toFixed(2)}` : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '58px' }} />}
                  {colVis('offeredPrice') && <FilterableTh colKey="offeredPrice" label="Off $/L" options={getUniqueValues(trials, v => v.offeredPricePerLitre ? `$${v.offeredPricePerLitre.toFixed(2)}` : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center', width: '58px' }} />}
                  {colVis('soldPrice') && <FilterableTh colKey="soldPrice" label="Sold $/L" options={getUniqueValues(trials, v => v.soldPricePerLitre ? `$${v.soldPricePerLitre.toFixed(2)}` : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('start') && <FilterableTh colKey="start" label="Start" options={getUniqueValues(trials, v => v.trialStartDate || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('end') && <FilterableTh colKey="end" label="End" options={getUniqueValues(trials, v => v.trialEndDate || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('closedDate') && <FilterableTh colKey="closedDate" label="Closed Date" options={getUniqueValues(trials, v => v.outcomeDate || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  {colVis('status') && <FilterableTh colKey="status" label="Status" options={[{value:'pending',label:'Pipeline'},{value:'in-progress',label:'Active'},{value:'completed',label:'Pending'},{value:'won',label:'Successful'},{value:'lost',label:'Unsuccessful'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                  {colVis('reason') && <FilterableTh colKey="reason" label="Reason" options={trialReasons.filter(r => trials.some(v => v.trialReason === r.key)).map(r => ({value:r.key,label:r.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                  <th style={{ width: '30px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    {venues.filter(v => v.trialStatus).length === 0 ? (
                      <div>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧪</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No trials yet</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Trials are created from the Venues section when a prospect is added with a trial oil. Load demo data to see examples.</div>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '13px' }}>No trials match your filters</span>
                    )}
                  </td></tr>
                ) : filtered.map(venue => {
                  const compOil = oilTypes.find(o => o.id === venue.defaultOil);
                  const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                  const comp = compOil?.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
                  const compTier = compOil ? (COMPETITOR_TIER_COLORS[compOil.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                  const statusConf = TRIAL_STATUS_CONFIGS[venue.trialStatus] || TRIAL_STATUS_CONFIGS['pending'];
                  const reasonObj = venue.trialReason ? trialReasons.find(r => r.key === venue.trialReason) : null;
                  return (
                    <tr key={venue.id} onClick={() => { setSelectedTrial(venue); setExpandedFryers([1]); }} style={{ cursor: 'pointer', height: '34px' }}>
                      <td style={{ width: '4px', padding: '0', background: statusConf.accent }}></td>
                      <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</td>
                      {colVis('group') && <td style={{ color: '#64748b', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={venue.groupId ? getGroupName(venue.groupId) : 'STREET'}>{venue.groupId ? getGroupName(venue.groupId) : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>STREET</span>}</td>}
                      {colVis('state') && <td><StateBadge state={venue.state} /></td>}
                      {colVis('bdm') && <td style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>{getUserName(venue.bdmId)}</td>}
                      {colVis('volume') && <td style={{ textAlign: "center" }}><VolumePill bracket={venue.volumeBracket} brackets={volumeBrackets} /></td>}
                      {colVis('competitor') && <td style={{ whiteSpace: 'nowrap' }}>{comp ? <CompetitorPill comp={comp} table /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('compOil') && <td style={{ textAlign: 'center', paddingLeft: '4px', paddingRight: '4px' }}>{compOil ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '72px', textAlign: 'center' }}>{compOil.name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('trialOil') && <td style={{ textAlign: 'center' }}><OilBadge oil={cookersOil} competitors={competitors} compact /></td>}
                      {colVis('currentPrice') && <td style={{ textAlign: 'center', fontWeight: '600', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{venue.currentPricePerLitre ? `$${venue.currentPricePerLitre.toFixed(2)}` : <span style={{color:'#cbd5e1'}}>—</span>}</td>}
                      {colVis('offeredPrice') && <td style={{ textAlign: 'center', fontWeight: '700', fontSize: '11px', color: '#1a428a', whiteSpace: 'nowrap' }}>{venue.offeredPricePerLitre ? `$${venue.offeredPricePerLitre.toFixed(2)}` : <span style={{color:'#cbd5e1'}}>—</span>}</td>}
                      {colVis('soldPrice') && <td style={{ fontWeight: '600', color: '#065f46', whiteSpace: 'nowrap' }}>{venue.soldPricePerLitre ? `$${venue.soldPricePerLitre.toFixed(2)}` : '—'}</td>}
                      {colVis('start') && <td style={{ color: (venue.trialStartDate && venue.trialStartDate > new Date().toISOString().split('T')[0] && ['pending', 'in-progress'].includes(venue.trialStatus)) ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap' }}>{formatDate(venue.trialStartDate)}</td>}
                      {colVis('end') && <td style={{ color: (venue.trialEndDate && venue.trialEndDate > new Date().toISOString().split('T')[0] && ['pending', 'in-progress'].includes(venue.trialStatus)) ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap' }}>{formatDate(venue.trialEndDate)}</td>}
                      {colVis('closedDate') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(venue.outcomeDate)}</td>}
                      {colVis('status') && <td style={{ textAlign: "center" }}><TrialStatusBadge status={venue.trialStatus} /></td>}
                      {colVis('reason') && <td style={{ color: reasonObj?.type === 'successful' ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>{reasonObj ? reasonObj.label : '—'}</td>}
                      <td><ChevronDown size={12} color="#94a3b8" style={{ transform: 'rotate(-90deg)' }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {/* Trial Detail Popup */}
      {selectedTrial && (() => {
        const t = selectedTrial;
        const compOil = oilTypes.find(o => o.id === t.defaultOil);
        const cookersOil = oilTypes.find(o => o.id === t.trialOilId);
        const bdm = users.find(u => u.id === t.bdmId);
        const group = t.groupId ? groups.find(g => g.id === t.groupId) : null;
        const nam = group?.namId ? users.find(u => u.id === group.namId) : null;
        const statusConfig = TRIAL_STATUS_CONFIGS[t.trialStatus] || TRIAL_STATUS_CONFIGS['pending'];
        const isFutureStart = t.trialStartDate && new Date(t.trialStartDate + 'T00:00:00') > new Date() && ['pending', 'in-progress'].includes(t.trialStatus);
        const isFutureEnd = t.trialEndDate && new Date(t.trialEndDate + 'T00:00:00') > new Date() && ['pending', 'in-progress'].includes(t.trialStatus);

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px',
            overflowY: 'auto', WebkitOverflowScrolling: 'touch'
          }} onClick={() => setSelectedTrial(null)}>
            <div style={{
              background: 'white', borderRadius: '16px', width: '100%', maxWidth: '600px',
              maxHeight: '94vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch'
            }} onClick={e => e.stopPropagation()}>

              {/* Header — compact with left accent */}
              <div style={{
                padding: '12px 16px', borderLeft: `4px solid ${statusConfig.accent}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                borderBottom: '1px solid #f1f5f9'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px' }}>{t.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      <StateBadge state={t.state} /> · {group ? group.name : 'Street venue'}{t.volumeBracket && <> · <VolumePill bracket={t.volumeBracket} brackets={VOLUME_BRACKETS} /></>}
                    </div>
                    <TrialStatusBadge status={t.trialStatus} />
                  </div>
                </div>
                <button onClick={() => setSelectedTrial(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                  <X size={18} color="#94a3b8" />
                </button>
              </div>

              <div style={{ padding: '12px 16px' }}>

                {/* 1. Start / End / BDM / Fryers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '12px' }}>
                  {[
                    { label: 'Start', value: formatDate(t.trialStartDate), light: isFutureStart },
                    { label: 'End', value: t.trialEndDate ? formatDate(t.trialEndDate) : '—', light: isFutureEnd },
                    { label: 'BDM', value: bdm ? bdm.name : '—' },
                    ...(nam ? [{ label: 'NAM', value: nam.name }] : []),
                    { label: 'Fryers', value: t.fryerCount || '—' },
                  ].map((row, i) => (
                    <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>{row.label}</div>
                      <div style={{ fontSize: '13px', color: row.light ? '#94a3b8' : '#1f2937' }}>{row.value}</div>
                    </div>
                  ))}
                </div>

                {/* 2. Competitor vs trial oil */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  {(() => {
                    const comp = compOil && competitors ? competitors.find(c => c.id === compOil?.competitorId) : null;
                    return <>
                      {comp && <CompetitorPill comp={comp} />}
                      {comp && <span style={{ color: '#e2e8f0', margin: '0 2px' }}>·</span>}
                      <OilBadge oil={compOil} competitors={competitors} compact />
                      <span style={{ fontSize: '12px', color: '#94a3b8', margin: '0 4px' }}>vs</span>
                      <OilBadge oil={cookersOil} competitors={competitors} compact />
                    </>;
                  })()}
                </div>

                {/* 3. Prices + volumes, then savings table */}
                {(t.currentWeeklyAvg || t.currentPricePerLitre || t.offeredPricePerLitre) && (() => {
                  const liveTrialAvg = calcTrialWeeklyAvg(t.id, t.trialStartDate, tpmReadings, t.trialEndDate);
                  const weekLitres = t.currentWeeklyAvg && liveTrialAvg ? Math.round(t.currentWeeklyAvg - liveTrialAvg) : null;
                  const annualLitres = weekLitres !== null ? Math.round(weekLitres * 52) : null;
                  const trialPrice = t.offeredPricePerLitre || t.currentPricePerLitre;
                  const weekSpend = weekLitres !== null && trialPrice ? Math.round(weekLitres * trialPrice) : null;
                  const annualSpend = weekSpend !== null ? Math.round(weekSpend * 52) : null;
                  const hasSavings = weekLitres !== null;

                  return (<>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '12px' }}>
                      {[
                        t.currentPricePerLitre ? { label: 'Current price/L', value: `$${t.currentPricePerLitre.toFixed(2)}` } : null,
                        t.offeredPricePerLitre ? { label: 'Offered price/L', value: `$${t.offeredPricePerLitre.toFixed(2)}` } : null,
                        t.currentWeeklyAvg ? { label: 'Pre-trial weekly avg', value: `${t.currentWeeklyAvg} L` } : null,
                        liveTrialAvg !== null ? { label: 'Trial weekly avg', value: `${liveTrialAvg} L` } : null,
                      ].filter(Boolean).map((row, i) => (
                        <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>{row.label}</div>
                          <div style={{ fontSize: '13px', color: '#1f2937' }}>{row.value}</div>
                        </div>
                      ))}
                    </div>

                  </>);
                })()}

                {/* TPM Readings Calendar */}
                {t.trialStartDate && t.trialEndDate && t.trialStatus !== 'pending' && (() => {
                  const start = new Date(t.trialStartDate + 'T00:00:00');
                  const end = new Date(t.trialEndDate + 'T00:00:00');
                  const today = new Date(); today.setHours(0,0,0,0);
                  const days = [];
                  const d = new Date(start);
                  while (d <= end) {
                    days.push(new Date(d));
                    d.setDate(d.getDate() + 1);
                  }
                  const fryerCount = t.fryerCount || 1;

                  // Look up real readings from tpmReadings state
                  const getReadingsForFryer = (fryerNum) => {
                    const result = {};
                    (tpmReadings || []).filter(r => r.venueId === t.id && r.fryerNumber === fryerNum).forEach(r => {
                      result[r.readingDate] = r.tpmValue;
                    });
                    return result;
                  };

                  const pastDays = days.filter(d => d <= today).length;

                  const FryerCalendar = ({ fryerNum, readings }) => {
                    const readingCount = Object.keys(readings).length;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: '2px' }}>
                        {days.map((day, i) => {
                          const dateStr = day.toISOString().split('T')[0];
                          const reading = readings[dateStr];
                          const isFuture = day > today;
                          const isToday = day.getTime() === today.getTime();
                          const dayLabel = day.toLocaleDateString('en-AU', { weekday: 'narrow' });
                          const dateLabel = day.getDate();

                          let bg = '#f1f5f9'; let color = '#cbd5e1';
                          if (isFuture) { bg = '#fafafa'; color = '#e2e8f0'; }
                          else if (reading !== undefined) {
                            if (reading <= 14) { bg = '#d1fae5'; color = '#065f46'; }
                            else if (reading <= 18) { bg = '#fef3c7'; color = '#92400e'; }
                            else { bg = '#fee2e2'; color = '#991b1b'; }
                          }

                          return (
                            <div key={i} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                            }}>
                              {fryerNum === (expandedFryers[0] || 1) && (
                                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '500' }}>{dayLabel}</span>
                              )}
                              <div style={{
                                width: '100%', height: '22px', borderRadius: '5px',
                                background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: isToday ? '2px solid #1a428a' : '1px solid transparent',
                              }}>
                                {reading !== undefined ? (
                                  <span style={{ fontSize: '10px', fontWeight: '600', color }}>{reading}</span>
                                ) : !isFuture ? (
                                  <span style={{ color: '#cbd5e1' }}>—</span>
                                ) : null}
                              </div>
                              {fryerNum === (expandedFryers[expandedFryers.length - 1] || 1) && (
                                <span style={{ fontSize: '9px', color: '#64748b' }}>{dateLabel}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  };

                  return (
                    <div style={{ marginBottom: '8px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase' }}>TPM Readings</div>
                        {fryerCount > 1 && (
                          <button onClick={() => setExpandedFryers(prev => prev.length > 1 ? [1] : Array.from({ length: fryerCount }, (_, i) => i + 1))} style={{
                            background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '6px'
                          }}>
                            <span style={{ fontSize: '11px', color: '#1a428a', fontWeight: '500' }}>{expandedFryers.length > 1 ? 'Hide' : 'Show'} all {fryerCount} fryers</span>
                            <span style={{ fontSize: '10px', color: '#1a428a', transform: expandedFryers.length > 1 ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                          </button>
                        )}
                      </div>
                      {Array.from({ length: fryerCount }, (_, i) => i + 1).filter(f => expandedFryers.includes(f)).map(fryerNum => {
                        const readings = getReadingsForFryer(fryerNum);
                        const readingCount = Object.keys(readings).length;

                        return (
                          <div key={fryerNum} style={{ marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '12px', color: '#1f2937' }}>Fryer {fryerNum}</span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{readingCount}/{pastDays}</span>
                            </div>
                            <FryerCalendar fryerNum={fryerNum} readings={readings} />
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', justifyContent: 'flex-end' }}>
                        {[
                          { bg: '#d1fae5', label: '≤14' },
                          { bg: '#fef3c7', label: '15-18' },
                          { bg: '#fee2e2', label: '19+' },
                          { bg: '#f1f5f9', label: 'Missed' },
                        ].map(l => (
                          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.bg }} />
                            <span style={{ fontSize: '10px', color: '#64748b' }}>{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Savings table */}
                {(t.currentWeeklyAvg || t.currentPricePerLitre || t.offeredPricePerLitre) && (() => {
                  const liveTrialAvg = calcTrialWeeklyAvg(t.id, t.trialStartDate, tpmReadings, t.trialEndDate);
                  const weekLitres = t.currentWeeklyAvg && liveTrialAvg ? Math.round(t.currentWeeklyAvg - liveTrialAvg) : null;
                  if (weekLitres === null) return null;
                  const annualLitres = Math.round(weekLitres * 52);
                  const trialPrice = t.offeredPricePerLitre || t.currentPricePerLitre;
                  const weekSpend = trialPrice ? Math.round(weekLitres * trialPrice) : null;
                  const annualSpend = weekSpend !== null ? Math.round(weekSpend * 52) : null;
                  return (
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
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: weekLitres < 0 ? '#dc2626' : '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{weekLitres < 0 ? '-' : ''}{Math.abs(weekLitres)} L</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: weekSpend !== null && weekSpend < 0 ? '#dc2626' : '#1f2937', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{weekSpend !== null ? (weekSpend < 0 ? '-$' : '$') + Math.abs(weekSpend).toLocaleString() : '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#1f2937' }}>Annual</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: annualLitres < 0 ? '#dc2626' : '#1f2937', textAlign: 'right' }}>{annualLitres < 0 ? '-' : ''}{Math.abs(annualLitres)} L</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: annualSpend !== null && annualSpend < 0 ? '#dc2626' : '#1f2937', textAlign: 'right' }}>{annualSpend !== null ? (annualSpend < 0 ? '-' : '') + '$' + Math.abs(annualSpend).toLocaleString() : '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Outcome strip */}
                {(t.trialStatus === 'won' || t.trialStatus === 'lost') && (
                  <div style={{
                    marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
                    background: t.trialStatus === 'won' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${t.trialStatus === 'won' ? '#bbf7d0' : '#fecaca'}`,
                    display: 'flex', flexDirection: 'column', gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: t.trialStatus === 'won' ? '#059669' : '#dc2626' }}>
                        {t.trialStatus === 'won' ? 'Successful' : 'Unsuccessful'}
                      </span>
                      {t.outcomeDate && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(t.outcomeDate)}</span></>}
                      {t.trialStatus === 'won' && t.customerCode && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{t.customerCode}</span></>}
                      {(t.trialStatus === 'lost' || t.trialStatus === 'won') && t.trialReason && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{trialReasons.find(r => r.key === t.trialReason)?.label || t.trialReason}</span></>}
                    </div>
                    {t.trialStatus === 'won' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        {cookersOil && <OilBadge oil={cookersOil} competitors={competitors} />}
                        {t.soldPricePerLitre && <span style={{ fontSize: '12px', color: '#1f2937', fontWeight: '400' }}>@ ${t.soldPricePerLitre.toFixed(2)}/L</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {['in-progress', 'completed', 'pending'].includes(t.trialStatus) && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>

                    {/* Pending — Start Trial kicks it to in-progress and opens the reading modal */}
                    {t.trialStatus === 'pending' && (
                      <button onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setVenues(prev => prev.map(v => v.id === t.id ? {
                          ...v,
                          trialStatus: 'in-progress',
                          trialStartDate: v.trialStartDate || today,
                        } : v));
                        setAddReadingModal({ ...t, trialStatus: 'in-progress', trialStartDate: t.trialStartDate || today });
                        const fc2 = (t.fryerCount || 1);
                        const initFryers2 = {};
                        for (let i = 1; i <= fc2; i++) initFryers2[i] = { oilAge: '', litresFilled: '', tpmValue: '', setTemperature: '', actualTemperature: '', filtered: null, foodType: '', notes: '', notInUse: false };
                        setReadingForm({ date: today, fryers: initFryers2 });
                        setActiveFryerTab(1);
                        setSelectedTrial(null);
                      }} style={{ flex: 1, padding: '9px 12px', background: '#1a428a', border: '1.5px solid #1a428a', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                        Start Trial
                      </button>
                    )}

                    {/* Active — log a reading */}
                    {t.trialStatus === 'in-progress' && (
                      <button onClick={() => {
                        setAddReadingModal(t);
                        const fcLR = (t.fryerCount || 1);
                        const initFryersLR = {};
                        for (let i = 1; i <= fcLR; i++) initFryersLR[i] = { oilAge: '', litresFilled: '', tpmValue: '', setTemperature: '', actualTemperature: '', filtered: null, foodType: '', notes: '', notInUse: false };
                        setReadingForm({ date: new Date().toISOString().split('T')[0], fryers: initFryersLR });
                        setActiveFryerTab(1);
                        setSelectedTrial(null);
                      }} style={{ flex: 1, padding: '9px 12px', background: '#e8eef6', border: '1.5px solid #1a428a', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#1a428a', cursor: 'pointer' }}>
                        Log Reading
                      </button>
                    )}

                    {/* Active or completed — close as won/lost */}
                    {['in-progress', 'completed'].includes(t.trialStatus) && (
                      <>
                        <button onClick={() => { setCloseTrialModal({ venue: t, outcome: 'won' }); setCloseForm({ reason: '', soldPrice: t.offeredPricePerLitre ? t.offeredPricePerLitre.toFixed(2) : '', outcomeDate: new Date().toISOString().split('T')[0], notes: t.trialNotes || '' }); setSelectedTrial(null); }} style={{ flex: 1, padding: '9px 12px', background: '#d1fae5', border: '1.5px solid #6ee7b7', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#065f46', cursor: 'pointer' }}>
                          Won
                        </button>
                        <button onClick={() => { setCloseTrialModal({ venue: t, outcome: 'lost' }); setCloseForm({ reason: '', soldPrice: '', outcomeDate: new Date().toISOString().split('T')[0], notes: t.trialNotes || '' }); setSelectedTrial(null); }} style={{ flex: 1, padding: '9px 12px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '8px', fontSize: '13px', fontWeight: '600', color: '#991b1b', cursor: 'pointer' }}>
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
      })()}

      {/* ── Close Trial Modal ── */}
      {closeTrialModal && (() => {
        const { venue: t, outcome } = closeTrialModal;
        const isWon = outcome === 'won';
        const successReasons = trialReasons.filter(r => r.type === 'successful');
        const failReasons = trialReasons.filter(r => r.type === 'unsuccessful');
        const reasons = isWon ? successReasons : failReasons;
        const canSubmit = closeForm.reason && closeForm.outcomeDate && (isWon ? closeForm.soldPrice : true);
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '16px' }} onClick={() => setCloseTrialModal(null)}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '14px 16px', borderLeft: `4px solid ${isWon ? '#10b981' : '#ef4444'}`, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{isWon ? 'Close as Won' : 'Close as Lost'}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{t.name}</div>
                </div>
                <button onClick={() => setCloseTrialModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', display: 'block', marginBottom: '6px' }}>REASON <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={closeForm.reason} onChange={e => setCloseForm(f => ({ ...f, reason: e.target.value }))} style={selectStyle}>
                    <option value="">Select a reason…</option>
                    {reasons.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', display: 'block', marginBottom: '6px' }}>OUTCOME DATE <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="date" value={closeForm.outcomeDate} onChange={e => setCloseForm(f => ({ ...f, outcomeDate: e.target.value }))} style={inputStyle} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>
                {isWon && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', display: 'block', marginBottom: '6px' }}>SOLD PRICE / LITRE <span style={{ color: '#ef4444' }}>*</span></label>
                    <input type="number" step="0.01" min="0" placeholder="2.45" value={closeForm.soldPrice} onChange={e => setCloseForm(f => ({ ...f, soldPrice: e.target.value }))} style={inputStyle} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  </div>
                )}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', display: 'block', marginBottom: '6px' }}>NOTES</label>
                  <textarea value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Any final notes on the outcome…" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setCloseTrialModal(null)} style={{ flex: 1, padding: '10px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Cancel</button>
                  <button disabled={!canSubmit} onClick={() => {
                    setVenues(prev => prev.map(v => v.id === t.id ? {
                      ...v,
                      trialStatus: outcome,
                      trialReason: closeForm.reason,
                      outcomeDate: closeForm.outcomeDate,
                      trialNotes: closeForm.notes,
                      ...(isWon ? { soldPricePerLitre: parseFloat(closeForm.soldPrice), status: 'trial-only' } : {}),
                    } : v));
                    setCloseTrialModal(null);
                  }} style={{ flex: 2, padding: '10px', background: canSubmit ? (isWon ? '#10b981' : '#ef4444') : '#94a3b8', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                    {isWon ? 'Mark as Won' : 'Mark as Lost'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Log TPM Reading Modal ── */}
      {addReadingModal && (() => {
        const t = addReadingModal;
        const fryerCount = t.fryerCount || 1;
        const fryerNums = Array.from({ length: fryerCount }, (_, i) => i + 1);

        const setFryer = (num, patch) => setReadingForm(f => ({ ...f, fryers: { ...f.fryers, [num]: { ...f.fryers[num], ...patch } } }));

        const fryerComplete = (fd) => {
          if (fd.notInUse) return true;
          const freshOk = parseInt(fd.oilAge) !== 1 || fd.litresFilled;
          return fd.oilAge && fd.tpmValue && fd.setTemperature && fd.actualTemperature
            && fd.filtered !== null && fd.foodType && freshOk;
        };
        const canSubmit = readingForm.date && fryerNums.every(n => fryerComplete(readingForm.fryers[n] || {}));
        const doneCount = fryerNums.filter(n => fryerComplete(readingForm.fryers[n] || {})).length;

        const fd = readingForm.fryers[activeFryerTab] || {};
        const isFreshOil = parseInt(fd.oilAge) === 1;
        const tpmVal = parseFloat(fd.tpmValue);
        const tpmColor = fd.tpmValue ? (tpmVal < 20 ? '#10b981' : tpmVal < 25 ? '#f59e0b' : '#ef4444') : null;

        const lbl = { fontSize: '13px', fontWeight: '600', color: '#1f2937', display: 'block', marginBottom: '6px' };
        const field = { marginBottom: '16px' };

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' }} onClick={() => setAddReadingModal(null)}>
            <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding: '12px 16px', borderLeft: '4px solid #3b82f6', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{t.name}</h3>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {fryerCount > 1 ? `Fryer ${activeFryerTab} of ${fryerCount}` : 'New Reading'}
                    {fryerCount > 1 && doneCount > 0 && <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: '600' }}>{doneCount}/{fryerCount} done</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button type="button" onClick={() => setFryer(activeFryerTab, { notInUse: !fd.notInUse })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: fd.notInUse ? '#1a428a' : '#cbd5e1', padding: 0 }}>
                    {fd.notInUse ? 'undo skip' : 'skip'}
                  </button>
                  <button onClick={() => setAddReadingModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                    <X size={18} color="#94a3b8" />
                  </button>
                </div>
              </div>

              {/* Form */}
              <div style={{ padding: '20px', opacity: fd.notInUse ? 0.35 : 1, pointerEvents: fd.notInUse ? 'none' : 'auto', transition: 'opacity 0.15s' }}>

                {/* Date */}
                <div style={field}>
                  <label style={lbl}>Date</label>
                  <input type="date" value={readingForm.date} onChange={e => setReadingForm(f => ({ ...f, date: e.target.value }))}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>

                {/* Oil Age */}
                <div style={field}>
                  <label style={lbl}>Oil Age (days){isFreshOil && <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: '600', color: '#10b981' }}>— fresh oil</span>}</label>
                  <input type="number" min="1" max="30" placeholder="e.g., 1 for fresh oil" value={fd.oilAge || ''}
                    onChange={e => setFryer(activeFryerTab, { oilAge: e.target.value, litresFilled: parseInt(e.target.value) === 1 ? fd.litresFilled : '' })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box', borderColor: isFreshOil ? '#6ee7b7' : '#e2e8f0',
                      WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                    onFocus={e => e.target.style.borderColor = isFreshOil ? '#10b981' : '#1a428a'}
                    onBlur={e => e.target.style.borderColor = isFreshOil ? '#6ee7b7' : '#e2e8f0'} />
                </div>

                {/* Litres filled — only when fresh */}
                {isFreshOil && (
                  <div style={field}>
                    <label style={lbl}>Litres Filled</label>
                    <input type="number" step="0.5" min="1" placeholder="e.g., 20" value={fd.litresFilled || ''}
                      onChange={e => setFryer(activeFryerTab, { litresFilled: e.target.value })}
                      style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box', borderColor: '#6ee7b7' }}
                      onFocus={e => e.target.style.borderColor = '#10b981'} onBlur={e => e.target.style.borderColor = '#6ee7b7'} />
                  </div>
                )}

                {/* TPM */}
                <div style={field}>
                  <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: '7px' }}>
                    TPM Value (%)
                    {tpmColor && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tpmColor, display: 'inline-block', flexShrink: 0 }} />}
                  </label>
                  <input type="number" step="0.5" min="0" max="40" placeholder="e.g., 18" value={fd.tpmValue || ''}
                    onChange={e => setFryer(activeFryerTab, { tpmValue: e.target.value })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>

                {/* Set Temperature */}
                <div style={field}>
                  <label style={lbl}>Set Temperature (°C)</label>
                  <input type="number" min="100" max="220" placeholder="e.g., 180" value={fd.setTemperature || ''}
                    onChange={e => setFryer(activeFryerTab, { setTemperature: e.target.value })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>

                {/* Actual Temperature */}
                <div style={field}>
                  <label style={lbl}>Actual Temperature (°C)</label>
                  <input type="number" min="100" max="220" placeholder="e.g., 175" value={fd.actualTemperature || ''}
                    onChange={e => setFryer(activeFryerTab, { actualTemperature: e.target.value })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  {activeFryerTab > 1 && readingForm.fryers[1]?.setTemperature && (
                    <button type="button" onClick={() => setFryer(activeFryerTab, { setTemperature: readingForm.fryers[1].setTemperature, actualTemperature: readingForm.fryers[1].actualTemperature })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#64748b', padding: '5px 0 0', display: 'block' }}>
                      Copy from Fryer 1
                    </button>
                  )}
                </div>

                {/* Did you filter? */}
                <div style={field}>
                  <label style={lbl}>Did you filter?</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[{ val: true, label: 'Yes' }, { val: false, label: 'No' }].map(opt => (
                      <button key={String(opt.val)} type="button" onClick={() => setFryer(activeFryerTab, { filtered: opt.val })}
                        style={{ padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.12s',
                          background: fd.filtered === opt.val ? (opt.val ? '#d1fae5' : '#fee2e2') : 'white',
                          borderColor: fd.filtered === opt.val ? (opt.val ? '#6ee7b7' : '#fca5a5') : '#e2e8f0',
                          color: fd.filtered === opt.val ? (opt.val ? '#065f46' : '#991b1b') : '#64748b' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* What are you frying? */}
                <div style={field}>
                  <label style={lbl}>What are you frying?</label>
                  <select value={fd.foodType || ''} onChange={e => setFryer(activeFryerTab, { foodType: e.target.value })}
                    style={{ ...selectStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box', color: fd.foodType ? '#1f2937' : '#94a3b8' }}>
                    <option value="" disabled>Select...</option>
                    {FOOD_TYPES.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                  </select>
                </div>

                {/* Comments */}
                <div style={{ marginBottom: '4px' }}>
                  <label style={lbl}>Comments (optional)</label>
                  <textarea rows={3} placeholder="" value={fd.notes || ''}
                    onChange={e => setFryer(activeFryerTab, { notes: e.target.value })}
                    style={{ ...inputStyle, resize: 'vertical', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>

              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px 20px', display: 'flex', gap: '8px' }}>
                {activeFryerTab === 1 ? (
                  <button onClick={() => setAddReadingModal(null)}
                    style={{ flex: 1, padding: '11px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>
                    Cancel
                  </button>
                ) : (
                  <button type="button" onClick={() => setActiveFryerTab(n => n - 1)}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#9ca3af'} onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                    style={{ flex: 1, padding: '11px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: '#1f2937', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    ← Fryer {activeFryerTab - 1}
                  </button>
                )}
                {activeFryerTab < fryerCount ? (
                  <button type="button" onClick={() => setActiveFryerTab(n => n + 1)}
                    style={{ flex: 1, padding: '11px', background: '#1a428a', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: 'white', cursor: 'pointer' }}>
                    Fryer {activeFryerTab + 1} →
                  </button>
                ) : (
                  <button disabled={!canSubmit} onClick={() => {
                    const newReadings = fryerNums.map(n => {
                      const fdata = readingForm.fryers[n] || {};
                      const freshOil = parseInt(fdata.oilAge) === 1;
                      return {
                        id: `r-${Date.now()}-${n}`,
                        venueId: t.id, fryerNumber: n, readingDate: readingForm.date, takenBy: currentUser?.id || null,
                        notInUse: fdata.notInUse || false,
                        oilAge: fdata.notInUse ? null : parseInt(fdata.oilAge),
                        litresFilled: (!fdata.notInUse && freshOil) ? parseFloat(fdata.litresFilled) : null,
                        tpmValue: fdata.notInUse ? null : parseFloat(fdata.tpmValue),
                        setTemperature: (!fdata.notInUse && fdata.setTemperature) ? parseFloat(fdata.setTemperature) : null,
                        actualTemperature: (!fdata.notInUse && fdata.actualTemperature) ? parseFloat(fdata.actualTemperature) : null,
                        filtered: fdata.notInUse ? null : fdata.filtered,
                        foodType: fdata.notInUse ? null : fdata.foodType,
                        notes: fdata.notes || '',
                      };
                    });
                    setTpmReadings(prev => [...prev, ...newReadings]);
                    // Update lastTpmDate on the venue so the TPM compliance dashboard stays current
                    setVenues(prev => prev.map(v => v.id === t.id ? { ...v, lastTpmDate: readingForm.date } : v));
                    setAddReadingModal(null);
                  }} style={{ flex: 1, padding: '11px', background: canSubmit ? '#1a428a' : '#9ca3af', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', color: 'white', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                    {fryerCount === 1 ? 'Save Recording' : 'Save All'}
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};

const PermissionsAccess = ({ users }) => {
  const permissions = [
    { role: 'bdm', sees: 'Own assigned venues and trial prospects', canDo: 'Create trials, log TPM readings, end trials, set outcomes' },
    { role: 'nam', sees: 'BDM and venue data linked to their assigned groups', canDo: 'Create trials, log readings, end trials, view trial pipeline, add venues and groups, export data' },
    { role: 'state_manager', sees: 'All BDMs, venues, and trials in their state', canDo: 'Create trials, log readings, end trials, view trial pipeline, export data' },
    { role: 'mgt', sees: 'All data nationally across every state', canDo: 'Full operational access — venues, groups, trials, competitors, reporting' },
    { role: 'admin', sees: 'Everything — full system access', canDo: 'All of the above plus user management, permissions, system settings' },
  ];

  const roleCounts = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  return (
    <div>
      <SectionHeader icon={Shield} title="Permissions & Access Levels" />
      
      <div style={{
        background: '#eff6ff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
        border: '1px solid #bfdbfe', display: 'flex', alignItems: 'flex-start', gap: '10px'
      }}>
        <AlertCircle size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: '1.5' }}>
          Permissions are role-based. Each role defines what data a user can see and what actions they can perform. Visibility is hierarchical — each level sees everything below it.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {permissions.map(p => (
          <div key={p.role} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RoleBadge role={p.role} />
                <span style={{ fontSize: '12px', color: '#64748b' }}>{roleCounts[p.role] || 0} user{(roleCounts[p.role] || 0) !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px' }}>SEES: </span>
              <span style={{ fontSize: '13px', color: '#1f2937' }}>{p.sees}</span>
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px' }}>CAN DO: </span>
              <span style={{ fontSize: '13px', color: '#1f2937' }}>{p.canDo}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== BULK VENUE UPLOAD ====================
const OnboardingFlow = ({ oilTypes, venues, groups, users, setVenues, setGroups, setUsers, defaultFryerCount = 4 }) => {
  const [step, setStep] = useState(0);
  const [bulkGroup, setBulkGroup] = useState({ groupId: '', newGroupName: '', newGroupCode: '', defaultOil: '', namId: '' });
  const [csvText, setCsvText] = useState('');
  const [bulkVenues, setBulkVenues] = useState([]);
  const [bulkError, setBulkError] = useState('');
  const [bulkDone, setBulkDone] = useState(false);

  const nams = users.filter(u => u.role === 'nam' && u.status === 'active');
  const getOilName = (id) => oilTypes.find(o => o.id === id)?.name || '—';
  const getGroupName = makeGetGroupName(groups);

  const bulkSteps = [
    { label: 'Upload CSV', icon: Copy },
    { label: 'Review', icon: Eye },
    { label: 'Oil & Confirm', icon: CheckCircle },
  ];

  const sampleCsv = `Cust Code,Name,Group Code,Rep Code,State,Fryers,Volume
TRUSOUV0,True South,JBS,BA01,VIC,4,100-150
GARMELV0,Garden State Hotel,JBS,BA01,VIC,6,150-plus
TONPORV0,Tony's Fish & Chips,,BC01,VIC,2,under-60`;

  const parseCsv = () => {
    setBulkError('');
    const lines = csvText.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) { setBulkError('Need at least a header row and one venue row.'); return; }
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('cust') || header.includes('name') || header.includes('state');
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const parsed = [];
    dataLines.forEach((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 2) return;
      const custCode = cols[0] || '';
      const name = cols[1] || '';
      const groupCode = cols[2] || '';
      const repCode = cols[3] || '';
      const state = cols[4] || '';
      const fryerCount = cols[5] ? parseInt(cols[5]) : defaultFryerCount;
      const volumeBracket = cols[6] || '';
      const matchedGroup = groupCode ? groups.find(g => g.groupCode === groupCode) : null;
      const matchedRep = repCode ? users.find(u => u.repCode === repCode) : null;
      parsed.push({
        _key: i, customerCode: custCode, name, groupCode, repCode,
        state, fryerCount: isNaN(fryerCount) ? defaultFryerCount : fryerCount, volumeBracket,
        oilId: bulkGroup.defaultOil || '',
        matchedGroupId: matchedGroup?.id || null, matchedGroupName: matchedGroup?.name || null,
        matchedRepId: matchedRep?.id || null, matchedRepName: matchedRep?.name || null,
        groupWarning: groupCode && !matchedGroup, repWarning: repCode && !matchedRep,
        valid: !!name
      });
    });
    if (parsed.length === 0) { setBulkError('No valid venue rows found. Check your CSV format.'); return; }
    setBulkVenues(parsed);
    setStep(1);
  };

  const removeBulkVenue = (key) => {
    setBulkVenues(prev => prev.filter(v => v._key !== key));
  };

  const finishBulk = () => {
    const newVenues = bulkVenues.filter(v => v.valid).map((v, i) => ({
      id: `v-${Date.now()}-${i}`, name: v.name.trim().toUpperCase(), fryerCount: v.fryerCount || defaultFryerCount, defaultOil: v.oilId || bulkGroup.defaultOil,
      groupId: v.matchedGroupId || null, status: 'active', customerCode: v.customerCode ? v.customerCode.trim().toUpperCase() : '', state: v.state || '',
      volumeBracket: v.volumeBracket || '', bdmId: v.matchedRepId || ''
    }));
    setVenues(prev => [...prev, ...newVenues]);
    setBulkDone(true);
  };

  // ---- BULK UPLOAD FLOW ----
  if (bulkDone) {
      const created = bulkVenues.filter(v => v.valid).length;
      const groupsLinked = [...new Set(bulkVenues.filter(v => v.matchedGroupName).map(v => v.matchedGroupName))];
      return (
        <div>
          <div style={{ background: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Check size={32} color="white" strokeWidth={3} />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px' }}>{created} Venues Created</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px' }}>
              {groupsLinked.length > 0 ? `Linked to: ${groupsLinked.join(', ')}` : 'Created as standalone venues.'}
            </p>
            <button onClick={() => { setBulkDone(false); setStep(0); setCsvText(''); setBulkVenues([]); }} style={{ padding: '14px 32px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      );
    }

    const warnings = bulkVenues.filter(v => v.groupWarning || v.repWarning);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => { if (step === 0) { setStep(0); setCsvText(''); setBulkVenues([]); } else setStep(s => s - 1); }} style={{ padding: '8px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer' }}><ArrowLeft size={16} color="#64748b" /></button>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>Bulk Upload</h2>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          {bulkSteps.map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: '4px', borderRadius: '2px', marginBottom: '8px', background: i <= step ? '#1a428a' : '#e2e8f0', transition: 'background 0.3s' }} />
              <div style={{ fontSize: '10px', fontWeight: '600', color: i <= step ? '#1a428a' : '#94a3b8', letterSpacing: '0.3px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
          {/* Step 0: Paste CSV */}
          {step === 0 && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px' }}>Upload CSV</h3>
              <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.6', marginBottom: '16px' }}>Paste venue data from your CRM export. Group Code and Rep Code will be matched to existing groups and reps in the system.</p>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px', letterSpacing: '0.3px' }}>EXPECTED FORMAT</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'monospace', background: 'white', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <thead>
                      <tr>
                        {['CUST CODE', 'NAME', 'GROUP CODE', 'REP CODE', 'STATE', 'FRYERS', 'VOLUME'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', background: '#eef2ff', borderBottom: '2px solid #c7d2fe', fontSize: '10px', fontWeight: '700', color: '#1a428a', textAlign: 'left', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['TRUSOUV0', 'True South', 'JBS', 'BA01', 'VIC', '4', '100-150'],
                        ['GARMELV0', 'Garden State Hotel', 'JBS', 'BA01', 'VIC', '6', '150-plus'],
                        ['TONPORV0', "Tony's Fish & Chips", '', 'BC01', 'VIC', '2', 'under-60'],
                      ].map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: cell ? '#1f2937' : '#cbd5e1', whiteSpace: 'nowrap' }}>{cell || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setCsvText(sampleCsv)} style={{ marginTop: '8px', padding: '6px 12px', background: '#e8eef6', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', color: '#1a428a', cursor: 'pointer' }}>Use Sample Data</button>
              </div>
              <FormField label="Paste CSV Data" required>
                <textarea style={{ ...inputStyle, minHeight: '160px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }} value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="Cust Code,Name,Group Code,Rep Code,State,Fryers,Volume" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              {bulkError && (<div style={{ background: '#fee2e2', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', border: '1px solid #fca5a5', fontSize: '13px', color: '#991b1b' }}>{bulkError}</div>)}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={parseCsv} disabled={!csvText.trim()} style={{ flex: 1, padding: '14px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', opacity: !csvText.trim() ? 0.5 : 1 }}>Parse & Review</button>
              </div>
            </div>
          )}

          {/* Step 1: Review parsed venues */}
          {step === 1 && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px' }}>Review Venues</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>{bulkVenues.length} venue{bulkVenues.length !== 1 ? 's' : ''} parsed from CSV.</p>

              {warnings.length > 0 && (
                <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', border: '1px solid #fcd34d', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{warnings.length} venue{warnings.length !== 1 ? 's have' : ' has'} unrecognised Group Code or Rep Code. These venues will still be created but won't be linked. Rep codes must match the <strong>Rep Code</strong> set on each BDM in User Management.</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
                {bulkVenues.map(v => (
                  <div key={v._key} style={{ background: (v.groupWarning || v.repWarning) ? '#fffbeb' : '#fafbfc', borderRadius: '10px', padding: '12px', border: (v.groupWarning || v.repWarning) ? '1px solid #fcd34d' : '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>{v.name}</span>
                          <CodeBadge code={v.customerCode} />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: v.groupWarning ? '#dc2626' : '#64748b' }}>
                            Group: {v.matchedGroupName ? <strong style={{ color: '#10b981' }}>{v.matchedGroupName}</strong> : v.groupCode ? <strong style={{ color: '#dc2626' }}>"{v.groupCode}" not found</strong> : <span style={{ color: '#94a3b8' }}>None</span>}
                          </span>
                          <span style={{ fontSize: '11px', color: v.repWarning ? '#dc2626' : '#64748b' }}>
                            Rep: {v.matchedRepName ? <strong style={{ color: '#10b981' }}>{v.matchedRepName}</strong> : v.repCode ? <strong style={{ color: '#dc2626' }}>"{v.repCode}" not found</strong> : <span style={{ color: '#94a3b8' }}>None</span>}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => removeBulkVenue(v._key)} style={{ padding: '6px', background: '#fee2e2', border: 'none', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={12} color="#ef4444" /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setStep(0)} style={{ flex: 1, padding: '14px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Back</button>
                <button onClick={() => setStep(2)} disabled={bulkVenues.filter(v => v.valid).length === 0} style={{ flex: 1, padding: '14px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', opacity: bulkVenues.filter(v => v.valid).length === 0 ? 0.5 : 1 }}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 2: Oil & Confirm */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: '0 0 16px' }}>Set Oil & Confirm</h3>
              <FormField label="Main Oil for All Venues">
                <select style={selectStyle} value={bulkGroup.defaultOil} onChange={e => {
                  const newOil = e.target.value;
                  setBulkGroup(g => ({ ...g, defaultOil: newOil }));
                  setBulkVenues(prev => prev.map(v => ({ ...v, oilId: v._oilOverride ? v.oilId : newOil })));
                }}>
                  <option value="">SELECT OIL...</option>
                  {oilTypes.filter(o => o.category === 'cookers' && o.status === 'active').map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
                </select>
              </FormField>

              <div style={{ marginTop: '20px', marginBottom: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.5px' }}>VENUES — change oil per venue if needed</div>
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                {bulkVenues.filter(v => v.valid).map(v => (
                  <div key={v._key} style={{ background: '#fafbfc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>{v.name}</span>
                        <CodeBadge code={v.customerCode} />
                      </div>
                      {v.matchedGroupName && <span style={{ fontSize: '11px', color: '#64748b' }}>{v.matchedGroupName}</span>}
                    </div>
                    <select style={{ ...selectStyle, fontSize: '12px', padding: '6px 8px', minWidth: '140px', flex: '0 0 auto' }} value={v.oilId || ''} onChange={e => {
                      const val = e.target.value;
                      setBulkVenues(prev => prev.map(bv => bv._key === v._key ? { ...bv, oilId: val, _oilOverride: true } : bv));
                    }}>
                      <option value="">SELECT OIL...</option>
                      {oilTypes.filter(o => o.category === 'cookers' && o.status === 'active').map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.5px' }}>SUMMARY</div>
              {[
                { label: 'Venues to Create', value: bulkVenues.filter(v => v.valid).length },
                { label: 'Linked to Groups', value: bulkVenues.filter(v => v.matchedGroupId).length },
                { label: 'Street venues', value: bulkVenues.filter(v => v.valid && !v.matchedGroupId).length },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937' }}>{item.value}</span>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '15px', fontWeight: '600', color: '#64748b', cursor: 'pointer' }}>Back</button>
                <button onClick={finishBulk} disabled={bulkVenues.some(v => v.valid && !v.oilId)} style={{ flex: 1, padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: bulkVenues.some(v => v.valid && !v.oilId) ? 0.5 : 1 }}><Check size={18} /> Create {bulkVenues.filter(v => v.valid).length} Venues</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
};

// ==================== SYSTEM SETTINGS ====================
const CollapsibleCard = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left'
      }}>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', letterSpacing: '0.3px' }}>{title}</span>
        <ChevronDown size={14} color="#64748b" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && <div style={{ padding: '0 20px 20px' }}>{children}</div>}
    </div>
  );
};

const TrialSettingsConfig = ({ trialReasons, setTrialReasons, volumeBrackets, setVolumeBrackets, systemSettings, setSystemSettings, oilTypeOptions, setOilTypeOptions, demoLoaded, loadDemoData, clearDemoData }) => {
  const [activeTab, setActiveTab] = useState('reasons');
  const [newReason, setNewReason] = useState('');
  const [newReasonType, setNewReasonType] = useState('successful');
  const [newBracket, setNewBracket] = useState({ label: '', color: '#64748b' });
  const [newOilType, setNewOilType] = useState('');

  const addReason = () => {
    if (!newReason.trim()) return;
    const key = newReason.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setTrialReasons(prev => [...prev, { key, label: newReason.trim(), type: newReasonType }]);
    setNewReason('');
  };
  const removeReason = (key) => setTrialReasons(prev => prev.filter(r => r.key !== key));

  const addBracket = () => {
    if (!newBracket.label.trim()) return;
    const key = newBracket.label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-+]/g, '');
    setVolumeBrackets(prev => [...prev, { key, label: newBracket.label.trim(), color: newBracket.color }]);
    setNewBracket({ label: '', color: '#64748b' });
  };
  const removeBracket = (key) => setVolumeBrackets(prev => prev.filter(b => b.key !== key));

  const addOilType = () => {
    if (!newOilType.trim()) return;
    const val = newOilType.trim().toLowerCase();
    if (oilTypeOptions.includes(val)) return;
    setOilTypeOptions(prev => [...prev, val]);
    setNewOilType('');
  };
  const removeOilType = (val) => setOilTypeOptions(prev => prev.filter(b => b !== val));

  const tabs = [
    { key: 'reasons',  label: 'Reason Codes',     icon: CheckCircle, group: 'Trials' },
    { key: 'brackets', label: 'Volume Brackets',   icon: BarChart3,   group: 'Trials' },
    { key: 'oiltypes', label: 'Oil Types',         icon: Droplets,    group: 'Trials' },
    { key: 'defaults', label: 'Trial Defaults',    icon: Target,      group: 'Trials' },
    { key: 'tpm',      label: 'TPM Thresholds',    icon: AlertCircle, group: 'System' },
    { key: 'fryers',   label: 'Default Fryers',    icon: Settings,    group: 'System' },
    { key: 'reporting',label: 'Reporting',         icon: RefreshCw,   group: 'System' },
    { key: 'demo',     label: 'Demo Data',         icon: Archive,     group: 'System' },
  ];

  return (
    <div>
      <SectionHeader icon={Settings} title="Settings" />
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', display: 'flex', minHeight: '460px' }}>

        {/* Vertical tab list */}
        <div style={{ width: '168px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#f8fafc', padding: '10px 8px' }}>
          {['Trials', 'System'].map(group => (
            <div key={group}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '6px 8px 4px' }}>{group}</div>
              {tabs.filter(t => t.group === group).map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '1px', textAlign: 'left', fontSize: '12.5px', fontWeight: isActive ? '600' : '500',
                    background: isActive ? '#e8eef6' : 'transparent',
                    color: isActive ? '#1a428a' : '#64748b',
                    transition: 'all 0.15s',
                  }}>
                    <tab.icon size={13} style={{ flexShrink: 0 }} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>

          {activeTab === 'reasons' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>When a trial outcome is recorded, the BDM selects a reason. Helps track why trials succeed or fail.</div>
              <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 40px', background: '#f8fafc', padding: '6px 12px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b' }}>REASON</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textAlign: 'center' }}>TYPE</span>
                  <span />
                </div>
                {[...trialReasons].sort((a, b) => a.label.localeCompare(b.label)).map((r, i, arr) => (
                  <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 40px', alignItems: 'center', padding: '8px 12px', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937' }}>{r.label}</span>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: '700', padding: '3px 0', borderRadius: '4px', display: 'inline-block', width: '88px', textAlign: 'center', background: r.type === 'successful' ? '#dcfce7' : '#fee2e2', color: r.type === 'successful' ? '#065f46' : '#991b1b' }}>{r.type === 'successful' ? 'SUCCESSFUL' : 'UNSUCCESSFUL'}</span>
                    </div>
                    <button onClick={() => removeReason(r.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', justifyContent: 'center' }}>
                      <X size={14} color="#cbd5e1" />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="BUDGET CONSTRAINTS" value={newReason} onChange={e => setNewReason(e.target.value.toUpperCase())} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} onKeyDown={e => e.key === 'Enter' && addReason()} />
                <button onClick={() => setNewReasonType('successful')} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', border: `1.5px solid ${newReasonType === 'successful' ? '#6ee7b7' : '#e2e8f0'}`, background: newReasonType === 'successful' ? '#d1fae5' : 'white', color: newReasonType === 'successful' ? '#065f46' : '#64748b' }}>Successful</button>
                <button onClick={() => setNewReasonType('unsuccessful')} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', border: `1.5px solid ${newReasonType === 'unsuccessful' ? '#fca5a5' : '#e2e8f0'}`, background: newReasonType === 'unsuccessful' ? '#fee2e2' : 'white', color: newReasonType === 'unsuccessful' ? '#991b1b' : '#64748b' }}>Unsuccessful</button>
                <button onClick={addReason} style={{ padding: '0 16px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            </div>
          )}

          {activeTab === 'brackets' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Categorise venues by weekly oil usage. Used for filtering and reporting on trials and calendars.</div>
              <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 40px 40px', background: '#f8fafc', padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textAlign: 'center' }}>#</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b' }}>BRACKET</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textAlign: 'center' }}>CLR</span>
                  <span />
                </div>
                {volumeBrackets.map((b, i) => (
                  <div key={b.key} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 40px 40px', alignItems: 'center', padding: '8px 0', borderBottom: i < volumeBrackets.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>{i + 1}</span>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937' }}>{b.label}</span>
                    <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', background: b.color }} /></div>
                    <button onClick={() => removeBracket(b.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', justifyContent: 'center' }}>
                      <X size={14} color="#cbd5e1" />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="200-300L" value={newBracket.label} onChange={e => setNewBracket(p => ({ ...p, label: e.target.value.toUpperCase() }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} onKeyDown={e => e.key === 'Enter' && addBracket()} />
                <input type="color" value={newBracket.color} onChange={e => setNewBracket(p => ({ ...p, color: e.target.value }))} style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1.5px solid #e2e8f0', cursor: 'pointer', padding: '2px' }} />
                <button onClick={addBracket} style={{ padding: '8px 16px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            </div>
          )}

          {activeTab === 'oiltypes' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Classifies oils by their primary ingredient. Used across Cookers and competitor oil records.</div>
              <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px', background: '#f8fafc', padding: '6px 12px', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b' }}>TYPE</span>
                  <span />
                </div>
                {oilTypeOptions.map((b, i) => (
                  <div key={b} style={{ display: 'grid', gridTemplateColumns: '1fr 40px', alignItems: 'center', padding: '8px 12px', borderBottom: i < oilTypeOptions.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937', textTransform: 'uppercase' }}>{b}</span>
                    <button onClick={() => removeOilType(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', justifyContent: 'center' }}>
                      <X size={14} color="#cbd5e1" />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="RICE BRAN" value={newOilType} onChange={e => setNewOilType(e.target.value.toUpperCase())} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} onKeyDown={e => e.key === 'Enter' && addOilType()} />
                <button onClick={addOilType} style={{ padding: '8px 16px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
              </div>
            </div>
          )}

          {activeTab === 'defaults' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Sets the default number of days when creating a new trial. Can be overridden per trial.</div>
              <FormField label="Default Trial Duration (days)">
                <input type="number" min="1" max="90" style={inputStyle} value={systemSettings.trialDuration} onChange={e => setSystemSettings(s => ({ ...s, trialDuration: parseInt(e.target.value) }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
            </div>
          )}

          {activeTab === 'tpm' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Set the TPM percentage levels that trigger warning and critical alerts on venue calendars.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'end' }}>
                <FormField label="Warning (%)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="number" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.warningThreshold} onChange={e => setSystemSettings(s => ({ ...s, warningThreshold: parseInt(e.target.value) }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                  </div>
                </FormField>
                <FormField label="Critical (%)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="number" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.criticalThreshold} onChange={e => setSystemSettings(s => ({ ...s, criticalThreshold: parseInt(e.target.value) }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  </div>
                </FormField>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '16px', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ flex: systemSettings.warningThreshold, background: '#10b981', borderRadius: '4px 0 0 4px' }} />
                <div style={{ flex: systemSettings.criticalThreshold - systemSettings.warningThreshold, background: '#f59e0b' }} />
                <div style={{ flex: 36 - systemSettings.criticalThreshold, background: '#ef4444', borderRadius: '0 4px 4px 0' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '600' }}>Good (0–{systemSettings.warningThreshold})</span>
                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '600' }}>Warning ({systemSettings.warningThreshold}–{systemSettings.criticalThreshold})</span>
                <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>Critical ({systemSettings.criticalThreshold}+)</span>
              </div>
            </div>
          )}

          {activeTab === 'fryers' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Pre-fills the fryer count when onboarding a new venue. Staff can adjust per venue.</div>
              <FormField label="Default Fryer Count">
                <input type="number" min="1" max="20" style={inputStyle} value={systemSettings.defaultFryerCount} onChange={e => setSystemSettings(s => ({ ...s, defaultFryerCount: parseInt(e.target.value) }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
            </div>
          )}

          {activeTab === 'reporting' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Controls how often reports are generated and when reminders are sent to BDMs for overdue readings.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'end' }}>
                <FormField label="Report Frequency">
                  <select style={selectStyle} value={systemSettings.reportFrequency} onChange={e => setSystemSettings(s => ({ ...s, reportFrequency: e.target.value }))}>
                    <option value="daily">DAILY</option>
                    <option value="weekly">WEEKLY</option>
                    <option value="monthly">MONTHLY</option>
                  </select>
                </FormField>
                <FormField label="Reminder (days)">
                  <input type="number" min="1" max="30" style={inputStyle} value={systemSettings.reminderDays} onChange={e => setSystemSettings(s => ({ ...s, reminderDays: parseInt(e.target.value) }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Load sample data to test the admin panel, or clear it before going live with real data.</div>
              <div style={{ background: demoLoaded ? '#fefce8' : '#f8fafc', borderRadius: '10px', padding: '14px', border: `1px solid ${demoLoaded ? '#fde047' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: demoLoaded ? '#854d0e' : '#1f2937', marginBottom: '2px' }}>{demoLoaded ? 'Demo data is active' : 'No demo data loaded'}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{demoLoaded ? 'Sample venues, groups, users, oils, competitors and trials are loaded.' : 'The system is empty. Load demo data to explore all features.'}</div>
                </div>
                <button onClick={demoLoaded ? clearDemoData : loadDemoData} style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, background: demoLoaded ? '#fff' : '#1a428a', color: demoLoaded ? '#dc2626' : '#fff', border: demoLoaded ? '1.5px solid #fca5a5' : '1.5px solid #1a428a' }}>
                  {demoLoaded ? 'Clear Demo Data' : 'Load Demo Data'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const SystemSettings = ({ systemSettings: settings, setSystemSettings: setSettings, demoLoaded, loadDemoData, clearDemoData }) => {
  return null;
};

// ==================== SEED DATA ====================

const seedCompetitors = () => [
  { id: 'comp-1', name: 'OIL2U', code: 'OIL2', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'QLD'], createdAt: '2025-06-15', updatedAt: '2026-02-10', color: '#e53e3e' },
  { id: 'comp-2', name: 'CFM', code: 'CFM', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'], createdAt: '2025-06-15', updatedAt: '2026-02-12', color: '#3182ce' },
  { id: 'comp-3', name: 'TROJAN', code: 'TROJ', status: 'active', type: 'direct', states: ['VIC', 'NSW'], createdAt: '2025-07-01', updatedAt: '2026-01-20', color: '#d69e2e' },
  { id: 'comp-4', name: 'ECOFRY', code: 'EFRY', status: 'active', type: 'direct', states: ['VIC', 'QLD', 'WA'], createdAt: '2025-08-10', updatedAt: '2026-02-05', color: '#38a169' },
  { id: 'comp-5', name: 'AUSCOL', code: 'AUSC', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'QLD', 'SA'], createdAt: '2025-09-01', updatedAt: '2026-01-15', color: '#805ad5' },
  { id: 'comp-6', name: 'FILTAFRY', code: 'FILT', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'QLD', 'SA', 'WA'], createdAt: '2025-09-10', updatedAt: '2026-01-28', color: '#319795' },
  { id: 'comp-7', name: 'THE FAT MAN', code: 'FMAN', status: 'active', type: 'direct', states: ['VIC', 'NSW'], createdAt: '2025-10-01', updatedAt: '2026-02-01', color: '#d53f8c' },
  { id: 'comp-8', name: 'THE OIL MAN', code: 'OMAN', status: 'active', type: 'direct', states: ['QLD'], createdAt: '2025-10-15', updatedAt: '2026-01-30', color: '#dd6b20' },
  { id: 'comp-9', name: 'THE OIL GUYS', code: 'THOG', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'SA'], createdAt: '2025-11-01', updatedAt: '2026-02-08', color: '#5a67d8' },
  { id: 'comp-10', name: 'VATMAN', code: 'VAT', status: 'active', type: 'direct', states: ['VIC', 'NSW', 'QLD', 'WA', 'TAS'], createdAt: '2025-11-10', updatedAt: '2026-02-14', color: '#2d3748' },
  { id: 'comp-11', name: 'PEERLESS', code: 'PEER', status: 'active', type: 'indirect', states: ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'], createdAt: '2025-06-20', updatedAt: '2026-02-10', color: '#276749' },
  { id: 'comp-12', name: 'COLES', code: 'COLE', status: 'active', type: 'indirect', states: ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'], createdAt: '2025-07-15', updatedAt: '2026-01-20', color: '#c05621' },
  { id: 'comp-13', name: 'MSM MILLING', code: 'MSM', status: 'active', type: 'indirect', states: ['VIC', 'NSW', 'QLD'], createdAt: '2025-08-01', updatedAt: '2026-02-05', color: '#2b6cb0' },
];

const seedOilTypes = () => [
  { id: 'oil-1', name: 'XLFRY', code: 'XLFRY', category: 'cookers', tier: 'premium', status: 'active', oilType: 'canola', packSize: 'bulk', competitorId: '' },
  { id: 'oil-2', name: 'ULTAFRY', code: 'ULTAFRY', category: 'cookers', tier: 'elite', status: 'active', oilType: 'canola', packSize: 'bulk', competitorId: '' },
  { id: 'oil-3', name: 'CANOLA', code: 'CANOLANA', category: 'cookers', tier: 'standard', status: 'active', oilType: 'canola', packSize: 'bulk', competitorId: '' },
  { id: 'oil-4', name: 'COOKERS BLEND', code: 'CKBLEND', category: 'cookers', tier: 'standard', status: 'inactive', oilType: 'canola', packSize: 'bulk', competitorId: '' },
  { id: 'oil-5', name: 'CANOLA', code: 'OIL2-CAN', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-1', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-5b', name: 'HI-PERFORMANCE', code: 'OIL2-HP', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-1', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-6', name: 'SUNFLOWER', code: 'CFM-FO', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-2', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-6b', name: 'GOLD BLEND', code: 'CFM-GB', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-2', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-6c', name: 'CANOLA LIGHT', code: 'CFM-CL', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-2', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-7', name: 'DEEP FRY', code: 'TROJ-DF', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-3', oilType: 'palm', packSize: 'bulk' },
  { id: 'oil-7b', name: 'ENDURANCE', code: 'TROJ-EN', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-3', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-8', name: 'PREMIUM', code: 'EFRY-PR', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-4', oilType: 'sunflower', packSize: 'bulk' },
  { id: 'oil-8b', name: 'ECOBLEND', code: 'EFRY-EB', category: 'competitor', tier: 'elite', status: 'active', competitorId: 'comp-4', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-8c', name: 'PURE CANOLA', code: 'EFRY-PC', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-4', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-9', name: 'FRY MAX', code: 'AUSC-FM', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-5', oilType: 'palm', packSize: 'bulk' },
  { id: 'oil-9b', name: 'CANOLA SELECT', code: 'AUSC-CS', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-5', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-9c', name: 'ULTRA BLEND', code: 'AUSC-UB', category: 'competitor', tier: 'elite', status: 'active', competitorId: 'comp-5', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-10', name: 'FILTRAOIL', code: 'FILT-FO', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-6', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-10b', name: 'CANOLA', code: 'FILT-SC', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-6', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-11', name: 'FAT BLEND', code: 'FMAN-BL', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-7', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-11b', name: 'BUDGET FRY', code: 'FMAN-BF', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-7', oilType: 'palm', packSize: 'bulk' },
  { id: 'oil-12', name: 'PREMIUM', code: 'OMAN-PR', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-8', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-13', name: 'GUYS CANOLA', code: 'THOG-CAN', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-9', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-13b', name: 'PREMIUM', code: 'THOG-PR', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-9', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-14', name: 'VATMAN FRY', code: 'VAT-FRY', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-10', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-14b', name: 'CANOLA', code: 'VAT-STD', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-10', oilType: 'canola', packSize: 'bulk' },
  { id: 'oil-15', name: 'CANOLA 20L', code: 'PEER-C20', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-11', oilType: 'canola', packSize: '20l' },
  { id: 'oil-15b', name: 'VEGETABLE 20L', code: 'PEER-V20', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-11', oilType: 'blend', packSize: '20l' },
  { id: 'oil-16', name: 'CANOLA OIL 20L', code: 'COLE-C20', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-12', oilType: 'canola', packSize: '20l' },
  { id: 'oil-17', name: 'FRYING OIL 20L', code: 'MSM-F20', category: 'competitor', tier: 'standard', status: 'active', competitorId: 'comp-13', oilType: 'canola', packSize: '20l' },
  { id: 'oil-17b', name: 'SUNFLOWER 20L', code: 'MSM-S20', category: 'competitor', tier: 'premium', status: 'active', competitorId: 'comp-13', oilType: 'sunflower', packSize: '20l' },
];

// Generates realistic TPM readings from the seed venue data.
// Each reading includes oilAge (days since last fill) and litresFilled when oilAge === 1.
// oilAge resets to 1 when the hash pattern simulates an oil change.
// litresFilled is derived from fryerCount and volume bracket — bigger venues fill more per fryer.
const seedTpmReadings = () => {
  const readings = [];
  const venues = seedVenues();
  let idCounter = 1;

  const volumeToLitresPerFryer = { 'under-60': 8, '60-100': 12, '100-150': 16, '150-plus': 22 };

  venues.forEach(v => {
    if (!v.trialStartDate || v.trialStatus === 'pending') return;
    const start = new Date(v.trialStartDate + 'T00:00:00');
    const end = new Date((v.trialEndDate || v.trialStartDate) + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const fryerCount = v.fryerCount || 1;
    const litresPerFill = volumeToLitresPerFryer[v.volumeBracket] || 12;

    // Track oil age per fryer independently
    const fryerOilAge = {};
    for (let f = 1; f <= fryerCount; f++) fryerOilAge[f] = 0;

    const d = new Date(start);
    while (d <= end && d <= today) {
      for (let f = 1; f <= fryerCount; f++) {
        const dayIdx = Math.floor((d - start) / 86400000);
        const seed = (hash * 31 + dayIdx * 17 + f * 53) % 100;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        // Skip some readings (weekends less likely, simulates missed days)
        if (seed >= (isWeekend ? 70 : 95)) continue;

        fryerOilAge[f]++;

        // Simulate oil change: fryers change based on volume — high volume changes more often
        const changeInterval = v.volumeBracket === '150-plus' ? 3 : v.volumeBracket === '100-150' ? 4 : 5;
        const isOilChange = fryerOilAge[f] > changeInterval && ((hash + f + dayIdx) % changeInterval === 0);
        if (isOilChange) fryerOilAge[f] = 1;

        const currentAge = fryerOilAge[f];
        const baseTpm = 3 + (hash % 3);
        const dailyRise = 1.5 + ((hash + f * 3) % 10) / 10;
        const noise = ((seed * 7 + dayIdx * 3) % 30 - 15) / 10;
        const tpm = Math.round(Math.max(2, Math.min(24, baseTpm + ((currentAge - 1) * dailyRise) + noise)));

        // Small per-fill variation so different fryers don't all show identical litres
        const fillVariance = ((hash + f * 7) % 5) - 2; // -2 to +2 L
        const litresFilled = currentAge === 1 ? Math.max(5, litresPerFill + fillVariance) : null;

        // Temperatures: set 175-185, actual drifts slightly from set
        const setTemp = 175 + ((hash + f * 3) % 3) * 5; // 175, 180, or 185
        const tempDrift = ((seed + dayIdx) % 7) - 3; // -3 to +3
        const actualTemp = setTemp + tempDrift;
        // Filtering: more likely on low oil age days (fresh oil = recently filtered)
        const didFilter = currentAge <= 2 ? ((hash + f + dayIdx) % 3 !== 0) : ((hash + f + dayIdx) % 5 === 0);
        const foodTypeIdx = (hash + f * 2) % FOOD_TYPES.length;

        readings.push({
          id: `r-${idCounter++}`,
          venueId: v.id,
          fryerNumber: f,
          readingDate: d.toISOString().split('T')[0],
          takenBy: v.bdmId || null,
          oilAge: currentAge,
          litresFilled,
          tpmValue: tpm,
          setTemperature: setTemp,
          actualTemperature: actualTemp,
          filtered: didFilter,
          foodType: FOOD_TYPES[foodTypeIdx],
          notes: '',
        });
      }
      d.setDate(d.getDate() + 1);
    }
  });
  return readings;
};

const seedVenues = () => [
  // JBS Hospitality Group venues (all active, NAM: Ben Andonov via group)
  { id: 'v-1', volumeBracket: '100-150', name: 'TRUE SOUTH', fryerCount: 4, defaultOil: 'oil-3', groupId: 'g-1', status: 'active', customerCode: 'TRUSOUV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-2', volumeBracket: '150-plus', name: 'GARDEN STATE HOTEL', fryerCount: 6, defaultOil: 'oil-3', groupId: 'g-1', status: 'active', customerCode: 'GARMELV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-3', volumeBracket: '60-100', name: 'THE EMERSON', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-1', status: 'active', customerCode: 'THESOUV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-4', volumeBracket: '150-plus', name: 'THE PRECINCT HOTEL', fryerCount: 5, defaultOil: 'oil-3', groupId: 'g-1', status: 'active', customerCode: 'THEMELV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-5', volumeBracket: '60-100', name: 'HOLLIAVA', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-1', status: 'active', customerCode: 'HOLWINV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },

  // Betty's Burgers group — mix of active customers and trial venues (NAM: Braedan Cleave via group)
  { id: 'v-9', volumeBracket: '60-100', name: "BETTY'S BURGERS DONCASTER", fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-2', status: 'active', customerCode: 'BETDONV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-10', volumeBracket: '60-100', name: "BETTY'S BURGERS CHADSTONE", fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-2', status: 'active', customerCode: 'BETCHAV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-11', volumeBracket: '60-100', name: "BETTY'S BURGERS BRUNETTI", fryerCount: 3, defaultOil: 'oil-3', groupId: 'g-2', status: 'active', customerCode: 'BETCARV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-12', volumeBracket: '60-100', name: "BETTY'S BURGERS BRIGHTON", fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: 'g-2', status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-20', currentWeeklyAvg: 85, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.45 },
  { id: 'v-13', volumeBracket: 'under-60', name: "BETTY'S BURGERS FITZROY", fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: 'g-2', status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'pending', trialStartDate: '2026-02-24', trialEndDate: '2026-03-06', currentWeeklyAvg: 55, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.45 },

  // Standalone active venues (no group)
  { id: 'v-6', volumeBracket: 'under-60', name: "TONY'S FISH & CHIPS", fryerCount: 2, defaultOil: 'oil-3', groupId: null, status: 'active', customerCode: 'TONPORV0', state: 'VIC', bdmId: 'u-7a', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-7', volumeBracket: 'under-60', name: "MARIO'S PIZZA", fryerCount: 2, defaultOil: 'oil-3', groupId: null, status: 'active', customerCode: 'MARCARV0', state: 'VIC', bdmId: 'u-7b', trialOilId: '', lastTpmDate: '2026-02-13' },
  { id: 'v-14', volumeBracket: '60-100', name: 'SALTY DOG FISH BAR', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-4', status: 'active', customerCode: 'SALSTV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-15', volumeBracket: 'under-60', name: 'WOK THIS WAY', fryerCount: 2, defaultOil: 'oil-3', groupId: null, status: 'active', customerCode: 'WOKRICV0', state: 'VIC', bdmId: 'u-7c', trialOilId: '', lastTpmDate: '2026-02-10' },

  // Standalone trial/prospect venues (BDM running trials)
  { id: 'v-8', volumeBracket: '100-150', name: 'PROSPECT BURGER CO', fryerCount: 4, defaultOil: 'oil-6', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7c', trialStatus: 'completed', trialStartDate: '2026-02-03', trialEndDate: '2026-02-13', trialNotes: 'Strong results across all 4 fryers. Dave wants to discuss with his business partner before committing. Follow up mid-Feb.', currentWeeklyAvg: 120, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.65 },
  { id: 'v-16', volumeBracket: 'under-60', name: 'GOLDEN WONTON', fryerCount: 2, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: 'GOLMELV0', state: 'VIC', bdmId: 'u-7a', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-02-03', trialEndDate: '2026-02-13', outcomeDate: '2026-02-14', trialNotes: 'Owner very impressed with oil life extension. Went from 3-day changes to 5-day. Keen to sign onto oil management program.', currentWeeklyAvg: 48, currentPricePerLitre: 2.20, offeredPricePerLitre: 2.85, soldPricePerLitre: 2.75 },
  { id: 'v-40', volumeBracket: '60-100', name: 'BRUNSWICK SOUVLAKI BAR', fryerCount: 3, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'in-progress', trialStartDate: '2026-02-11', trialEndDate: '2026-02-21', currentWeeklyAvg: 70, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.55 },
  { id: 'v-41', volumeBracket: '100-150', name: 'ST KILDA BURGER JOINT', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7c', trialStatus: 'pending', trialStartDate: '2026-02-20', trialEndDate: '2026-03-02', currentWeeklyAvg: 105, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.60 },

  // NSW venues
  { id: 'v-18', volumeBracket: '60-100', name: 'THE CHIPPO', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-4', status: 'active', customerCode: 'THECHINS0', state: 'NSW', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-19', volumeBracket: '150-plus', name: 'DARLING HARBOUR FISH CO', fryerCount: 5, defaultOil: 'oil-3', groupId: 'g-3', status: 'active', customerCode: 'DARSYNS0', state: 'NSW', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-20', volumeBracket: 'under-60', name: 'BONDI BITES', fryerCount: 2, defaultOil: 'oil-1', groupId: null, status: 'active', customerCode: 'BONBONS0', state: 'NSW', bdmId: 'u-7d', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-21', volumeBracket: '100-150', name: 'NEWTOWN NOODLE BAR', fryerCount: 3, defaultOil: 'oil-7', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7d', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-19', currentWeeklyAvg: 110, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.65 },
  { id: 'v-22', volumeBracket: 'under-60', name: 'PARRAMATTA KEBABS', fryerCount: 2, defaultOil: 'oil-6', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7e', trialStatus: 'lost', trialStartDate: '2026-01-27', trialEndDate: '2026-02-06', outcomeDate: '2026-02-08', trialReason: 'no-savings', trialNotes: 'Small venue with low volume. Oil change frequency was already low so savings were marginal. Owner not willing to pay premium price for minimal benefit.', currentWeeklyAvg: 30, currentPricePerLitre: 1.85, offeredPricePerLitre: 2.45 },
  { id: 'v-42', volumeBracket: '100-150', name: 'SURRY HILLS FRIED CHICKEN', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7f', trialStatus: 'in-progress', trialStartDate: '2026-02-08', trialEndDate: '2026-02-18', currentWeeklyAvg: 110, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.70 },
  { id: 'v-43', volumeBracket: '60-100', name: 'MANLY WHARF FISH CO', fryerCount: 3, defaultOil: 'oil-6', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7d', trialStatus: 'completed', trialStartDate: '2026-02-01', trialEndDate: '2026-02-11', trialNotes: 'Sarah happy with results. Wants to run numbers past her accountant before committing.', currentWeeklyAvg: 80, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.55 },

  // QLD venues
  { id: 'v-23', volumeBracket: '100-150', name: 'SURFERS FISH HOUSE', fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-3', status: 'active', customerCode: 'SURSURQ0', state: 'QLD', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-24', volumeBracket: '60-100', name: 'FORTITUDE FRY BAR', fryerCount: 3, defaultOil: 'oil-3', groupId: 'g-4', status: 'active', customerCode: 'FORFORQ0', state: 'QLD', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-25', volumeBracket: '100-150', name: 'NOOSA COASTAL KITCHEN', fryerCount: 3, defaultOil: 'oil-8', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: 'NOOQLD1', state: 'QLD', bdmId: 'u-7g', trialStatus: 'won', trialReason: 'cost-savings', trialStartDate: '2026-01-20', trialEndDate: '2026-01-30', outcomeDate: '2026-02-02', trialNotes: 'High volume venue, busy tourist season. Reading twice daily to get good data.', currentWeeklyAvg: 130, currentPricePerLitre: 2.15, offeredPricePerLitre: 2.50, soldPricePerLitre: 2.50 },
  { id: 'v-44', volumeBracket: '60-100', name: 'WEST END WINGS', fryerCount: 3, defaultOil: 'oil-8', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7h', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-20', currentWeeklyAvg: 75, currentPricePerLitre: 2.15, offeredPricePerLitre: 2.55 },
  { id: 'v-45', volumeBracket: '150-plus', name: 'BROADBEACH BURGER BAR', fryerCount: 5, defaultOil: 'oil-6', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7i', trialStatus: 'pending', trialStartDate: '2026-02-22', trialEndDate: '2026-03-04', currentWeeklyAvg: 160, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.50 },

  // SA venues
  { id: 'v-26', volumeBracket: '100-150', name: 'HENLEY BEACH SEAFOOD', fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-3', status: 'active', customerCode: 'HENHENS0', state: 'SA', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-27', volumeBracket: 'under-60', name: 'RUNDLE ST CHICKEN', fryerCount: 2, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7j', trialStatus: 'pending', trialStartDate: '2026-02-24', trialEndDate: '2026-03-06', currentWeeklyAvg: 40, currentPricePerLitre: 2.30, offeredPricePerLitre: 2.40 },
  { id: 'v-46', volumeBracket: '60-100', name: 'GLENELG FISH SHACK', fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7k', trialStatus: 'in-progress', trialStartDate: '2026-02-07', trialEndDate: '2026-02-17', currentWeeklyAvg: 65, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.50 },

  // WA venues
  { id: 'v-28', volumeBracket: '150-plus', name: 'FREMANTLE FISH MARKET', fryerCount: 5, defaultOil: 'oil-2', groupId: 'g-3', status: 'active', customerCode: 'FREFREW0', state: 'WA', bdmId: '', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-29', volumeBracket: '60-100', name: 'SCARBOROUGH BURGERS', fryerCount: 3, defaultOil: 'oil-6', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'WA', bdmId: 'u-7l', trialStatus: 'completed', trialStartDate: '2026-02-01', trialEndDate: '2026-02-11', trialNotes: 'Josh says results look good. Waiting on credit approval from head office.', currentWeeklyAvg: 75, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.45 },
  { id: 'v-47', volumeBracket: '100-150', name: 'LEEDERVILLE GRILL HOUSE', fryerCount: 4, defaultOil: 'oil-8', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'WA', bdmId: 'u-7m', trialStatus: 'in-progress', trialStartDate: '2026-02-09', trialEndDate: '2026-02-19', currentWeeklyAvg: 95, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.60 },

  // TAS venues
  { id: 'v-30', volumeBracket: '60-100', name: 'SALAMANCA FISH PUNT', fryerCount: 3, defaultOil: 'oil-1', groupId: null, status: 'active', customerCode: 'SALHOBS0', state: 'TAS', bdmId: 'u-7n', trialOilId: '', lastTpmDate: '2026-02-14' },
  { id: 'v-31', volumeBracket: 'under-60', name: 'NORTH HOBART CHICKEN', fryerCount: 2, defaultOil: 'oil-3', groupId: null, status: 'active', customerCode: 'NORHOBS0', state: 'TAS', bdmId: 'u-7n', trialOilId: '', lastTpmDate: '2026-02-06' },
  { id: 'v-32', volumeBracket: '60-100', name: 'LAUNCESTON BURGER SHACK', fryerCount: 3, defaultOil: 'oil-13', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'TAS', bdmId: 'u-7n', trialStatus: 'lost', trialStartDate: '2026-01-13', trialEndDate: '2026-01-23', outcomeDate: '2026-01-28', trialReason: 'price-too-high', currentWeeklyAvg: 70, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.45 },

  // Trader House group venues (VIC)
  { id: 'v-33', volumeBracket: '100-150', name: 'TRADER HOUSE SOUTH MELBOURNE', fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-6', status: 'active', customerCode: 'TRHSMV0', state: 'VIC', bdmId: 'u-7a', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-34', volumeBracket: '60-100', name: 'TRADER HOUSE HAWTHORN', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-6', status: 'active', customerCode: 'TRHHAWV0', state: 'VIC', bdmId: 'u-7b', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-35', volumeBracket: '60-100', name: 'TRADER HOUSE FITZROY', fryerCount: 3, defaultOil: 'oil-3', groupId: 'g-6', status: 'active', customerCode: 'TRHFITV0', state: 'VIC', bdmId: 'u-7c', trialOilId: '', lastTpmDate: '2026-02-16' },

  // Guzman Y Gomez group venues (multi-state)
  { id: 'v-36', volumeBracket: '60-100', name: 'GYG CHAPEL ST', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-7', status: 'active', customerCode: 'GYGPRAV0', state: 'VIC', bdmId: 'u-7a', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-37', volumeBracket: '100-150', name: 'GYG NEWTOWN', fryerCount: 4, defaultOil: 'oil-1', groupId: 'g-7', status: 'active', customerCode: 'GYGNETN0', state: 'NSW', bdmId: 'u-7d', trialOilId: '', lastTpmDate: '2026-02-16' },
  { id: 'v-38', volumeBracket: '60-100', name: 'GYG JAMES ST', fryerCount: 3, defaultOil: 'oil-3', groupId: 'g-7', status: 'active', customerCode: 'GYGFORQ0', state: 'QLD', bdmId: 'u-7g', trialOilId: '', lastTpmDate: '2026-02-15' },
  { id: 'v-39', volumeBracket: '60-100', name: 'GYG RUNDLE ST', fryerCount: 3, defaultOil: 'oil-1', groupId: 'g-7', status: 'active', customerCode: 'GYGRUNS0', state: 'SA', bdmId: 'u-7j', trialOilId: '', lastTpmDate: '2026-02-14' },

  // Inactive venue (closed)
  { id: 'v-17', volumeBracket: '60-100', name: 'THE FRYING PAN (CLOSED)', fryerCount: 2, defaultOil: 'oil-3', groupId: null, status: 'inactive', customerCode: 'FRIRICV0', state: 'VIC', bdmId: '', trialOilId: '', lastTpmDate: '2025-11-15' },

  // Additional trial venues for richer analysis
  { id: 'v-50', volumeBracket: '100-150', name: 'PRAHRAN WINGS CO', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-01-06', trialEndDate: '2026-01-13', outcomeDate: '2026-01-15', trialNotes: 'Quick turnaround, owner loved oil longevity.', currentWeeklyAvg: 105, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.70, soldPricePerLitre: 2.60 },
  { id: 'v-51', volumeBracket: '60-100', name: 'SEDDON STREET EATS', fryerCount: 3, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'won', trialReason: 'trial-results', trialStartDate: '2025-12-15', trialEndDate: '2025-12-22', outcomeDate: '2025-12-28', trialNotes: 'Great results. Signed 12-month supply agreement.', currentWeeklyAvg: 65, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.55, soldPricePerLitre: 2.50 },
  { id: 'v-52', volumeBracket: '150-plus', name: 'COLLINGWOOD FRIED CHICKEN', fryerCount: 6, defaultOil: 'oil-8', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7c', trialStatus: 'lost', trialStartDate: '2026-01-10', trialEndDate: '2026-01-20', outcomeDate: '2026-01-25', trialReason: 'price-too-high', trialNotes: 'Venue liked performance but wouldn\'t move off budget pricing.', currentWeeklyAvg: 180, currentPricePerLitre: 1.80, offeredPricePerLitre: 2.65 },
  { id: 'v-53', volumeBracket: 'under-60', name: 'YARRAVILLE DUMPLINGS', fryerCount: 2, defaultOil: 'oil-10', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'lost', trialStartDate: '2026-01-20', trialEndDate: '2026-01-27', outcomeDate: '2026-02-03', trialReason: 'no-savings', trialNotes: 'Low volume venue, oil savings marginal.', currentWeeklyAvg: 35, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.50 },
  { id: 'v-54', volumeBracket: '100-150', name: 'COOGEE BAY FISH', fryerCount: 4, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7d', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2025-12-20', trialEndDate: '2025-12-30', outcomeDate: '2026-01-03', trialNotes: 'Busy summer trade. Oil lasted 40% longer than previous.', currentWeeklyAvg: 120, currentPricePerLitre: 2.25, offeredPricePerLitre: 2.75, soldPricePerLitre: 2.70 },
  { id: 'v-55', volumeBracket: '60-100', name: 'MARRICKVILLE FRY BAR', fryerCount: 3, defaultOil: 'oil-5', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7e', trialStatus: 'won', trialReason: 'bdm-relationship', trialStartDate: '2026-01-13', trialEndDate: '2026-01-20', outcomeDate: '2026-01-22', trialNotes: 'Quick decision. Manager was already unhappy with current supplier.', currentWeeklyAvg: 80, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.60, soldPricePerLitre: 2.55 },
  { id: 'v-56', volumeBracket: '150-plus', name: 'CRONULLA SEAFOOD HOUSE', fryerCount: 5, defaultOil: 'oil-7', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7f', trialStatus: 'lost', trialStartDate: '2026-01-06', trialEndDate: '2026-01-16', outcomeDate: '2026-01-22', trialReason: 'chose-competitor', trialNotes: 'Went with a cheaper competitor who offered rebates.', currentWeeklyAvg: 155, currentPricePerLitre: 1.85, offeredPricePerLitre: 2.50 },
  { id: 'v-57', volumeBracket: 'under-60', name: 'REDFERN CHICKEN SHOP', fryerCount: 2, defaultOil: 'oil-11b', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7d', trialStatus: 'lost', trialStartDate: '2025-12-09', trialEndDate: '2025-12-16', outcomeDate: '2025-12-23', trialReason: 'owner-not-interested', trialNotes: 'Owner didn\'t engage during trial. No readings taken.', currentWeeklyAvg: 40, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.40 },
  { id: 'v-58', volumeBracket: '100-150', name: 'SOUTHBANK GRILL', fryerCount: 4, defaultOil: 'oil-9', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7g', trialStatus: 'won', trialReason: 'cost-savings', trialStartDate: '2026-01-15', trialEndDate: '2026-01-25', outcomeDate: '2026-01-24', trialNotes: 'Excellent results. Reduced oil changes from every 2 days to every 4.', currentWeeklyAvg: 115, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.65, soldPricePerLitre: 2.60 },
  { id: 'v-59', volumeBracket: '60-100', name: 'PADDINGTON CHIPPY', fryerCount: 3, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7h', trialStatus: 'lost', trialStartDate: '2026-01-20', trialEndDate: '2026-01-30', outcomeDate: '2026-02-05', trialReason: 'price-too-high', trialNotes: 'Good performance but owner is price-driven.', currentWeeklyAvg: 70, currentPricePerLitre: 1.85, offeredPricePerLitre: 2.45 },
  { id: 'v-60', volumeBracket: '150-plus', name: 'KANGAROO POINT SEAFOOD', fryerCount: 5, defaultOil: 'oil-8', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7i', trialStatus: 'won', trialReason: 'cost-savings', trialStartDate: '2025-12-16', trialEndDate: '2025-12-26', outcomeDate: '2025-12-30', trialNotes: 'High-volume success story. Massive oil savings.', currentWeeklyAvg: 170, currentPricePerLitre: 2.20, offeredPricePerLitre: 2.80, soldPricePerLitre: 2.75 },
  { id: 'v-61', volumeBracket: '60-100', name: 'GLENELG FISH & CHIPS', fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7j', trialStatus: 'won', trialReason: 'better-value', trialStartDate: '2026-01-08', trialEndDate: '2026-01-18', outcomeDate: '2026-01-17', trialNotes: 'Straightforward win. Happy customer.', currentWeeklyAvg: 85, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.55, soldPricePerLitre: 2.50 },
  { id: 'v-62', volumeBracket: '100-150', name: 'PROSPECT ROAD CHICKEN', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7k', trialStatus: 'lost', trialStartDate: '2025-12-02', trialEndDate: '2025-12-12', outcomeDate: '2025-12-20', trialReason: 'chose-competitor', trialNotes: 'Competitor offered a 6-month locked rate.', currentWeeklyAvg: 100, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.55 },
  { id: 'v-63', volumeBracket: 'under-60', name: 'NORWOOD SOUVLAKI', fryerCount: 2, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7j', trialStatus: 'pending', trialStartDate: '2026-02-24', trialEndDate: '2026-03-06', currentWeeklyAvg: 45, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.40 },
  { id: 'v-64', volumeBracket: '60-100', name: 'COTTESLOE BEACH BITES', fryerCount: 3, defaultOil: 'oil-6', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'WA', bdmId: 'u-7l', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-01-02', trialEndDate: '2026-01-09', outcomeDate: '2026-01-11', trialNotes: 'Summer rush made trial results very clear. Oil lasted significantly longer.', currentWeeklyAvg: 90, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.60, soldPricePerLitre: 2.55 },
  { id: 'v-65', volumeBracket: '100-150', name: 'SUBIACO WINGS BAR', fryerCount: 4, defaultOil: 'oil-8', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'WA', bdmId: 'u-7m', trialStatus: 'lost', trialStartDate: '2026-01-15', trialEndDate: '2026-01-25', outcomeDate: '2026-02-01', trialReason: 'no-savings', trialNotes: 'Venue already efficient with oil usage. Marginal improvement.', currentWeeklyAvg: 110, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.65 },
  { id: 'v-66', volumeBracket: '60-100', name: 'BATTERY POINT TAKEAWAY', fryerCount: 3, defaultOil: 'oil-14', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'TAS', bdmId: 'u-7n', trialStatus: 'won', trialReason: 'consistent-results', trialStartDate: '2026-01-22', trialEndDate: '2026-01-29', outcomeDate: '2026-01-31', trialNotes: 'Small but profitable win. Good reference site for TAS.', currentWeeklyAvg: 65, currentPricePerLitre: 2.15, offeredPricePerLitre: 2.60, soldPricePerLitre: 2.55 },
  { id: 'v-67', volumeBracket: '100-150', name: 'RICHMOND FRIED CHICKEN', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-20', currentWeeklyAvg: 125, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.65 },
  { id: 'v-68', volumeBracket: '60-100', name: 'DEE WHY SEAFOOD', fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7f', trialStatus: 'in-progress', trialStartDate: '2026-02-07', trialEndDate: '2026-02-17', currentWeeklyAvg: 75, currentPricePerLitre: 2.20, offeredPricePerLitre: 2.70 },
  { id: 'v-69', volumeBracket: '150-plus', name: 'BULIMBA BURGER CO', fryerCount: 5, defaultOil: 'oil-6', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7g', trialStatus: 'completed', trialStartDate: '2026-02-03', trialEndDate: '2026-02-13', trialNotes: 'Trial done, awaiting owner sign-off. Looks promising.', currentWeeklyAvg: 165, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.55 },

  // More trials — recent outcomes (last 30 days) with longer decision times
  { id: 'v-70', volumeBracket: '60-100', name: 'HAWTHORN GRILL', fryerCount: 3, defaultOil: 'oil-3', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'won', trialReason: 'better-food-quality', trialStartDate: '2026-01-18', trialEndDate: '2026-01-25', outcomeDate: '2026-02-01', trialNotes: 'Owner took a week to confirm. Signed.', currentWeeklyAvg: 78, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.65, soldPricePerLitre: 2.58 },
  { id: 'v-71', volumeBracket: '100-150', name: 'BONDI JUNCTION CHICKEN', fryerCount: 4, defaultOil: 'oil-7', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7e', trialStatus: 'lost', trialStartDate: '2026-01-20', trialEndDate: '2026-01-30', outcomeDate: '2026-02-10', trialReason: 'price-too-high', trialNotes: 'Took 11 days to decide, ultimately said no on price.', currentWeeklyAvg: 130, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.55 },
  { id: 'v-72', volumeBracket: '60-100', name: 'WEST END KEBABS', fryerCount: 3, defaultOil: 'oil-5', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7h', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-01-22', trialEndDate: '2026-01-29', outcomeDate: '2026-02-04', trialNotes: 'Happy with oil life. Signed next day after follow-up.', currentWeeklyAvg: 68, currentPricePerLitre: 1.90, offeredPricePerLitre: 2.50, soldPricePerLitre: 2.45 },
  { id: 'v-73', volumeBracket: 'under-60', name: 'UNLEY FISH BAR', fryerCount: 2, defaultOil: 'oil-10b', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7k', trialStatus: 'won', trialReason: 'trial-results', trialStartDate: '2026-01-25', trialEndDate: '2026-02-01', outcomeDate: '2026-02-08', trialNotes: 'Small venue but keen. Signed after seeing TPM data.', currentWeeklyAvg: 40, currentPricePerLitre: 2.15, offeredPricePerLitre: 2.60, soldPricePerLitre: 2.55 },
  { id: 'v-74', volumeBracket: '100-150', name: 'NORTHBRIDGE WOK HOUSE', fryerCount: 4, defaultOil: 'oil-12', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'WA', bdmId: 'u-7l', trialStatus: 'lost', trialStartDate: '2026-01-28', trialEndDate: '2026-02-04', outcomeDate: '2026-02-14', trialReason: 'owner-not-interested', trialNotes: 'Owner dragged feet for 10 days then declined. Not engaged.', currentWeeklyAvg: 115, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.60 },

  // More trials — previous window outcomes (30-60 days ago) with shorter decision times
  { id: 'v-75', volumeBracket: '60-100', name: 'FOOTSCRAY CHICKEN', fryerCount: 3, defaultOil: 'oil-6', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7c', trialStatus: 'won', trialReason: 'cleaner-frying', trialStartDate: '2025-12-20', trialEndDate: '2025-12-27', outcomeDate: '2025-12-28', trialNotes: 'Fastest close ever. Owner said yes same day trial ended.', currentWeeklyAvg: 72, currentPricePerLitre: 1.85, offeredPricePerLitre: 2.45, soldPricePerLitre: 2.40 },
  { id: 'v-76', volumeBracket: '100-150', name: 'MANLY SEAFOOD GRILL', fryerCount: 4, defaultOil: 'oil-9', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7f', trialStatus: 'won', trialReason: 'cost-savings', trialStartDate: '2025-12-22', trialEndDate: '2026-01-01', outcomeDate: '2025-12-31', trialNotes: 'Quick decision over Christmas. 2 days.', currentWeeklyAvg: 110, currentPricePerLitre: 2.20, offeredPricePerLitre: 2.75, soldPricePerLitre: 2.70 },
  { id: 'v-77', volumeBracket: '60-100', name: 'SANDGATE FISH & CHIPS', fryerCount: 3, defaultOil: 'oil-14b', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7i', trialStatus: 'lost', trialStartDate: '2025-12-26', trialEndDate: '2026-01-05', outcomeDate: '2026-01-04', trialReason: 'no-savings', trialNotes: 'Low frying volume. Savings not compelling.', currentWeeklyAvg: 60, currentPricePerLitre: 1.80, offeredPricePerLitre: 2.40 },
  { id: 'v-78', volumeBracket: '150-plus', name: 'ADELAIDE CENTRAL CHICKEN', fryerCount: 5, defaultOil: 'oil-3', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'SA', bdmId: 'u-7j', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-01-02', trialEndDate: '2026-01-12', outcomeDate: '2026-01-10', trialNotes: 'Big venue, decisive owner. Signed next day.', currentWeeklyAvg: 160, currentPricePerLitre: 2.05, offeredPricePerLitre: 2.70, soldPricePerLitre: 2.65 },

  // Extra pipeline and in-progress to fill out
  { id: 'v-79', volumeBracket: '60-100', name: 'SOUTH YARRA POKE', fryerCount: 2, defaultOil: 'oil-11', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'pending', trialStartDate: '2026-02-24', trialEndDate: '2026-03-06', currentWeeklyAvg: 55, currentPricePerLitre: 2.10, offeredPricePerLitre: 2.55 },
  { id: 'v-80', volumeBracket: '100-150', name: 'NEWSTEAD BURGER JOINT', fryerCount: 4, defaultOil: 'oil-13b', trialOilId: 'oil-2', groupId: null, status: 'trial-only', customerCode: '', state: 'QLD', bdmId: 'u-7g', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-20', currentWeeklyAvg: 120, currentPricePerLitre: 1.95, offeredPricePerLitre: 2.60 },
  { id: 'v-81', volumeBracket: '60-100', name: 'DEVONPORT SEAFOOD', fryerCount: 3, defaultOil: 'oil-14', trialOilId: 'oil-1', groupId: null, status: 'trial-only', customerCode: '', state: 'TAS', bdmId: 'u-7n', trialStatus: 'pending', trialStartDate: '2026-02-20', trialEndDate: '2026-03-02', currentWeeklyAvg: 70, currentPricePerLitre: 2.00, offeredPricePerLitre: 2.55 },
  // Canola trials
  { id: 'v-82', volumeBracket: 'under-60', name: 'THORNBURY FISH & CHIPS', fryerCount: 2, defaultOil: 'oil-5', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'won', trialReason: 'cost-savings', trialStartDate: '2026-01-13', trialEndDate: '2026-01-23', outcomeDate: '2026-01-25', currentWeeklyAvg: 40, currentPricePerLitre: 1.75, offeredPricePerLitre: 2.10, soldPricePerLitre: 2.05 },
  { id: 'v-83', volumeBracket: 'under-60', name: 'COBURG KEBAB HOUSE', fryerCount: 2, defaultOil: 'oil-6', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'won', trialReason: 'oil-lasted-longer', trialStartDate: '2026-01-20', trialEndDate: '2026-01-30', outcomeDate: '2026-02-01', currentWeeklyAvg: 35, currentPricePerLitre: 1.65, offeredPricePerLitre: 2.00, soldPricePerLitre: 1.95 },
  { id: 'v-84', volumeBracket: 'under-60', name: 'PRESTON CHARCOAL CHICKEN', fryerCount: 2, defaultOil: 'oil-7', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7a', trialStatus: 'lost', trialReason: 'price-too-high', trialStartDate: '2026-01-06', trialEndDate: '2026-01-16', outcomeDate: '2026-01-20', currentWeeklyAvg: 45, currentPricePerLitre: 1.55, offeredPricePerLitre: 1.95 },
  { id: 'v-85', volumeBracket: 'under-60', name: 'RESERVOIR HOT DOGS', fryerCount: 1, defaultOil: 'oil-5', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7b', trialStatus: 'in-progress', trialStartDate: '2026-02-10', trialEndDate: '2026-02-20', currentWeeklyAvg: 25, currentPricePerLitre: 1.70, offeredPricePerLitre: 2.05 },
  { id: 'v-86', volumeBracket: 'under-60', name: 'HEIDELBERG SCHNITZELS', fryerCount: 2, defaultOil: 'oil-6c', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'VIC', bdmId: 'u-7c', trialStatus: 'pending', trialStartDate: '2026-02-24', trialEndDate: '2026-03-06', currentWeeklyAvg: 50, currentPricePerLitre: 1.80, offeredPricePerLitre: 2.10 },
  { id: 'v-87', volumeBracket: '60-100', name: 'CAMPBELLTOWN FISH MARKET', fryerCount: 3, defaultOil: 'oil-9', trialOilId: 'oil-3', groupId: null, status: 'trial-only', customerCode: '', state: 'NSW', bdmId: 'u-7e', trialStatus: 'won', trialReason: 'cleaner-frying', trialStartDate: '2026-01-27', trialEndDate: '2026-02-06', outcomeDate: '2026-02-08', currentWeeklyAvg: 65, currentPricePerLitre: 1.80, offeredPricePerLitre: 2.15, soldPricePerLitre: 2.10 },
];

const seedGroups = () => [
  { id: 'g-1', name: 'JBS HOSPITALITY GROUP', groupCode: 'JBS', username: 'FRYSMRT-JBS', namId: 'u-6', status: 'active', venueIds: ['v-1', 'v-2', 'v-3', 'v-4', 'v-5'], lastTpmDate: '2026-02-16' },
  { id: 'g-2', name: "BETTY'S BURGERS", groupCode: 'BET', username: 'FRYSMRT-BET', namId: 'u-6b', status: 'active', venueIds: ['v-9', 'v-10', 'v-11', 'v-12', 'v-13'], lastTpmDate: '2026-02-16' },
  { id: 'g-3', name: 'FISHBONE COLLECTIVE', groupCode: 'FBC', username: 'FRYSMRT-FBC', namId: 'u-6', status: 'active', venueIds: ['v-19', 'v-23', 'v-26', 'v-28'], lastTpmDate: '2026-02-16' },
  { id: 'g-4', name: 'SALT & PEPPER HOSPITALITY', groupCode: 'SPH', username: 'FRYSMRT-SPH', namId: 'u-6b', status: 'active', venueIds: ['v-14', 'v-18', 'v-24'], lastTpmDate: '2026-02-16' },
  { id: 'g-5', name: 'UPPERCUT DINING', groupCode: 'UCD', username: 'FRYSMRT-UCD', namId: 'u-6', status: 'inactive', venueIds: [], lastTpmDate: '2025-09-15' },
  { id: 'g-6', name: 'TRADER HOUSE', groupCode: 'MCC', username: 'FRYSMRT-MCC', namId: 'u-6', status: 'active', venueIds: ['v-33', 'v-34', 'v-35'], lastTpmDate: '2026-02-16' },
  { id: 'g-7', name: 'GUZMAN Y GOMEZ', groupCode: 'GYG', username: 'FRYSMRT-GYG', namId: 'u-6b', status: 'active', venueIds: ['v-36', 'v-37', 'v-38', 'v-39'], lastTpmDate: '2026-02-16' },
];

const seedUsers = () => [
  { id: 'u-6', name: 'BEN ANDONOV', role: 'nam', venueId: null, groupId: null, status: 'active', crmCode: '', repCode: 'BA01', username: 'BANDONOV', lastActive: '2026-02-14' },
  { id: 'u-6b', name: 'BRAEDAN CLEAVE', role: 'nam', venueId: null, groupId: null, status: 'active', crmCode: '', repCode: 'BC01', username: 'BCLEAVE', lastActive: '2026-02-15' },
  // VIC BDMs
  { id: 'u-7a', name: 'DAVID ANGELKOVSKI', role: 'bdm', venueId: null, groupId: null, region: 'VIC', status: 'active', crmCode: '', repCode: 'V16', username: 'DANGELKOVSKI', lastActive: '2026-02-14' },
  { id: 'u-7b', name: 'BORIS JOKSIMOVIC', role: 'bdm', venueId: null, groupId: null, region: 'VIC', status: 'active', crmCode: '', repCode: 'V20', username: 'BJOKSIMOVIC', lastActive: '2026-02-13' },
  { id: 'u-7c', name: 'PAUL KONKEL', role: 'bdm', venueId: null, groupId: null, region: 'VIC', status: 'active', crmCode: '', repCode: 'V22', username: 'PKONKEL', lastActive: '2026-02-12' },
  // NSW BDMs
  { id: 'u-7d', name: 'THOMAS MORALES', role: 'bdm', venueId: null, groupId: null, region: 'NSW', status: 'active', crmCode: '', repCode: 'N10', username: 'TMORALES', lastActive: '2026-02-11' },
  { id: 'u-7e', name: 'TOM CHAN', role: 'bdm', venueId: null, groupId: null, region: 'NSW', status: 'active', crmCode: '', repCode: 'N11', username: 'TCHAN', lastActive: '2026-02-10' },
  { id: 'u-7f', name: 'SUNNY NAGPAL', role: 'bdm', venueId: null, groupId: null, region: 'NSW', status: 'active', crmCode: '', repCode: 'N12', username: 'SNAGPAL', lastActive: '2026-02-14' },
  // QLD BDMs
  { id: 'u-7g', name: 'CORINA TAAFFE', role: 'bdm', venueId: null, groupId: null, region: 'QLD', status: 'active', crmCode: '', repCode: 'Q10', username: 'CTAAFFE', lastActive: '2026-02-12' },
  { id: 'u-7h', name: 'REECE LANGHAN', role: 'bdm', venueId: null, groupId: null, region: 'QLD', status: 'active', crmCode: '', repCode: 'Q11', username: 'RLANGHAN', lastActive: '2026-02-11' },
  { id: 'u-7i', name: 'JOHN ZENG', role: 'bdm', venueId: null, groupId: null, region: 'QLD', status: 'active', crmCode: '', repCode: 'Q12', username: 'JZENG', lastActive: '2026-02-09' },
  // SA BDMs
  { id: 'u-7j', name: 'CHRIS BADAMS', role: 'bdm', venueId: null, groupId: null, region: 'SA', status: 'active', crmCode: '', repCode: 'S10', username: 'CBADAMS', lastActive: '2026-02-13' },
  { id: 'u-7k', name: 'DANIEL PUDNEY', role: 'bdm', venueId: null, groupId: null, region: 'SA', status: 'active', crmCode: '', repCode: 'S11', username: 'DPUDNEY', lastActive: '2026-02-10' },
  // WA BDMs
  { id: 'u-7l', name: 'DAVID MIRAUDO', role: 'bdm', venueId: null, groupId: null, region: 'WA', status: 'active', crmCode: '', repCode: 'W10', username: 'DMIRAUDO', lastActive: '2026-02-09' },
  { id: 'u-7m', name: 'ADAM SWAN', role: 'bdm', venueId: null, groupId: null, region: 'WA', status: 'active', crmCode: '', repCode: 'W11', username: 'ASWAN', lastActive: '2026-02-13' },
  // TAS BDM
  { id: 'u-7n', name: 'CRYSTAL STEWART', role: 'bdm', venueId: null, groupId: null, region: 'TAS', status: 'active', crmCode: '', repCode: 'T10', username: 'CSTEWART', lastActive: '2026-02-08' },
  { id: 'u-7x', name: 'JAMES HOLDEN', role: 'bdm', venueId: null, groupId: null, region: 'VIC', status: 'inactive', crmCode: '', repCode: 'V99', username: 'JHOLDEN', lastActive: '2025-12-01' },
  { id: 'u-8a', name: 'BEN PIGOTT', role: 'state_manager', venueId: null, groupId: null, region: 'VIC', status: 'active', crmCode: '', repCode: 'BP01', username: 'BPIGOTT', lastActive: '2026-02-15' },
  { id: 'u-8b', name: 'KYLIE CHRISTENSEN', role: 'state_manager', venueId: null, groupId: null, region: 'QLD', status: 'active', crmCode: '', repCode: 'KC01', username: 'KCHRISTENSEN', lastActive: '2026-02-14' },
  { id: 'u-8c', name: 'ALANA WOODWARD', role: 'state_manager', venueId: null, groupId: null, region: 'NSW', status: 'active', crmCode: '', repCode: 'AW01', username: 'AWOODWARD', lastActive: '2026-02-13' },
  { id: 'u-8d', name: 'ALEX SILVAGNI', role: 'state_manager', venueId: null, groupId: null, region: 'WA', status: 'active', crmCode: '', repCode: 'AS01', username: 'ASILVAGNI', lastActive: '2026-02-12' },
  { id: 'u-8e', name: 'DAMON ROSSETTO', role: 'state_manager', venueId: null, groupId: null, region: 'SA', status: 'active', crmCode: '', repCode: 'DR01', username: 'DROSSETTO', lastActive: '2026-02-10' },
  { id: 'u-8f', name: 'SCOTT OATES', role: 'state_manager', venueId: null, groupId: null, region: 'TAS', status: 'active', crmCode: '', repCode: 'SO01', username: 'SOATES', lastActive: '2026-02-08' },
  { id: 'u-9', name: 'MICHAEL CARTY', role: 'mgt', venueId: null, groupId: null, status: 'active', crmCode: '', repCode: 'MC01', username: 'MCARTY', lastActive: '2026-02-15' },
  { id: 'u-10', name: 'LIZ LE', role: 'admin', venueId: null, groupId: null, status: 'active', crmCode: '', repCode: '', username: 'ELE', lastActive: '2026-02-15' },
  { id: 'u-10b', name: 'GARRY NASH', role: 'mgt', venueId: null, groupId: null, status: 'active', crmCode: '', repCode: '', username: 'GNASH', lastActive: '2026-02-11' },
];

const TRIAL_REASONS = [
  // Successful reasons
  { key: 'oil-lasted-longer', label: 'Oil Lasted Longer', type: 'successful' },
  { key: 'better-food-quality', label: 'Better Food Quality', type: 'successful' },
  { key: 'cost-savings', label: 'Cost Savings on Oil Usage', type: 'successful' },
  { key: 'cleaner-frying', label: 'Cleaner Frying / Less Residue', type: 'successful' },
  { key: 'bdm-relationship', label: 'BDM Relationship / Service', type: 'successful' },
  { key: 'healthier-oil', label: 'Healthier Oil Option', type: 'successful' },
  { key: 'easier-to-manage', label: 'Easier to Manage', type: 'successful' },
  { key: 'consistent-results', label: 'Consistent Frying Results', type: 'successful' },
  { key: 'better-value', label: 'Better Value for Money', type: 'successful' },
  { key: 'recommended', label: 'Recommended by Others', type: 'successful' },
  { key: 'trial-results', label: 'Trial Results Spoke for Themselves', type: 'successful' },
  { key: 'reduced-oil-smell', label: 'Reduced Oil Smell', type: 'successful' },
  // Unsuccessful reasons
  { key: 'no-savings', label: 'No Savings Found', type: 'unsuccessful' },
  { key: 'price-too-high', label: 'Price Too High', type: 'unsuccessful' },
  { key: 'preferred-current', label: 'Preferred Current Supplier', type: 'unsuccessful' },
  { key: 'quality-concern', label: 'Oil Quality Concerns', type: 'unsuccessful' },
  { key: 'staff-resistance', label: 'Staff Resistance to Change', type: 'unsuccessful' },
  { key: 'contract-locked', label: 'Locked Into Existing Contract', type: 'unsuccessful' },
  { key: 'ownership-change', label: 'Ownership / Management Change', type: 'unsuccessful' },
  { key: 'venue-closed', label: 'Venue Closed', type: 'unsuccessful' },
  { key: 'chose-competitor', label: 'Chose Competitor', type: 'unsuccessful' },
  { key: 'owner-not-interested', label: 'Owner Not Interested', type: 'unsuccessful' },
  { key: 'no-response', label: 'No Response / Ghosted', type: 'unsuccessful' },
  { key: 'other-unsuccessful', label: 'Other', type: 'unsuccessful' },
  { key: 'other-successful', label: 'Other', type: 'successful' },
];

// ==================== MAIN ADMIN PANEL ====================
export default function FrysmartAdminPanel({ currentUser }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [overviewBdmState, setOverviewBdmState] = useState('all');
  const [matrixSort, setMatrixSort] = useState({ col: null, asc: false });
  const [analysisView, setAnalysisView] = useState('bdm');
  const [trialsDateFrom, setTrialsDateFrom] = useState('');
  const [trialsDateTo, setTrialsDateTo] = useState('');
  const [trialsAllTime, setTrialsAllTime] = useState(true);
  const [analysisMatrixFrom, setAnalysisMatrixFrom] = useState('');
  const [analysisMatrixTo, setAnalysisMatrixTo] = useState('');
  const [breakdownPeriod, setBreakdownPeriod] = useState('all');
  const [trialPeriod, setTrialPeriod] = useState('mtd');
  const [analysisDateFrom, setAnalysisDateFrom] = useState('');
  const [analysisDateTo, setAnalysisDateTo] = useState('');
  const [quickActionForm, setQuickActionForm] = useState(null);
  const [breakdownCollapsed, setBreakdownCollapsed] = useState({});
  const [oilTypes, setOilTypes] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [venues, setVenues] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [trialReasons, setTrialReasons] = useState([]);
  const [volumeBrackets, setVolumeBrackets] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [tpmReadings, setTpmReadings] = useState([]);
  const [oilTypeOptions, setOilTypeOptions] = useState([]);
  const [systemSettings, setSystemSettings] = useState({
    warningThreshold: 18, criticalThreshold: 24, defaultFryerCount: 4,
    reportFrequency: 'weekly', reminderDays: 7, trialDuration: 7
  });

  // ── Supabase: fetch all data on mount ──
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const [
        { data: compRows },
        { data: oilRows },
        { data: profileRows },
        { data: groupRows },
        { data: venueRows },
        { data: readingRows },
        { data: reasonRows },
        { data: bracketRows },
        { data: settingsRows },
      ] = await Promise.all([
        supabase.from('competitors').select('*'),
        supabase.from('oil_types').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('groups').select('*'),
        supabase.from('venues').select('*'),
        supabase.from('tpm_readings').select('*'),
        supabase.from('trial_reasons').select('*'),
        supabase.from('volume_brackets').select('*'),
        supabase.from('system_settings').select('*'),
      ]);
      if (cancelled) return;
      setCompetitors((compRows || []).map(mapCompetitor));
      setOilTypes((oilRows || []).map(mapOilType));
      setUsers((profileRows || []).map(mapProfile));
      setGroups((groupRows || []).map(mapGroup));
      setVenues((venueRows || []).map(mapVenue));
      setTpmReadings((readingRows || []).map(mapReading));
      setTrialReasons((reasonRows || []).map(mapTrialReason));
      setVolumeBrackets((bracketRows || []).map(mapVolumeBracket));
      if (settingsRows && settingsRows.length > 0) {
        const s = mapSystemSettings(settingsRows[0]);
        setSystemSettings(s);
        setOilTypeOptions(s.oilTypeOptions || []);
      }
      setDataLoaded(true);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // Keep demoLoaded alias so the rest of the file compiles without changes
  const demoLoaded = dataLoaded;
  const loadDemoData = () => {};
  const clearDemoData = () => {};

  // ── Supabase-aware state wrappers ──
  // These intercept prev => ... updater calls, detect create/update/delete,
  // persist to Supabase, then update local state with real DB data.

  const makeDbSetter = useCallback((rawSet, table, mapper, unMapper) => {
    return (updaterOrValue) => {
      if (typeof updaterOrValue === 'function') {
        // Wrap the updater: run it, diff against prev, and persist changes
        rawSet(prev => {
          const next = updaterOrValue(prev);

          // DETECT CREATE — new items (present in next, not in prev)
          const prevIds = new Set(prev.map(i => i.id));
          const added = next.filter(i => !prevIds.has(i.id));
          added.forEach(item => {
            const row = unMapper(item);
            supabase.from(table).insert(row).select().then(({ data, error }) => {
              if (!error && data && data.length > 0) {
                const mapped = mapper(data[0]);
                // Replace the temp-id item with the real DB item
                rawSet(p => p.map(i => i.id === item.id ? mapped : i));
              }
            });
          });

          // DETECT UPDATE — items with same id but changed content
          const prevMap = Object.fromEntries(prev.map(i => [i.id, i]));
          const updated = next.filter(i => prevIds.has(i.id) && i !== prevMap[i.id]);
          updated.forEach(item => {
            // Skip temp-id items (they're handled by create above)
            if (String(item.id).match(/^(comp|oil|v|g|u|r)-/)) return;
            const row = unMapper(item);
            supabase.from(table).update(row).eq('id', item.id).then(({ error }) => {
              if (error) console.error(`Update ${table} failed:`, error);
            });
          });

          // DETECT DELETE — items in prev not in next
          const nextIds = new Set(next.map(i => i.id));
          const removed = prev.filter(i => !nextIds.has(i.id));
          removed.forEach(item => {
            if (String(item.id).match(/^(comp|oil|v|g|u|r)-/)) return;
            supabase.from(table).delete().eq('id', item.id).then(({ error }) => {
              if (error) console.error(`Delete ${table} failed:`, error);
            });
          });

          return next;
        });
      } else {
        rawSet(updaterOrValue);
      }
    };
  }, []);

  const dbSetCompetitors = useCallback(
    makeDbSetter(setCompetitors, 'competitors', mapCompetitor, unMapCompetitor),
    [makeDbSetter]
  );
  const dbSetOilTypes = useCallback(
    makeDbSetter(setOilTypes, 'oil_types', mapOilType, unMapOilType),
    [makeDbSetter]
  );
  const dbSetVenues = useCallback(
    makeDbSetter(setVenues, 'venues', mapVenue, unMapVenue),
    [makeDbSetter]
  );
  const dbSetGroups = useCallback(
    makeDbSetter(setGroups, 'groups', mapGroup, unMapGroup),
    [makeDbSetter]
  );
  const dbSetUsers = useCallback(
    makeDbSetter(setUsers, 'profiles', mapProfile, unMapProfile),
    [makeDbSetter]
  );
  const dbSetTpmReadings = useCallback(
    makeDbSetter(setTpmReadings, 'tpm_readings', mapReading, unMapReading),
    [makeDbSetter]
  );

  // Config tables — simpler wrappers
  const dbSetTrialReasons = useCallback((updater) => {
    if (typeof updater === 'function') {
      setTrialReasons(prev => {
        const next = updater(prev);
        const prevKeys = new Set(prev.map(r => r.key));
        const added = next.filter(r => !prevKeys.has(r.key));
        added.forEach(r => { supabase.from('trial_reasons').insert(r); });
        const nextKeys = new Set(next.map(r => r.key));
        const removed = prev.filter(r => !nextKeys.has(r.key));
        removed.forEach(r => { supabase.from('trial_reasons').delete().eq('key', r.key); });
        return next;
      });
    } else { setTrialReasons(updater); }
  }, []);

  const dbSetVolumeBrackets = useCallback((updater) => {
    if (typeof updater === 'function') {
      setVolumeBrackets(prev => {
        const next = updater(prev);
        const prevKeys = new Set(prev.map(b => b.key));
        const added = next.filter(b => !prevKeys.has(b.key));
        added.forEach(b => { supabase.from('volume_brackets').insert(b); });
        const nextKeys = new Set(next.map(b => b.key));
        const removed = prev.filter(b => !nextKeys.has(b.key));
        removed.forEach(b => { supabase.from('volume_brackets').delete().eq('key', b.key); });
        return next;
      });
    } else { setVolumeBrackets(updater); }
  }, []);

  const dbSetSystemSettings = useCallback((updater) => {
    if (typeof updater === 'function') {
      setSystemSettings(prev => {
        const next = updater(prev);
        supabase.from('system_settings').update(unMapSystemSettings(next)).eq('id', 1);
        return next;
      });
    } else {
      setSystemSettings(updater);
      supabase.from('system_settings').update(unMapSystemSettings(updater)).eq('id', 1);
    }
  }, []);

  const dbSetOilTypeOptions = useCallback((updater) => {
    if (typeof updater === 'function') {
      setOilTypeOptions(prev => {
        const next = updater(prev);
        supabase.from('system_settings').update({ oil_type_options: next }).eq('id', 1);
        return next;
      });
    } else {
      setOilTypeOptions(updater);
      supabase.from('system_settings').update({ oil_type_options: updater }).eq('id', 1);
    }
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  // currentView controls which role interface is shown in the role switcher.
  // Values: 'admin' | 'bdm' | 'nam' | 'state_manager' | 'mgt' | 'group' | 'venue'
  // NOTE: 'state_manager' intentionally matches the role key used in user records
  // so the two can be compared directly when role-based views are built out.
  const [currentView, setCurrentView] = useState('admin');
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeSection]);

  const navGroups = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'management', label: 'Management', icon: Building, children: [
      { key: 'users', label: 'Users', icon: Users },
      { key: 'groups', label: 'Groups', icon: Layers },
      { key: 'venues', label: 'Venues', icon: Building },
      { key: 'onboarding', label: 'Bulk Upload', icon: Copy },
    ]},
    { key: 'trial-analysis', label: 'Trial Analysis', icon: BarChart3 },
    { key: 'trials', label: 'Trials', icon: AlertTriangle },
    { key: 'configuration', label: 'Configuration', icon: Settings, children: [
      { key: 'permissions', label: 'Permissions', icon: Shield },
      { key: 'competitors', label: 'Competitors', icon: Globe },
      { key: 'settings', label: 'Settings', icon: Settings },
      { key: 'oil-types', label: 'Cookers Oils', icon: Droplets },
    ]},
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'oil-types': return <OilTypeConfig oilTypes={oilTypes} setOilTypes={dbSetOilTypes} competitors={competitors} oilTypeOptions={oilTypeOptions} />;
      case 'competitors': return <CompetitorManagement competitors={competitors} setCompetitors={dbSetCompetitors} oilTypes={oilTypes} setOilTypes={dbSetOilTypes} oilTypeOptions={oilTypeOptions} />;
      case 'trials': return <TrialManagement venues={venues} setVenues={dbSetVenues} oilTypes={oilTypes} competitors={competitors} users={users} groups={groups} trialReasons={trialReasons} volumeBrackets={volumeBrackets} isDesktop={isDesktop} tpmReadings={tpmReadings} setTpmReadings={dbSetTpmReadings} dateFrom={trialsDateFrom} setDateFrom={setTrialsDateFrom} dateTo={trialsDateTo} setDateTo={setTrialsDateTo} allTime={trialsAllTime} setAllTime={setTrialsAllTime} currentUser={currentUser} />;
      case 'trial-analysis': return (() => {
        const allTrials = venues.filter(v => v.status === 'trial-only');
        const statuses = [
          { key: 'pending', label: 'Pipeline', shortLabel: 'Pipeline' },
          { key: 'in-progress', label: 'Active', shortLabel: 'Active' },
          { key: 'completed', label: 'Pending', shortLabel: 'Pending' },
          { key: 'won', label: 'Successful', shortLabel: 'Won' },
          { key: 'lost', label: 'Unsuccessful', shortLabel: 'Lost' },
        ];
        // Period-based filtering
        const periodNow = new Date();
        const periodCutoff = (() => {
          if (trialPeriod === 'custom') return null;
          if (trialPeriod === 'all') return null;
          const d = new Date(periodNow);
          if (trialPeriod === 'mtd') { d.setDate(1); return d; }
          if (trialPeriod === '1m') { d.setMonth(d.getMonth() - 1); return d; }
          if (trialPeriod === '3m') { d.setMonth(d.getMonth() - 3); return d; }
          if (trialPeriod === '6m') { d.setMonth(d.getMonth() - 6); return d; }
          if (trialPeriod === '12m') { d.setFullYear(d.getFullYear() - 1); return d; }
          if (trialPeriod === 'ytd') { d.setMonth(0); d.setDate(1); return d; }
          return null;
        })();
        const periodFrom = periodCutoff ? periodCutoff.toISOString().slice(0, 10) : (trialPeriod === 'custom' && analysisDateFrom ? analysisDateFrom : null);
        const periodTo = trialPeriod === 'custom' && analysisDateTo ? analysisDateTo : null;
        const filtered = allTrials.filter(v => {
          if (!periodFrom && !periodTo) return true;
          const end = v.outcomeDate || v.trialEndDate || v.trialStartDate || '';
          if (periodFrom && end < periodFrom) return false;
          if (periodTo && end > periodTo) return false;
          return true;
        });
        const periodLabels = [
          { key: 'mtd', label: 'MTD' },
          { key: '1m', label: '1M' },
          { key: '3m', label: '3M' },
          { key: '6m', label: '6M' },
          { key: '12m', label: '12M' },
          { key: 'ytd', label: 'YTD' },
          { key: 'all', label: 'All' },
        ];
        const getUN = (id) => { const u = users.find(u => u.id === id); return u ? u.name.split(' ')[0] + ' ' + (u.name.split(' ')[1] || '').charAt(0) + '.' : '—'; };
        const getCN = (id) => { const c = competitors.find(c => c.id === id); return c ? c.name : 'Unknown'; };
        const buildMap = (keyFn, dataset) => {
          const map = {};
          (dataset || filtered).forEach(v => {
            const name = keyFn(v);
            if (!map[name]) map[name] = { pending: 0, 'in-progress': 0, completed: 0, won: 0, lost: 0, total: 0 };
            map[name][v.trialStatus] = (map[name][v.trialStatus] || 0) + 1;
            map[name].total += 1;
          });
          return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
        };
        const compData = buildMap(v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil?.competitorId ? getCN(oil.competitorId) : 'Unknown'; });
        const bdmFiltered = overviewBdmState === 'all' ? filtered : filtered.filter(v => v.state === overviewBdmState);
        const bdmData = buildMap(v => v.bdmId ? getUN(v.bdmId) : 'Unassigned', bdmFiltered);
        const stateData = buildMap(v => v.state || 'N/A', filtered);
        const volBracketData = buildMap(v => {
          const b = volumeBrackets.find(vb => vb.key === v.volumeBracket);
          return b ? b.label : v.volumeBracket || 'Unknown';
        });
        const fmtDisplay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
        const periodLabel = 'All Time';

        // KPIs
        const wonTrials = filtered.filter(v => v.trialStatus === 'won');
        const lostTrials = filtered.filter(v => v.trialStatus === 'lost');
        const closedTrials = [...wonTrials, ...lostTrials];
        const winRate = closedTrials.length > 0 ? Math.round((wonTrials.length / closedTrials.length) * 100) : null;
        const activeTrials = filtered.filter(v => v.trialStatus === 'in-progress');
        const pipelineTrials = filtered.filter(v => v.trialStatus === 'pending');
        const awaitingTrials = filtered.filter(v => v.trialStatus === 'completed');

        // Pricing
        const withCurr = filtered.filter(v => v.currentPricePerLitre);
        const withSold = wonTrials.filter(v => v.soldPricePerLitre);
        const wonWithOff = wonTrials.filter(v => v.offeredPricePerLitre);
        const avgCurr = withCurr.length > 0 ? withCurr.reduce((s, v) => s + v.currentPricePerLitre, 0) / withCurr.length : null;
        const avgOff = wonWithOff.length > 0 ? wonWithOff.reduce((s, v) => s + v.offeredPricePerLitre, 0) / wonWithOff.length : null;
        const avgSold = withSold.length > 0 ? withSold.reduce((s, v) => s + v.soldPricePerLitre, 0) / withSold.length : null;

        // Volume — monthly avg
        // trialWeeklyAvg is derived from oil fill readings, not stored on venue
        const getTrialAvg = (v) => calcTrialWeeklyAvg(v.id, v.trialStartDate, tpmReadings, v.trialEndDate);
        const trialsWithVol = filtered.filter(v => v.currentWeeklyAvg && getTrialAvg(v) !== null);
        const avgVolRed = trialsWithVol.length > 0
          ? Math.round(trialsWithVol.reduce((s, v) => s + ((1 - getTrialAvg(v) / v.currentWeeklyAvg) * 100), 0) / trialsWithVol.length) : null;
        const wonPrevVol = wonTrials.reduce((s, v) => s + (v.currentWeeklyAvg || 0), 0);
        const wonNewVol = wonTrials.reduce((s, v) => s + (getTrialAvg(v) || v.currentWeeklyAvg || 0), 0);
        const wonMonthlyVol = Math.round(wonNewVol * 4.33);

        // Revenue — monthly avg
        const estRevenue = wonTrials.reduce((s, v) => s + ((v.soldPricePerLitre || v.offeredPricePerLitre || 0) * (getTrialAvg(v) || v.currentWeeklyAvg || 0) * 52), 0);
        const estMonthlyRev = Math.round(estRevenue / 12);

        // Oil stats — competitor · oil with win/loss
        const compOilDetail = {};
        filtered.forEach(v => {
          if (v.defaultOil) {
            const oil = oilTypes.find(o => o.id === v.defaultOil);
            const oilName = oil ? oil.name : v.defaultOil;
            const comp = oil?.competitorId ? competitors.find(c => c.id === oil.competitorId) : null;
            const compName = comp ? comp.name : 'Unknown';
            const key = `${compName} · ${oilName}`;
            if (!compOilDetail[key]) compOilDetail[key] = { total: 0, won: 0, lost: 0, other: 0 };
            compOilDetail[key].total += 1;
            if (v.trialStatus === 'won') compOilDetail[key].won += 1;
            else if (v.trialStatus === 'lost') compOilDetail[key].lost += 1;
            else compOilDetail[key].other += 1;
          }
        });
        const topCompOilDetail = Object.entries(compOilDetail).sort((a, b) => b[1].total - a[1].total).slice(0, 3);

        // Duration
        const durs = closedTrials.filter(v => v.trialStartDate && v.trialEndDate).map(v => (new Date(v.trialEndDate + 'T00:00:00') - new Date(v.trialStartDate + 'T00:00:00')) / 86400000);
        const avgDur = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

        // Reasons — both successful and unsuccessful
        const lostReasonMap = {};
        lostTrials.forEach(v => { lostReasonMap[v.trialReason || 'unspecified'] = (lostReasonMap[v.trialReason || 'unspecified'] || 0) + 1; });
        const lostReasonData = Object.entries(lostReasonMap).sort((a, b) => b[1] - a[1]);
        const wonReasonMap = {};
        wonTrials.forEach(v => { wonReasonMap[v.trialReason || 'unspecified'] = (wonReasonMap[v.trialReason || 'unspecified'] || 0) + 1; });
        const wonReasonData = Object.entries(wonReasonMap).sort((a, b) => b[1] - a[1]);

        // Win % helper
        const winPct = (counts) => {
          const cl = (counts.won || 0) + (counts.lost || 0);
          return cl > 0 ? Math.round((counts.won / cl) * 100) : null;
        };

        // Shared table styles
        const thStyle = { padding: '10px 8px', fontSize: '11px', fontWeight: '700', letterSpacing: '0.3px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0' };
        const tdStyle = { padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', fontSize: '12px', verticalAlign: 'middle' };
        const tfStyle = { padding: '10px 8px', textAlign: 'center', borderTop: '2px solid #e2e8f0', fontSize: '12px' };
        const nameThStyle = { ...thStyle, textAlign: 'left', color: '#64748b', paddingLeft: '14px' };
        const nameTdStyle = { ...tdStyle, textAlign: 'left', paddingLeft: '14px', fontSize: '13px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
        const pill = (val, key, maxVal) => {
          if (!val) return <span style={{ color: '#cbd5e1' }}>—</span>;
          const c = TRIAL_STATUS_CONFIGS[key];
          const hex = c.accent || '#94a3b8';
          const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
          const opacity = maxVal ? Math.max(0.08, (val / maxVal) * 0.4) : 0.15;
          return <span style={{ fontSize: '12px', fontWeight: '700', color: c.text, background: `rgba(${r},${g},${b},${opacity})`, padding: '3px 12px', borderRadius: '20px', display: 'inline-block', minWidth: '30px' }}>{val}</span>;
        };
        const wpCell = (wp) => wp !== null ? <span style={{ fontSize: '12px', fontWeight: '700', color: wp >= 60 ? '#059669' : wp >= 40 ? '#ca8a04' : '#dc2626' }}>{wp}%</span> : <span style={{ color: '#cbd5e1' }}>—</span>;

        // Top BDM leaderboards
        const bdmTrialCounts = {};
        filtered.forEach(v => {
          const name = v.bdmId ? getUN(v.bdmId) : 'Unassigned';
          if (!bdmTrialCounts[name]) bdmTrialCounts[name] = { pending: 0, 'in-progress': 0, completed: 0, won: 0, lost: 0, total: 0 };
          bdmTrialCounts[name][v.trialStatus] = (bdmTrialCounts[name][v.trialStatus] || 0) + 1;
          bdmTrialCounts[name].total += 1;
        });
        const bdmEntries = Object.entries(bdmTrialCounts);
        const topWon = [...bdmEntries].sort((a, b) => b[1].won - a[1].won).filter(([, c]) => c.won > 0).slice(0, 5);
        const topLost = [...bdmEntries].sort((a, b) => b[1].lost - a[1].lost).filter(([, c]) => c.lost > 0).slice(0, 5);
        const topPending = [...bdmEntries].sort((a, b) => b[1].pending - a[1].pending).filter(([, c]) => c.pending > 0).slice(0, 5);
        const topActive = [...bdmEntries].sort((a, b) => b[1]['in-progress'] - a[1]['in-progress']).filter(([, c]) => c['in-progress'] > 0).slice(0, 5);

        const LeaderCol = ({ title, icon: Icon, iconColor, entries, statKey, statusKey }) => {
          const maxVal = entries.length > 0 ? entries[0][1][statKey] : 1;
          const c = TRIAL_STATUS_CONFIGS[statusKey];
          return (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Icon size={14} color={iconColor} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>{title}</span>
              </div>
              {entries.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#cbd5e1', textAlign: 'center', padding: '8px 0' }}>—</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {entries.map(([name, counts], i) => {
                    const val = counts[statKey];
                    const opacity = Math.max(0.08, (val / maxVal) * 0.4);
                    // Convert accent hex to rgba for gradient
                    const hex = c.accent || iconColor;
                    const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b2 = parseInt(hex.slice(5,7), 16);
                    return (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: c.text, background: `rgba(${r},${g},${b2},${opacity})`, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, minWidth: '36px', textAlign: 'center' }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        };

        // Net change: compare 30d windows
        const now = new Date();
        const d30ago = new Date(now); d30ago.setDate(d30ago.getDate() - 30);
        const d60ago = new Date(now); d60ago.setDate(d60ago.getDate() - 60);
        const fmt = d => d.toISOString().slice(0, 10);
        const inRange = (v, from, to) => {
          const s = v.trialStartDate || v.outcomeDate || '';
          return s >= from && s <= to;
        };
        const recent = allTrials.filter(v => inRange(v, fmt(d30ago), fmt(now)));
        const prev = allTrials.filter(v => inRange(v, fmt(d60ago), fmt(d30ago)));
        const recentWon = recent.filter(v => v.trialStatus === 'won').length;
        const prevWon = prev.filter(v => v.trialStatus === 'won').length;
        const recentLost = recent.filter(v => v.trialStatus === 'lost').length;
        const prevLost = prev.filter(v => v.trialStatus === 'lost').length;
        const recentDurs = recent.filter(v => v.trialStartDate && v.trialEndDate && (v.trialStatus === 'won' || v.trialStatus === 'lost')).map(v => (new Date(v.trialEndDate + 'T00:00:00') - new Date(v.trialStartDate + 'T00:00:00')) / 86400000);
        const prevDurs = prev.filter(v => v.trialStartDate && v.trialEndDate && (v.trialStatus === 'won' || v.trialStatus === 'lost')).map(v => (new Date(v.trialEndDate + 'T00:00:00') - new Date(v.trialStartDate + 'T00:00:00')) / 86400000);
        const recentAvgDur = recentDurs.length > 0 ? Math.round(recentDurs.reduce((a, b) => a + b, 0) / recentDurs.length) : null;
        const prevAvgDur = prevDurs.length > 0 ? Math.round(prevDurs.reduce((a, b) => a + b, 0) / prevDurs.length) : null;
        const deltaWon = recentWon - prevWon;
        const deltaLost = recentLost - prevLost;
        const deltaDur = recentAvgDur !== null && prevAvgDur !== null ? recentAvgDur - prevAvgDur : null;

        // Win rate delta
        const recentClosed = recent.filter(v => v.trialStatus === 'won' || v.trialStatus === 'lost');
        const prevClosed = prev.filter(v => v.trialStatus === 'won' || v.trialStatus === 'lost');
        const recentWinRate = recentClosed.length > 0 ? Math.round((recentWon / recentClosed.length) * 100) : null;
        const prevWinRate = prevClosed.length > 0 ? Math.round((prevWon / prevClosed.length) * 100) : null;
        const deltaWinRate = recentWinRate !== null && prevWinRate !== null ? recentWinRate - prevWinRate : null;

        // Avg decision time (end → outcome) for KPI
        const avgDecision = (() => {
          const dt = closedTrials.filter(v => v.trialEndDate && v.outcomeDate).map(v => Math.round((new Date(v.outcomeDate + 'T00:00:00') - new Date(v.trialEndDate + 'T00:00:00')) / 86400000));
          return dt.length > 0 ? Math.round(dt.reduce((a, b) => a + b, 0) / dt.length) : null;
        })();
        const recentDecTimes = recent.filter(v => v.trialEndDate && v.outcomeDate && (v.trialStatus === 'won' || v.trialStatus === 'lost')).map(v => Math.round((new Date(v.outcomeDate + 'T00:00:00') - new Date(v.trialEndDate + 'T00:00:00')) / 86400000));
        const prevDecTimes = prev.filter(v => v.trialEndDate && v.outcomeDate && (v.trialStatus === 'won' || v.trialStatus === 'lost')).map(v => Math.round((new Date(v.outcomeDate + 'T00:00:00') - new Date(v.trialEndDate + 'T00:00:00')) / 86400000));
        const recentAvgDec = recentDecTimes.length > 0 ? Math.round(recentDecTimes.reduce((a, b) => a + b, 0) / recentDecTimes.length) : null;
        const prevAvgDec = prevDecTimes.length > 0 ? Math.round(prevDecTimes.reduce((a, b) => a + b, 0) / prevDecTimes.length) : null;
        const deltaDec = recentAvgDec !== null && prevAvgDec !== null ? recentAvgDec - prevAvgDec : null;

        const Delta = ({ value, invert, suffix }) => {
          if (value === null || value === undefined) return null;
          const good = invert ? value < 0 : value > 0;
          const neutral = value === 0;
          return (
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: neutral ? '#94a3b8' : good ? '#059669' : '#dc2626' }}>{value > 0 ? '+' : value === 0 ? '+' : ''}{value}{suffix || ''}</span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>vs prev 30d</span>
            </div>
          );
        };

        // Analysis matrix data — driven by analysisView state
        const analysisViews = [
          { key: 'bdm', label: 'BDM', icon: Users },
          { key: 'competitor', label: 'Competitor', icon: Globe },
          { key: 'state', label: 'State', icon: Building },
          { key: 'volume', label: 'Volume', icon: BarChart3 },
        ];
        const analysisFiltered = allTrials.filter(v => {
          // Period presets
          if (breakdownPeriod !== 'custom' && breakdownPeriod !== 'all') {
            const today = new Date();
            let cutoff;
            if (breakdownPeriod === 'mtd') cutoff = new Date(today.getFullYear(), today.getMonth(), 1);
            else if (breakdownPeriod === '1m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 1); }
            else if (breakdownPeriod === '3m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 3); }
            else if (breakdownPeriod === '6m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 6); }
            else if (breakdownPeriod === '12m') { cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - 1); }
            else if (breakdownPeriod === 'ytd') cutoff = new Date(today.getFullYear(), 0, 1);
            if (cutoff) {
              const cutoffStr = cutoff.toISOString().slice(0, 10);
              const start = v.trialStartDate || '';
              if (start < cutoffStr) return false;
            }
            return true;
          }
          if (breakdownPeriod === 'all') return true;
          // custom dates
          const start = v.trialStartDate || '';
          const end = v.outcomeDate || v.trialEndDate || '';
          if (analysisMatrixFrom && end < analysisMatrixFrom) return false;
          if (analysisMatrixTo && start > analysisMatrixTo) return false;
          return true;
        });
        const analysisBdmFiltered = overviewBdmState === 'all' ? analysisFiltered : analysisFiltered.filter(v => v.state === overviewBdmState);
        const buildAnalysisMap = (keyFn, dataset) => {
          const map = {};
          (dataset || analysisFiltered).forEach(v => {
            const name = keyFn(v);
            if (!map[name]) map[name] = { pending: 0, 'in-progress': 0, completed: 0, won: 0, lost: 0, total: 0 };
            map[name][v.trialStatus] = (map[name][v.trialStatus] || 0) + 1;
            map[name].total += 1;
          });
          return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
        };
        const analysisData = (() => {
          switch (analysisView) {
            case 'bdm': return buildAnalysisMap(v => v.bdmId ? getUN(v.bdmId) : 'Unassigned', analysisBdmFiltered);
            case 'competitor': return buildAnalysisMap(v => { const oil = oilTypes.find(o => o.id === v.defaultOil); return oil?.competitorId ? getCN(oil.competitorId) : 'Unknown'; });
            case 'state': return buildAnalysisMap(v => v.state || 'N/A');
            case 'volume': return buildAnalysisMap(v => { const b = volumeBrackets.find(vb => vb.key === v.volumeBracket); return b ? b.label : v.volumeBracket || 'Unknown'; });
            default: return [];
          }
        })();
        const analysisWinRate = (() => {
          const w = analysisFiltered.filter(v => v.trialStatus === 'won').length;
          const l = analysisFiltered.filter(v => v.trialStatus === 'lost').length;
          return (w + l) > 0 ? Math.round((w / (w + l)) * 100) : null;
        })();

        return (
          <div>
            <SectionHeader icon={BarChart3} title="Trial Analysis" count={filtered.length} />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', gap: '0', flexWrap: 'wrap', rowGap: '8px' }}>
              {/* Presets group */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#f8fafc', borderRadius: '8px', padding: '3px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                {periodLabels.map(p => {
                  const isActive = trialPeriod === p.key;
                  return (
                    <button key={p.key} onClick={() => { setTrialPeriod(p.key); if (p.key !== 'custom') { setAnalysisDateFrom(''); setAnalysisDateTo(''); } }} style={{
                      padding: '4px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                      border: 'none', minWidth: '36px', textAlign: 'center',
                      background: isActive ? '#1a428a' : 'transparent',
                      color: isActive ? 'white' : '#64748b', transition: 'all 0.15s',
                      whiteSpace: 'nowrap', lineHeight: '1.3'
                    }}>{p.label}</button>
                  );
                })}
              </div>

              {/* Separator */}
              <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 10px', flexShrink: 0 }} />

              {/* Custom date range picker */}
              {(() => {
                const fmtShort = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
                const extLabel = trialPeriod !== 'custom' && trialPeriod !== 'all' && periodFrom
                  ? `${fmtShort(periodFrom)} – Today`
                  : null;
                return (
                  <CalendarIconPicker
                    dateFrom={analysisDateFrom}
                    dateTo={analysisDateTo}
                    setDateFrom={(v) => { setAnalysisDateFrom(v); if (v) setTrialPeriod('custom'); }}
                    setDateTo={(v) => { setAnalysisDateTo(v); if (v) setTrialPeriod('custom'); }}
                    setAllTime={() => { setTrialPeriod('all'); setAnalysisDateFrom(''); setAnalysisDateTo(''); }}
                    externalLabel={extLabel}
                  />
                );
              })()}
            </div>

            {/* ── Row 1: Core metrics ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
              {[
                { label: 'Win Rate', icon: Target, iconColor: '#1a428a', value: winRate !== null ? `${winRate}%` : '—', delta: deltaWinRate, deltaSuffix: '%' },
                { label: 'Successful', icon: Trophy, iconColor: '#10b981', value: wonTrials.length, delta: deltaWon },
                { label: 'Unsuccessful', icon: AlertTriangle, iconColor: '#ef4444', value: lostTrials.length, delta: deltaLost, invert: true },
                { label: 'Avg Decision', icon: Clock, iconColor: '#64748b', value: avgDecision !== null ? `${avgDecision}d` : '—', delta: deltaDec, deltaSuffix: 'd' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <s.icon size={16} color={s.iconColor} />
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#1f2937' }}>{s.value}</div>
                  <Delta value={s.delta} suffix={s.deltaSuffix} invert={s.invert} />
                </div>
              ))}
            </div>

            {/* ── Pipeline row ── */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '12px' }}>Pipeline</div>
                <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { key: 'pending', label: 'In Pipeline', color: '#64748b', bg: '#f1f5f9' },
                    { key: 'in-progress', label: 'In Progress', color: '#1e40af', bg: '#dbeafe' },
                    { key: 'completed', label: 'Pending Outcome', color: '#a16207', bg: '#fef3c7' },
                    { key: 'won', label: 'Successful', color: '#065f46', bg: '#d1fae5' },
                    { key: 'lost', label: 'Unsuccessful', color: '#991b1b', bg: '#fee2e2' },
                  ].map(s => {
                    const count = filtered.filter(v => v.trialStatus === s.key).length;
                    return (
                      <div key={s.key} style={{ background: s.bg, borderRadius: '10px', padding: '10px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: s.color, lineHeight: 1, marginBottom: '4px' }}>{count}</div>
                        <div style={{ fontSize: '9px', fontWeight: '600', color: s.color, opacity: 0.8 }}>{s.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Row 2: Pricing ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr 1fr' : '1fr', gap: '8px', marginBottom: '10px' }}>
              {/* Pricing — table by oil */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Avg Pricing $/L</div>
                {(() => {
                  // Group by trial oil (cookers oils only)
                  const oilGroups = {};
                  filtered.forEach(v => {
                    const trialOil = oilTypes.find(o => o.id === v.trialOilId);
                    if (!trialOil || trialOil.category !== 'cookers') return;
                    const key = trialOil.id;
                    if (!oilGroups[key]) oilGroups[key] = { oil: trialOil, trials: [] };
                    oilGroups[key].trials.push(v);
                  });
                  const groups = Object.values(oilGroups).sort((a, b) => b.trials.length - a.trials.length);
                  if (groups.length === 0) return <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '10px 0' }}>No pricing data</div>;
                  const pricingRows = groups.map(({ oil, trials: grpTrials }) => {
                    const tierColors = OIL_TIER_COLORS[oil.tier] || OIL_TIER_COLORS.standard;
                    const wCurr = grpTrials.filter(v => v.currentPricePerLitre);
                    const wOff = grpTrials.filter(v => v.offeredPricePerLitre);
                    const wSold = grpTrials.filter(v => v.soldPricePerLitre && v.trialStatus === 'won');
                    return {
                      oil, tierColors,
                      their: wCurr.length > 0 ? (wCurr.reduce((s, v) => s + v.currentPricePerLitre, 0) / wCurr.length).toFixed(2) : null,
                      ask: wOff.length > 0 ? (wOff.reduce((s, v) => s + v.offeredPricePerLitre, 0) / wOff.length).toFixed(2) : null,
                      sold: wSold.length > 0 ? (wSold.reduce((s, v) => s + v.soldPricePerLitre, 0) / wSold.length).toFixed(2) : null,
                    };
                  }).filter(r => r.their || r.ask);
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Oil</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Their Price</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Our Ask</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Sold At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricingRows.map(r => (
                          <tr key={r.oil.id}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', background: r.tierColors.bg, color: r.tierColors.text, border: `1px solid ${r.tierColors.border}`, display: 'inline-block', minWidth: '68px', textAlign: 'center' }}>{r.oil.name}</span></td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: r.their ? '#1f2937' : '#cbd5e1', borderBottom: '1px solid #f1f5f9' }}>{r.their ? `$${r.their}` : '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: r.ask ? '#1f2937' : '#cbd5e1', borderBottom: '1px solid #f1f5f9' }}>{r.ask ? `$${r.ask}` : '—'}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '700', color: r.sold ? '#1f2937' : '#cbd5e1', borderBottom: '1px solid #f1f5f9' }}>{r.sold ? `$${r.sold}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              {/* Top Successful Reasons */}
              {wonTrials.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                    <Trophy size={14} color="#10b981" />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Top Successful Reasons</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {wonReasonData.slice(0, 5).map(([key, count]) => {
                      const reason = trialReasons.find(r => r.key === key);
                      const pct = Math.round((count / wonTrials.length) * 100);
                      const opacity = Math.max(0.12, pct / 100 * 0.6);
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{reason ? reason.label : key}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#065f46', background: `rgba(16, 185, 129, ${opacity})`, padding: '4px 12px', borderRadius: '20px', flexShrink: 0, minWidth: '48px', textAlign: 'center' }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Top Unsuccessful Reasons */}
              {lostTrials.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                    <AlertTriangle size={14} color="#ef4444" />
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Top Unsuccessful Reasons</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {lostReasonData.slice(0, 5).map(([key, count]) => {
                      const reason = trialReasons.find(r => r.key === key);
                      const pct = Math.round((count / lostTrials.length) * 100);
                      const opacity = Math.max(0.12, pct / 100 * 0.6);
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{reason ? reason.label : key}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b', background: `rgba(239, 68, 68, ${opacity})`, padding: '4px 12px', borderRadius: '20px', flexShrink: 0, minWidth: '48px', textAlign: 'center' }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Row 2b: Top 3 Oils + Vol Bracket Wins ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '10px' }}>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Top 3 Oils Trialled Against</div>
                {topCompOilDetail.length > 0 ? (() => {
                  const maxTotal = Math.max(...topCompOilDetail.map(([, d]) => d.won + d.lost), 1);
                  const maxWon = Math.max(...topCompOilDetail.map(([, d]) => d.won), 1);
                  const maxLost = Math.max(...topCompOilDetail.map(([, d]) => d.lost), 1);
                  return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Oil</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#10b981', borderBottom: '2px solid #e2e8f0' }}>Won</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#ef4444', borderBottom: '2px solid #e2e8f0' }}>Lost</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#7c3aed', borderBottom: '2px solid #e2e8f0' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCompOilDetail.map(([name, d]) => {
                        const total = d.won + d.lost;
                        const wonOp = d.won ? Math.max(0.1, (d.won / maxWon) * 0.4) : 0;
                        const lostOp = d.lost ? Math.max(0.08, (d.lost / maxLost) * 0.35) : 0;
                        const totalOp = Math.max(0.1, (total / maxTotal) * 0.35);
                        return (
                        <tr key={name}>
                          <td style={{ padding: '7px 8px', fontWeight: '600', color: '#1f2937', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isDesktop ? '160px' : '100px' }} title={name}>{name}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.won ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#065f46', background: `rgba(16, 185, 129, ${wonOp})`, padding: '3px 10px', borderRadius: '20px', display: 'inline-block', minWidth: '32px' }}>{d.won}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.lost ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b', background: `rgba(239, 68, 68, ${lostOp})`, padding: '3px 10px', borderRadius: '20px', display: 'inline-block', minWidth: '32px' }}>{d.lost}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontSize: '12px', fontWeight: '700', color: '#6d28d9', background: `rgba(139, 92, 246, ${totalOp})`, padding: '3px 10px', borderRadius: '20px', display: 'inline-block', minWidth: '32px' }}>{total}</span></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  );
                })() : <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '8px 0' }}>No data</div>}
              </div>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Avg Days to Decision by Volume</div>
                {(() => {
                  const bracketMap = {};
                  volumeBrackets.forEach(b => { bracketMap[b.key] = { label: b.label, color: b.color, days: [], wins: 0, total: 0 }; });
                  filtered.filter(v => v.trialStatus === 'won' || v.trialStatus === 'lost').forEach(v => {
                    const bk = v.volumeBracket || 'unknown';
                    if (!bracketMap[bk]) return;
                    const end = v.trialEndDate;
                    const outcome = v.outcomeDate;
                    if (end && outcome) {
                      const d = Math.round((new Date(outcome) - new Date(end)) / 86400000);
                      if (d >= 0) bracketMap[bk].days.push(d);
                    }
                    bracketMap[bk].total++;
                    if (v.trialStatus === 'won') bracketMap[bk].wins++;
                  });
                  const rows = Object.values(bracketMap);
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Bracket</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Avg Days</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => {
                          const avg = r.days.length > 0 ? Math.round(r.days.reduce((s, d) => s + d, 0) / r.days.length) : null;
                          const winRate = r.total > 0 ? Math.round((r.wins / r.total) * 100) : null;
                          return (
                            <tr key={r.label}>
                              <td style={{ padding: '7px 8px', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                                  <span style={{ fontWeight: '600', color: '#1f2937' }}>{r.label}</span>
                                </div>
                              </td>
                              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', color: avg !== null ? '#1f2937' : '#cbd5e1', borderBottom: '1px solid #f1f5f9' }}>{avg !== null ? `${avg}d` : '—'}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', color: winRate !== null ? '#1f2937' : '#cbd5e1', borderBottom: '1px solid #f1f5f9' }}>{winRate !== null ? `${winRate}%` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            {/* ── Row 4: Top 5 BDMs ── */}
            <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: isDesktop ? '20px 24px' : '14px', marginBottom: '10px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', marginBottom: '12px' }}>Top 5 BDMs</div>
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
                <LeaderCol title="Successful" icon={Trophy} iconColor="#10b981" entries={topWon} statKey="won" statusKey="won" />
                <LeaderCol title="Unsuccessful" icon={AlertTriangle} iconColor="#ef4444" entries={topLost} statKey="lost" statusKey="lost" />
                <LeaderCol title="In Progress" icon={Zap} iconColor="#3b82f6" entries={topActive} statKey="in-progress" statusKey="in-progress" />
                <LeaderCol title="In Pipeline" icon={Clock} iconColor="#94a3b8" entries={topPending} statKey="pending" statusKey="pending" />
              </div>
            </div>

            {/* ── Row 5: Analysis Matrix — contained panel ── */}
            <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '10px' }}>
              {/* Header row: title + view toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', flexShrink: 0 }}>Trial Breakdown</span>
                <div style={{ display: 'flex', gap: '3px', background: '#1a428a', borderRadius: '10px', padding: '3px' }}>
                  {analysisViews.map(av => (
                    <button key={av.key} onClick={() => setAnalysisView(av.key)} style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '7px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: analysisView === av.key ? 'white' : 'transparent',
                      color: analysisView === av.key ? '#1a428a' : 'rgba(255,255,255,0.6)',
                    }}>
                      <av.icon size={12} />
                      {av.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Filters */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap', rowGap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#f8fafc', borderRadius: '8px', padding: '3px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                    {[
                      { key: 'mtd', label: 'MTD' },
                      { key: '1m', label: '1M' },
                      { key: '3m', label: '3M' },
                      { key: '6m', label: '6M' },
                      { key: '12m', label: '12M' },
                      { key: 'ytd', label: 'YTD' },
                      { key: 'all', label: 'All' },
                    ].map(p => {
                      const isActive = breakdownPeriod === p.key;
                      return (
                        <button key={p.key} onClick={() => { setBreakdownPeriod(p.key); if (p.key !== 'custom') { setAnalysisMatrixFrom(''); setAnalysisMatrixTo(''); }}} style={{
                          padding: '4px 0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                          border: 'none', minWidth: '36px', textAlign: 'center',
                          background: isActive ? '#1a428a' : 'transparent',
                          color: isActive ? 'white' : '#64748b', transition: 'all 0.15s',
                          whiteSpace: 'nowrap', lineHeight: '1.3'
                        }}>{p.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ width: '1px', height: '22px', background: '#e2e8f0', margin: '0 10px', flexShrink: 0 }} />
                  {(() => {
                    const fmtShort = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
                    const extLabel = breakdownPeriod !== 'custom' && breakdownPeriod !== 'all'
                      ? (() => {
                          const today = new Date();
                          let cutoff;
                          if (breakdownPeriod === 'mtd') cutoff = new Date(today.getFullYear(), today.getMonth(), 1);
                          else if (breakdownPeriod === '1m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 1); }
                          else if (breakdownPeriod === '3m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 3); }
                          else if (breakdownPeriod === '6m') { cutoff = new Date(today); cutoff.setMonth(cutoff.getMonth() - 6); }
                          else if (breakdownPeriod === '12m') { cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - 1); }
                          else if (breakdownPeriod === 'ytd') cutoff = new Date(today.getFullYear(), 0, 1);
                          return cutoff ? `${fmtShort(cutoff.toISOString().slice(0, 10))} – Today` : null;
                        })()
                      : null;
                    return (
                      <CalendarIconPicker
                        dateFrom={analysisMatrixFrom}
                        dateTo={analysisMatrixTo}
                        setDateFrom={(v) => { setAnalysisMatrixFrom(v); if (v) setBreakdownPeriod('custom'); }}
                        setDateTo={(v) => { setAnalysisMatrixTo(v); if (v) setBreakdownPeriod('custom'); }}
                        setAllTime={() => { setBreakdownPeriod('all'); setAnalysisMatrixFrom(''); setAnalysisMatrixTo(''); }}
                        externalLabel={extLabel}
                      />
                    );
                  })()}
                </div>
                {analysisView === 'bdm' && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                    {['all', 'VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS'].map(s => (
                      <button key={s} onClick={() => setOverviewBdmState(s)} style={{ padding: '6px 0', borderRadius: '8px', fontSize: '11px', fontWeight: '700', border: '1.5px solid', cursor: 'pointer', flex: 1, textAlign: 'center', background: overviewBdmState === s ? (s === 'all' ? '#1a428a' : `${STATE_COLOURS[s]}15`) : 'white', color: overviewBdmState === s ? (s === 'all' ? 'white' : STATE_COLOURS[s]) : '#cbd5e1', borderColor: overviewBdmState === s ? (s === 'all' ? '#1a428a' : STATE_COLOURS[s]) : '#e2e8f0' }}>{s === 'all' ? 'All States' : s}</button>
                    ))}
                  </div>
                )}
              </div>
              {/* Matrix table */}
              <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {analysisData.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>No trials in this period</div>
                ) : (() => {
                  const sorted = (() => {
                    if (!matrixSort.col) return analysisData;
                    return [...analysisData].sort((a, b) => {
                      let va, vb;
                      if (matrixSort.col === 'name') { va = a[0].toLowerCase(); vb = b[0].toLowerCase(); return matrixSort.asc ? va.localeCompare(vb) : vb.localeCompare(va); }
                      if (matrixSort.col === 'winpct') { va = winPct(a[1]) || 0; vb = winPct(b[1]) || 0; }
                      else if (matrixSort.col === 'total') { va = a[1].total || 0; vb = b[1].total || 0; }
                      else { va = a[1][matrixSort.col] || 0; vb = b[1][matrixSort.col] || 0; }
                      return matrixSort.asc ? va - vb : vb - va;
                    });
                  })();
                  const handleSort = (col) => setMatrixSort(prev => prev.col === col ? { col, asc: !prev.asc } : { col, asc: false });
                  const arrow = (col) => matrixSort.col === col ? (matrixSort.asc ? ' ↑' : ' ↓') : '';
                  const colMaxes = {};
                  statuses.forEach(s => { colMaxes[s.key] = Math.max(...analysisData.map(([, c]) => c[s.key] || 0), 1); });
                  const maxTotal = Math.max(...analysisData.map(([, c]) => c.total || 0), 1);
                  return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '620px' }}>
                      <colgroup>
                        <col style={{ width: isDesktop ? '140px' : '110px' }} />
                        {statuses.map(s => <col key={s.key} />)}
                        <col />
                        <col />
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '14px', color: '#64748b', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>{analysisViews.find(v => v.key === analysisView)?.label || ''}{arrow('name')}</th>
                          {statuses.map(s => <th key={s.key} style={{ ...thStyle, color: TRIAL_STATUS_CONFIGS[s.key].text, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(s.key)}>{s.shortLabel || s.label}{arrow(s.key)}</th>)}
                          <th style={{ ...thStyle, color: '#7c3aed', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('total')}>Total{arrow('total')}</th>
                          <th style={{ ...thStyle, color: '#1f2937', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('winpct')}>Win%{arrow('winpct')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(([name, counts]) => {
                          const totalOp = counts.total ? Math.max(0.08, (counts.total / maxTotal) * 0.4) : 0;
                          return (
                          <tr key={name}>
                            <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '14px', fontSize: '13px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isDesktop ? '160px' : '130px' }} title={name}>{name}</td>
                            {statuses.map(s => <td key={s.key} style={tdStyle}>{pill(counts[s.key], s.key, colMaxes[s.key])}</td>)}
                            <td style={tdStyle}>{counts.total ? <span style={{ fontSize: '12px', fontWeight: '700', color: '#6d28d9', background: `rgba(139, 92, 246, ${totalOp})`, padding: '3px 12px', borderRadius: '20px', display: 'inline-block', minWidth: '30px' }}>{counts.total}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, fontWeight: '700' }}>{wpCell(winPct(counts))}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td style={{ ...tfStyle, textAlign: 'left', paddingLeft: '14px', fontWeight: '700', color: '#64748b', fontSize: '11px' }}>TOTAL</td>
                          {statuses.map(s => { const t = analysisData.reduce((sum, [, c]) => sum + (c[s.key] || 0), 0); return <td key={s.key} style={{ ...tfStyle, fontWeight: '700', color: t > 0 ? '#1f2937' : '#e2e8f0' }}>{t || '—'}</td>; })}
                          {(() => { const gt = analysisData.reduce((sum, [, c]) => sum + (c.total || 0), 0); return <td style={{ ...tfStyle, fontWeight: '700', color: gt > 0 ? '#1f2937' : '#e2e8f0' }}>{gt || '—'}</td>; })()}
                          <td style={{ ...tfStyle, fontWeight: '700' }}>{analysisWinRate !== null ? <span style={{ color: analysisWinRate >= 60 ? '#059669' : analysisWinRate >= 40 ? '#ca8a04' : '#dc2626' }}>{analysisWinRate}%</span> : '—'}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })();
      case 'venues': return <VenueManagement venues={venues} setVenues={dbSetVenues} oilTypes={oilTypes} groups={groups} competitors={competitors} users={users} setActiveSection={setActiveSection} isDesktop={isDesktop} autoOpenForm={quickActionForm === 'venues'} clearAutoOpen={() => setQuickActionForm(null)} />;
      case 'groups': return <GroupManagement groups={groups} setGroups={dbSetGroups} venues={venues} setVenues={dbSetVenues} users={users} oilTypes={oilTypes} competitors={competitors} autoOpenForm={quickActionForm === 'groups'} clearAutoOpen={() => setQuickActionForm(null)} />;
      case 'users': return <UserManagement users={users} setUsers={dbSetUsers} venues={venues} groups={groups} autoOpenForm={quickActionForm === 'users'} clearAutoOpen={() => setQuickActionForm(null)} />;
      case 'permissions': return <PermissionsAccess users={users} />;
      case 'onboarding': return <OnboardingFlow oilTypes={oilTypes} venues={venues} groups={groups} users={users} setVenues={dbSetVenues} setGroups={dbSetGroups} setUsers={dbSetUsers} defaultFryerCount={systemSettings.defaultFryerCount} />;
      case 'settings': return <TrialSettingsConfig trialReasons={trialReasons} setTrialReasons={dbSetTrialReasons} volumeBrackets={volumeBrackets} setVolumeBrackets={dbSetVolumeBrackets} systemSettings={systemSettings} setSystemSettings={dbSetSystemSettings} oilTypeOptions={oilTypeOptions} setOilTypeOptions={dbSetOilTypeOptions} demoLoaded={demoLoaded} loadDemoData={loadDemoData} clearDemoData={clearDemoData} />;
      default: return (
        <div>
          <SectionHeader icon={BarChart3} title="Admin Overview" />

          {/* Empty system banner */}
          {venues.length === 0 && users.length === 0 && (
            <div style={{ background: 'linear-gradient(135deg, #e8eef6 0%, #f0f4ff 100%)', borderRadius: '14px', padding: '20px', marginBottom: '16px', border: '1px solid #c7d7f0', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '36px' }}>🚀</div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a428a', marginBottom: '4px' }}>Welcome to Frysmart Admin</div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>The system is empty. Load demo data to explore all features, or start adding real venues and users.</div>
              </div>
              <button onClick={loadDemoData} style={{ padding: '9px 18px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}>Load Demo Data</button>
            </div>
          )}

          {/* Quick Actions */}
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginBottom: '8px' }}>QUICK ACTIONS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {[
              { label: 'New User', icon: UserPlus, section: 'users', color: '#3b82f6', desc: 'NAM, BDM, etc', openForm: true },
              { label: 'New Group', icon: Layers, section: 'groups', color: '#8b5cf6', desc: 'Link venues', openForm: true },
              { label: 'New Venue', icon: Zap, section: 'venues', color: '#1a428a', desc: 'Add single', openForm: true },
            ].map(a => (
              <button key={a.label} onClick={() => { setActiveSection(a.section); if (a.openForm) setQuickActionForm(a.section); }} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '4px', padding: '14px 8px',
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
                onMouseOver={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.background = `${a.color}08`; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
              >
                <div style={{
                  width: '34px', height: '34px', borderRadius: '10px', background: `${a.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <a.icon size={17} color={a.color} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937' }}>{a.label}</span>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '400' }}>{a.desc}</span>
              </button>
            ))}
          </div>
          
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
            {[
              { label: 'Active Calendars', value: venues.filter(v => v.status === 'active').length, color: '#10b981', icon: Building },
              { label: 'Active Trials', value: venues.filter(v => v.status === 'trial-only' && v.trialStatus !== 'won' && v.trialStatus !== 'lost').length, color: '#f59e0b', icon: AlertTriangle },
              { label: 'Customer Groups', value: groups.filter(g => g.status === 'active').length, color: '#3b82f6', icon: Layers },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <s.icon size={16} color={s.color} />
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1f2937' }}>{s.value}</div>
                {s.delta !== undefined && s.delta !== 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: s.delta > 0 ? '#059669' : '#dc2626' }}>{s.delta > 0 ? '+' : ''}{s.delta}</span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>this month</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Insight Row */}
          {(() => {
            const activeVenues = venues.filter(v => v.status === 'active');
            const allTrials = venues.filter(v => v.status === 'trial-only');
            const pipelineCount = allTrials.filter(v => v.trialStatus === 'pending').length;
            const inProgressCount = allTrials.filter(v => v.trialStatus === 'in-progress').length;
            const awaitingCount = allTrials.filter(v => v.trialStatus === 'completed').length;
            const totalActive = pipelineCount + inProgressCount + awaitingCount;
            const totalForDonut = activeVenues.length + totalActive;
            const calPct = totalForDonut > 0 ? (activeVenues.length / totalForDonut) * 100 : 0;

            // Donut SVG
            const donutR = 40;
            const donutStroke = 10;
            const circ = 2 * Math.PI * donutR;
            const calDash = (calPct / 100) * circ;
            const trialDash = circ - calDash;

            // NAM data
            const getUserName = makeGetUserName(users, true);
            const calByNam = {};
            activeVenues.forEach(v => {
              const g = v.groupId ? groups.find(g => g.id === v.groupId) : null;
              if (!g?.namId) return;
              const nam = getUserName(g.namId);
              calByNam[nam] = (calByNam[nam] || 0) + 1;
            });
            const grpByNam = {};
            groups.filter(g => g.status === 'active').forEach(g => {
              if (!g.namId) return;
              const nam = getUserName(g.namId);
              grpByNam[nam] = (grpByNam[nam] || 0) + 1;
            });

            const NamList = ({ data, badgeBg, badgeText }) => {
              const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
              const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
              if (sorted.length === 0) return <div style={{ fontSize: '12px', color: '#64748b' }}>No data</div>;
              return sorted.map(([label, count], i) => {
                const intensity = 1;
                return (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < sorted.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{label}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: badgeText, background: badgeBg, padding: '2px 10px', borderRadius: '10px', minWidth: '28px', textAlign: 'center', opacity: intensity }}>{count}</span>
                </div>
                );
              });
            };

            return (
              <div className="breakdown-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                {/* Accounts Split donut */}
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Account Overview</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={donutR} fill="none" stroke="#f59e0b" strokeWidth={donutStroke} strokeDasharray={`${circ}`} transform="rotate(-90 50 50)" />
                        <circle cx="50" cy="50" r={donutR} fill="none" stroke="#10b981" strokeWidth={donutStroke} strokeDasharray={`${calDash} ${trialDash}`} transform="rotate(-90 50 50)" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', lineHeight: 1 }}>{totalForDonut}</span>
                        <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '600' }}>TOTAL</span>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: '#1f2937' }}>Calendars</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#065f46' }}>{activeVenues.length}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f59e0b', flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: '#1f2937' }}>Trials</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#92400e' }}>{totalActive}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Trial Pipeline */}
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Trial Pipeline</div>
                  {[
                    { label: 'In Pipeline', count: pipelineCount, color: '#94a3b8' },
                    { label: 'In Progress', count: inProgressCount, color: '#3b82f6' },
                    { label: 'Pending Outcome', count: awaitingCount, color: '#eab308' },
                  ].map((stage, i) => (
                    <div key={stage.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '3px', background: stage.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937' }}>{stage.label}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: stage.color }}>{stage.count}</span>
                    </div>
                  ))}
                </div>
                {/* Calendars by NAM */}
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Calendars by NAM</div>
                  <NamList data={calByNam} badgeBg="#d1fae5" badgeText="#065f46" />
                </div>
                {/* Groups by NAM */}
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Groups by NAM</div>
                  <NamList data={grpByNam} badgeBg="#dbeafe" badgeText="#1e40af" />
                </div>
              </div>
            );
          })()}

          {/* Breakdowns */}
          {(() => {
            const getUserName = makeGetUserName(users, true);
            const getCompName = (id) => { const c = competitors.find(c => c.id === id); return c ? c.name : '—'; };

            const calVenues = venues.filter(v => v.status === 'active');
            const trialVenues = venues.filter(v => v.status === 'trial-only' && v.trialStatus !== 'won' && v.trialStatus !== 'lost');

            // Calendars by State
            const calByState = {};
            calVenues.forEach(v => { const s = v.state || 'N/A'; calByState[s] = (calByState[s] || 0) + 1; });

            // Trials by State
            const trialByState = {};
            trialVenues.forEach(v => { const s = v.state || 'N/A'; trialByState[s] = (trialByState[s] || 0) + 1; });

            // Calendars by NAM (via group) - exclude unassigned
            const calByNam = {};
            calVenues.forEach(v => {
              const g = v.groupId ? groups.find(g => g.id === v.groupId) : null;
              if (!g?.namId) return;
              const nam = getUserName(g.namId);
              calByNam[nam] = (calByNam[nam] || 0) + 1;
            });

            // Groups by NAM - exclude unassigned
            const grpByNam = {};
            groups.filter(g => g.status === 'active').forEach(g => {
              if (!g.namId) return;
              const nam = getUserName(g.namId);
              grpByNam[nam] = (grpByNam[nam] || 0) + 1;
            });

            // Trials by Competitor
            const trialByComp = {};
            trialVenues.forEach(v => {
              const oil = oilTypes.find(o => o.id === v.defaultOil);
              const comp = oil?.competitorId ? getCompName(oil.competitorId) : 'Unknown';
              trialByComp[comp] = (trialByComp[comp] || 0) + 1;
            });

            // Trials by BDM
            const trialByBdm = {};
            trialVenues.forEach(v => {
              const bdm = v.bdmId ? getUserName(v.bdmId) : 'Unassigned';
              trialByBdm[bdm] = (trialByBdm[bdm] || 0) + 1;
            });

            const BreakdownCard = ({ title, icon: Icon, iconColor, data, badgeBg, badgeText, colorMap, maxRows = 6 }) => {
              const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
              const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
              const isCollapsible = sorted.length > maxRows;
              const isCollapsed = isCollapsible && !breakdownCollapsed[title];
              const visible = isCollapsed ? sorted.slice(0, maxRows) : sorted;
              return (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={13} color={iconColor} />
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#1f2937' }}>{title}</span>
                  </div>
                  {sorted.length === 0 ? (
                    <div style={{ padding: '14px', fontSize: '12px', color: '#64748b' }}>No data</div>
                  ) : visible.map(([label, count], i) => {
                    const intensity = 1;
                    return (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 14px', borderBottom: i < visible.length - 1 || isCollapsible ? '1px solid #f1f5f9' : 'none'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: colorMap?.[label] ? '700' : '500', color: colorMap?.[label] || '#1f2937' }}>{label}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: '700', color: badgeText,
                        background: badgeBg, padding: '2px 10px', borderRadius: '10px', minWidth: '28px', textAlign: 'center',
                        opacity: intensity
                      }}>{count}</span>
                    </div>
                    );
                  })}
                  {isCollapsible && (
                    <button onClick={() => setBreakdownCollapsed(prev => ({ ...prev, [title]: !prev[title] }))} style={{
                      width: '100%', padding: '8px 14px', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: '11px', fontWeight: '600', color: '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                    }}>
                      {isCollapsed ? `Show ${sorted.length - maxRows} more` : 'Show less'}
                      <span style={{ transform: isCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}>▼</span>
                    </button>
                  )}
                </div>
              );
            };

            return (
              <>
                {/* Row 1: State + Trial breakdowns — 4 across on wide desktop */}
                <div className="breakdown-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                  <BreakdownCard title="Calendars by State" icon={Building} iconColor="#10b981" data={calByState} badgeBg="#d1fae5" badgeText="#065f46" />
                  <BreakdownCard title="Trials by State" icon={AlertTriangle} iconColor="#f59e0b" data={trialByState} badgeBg="#fef3c7" badgeText="#92400e" />
                  <BreakdownCard title="Trials by Competitor" icon={Globe} iconColor="#dc2626" data={trialByComp} badgeBg="#fee2e2" badgeText="#991b1b" />
                  <BreakdownCard title="Trials by BDM" icon={Users} iconColor="#f59e0b" data={trialByBdm} badgeBg="#fef3c7" badgeText="#92400e" />
                </div>
              </>
            );
          })()}

          {/* TPM Recording Health Check */}
          {(() => {
            const activeVenuesForTpm = venues.filter(v => v.status === 'active');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const getAgeDays = (dateStr) => {
              if (!dateStr) return 999;
              const d = new Date(dateStr + 'T00:00:00');
              return Math.floor((today - d) / 86400000);
            };
            const recordedToday = activeVenuesForTpm.filter(v => getAgeDays(v.lastTpmDate) === 0);
            const recordedYesterday = activeVenuesForTpm.filter(v => getAgeDays(v.lastTpmDate) === 1);
            const overdue2 = activeVenuesForTpm.filter(v => getAgeDays(v.lastTpmDate) >= 2 && getAgeDays(v.lastTpmDate) < 7);
            const overdue7 = activeVenuesForTpm.filter(v => getAgeDays(v.lastTpmDate) >= 7);
            const totalActive = activeVenuesForTpm.length;
            const compliancePct = totalActive > 0 ? Math.round(((recordedToday.length + recordedYesterday.length) / totalActive) * 100) : 0;
            const isHealthy = compliancePct >= 80;

            const barData = [
              { label: 'Today', count: recordedToday.length, color: '#10b981', bg: '#d1fae5' },
              { label: 'Yesterday', count: recordedYesterday.length, color: '#3b82f6', bg: '#dbeafe' },
              { label: '2–6 days', count: overdue2.length, color: '#f59e0b', bg: '#fef3c7' },
              { label: '7+ days', count: overdue7.length, color: '#ef4444', bg: '#fee2e2' },
            ];

            // Build overdue venue list
            const overdueVenues = activeVenuesForTpm
              .filter(v => getAgeDays(v.lastTpmDate) >= 2)
              .sort((a, b) => getAgeDays(b.lastTpmDate) - getAgeDays(a.lastTpmDate));
            const getOverdueUserName = makeGetUserName(users, true);
            const getOverdueNam = (v) => {
              if (!v.groupId) return null;
              const g = groups.find(g => g.id === v.groupId);
              return g?.namId ? getOverdueUserName(g.namId) : null;
            };
            const getOverdueBdm = (v) => v.bdmId ? getOverdueUserName(v.bdmId) : null;

            return (
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: isHealthy ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Droplets size={15} color={isHealthy ? '#059669' : '#dc2626'} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>TPM Recording Health</div>
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{totalActive} active calendars</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: isHealthy ? '#059669' : '#dc2626', lineHeight: 1 }}>{compliancePct}%</div>
                    <div style={{ fontSize: '9px', fontWeight: '600', color: '#64748b', marginTop: '2px' }}>COMPLIANT</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {barData.map(b => (
                    <div key={b.label} style={{ background: b.bg, borderRadius: '10px', padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: b.color, lineHeight: 1 }}>{b.count}</div>
                      <div style={{ fontSize: '10px', fontWeight: '600', color: b.color, marginTop: '4px' }}>{b.label}</div>
                    </div>
                  ))}
                </div>
                {overdueVenues.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', letterSpacing: '0.3px', marginBottom: '6px' }}>OVERDUE VENUES</div>
                    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                      {/* Header row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '6px 1fr 52px 1fr 1fr 80px', gap: '12px', padding: '6px 12px', borderBottom: '1.5px solid #e2e8f0', minWidth: '580px' }}>
                        <span />
                        <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px' }}>VENUE</span>
                        <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>STATE</span>
                        <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>BDM</span>
                        <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>NAM</span>
                        <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'right' }}>LAST TPM</span>
                      </div>
                      {overdueVenues.slice(0, 8).map((v, i) => {
                        const days = getAgeDays(v.lastTpmDate);
                        const isSevere = days >= 7;
                        const bdm = getOverdueBdm(v);
                        const nam = getOverdueNam(v);
                        return (
                          <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '6px 1fr 52px 1fr 1fr 80px', gap: '12px', alignItems: 'center', padding: '7px 12px', borderBottom: i < Math.min(overdueVenues.length, 8) - 1 ? '1px solid #f1f5f9' : 'none', minWidth: '580px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSevere ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                            <StateBadge state={v.state} />
                            <div style={{ textAlign: 'center' }}>
                              {bdm ? <span style={{ fontSize: '10px', fontWeight: '600', color: '#065f46', background: '#d1fae5', padding: '2px 0', borderRadius: '4px', display: 'inline-block', width: '72px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bdm}</span>
                                : <span style={{ fontSize: '10px', color: '#cbd5e1' }}>—</span>}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              {nam ? <span style={{ fontSize: '10px', fontWeight: '600', color: '#1e40af', background: '#dbeafe', padding: '2px 0', borderRadius: '4px', display: 'inline-block', width: '72px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nam}</span>
                                : <span style={{ fontSize: '10px', color: '#cbd5e1' }}>—</span>}
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#1f2937', textAlign: 'right' }}>{days}d ago</span>
                          </div>
                        );
                      })}
                      {overdueVenues.length > 8 && (
                        <div style={{ padding: '6px 12px', fontSize: '11px', color: '#64748b', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>+{overdueVenues.length - 8} more</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      );
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }}>
      <style>{hideScrollbarCSS}</style>

      {/* Frysmart header bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#1a428a', padding: '14px 16px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'white', margin: 0 }}>Frysmart</h1>
            <span style={{
              padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
              background: 'rgba(236,72,153,0.25)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.4)',
              letterSpacing: '0.5px'
            }}>ADMIN</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>Liz</span>
            {!isDesktop && (
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '10px',
                width: '38px', height: '38px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ width: '18px', height: '2px', background: 'white', borderRadius: '1px' }} />
                  <div style={{ width: '18px', height: '2px', background: 'white', borderRadius: '1px' }} />
                  <div style={{ width: '18px', height: '2px', background: 'white', borderRadius: '1px' }} />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Placeholder for non-admin views */}
      {currentView !== 'admin' ? (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '48px', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              {currentView === 'bdm' && <AlertTriangle size={28} color="#1a428a" />}
              {currentView === 'nam' && <Layers size={28} color="#1a428a" />}
              {currentView === 'state_manager' && <BarChart3 size={28} color="#1a428a" />}
              {currentView === 'mgt' && <BarChart3 size={28} color="#1a428a" />}
              {currentView === 'group' && <Users size={28} color="#1a428a" />}
              {currentView === 'venue' && <Building size={28} color="#1a428a" />}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px' }}>
              {{ bdm: 'BDM Oil Trials', nam: 'NAM View', state_manager: 'State Manager View', mgt: 'MGT / NSM View', group: 'Group View', venue: 'Venue Staff Interface' }[currentView]}
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.6' }}>
              This interface is in the build sequence and will be implemented as a separate view.
            </p>
            <button onClick={() => setCurrentView('admin')} style={{
              padding: '10px 24px', background: '#1a428a', color: 'white', border: 'none',
              borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}>Back to Admin Panel</button>
          </div>
        </div>
      ) : isDesktop ? (
        <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto', minHeight: 'calc(100vh - 60px)' }}>
          {/* Persistent sidebar */}
          <div style={{
            width: '240px', flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0',
            padding: '20px 12px', overflowY: 'auto', position: 'sticky', top: '60px', height: 'calc(100vh - 60px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
            {/* Core section — Overview, Trials, Analysis */}
            <div style={{ background: '#f0f4fa', borderRadius: '10px', padding: '6px', marginBottom: '14px' }}>
              {navGroups.filter(g => !g.children).map(group => {
                const isActive = activeSection === group.key;
                const isTrials = group.key === 'trials';
                const trialCount = isTrials ? venues.filter(v => v.status === 'trial-only' && ['pending', 'in-progress', 'completed'].includes(v.trialStatus)).length : 0;
                return (
                  <button key={group.key} onClick={() => setActiveSection(group.key)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '2px', transition: 'all 0.15s', textAlign: 'left',
                    background: isActive ? '#1a428a' : 'transparent',
                    color: isActive ? 'white' : '#1a428a',
                    fontWeight: '600', fontSize: '13px',
                  }}>
                    <group.icon size={17} color={isActive ? 'white' : '#1a428a'} />
                    {group.label}
                    {isTrials && trialCount > 0 && (
                      <span style={{
                        marginLeft: 'auto', fontSize: '11px', fontWeight: '700',
                        background: isActive ? 'rgba(255,255,255,0.2)' : '#1a428a',
                        color: 'white',
                        padding: '2px 8px', borderRadius: '10px', minWidth: '20px', textAlign: 'center'
                      }}>{trialCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Grouped sections */}
            {navGroups.filter(g => g.children).map(group => (
              <div key={group.key} style={{ marginBottom: '14px' }}>
                <div style={{
                  padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b',
                  letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px'
                }}>{group.label}</div>
                {group.children.map(child => {
                  const isChildActive = activeSection === child.key;
                  return (
                    <button key={child.key} onClick={() => setActiveSection(child.key)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                      background: isChildActive ? '#e8eef6' : 'transparent',
                      color: isChildActive ? '#1a428a' : '#1f2937',
                      fontWeight: isChildActive ? '600' : '500', fontSize: '13px'
                    }}>
                      <child.icon size={15} />
                      {child.label}
                    </button>
                  );
                })}
              </div>
            ))}
            </div>

            {/* Bottom — Switch Role & Logout */}
            <div>
            {/* Switch Role */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '14px', position: 'relative' }}>
              <button onClick={() => setShowRoleSwitcher(s => !s)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                color: '#64748b',
                fontWeight: '600', fontSize: '13px', textAlign: 'left', transition: 'all 0.15s'
              }}>
                <Repeat2 size={15} />
                Switch Role
                <ChevronDown size={13} style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: showRoleSwitcher ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showRoleSwitcher && (
                <div style={{ position: 'absolute', bottom: '100%', left: '0', right: '0', marginBottom: '4px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 10 }}>
                  {[
                    { id: 'admin', label: 'Admin Panel', color: '#ff69b4' },
                    { id: 'mgt', label: 'MGT / NSM', color: '#ff0000' },
                    { id: 'state_manager', label: 'State Manager', color: '#ffd700' },
                    { id: 'nam', label: 'NAM View', color: '#0066ff' },
                    { id: 'bdm', label: 'BDM Trials', color: '#00cc44' },
                    { id: 'group', label: 'Group View', color: '#9933ff' },
                    { id: 'venue', label: 'Venue Staff', color: '#ff6600' },
                  ].map((v, i) => {
                    const isActive = currentView === v.id;
                    return (
                      <button key={v.id}
                        onClick={() => { setCurrentView(v.id); setShowRoleSwitcher(false); }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                          borderBottom: i < 6 ? '1px solid #f1f5f9' : 'none',
                          background: isActive ? '#f8fafc' : 'transparent',
                          color: isActive ? '#1a428a' : '#1f2937',
                          fontWeight: isActive ? '600' : '500', fontSize: '13px',
                          transition: 'background 0.1s'
                        }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                        {v.label}
                        {isActive && <Check size={12} color="#1a428a" style={{ marginLeft: 'auto' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Logout */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
              <button onClick={() => { if (window.confirm('Are you sure you want to log out?')) { supabase.auth.signOut(); } }} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '9px', borderRadius: '8px', border: '1px solid #fca5a5',
                background: '#fff5f5', fontSize: '12px', fontWeight: '600', color: '#dc2626',
                cursor: 'pointer', transition: 'all 0.15s'
              }}>
                <LogOut size={14} />
                Log Out
              </button>
            </div>
            </div>
          </div>
          {/* Main content */}
          <div style={{ flex: 1, padding: '24px clamp(16px, 2vw, 32px)', minWidth: 0 }}>
            {renderContent()}
          </div>
        </div>
      ) : (
        /* =================== MOBILE LAYOUT =================== */
        <>
          {/* Sticky tab bars */}
          <div style={{ position: 'sticky', top: '54px', zIndex: 90 }}>
            {/* Main tab bar */}
            <div className="no-scrollbar" style={{
              display: 'flex', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', overflowY: 'hidden',
              background: 'white', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x'
            }}>
              <div style={{ display: 'flex', width: '100%' }}>
                {navGroups.map(group => {
                  const activeGroup = navGroups.find(g => g.children?.some(c => c.key === activeSection));
                  const isActive = !group.children ? activeSection === group.key : activeGroup?.key === group.key;
                  return (
                    <button key={group.key} onClick={() => {
                      if (!group.children) { setActiveSection(group.key); }
                      else if (!group.children.some(c => c.key === activeSection)) { setActiveSection(group.children[0].key); }
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '11px 16px',
                      border: 'none', borderBottom: isActive ? '3px solid #1a428a' : '3px solid transparent',
                      marginBottom: '-1px', background: 'transparent',
                      color: isActive ? '#1a428a' : '#64748b',
                      fontSize: '13px', fontWeight: isActive ? '700' : '500', cursor: 'pointer',
                      whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0
                    }}>
                      <group.icon size={15} />
                      {group.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Sub-tab bar */}
            {(() => {
              const activeGroup = navGroups.find(g => g.children?.some(c => c.key === activeSection));
              if (!activeGroup) return null;
              return (
                <div className="no-scrollbar" style={{
                  background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
                  padding: '6px 16px', overflowX: 'auto', overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch', touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {activeGroup.children.map(child => {
                      const isActive = activeSection === child.key;
                      return (
                        <button key={child.key} onClick={() => setActiveSection(child.key)} style={{
                          padding: '7px 16px', borderRadius: '8px', border: 'none',
                          background: isActive ? 'white' : 'transparent',
                          color: isActive ? '#1a428a' : '#64748b',
                          fontSize: '13px', fontWeight: isActive ? '600' : '500', cursor: 'pointer',
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                          boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                        }}>
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Content area */}
          <div style={{ padding: '20px 16px' }}>
            {renderContent()}
          </div>

          {/* Sidebar overlay (mobile only) */}
          {sidebarOpen && (
            <div onClick={() => setSidebarOpen(false)} style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 200
            }} />
          )}
          {/* Sidebar drawer (mobile only) */}
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: '270px',
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease', background: 'white', zIndex: 300,
            borderRight: '1px solid #e2e8f0', boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
            overflowY: 'auto'
          }}>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: '700', color: '#1a428a' }}>Frysmart</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>Admin Panel</div>
                </div>
                <button onClick={() => setSidebarOpen(false)} style={{
                  background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '8px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center'
                }}>
                  <X size={16} color="#64748b" />
                </button>
              </div>
              {navGroups.filter(g => !g.children).map(group => {
                const isActive = activeSection === group.key;
                return (
                  <button key={group.key} onClick={() => { setActiveSection(group.key); setSidebarOpen(false); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '11px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    marginBottom: '2px', transition: 'all 0.2s', textAlign: 'left',
                    background: isActive ? '#e8eef6' : 'transparent',
                    color: isActive ? '#1a428a' : '#1f2937',
                    fontWeight: isActive ? '600' : '500', fontSize: '14px'
                  }}>
                    <group.icon size={18} />
                    {group.label}
                  </button>
                );
              })}
              <div style={{ height: '1px', background: '#e2e8f0', margin: '14px 0' }} />
              {navGroups.filter(g => g.children).map(group => (
                <div key={group.key} style={{ marginBottom: '16px' }}>
                  <div style={{
                    padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b',
                    letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '4px'
                  }}>{group.label}</div>
                  {group.children.map(child => {
                    const isChildActive = activeSection === child.key;
                    return (
                      <button key={child.key} onClick={() => { setActiveSection(child.key); setSidebarOpen(false); }} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                        padding: '10px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        marginBottom: '1px', transition: 'all 0.2s', textAlign: 'left',
                        background: isChildActive ? '#e8eef6' : 'transparent',
                        color: isChildActive ? '#1a428a' : '#1f2937',
                        fontWeight: isChildActive ? '600' : '500', fontSize: '14px'
                      }}>
                        <child.icon size={16} />
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              ))}
              {/* Switch Role (mobile) */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px', position: 'relative' }}>
                <button onClick={() => setShowRoleSwitcher(s => !s)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                  padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#64748b',
                  fontWeight: '600', fontSize: '13px', textAlign: 'left'
                }}>
                  <Repeat2 size={15} />
                  Switch Role
                  <ChevronDown size={13} style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: showRoleSwitcher ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showRoleSwitcher && (
                  <div style={{ marginTop: '4px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    {[
                      { id: 'admin', label: 'Admin Panel', color: '#ff69b4' },
                      { id: 'mgt', label: 'MGT / NSM', color: '#ff0000' },
                      { id: 'state_manager', label: 'State Manager', color: '#ffd700' },
                      { id: 'nam', label: 'NAM View', color: '#0066ff' },
                      { id: 'bdm', label: 'BDM Trials', color: '#00cc44' },
                      { id: 'group', label: 'Group View', color: '#9933ff' },
                      { id: 'venue', label: 'Venue Staff', color: '#ff6600' },
                    ].map((v, i) => {
                      const isActive = currentView === v.id;
                      return (
                        <button key={v.id}
                          onClick={() => { setCurrentView(v.id); setShowRoleSwitcher(false); setSidebarOpen(false); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                            borderBottom: i < 6 ? '1px solid #f1f5f9' : 'none',
                            background: isActive ? '#f8fafc' : 'transparent',
                            color: isActive ? '#1a428a' : '#1f2937',
                            fontWeight: isActive ? '600' : '500', fontSize: '13px'
                          }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                          {v.label}
                          {isActive && <Check size={12} color="#1a428a" style={{ marginLeft: 'auto' }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Logout (mobile) */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
                <button onClick={() => { if (window.confirm('Are you sure you want to log out?')) { supabase.auth.signOut(); } }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '10px', borderRadius: '8px', border: '1px solid #fca5a5',
                  background: '#fff5f5', fontSize: '13px', fontWeight: '600', color: '#dc2626', cursor: 'pointer'
                }}>
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
