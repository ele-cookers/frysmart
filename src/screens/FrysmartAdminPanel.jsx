import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  mapCompetitor, unMapCompetitor,
  mapOilType, unMapOilType,
  mapProfile, unMapProfile,
  mapGroup, unMapGroup,
  mapVenue, unMapVenue,
  mapTrial, unMapTrial,
  mapReading, unMapReading,
  mapTrialReason, mapVolumeBracket,
  mapSystemSettings,
  mergeTrialIntoVenue, splitTrialFromVenue,
} from '../lib/mappers';
import { ChevronDown, Plus, Trash2, X, Check, AlertTriangle, Edit3, Settings, Building, Eye, ArrowLeft, Users, Droplets, Archive, Filter, Layers, BarChart3, RefreshCw, AlertCircle, ArrowUpDown, ArrowDown, Trophy, Clock, Target, Calendar, ChevronLeft, ChevronRight, LogOut, RotateCcw, TrendingUp, Copy, CheckCircle, Globe, Palette, Shield, UserPlus, Zap, ClipboardList, LayoutDashboard } from 'lucide-react';
import { FilterableTh } from '../components/FilterableTh';
import { ColumnToggle } from '../components/ColumnToggle';
import { TrialDetailModal } from '../components/TrialDetailModal';
import {
  HEADER_BADGE_COLORS, ROLE_COLORS, STATE_BADGE_COLORS, STATE_COLOURS,
  STATUS_COLORS, OIL_TIER_COLORS, COMPETITOR_TIER_COLORS, CODE_BADGE_COLORS,
  TRIAL_STATUS_COLORS, VOLUME_BRACKET_COLORS,
  getThemeColors, THEME_CATEGORIES, getEntryLabel,
} from '../lib/badgeConfig';

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

const ROLE_PERMISSIONS = {
  bdm: 'Own assigned venues & trials',
  nam: 'BDM & venue data for their groups',
  state_manager: 'All BDMs, venues & trials in state',
  mgt: 'All data nationally',
  admin: 'Everything — full system access',
};

// ==================== SHARED COMPONENTS ====================

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

const VOLUME_BRACKETS = VOLUME_BRACKET_COLORS;

const OilBadge = ({ oil, competitors, compact, theme }) => {
  if (!oil) return <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>;
  const isCompetitor = oil.category === 'competitor';
  const tierSrc = theme || {};
  const s = isCompetitor
    ? (tierSrc.COMPETITOR_TIER_COLORS?.[oil.tier] || COMPETITOR_TIER_COLORS[oil.tier] || COMPETITOR_TIER_COLORS.standard)
    : (tierSrc.OIL_TIER_COLORS?.[oil.tier] || OIL_TIER_COLORS[oil.tier] || OIL_TIER_COLORS.standard);
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

const StatusBadge = ({ status, theme }) => {
  const c = (theme?.STATUS_COLORS?.[status]) || STATUS_COLORS[status] || STATUS_COLORS.active;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '68px', textAlign: 'center'
    }}>{getEntryLabel(null, 'STATUS_COLORS', status)}</span>
  );
};

const RoleBadge = ({ role, theme }) => {
  const c = (theme?.ROLE_COLORS?.[role]) || ROLE_COLORS[role] || ROLE_COLORS.staff;
  return (
    <span style={{
      padding: '2px 0', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.3px',
      whiteSpace: 'nowrap', display: 'inline-block', minWidth: '90px', textAlign: 'center'
    }}>{getEntryLabel(null, 'ROLE_COLORS', role)}</span>
  );
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

const StateBadge = ({ state, theme }) => {
  if (!state) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const c = (theme?.STATE_BADGE_COLORS?.[state]) || STATE_BADGE_COLORS[state] || { color: '#64748b', bg: '#f1f5f9' };
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

// ColumnToggle imported from ../components/ColumnToggle

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

// FilterableTh imported from ../components/FilterableTh

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

const OilTypeConfig = ({ oilTypes, setOilTypes, competitors, oilTypeOptions, theme }) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), code: form.code.trim().toUpperCase() };
    if (editing) {
      const row = unMapOilType(cleaned);
      const { error: updateErr } = await supabase.from('oil_types').update(row).eq('id', editing);
      if (updateErr) { alert('Failed to update oil type: ' + updateErr.message); return; }
      setOilTypes(prev => prev.map(o => o.id === editing ? { ...o, ...cleaned } : o));
    } else {
      const row = unMapOilType({ ...cleaned, category: 'cookers' });
      const { data: inserted, error: insertErr } = await supabase.from('oil_types').insert(row).select().single();
      if (insertErr) { alert('Failed to create oil type: ' + insertErr.message); return; }
      setOilTypes(prev => [...prev, mapOilType(inserted)]);
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
                    <td style={{ textAlign: 'center' }}><StatusBadge theme={theme} status={oil.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button onClick={() => handleEdit(oil)} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                        <button onClick={() => toggleStatus(oil.id)} style={{ padding: '6px', background: oil.status === 'active' ? '#fee2e2' : '#d1fae5', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {oil.status === 'active' ? <Archive size={13} color="#ef4444" /> : <RefreshCw size={13} color="#10b981" />}
                        </button>
                        {oil.status === 'inactive' && (
                          <button onClick={() => setDeleteConfirm(oil.id)} style={{ padding: '6px', background: '#fee2e2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete permanently">
                            <Trash2 size={13} color="#ef4444" />
                          </button>
                        )}
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (() => {
        const oil = oilTypes.find(o => o.id === deleteConfirm);
        if (!oil) return null;
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '16px', maxWidth: '400px', width: '100%', padding: '24px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertTriangle size={24} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px' }}>Delete "{oil.name}"?</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.5' }}>
                This will permanently remove this oil type. Venues currently using it will have their oil reference cleared. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { setOilTypes(prev => prev.filter(o => o.id !== deleteConfirm)); setDeleteConfirm(null); }} style={{ flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Delete Permanently</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ==================== COMPETITOR MANAGEMENT ====================
const CompetitorManagement = ({ competitors, setCompetitors, oilTypes, setOilTypes, oilTypeOptions, theme }) => {
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
  const save = async () => {
    if (!form.name.trim()) return;
    const now = new Date().toISOString().split('T')[0];
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), code: form.code ? form.code.trim().toUpperCase() : '' };
    if (editing) {
      const row = unMapCompetitor(cleaned);
      const { error: updateErr } = await supabase.from('competitors').update(row).eq('id', editing);
      if (updateErr) { alert('Failed to update competitor: ' + updateErr.message); return; }
      setCompetitors(prev => prev.map(c => c.id === editing ? { ...c, ...cleaned, updatedAt: now } : c));
    } else {
      const row = unMapCompetitor({ ...cleaned });
      const { data: inserted, error: insertErr } = await supabase.from('competitors').insert(row).select().single();
      if (insertErr) { alert('Failed to create competitor: ' + insertErr.message); return; }
      setCompetitors(prev => [...prev, mapCompetitor(inserted)]);
    }
    setShowForm(false); setEditing(null); setForm({ name: '', code: '', status: 'active', type: 'direct', states: [], color: '' });
  };

  const startOilEdit = (oil) => { setOilForm({ name: oil.name, code: oil.code || '', tier: oil.tier || 'standard', oilType: oil.oilType || '', packSize: oil.packSize || '', status: oil.status }); setEditingOil(oil.id); setShowOilForm(true); };
  const saveOil = async (compId) => {
    if (!oilForm.name.trim()) return;
    const cleanedName = oilForm.name.trim().toUpperCase();
    const cleanedCode = oilForm.code ? oilForm.code.trim().toUpperCase() : '';
    const cleaned = { name: cleanedName, code: cleanedCode, tier: oilForm.tier, oilType: oilForm.oilType, packSize: oilForm.packSize, status: oilForm.status };
    if (editingOil) {
      const row = unMapOilType(cleaned);
      const { error: updateErr } = await supabase.from('oil_types').update(row).eq('id', editingOil);
      if (updateErr) { alert('Failed to update oil type: ' + updateErr.message); return; }
      setOilTypes(prev => prev.map(o => o.id === editingOil ? { ...o, ...cleaned } : o));
    } else {
      const row = unMapOilType({ ...cleaned, category: 'competitor', competitorId: compId });
      const { data: inserted, error: insertErr } = await supabase.from('oil_types').insert(row).select().single();
      if (insertErr) { alert('Failed to create oil type: ' + insertErr.message); return; }
      setOilTypes(prev => [...prev, mapOilType(inserted)]);
    }
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
                {colVis('status') && <td style={{ textAlign: 'center' }}><StatusBadge theme={theme} status={comp.status} /></td>}
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
                                <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}><StatusBadge theme={theme} status={oil.status} /></td>
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
                  const sc = theme?.STATE_BADGE_COLORS?.[st] || STATE_BADGE_COLORS[st] || { color: '#64748b', bg: '#f1f5f9' };
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
const VenueManagement = ({ venues, setVenues, rawSetVenues, oilTypes, groups, competitors, users, setUsers, rawSetUsers, setActiveSection, isDesktop, autoOpenForm, clearAutoOpen, onPreviewVenue, theme }) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByTpm, setSortByTpm] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [form, setForm] = useState({ name: '', fryerCount: 4, defaultOil: '', groupId: '', status: 'active', customerCode: '', volumeBracket: '', state: '', bdmId: '', password: '' });

  useEffect(() => {
    if (autoOpenForm) { setForm({ name: '', fryerCount: 4, defaultOil: '', groupId: '', status: 'active', customerCode: '', volumeBracket: '', state: '', bdmId: '', password: '' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
  }, [autoOpenForm]);
  const colFilters = useColumnFilters();

  const getUserName = makeGetUserName(users, true);
  const getGroupNam = (venueGroupId) => {
    if (!venueGroupId) return '';
    const grp = groups.find(g => g.id === venueGroupId);
    return grp?.namId ? getUserName(grp.namId) : '';
  };

  const VENUE_COLS = [
    { key: 'name', label: 'Venue Name', locked: true },
    { key: 'code', label: 'Cust Code' },
    { key: 'group', label: 'Group Name' },
    { key: 'groupCode', label: 'Group Code' },
    { key: 'bdm', label: 'BDM' },
    { key: 'nam', label: 'NAM' },
    { key: 'state', label: 'State' },
    { key: 'oil', label: 'Main Oil' },
    { key: 'volume', label: 'Vol Bracket' },
    { key: 'fryers', label: 'Fryers' },
    { key: 'tpm', label: 'Last TPM' },
  ];
  const [visibleCols, setVisibleCols] = useState(VENUE_COLS.filter(c => c.key !== 'groupCode' && c.key !== 'volume').map(c => c.key));
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
      bdm: v => v.bdmId ? getUserName(v.bdmId) : '',
      nam: v => getGroupNam(v.groupId),
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

  const [saving, setSaving] = useState(false);

  const adminApi = async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/admin-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Server error');
    return json;
  };

  const handleSave = async () => {
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

    setSaving(true);
    try {
      if (editing) {
        const venueRow = unMapVenue({ ...cleaned, groupId: cleaned.groupId || null });
        let { error: updateErr } = await supabase.from('venues').update(venueRow).eq('id', editing);
        // If DB trigger fails due to missing updated_at column, retry after dropping the trigger
        // Root cause fix: Run this SQL in Supabase dashboard:
        //   ALTER TABLE venues ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        //   CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
        //     BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
        //   DROP TRIGGER IF EXISTS venues_updated_at ON venues;
        //   CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        if (updateErr && updateErr.message?.includes('updated_at')) {
          console.warn('[Frysmart] updated_at column missing on venues table. Retrying update without trigger-dependent fields. Please run the SQL migration in the admin panel comments.');
          // Strip updated_at from payload and retry (column is managed by trigger)
          const { updated_at, ...rowWithout } = venueRow;
          ({ error: updateErr } = await supabase.from('venues').update(rowWithout).eq('id', editing));
        }
        if (updateErr) throw new Error('Failed to update venue: ' + updateErr.message);
        setVenues(prev => prev.map(v => v.id === editing ? { ...v, ...cleaned, groupId: cleaned.groupId || null } : v));
      } else {
        const venueRow = unMapVenue({ ...cleaned, groupId: cleaned.groupId || null });
        const { data: inserted, error: insertErr } = await supabase.from('venues').insert(venueRow).select().single();
        if (insertErr) throw new Error('Failed to create venue: ' + insertErr.message);
        rawSetVenues(prev => [...prev, mapVenue(inserted)]);
      }

      // Auto-create/update auth account if customerCode and password are set
      if (cleaned.customerCode && cleaned.password) {
        const authEmail = `${cleaned.customerCode}@frysmart.app`;
        await adminApi({ action: 'fix-user', email: authEmail, password: cleaned.password });
      }
    } catch (err) {
      console.error('Venue save error:', err);
      alert('Error: ' + err.message);
    }

    setSaving(false);
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (venue) => {
    setForm({ name: venue.name, fryerCount: venue.fryerCount, defaultOil: venue.defaultOil, groupId: venue.groupId || '', status: venue.status, customerCode: venue.customerCode || '', volumeBracket: venue.volumeBracket || '', state: venue.state || '', bdmId: venue.bdmId || '', password: venue.password || '' });
    setEditing(venue.id);
    setShowForm(true);
  };

  const handleDeleteVenue = (venue) => {
    if (!window.confirm(`Permanently delete venue "${venue.name}"? This cannot be undone.`)) return;
    setVenues(prev => prev.filter(v => v.id !== venue.id));
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

        {filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '40px 20px', textAlign: 'center' }}>
            {venues.filter(v => v.status !== 'trial-only').length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏪</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No venues yet</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Click "Add Venue" to add your first venue.</div>
              </div>
            ) : (
              <span style={{ color: '#64748b', fontSize: '13px' }}>No venues match your filters</span>
            )}
          </div>
        ) : !isDesktop ? (
          /* Mobile card view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(venue => {
              const grp = venue.groupId ? groups.find(g => g.id === venue.groupId) : null;
              const oil = oilTypes.find(o => o.id === venue.defaultOil);
              return (
                <div key={venue.id} onClick={() => setSelectedVenue(venue)} style={{
                  background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
                  padding: '10px 12px', cursor: 'pointer',
                  opacity: venue.status === 'inactive' ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {grp ? grp.name : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Street</span>}
                        {venue.state ? ` · ${venue.state}` : ''}
                      </div>
                    </div>
                    {venue.customerCode && <CodeBadge code={venue.customerCode} minWidth="60px" />}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '4px' }}>
                    {oil && <OilBadge theme={theme} oil={oil} competitors={competitors} compact />}
                    {venue.volumeBracket && <VolumePill bracket={venue.volumeBracket} />}
                    {venue.fryerCount && <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>{venue.fryerCount} fryer{venue.fryerCount > 1 ? 's' : ''}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {venue.bdmId ? getUserName(venue.bdmId) : ''}
                      {venue.lastTpmDate ? ` · TPM ${relativeDate(venue.lastTpmDate)}` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(venue); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><Edit3 size={13} color="#64748b" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteVenue(venue); }} style={{ padding: '6px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#ef4444" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table view */
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <FilterableTh colKey="name" label="Venue Name" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                    {colVis('code') && <FilterableTh colKey="code" label="Cust Code" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.customerCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('group') && <FilterableTh colKey="group" label="Group Name" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.groupId ? (groups.find(g => g.id === v.groupId)?.name || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('groupCode') && <FilterableTh colKey="groupCode" label="Group Code" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.groupId ? (groups.find(g => g.id === v.groupId)?.groupCode || '') : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('bdm') && <FilterableTh colKey="bdm" label="BDM" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.bdmId ? getUserName(v.bdmId) : '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('nam') && <FilterableTh colKey="nam" label="NAM" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => getGroupNam(v.groupId))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('state') && <FilterableTh colKey="state" label="State" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => v.state)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('oil') && <FilterableTh colKey="oil" label="Main Oil" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => oilTypes.find(o => o.id === v.defaultOil)?.name || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('volume') && <FilterableTh colKey="volume" label="Vol Bracket" options={VOLUME_BRACKETS.map(b => ({value:b.label,label:b.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('fryers') && <FilterableTh colKey="fryers" label="Fryers" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => String(v.fryerCount))} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('tpm') && <FilterableTh colKey="tpm" label="Last TPM" options={getUniqueValues(venues.filter(v => v.status !== 'trial-only'), v => relativeDate(v.lastTpmDate))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(venue => {
                    const grp = venue.groupId ? groups.find(g => g.id === venue.groupId) : null;
                    return (
                    <tr key={venue.id} className={venue.status === 'inactive' ? 'inactive-row' : ''} onClick={() => setSelectedVenue(venue)} style={{ cursor: 'pointer', height: '36px' }}>
                      <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={venue.name}>{venue.name}</td>
                      {colVis('code') && <td style={{ textAlign: 'center' }}>{<CodeBadge code={venue.customerCode} minWidth="70px" />}</td>}
                      {colVis('group') && <td style={{ color: '#1f2937', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={grp ? grp.name : 'STREET'}>{grp ? grp.name : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: '400' }}>STREET</span>}</td>}
                      {colVis('groupCode') && <td style={{ textAlign: 'center' }}>{<CodeBadge code={grp?.groupCode} variant="charcoal" />}</td>}
                      {colVis('bdm') && <td style={{ fontSize: '11px', color: '#1f2937', whiteSpace: 'nowrap', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={venue.bdmId ? getUserName(venue.bdmId) : ''}>{venue.bdmId ? getUserName(venue.bdmId) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('nam') && <td style={{ fontSize: '11px', color: '#1f2937', whiteSpace: 'nowrap', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={getGroupNam(venue.groupId)}>{getGroupNam(venue.groupId) || <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('state') && <td><StateBadge theme={theme} state={venue.state} /></td>}
                      {colVis('oil') && <td style={{ textAlign: 'center' }}><OilBadge theme={theme} oil={oilTypes.find(o => o.id === venue.defaultOil)} competitors={competitors} compact /></td>}
                      {colVis('volume') && <td style={{ textAlign: "center" }}><VolumePill bracket={venue.volumeBracket} /></td>}
                      {colVis('fryers') && <td style={{ textAlign: 'center', fontWeight: '600' }}>{venue.fryerCount}</td>}
                      {colVis('tpm') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(venue.lastTpmDate) || '—'}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(venue); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Edit venue"><Edit3 size={13} color="#64748b" /></button>
                          {onPreviewVenue && <button onClick={(e) => { e.stopPropagation(); onPreviewVenue(venue.id); }} style={{ padding: '6px', background: '#eff6ff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Preview as venue staff"><Eye size={13} color="#3b82f6" /></button>}
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteVenue(venue); }} style={{ padding: '6px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete venue"><Trash2 size={13} color="#ef4444" /></button>
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
        )}

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
              <OilBadge theme={theme} oil={oilTypes.find(o => o.id === selectedVenue.defaultOil)} competitors={competitors} />
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
                    <RoleBadge theme={theme} role={p.role} />
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937' }}>{p.name}</span>
                  </div>
                ));
              })()}
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
                <FormField label="Password">
                  <input style={inputStyle} type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Venue login password" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
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
              <button onClick={handleSave} disabled={!isFormValid || saving} style={{
                width: '100%', padding: '10px', background: (isFormValid && !saving) ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: (isFormValid && !saving) ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Venue')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== GROUP MANAGEMENT ====================
const GroupManagement = ({ groups, setGroups, rawSetGroups, venues, setVenues, users, setUsers, rawSetUsers, oilTypes, competitors, autoOpenForm, clearAutoOpen, theme }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByActive, setSortByActive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [form, setForm] = useState({ name: '', groupCode: '', username: '', namId: '', status: 'active', password: '' });
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
    if (autoOpenForm) { setForm({ name: '', groupCode: '', username: '', namId: '', status: 'active', password: '' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
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

  const [saving, setSaving] = useState(false);

  const adminApi = async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/admin-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Server error');
    return json;
  };

  const handleSave = async () => {
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

    setSaving(true);
    try {
      if (editing) {
        const groupRow = unMapGroup(cleaned);
        const { error: updateErr } = await supabase.from('groups').update(groupRow).eq('id', editing);
        if (updateErr) throw new Error('Failed to update group: ' + updateErr.message);
        setGroups(prev => prev.map(g => g.id === editing ? { ...g, ...cleaned } : g));
      } else {
        const groupRow = unMapGroup({ ...cleaned, status: 'active' });
        const { data: inserted, error: insertErr } = await supabase.from('groups').insert(groupRow).select().single();
        if (insertErr) throw new Error('Failed to create group: ' + insertErr.message);
        rawSetGroups(prev => [...prev, mapGroup(inserted)]);
      }

      // Auto-create/update auth account if username and password are set
      if (cleaned.username && cleaned.password) {
        const authEmail = `${cleaned.username}@frysmart.app`;
        await adminApi({ action: 'fix-user', email: authEmail, password: cleaned.password });
      }
    } catch (err) {
      console.error('Group save error:', err);
      alert('Error: ' + err.message);
    }

    setSaving(false);
    setShowForm(false);
    setEditing(null);
  };

  const handleEdit = (group) => {
    setForm({ name: group.name, groupCode: group.groupCode || '', username: group.username || '', namId: group.namId || '', status: group.status || 'active', password: group.password || '' });
    setEditing(group.id);
    setShowForm(true);
  };

  const handleDeleteGroup = (group) => {
    const groupVenues = venues.filter(v => v.groupId === group.id);
    if (groupVenues.length > 0) {
      if (!window.confirm(`Group "${group.name}" has ${groupVenues.length} venue(s) linked. Deleting will unlink them. Continue?`)) return;
      groupVenues.forEach(v => setVenues(prev => prev.map(vn => vn.id === v.id ? { ...vn, groupId: null } : vn)));
    } else {
      if (!window.confirm(`Permanently delete group "${group.name}"? This cannot be undone.`)) return;
    }
    setGroups(prev => prev.filter(g => g.id !== group.id));
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
                      {colVis('oil') && <td style={{ textAlign: 'center' }}><OilBadge theme={theme} oil={getPrimaryOil(group.id)} competitors={competitors} compact /></td>}
                      {colVis('tpm') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(group.lastTpmDate) || '—'}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(group); }} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }} style={{ padding: '6px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} color="#ef4444" /></button>
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
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Main Oil: <OilBadge theme={theme} oil={getPrimaryOil(group.id)} competitors={competitors} /></span>
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
                          <StateBadge theme={theme} state={v.state} />
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
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="e.g. MY GROUP NAME" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <FormField label="Group Code">
                <input style={inputStyle} value={form.groupCode} onChange={e => setForm(f => ({ ...f, groupCode: e.target.value.toUpperCase() }))} placeholder="e.g. GRP" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <FormField label="Login Username">
                <div style={{ display: 'flex' }}>
                  <span style={{ padding: '8px 0 8px 10px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRight: 'none', borderRadius: '8px 0 0 8px', fontSize: '13px', fontWeight: '600', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>FRYSMRT-</span>
                  <input style={{ ...inputStyle, borderRadius: '0 8px 8px 0', fontFamily: 'monospace', flex: 1 }} value={form.username.startsWith('FRYSMRT-') ? form.username.slice(8) : form.username} onChange={e => setForm(f => ({ ...f, username: 'FRYSMRT-' + e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="GRP" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: editing ? '1fr 1fr' : '1fr', gap: '10px' }}>
                <FormField label="Assign NAM">
                  <select style={selectStyle} value={form.namId} onChange={e => setForm(f => ({ ...f, namId: e.target.value }))}>
                    <option value="">UNASSIGNED</option>
                    {nams.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Password">
                  <input style={inputStyle} type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Group login password" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
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
              <button onClick={handleSave} disabled={!form.name.trim() || saving} style={{
                width: '100%', padding: '10px', background: (form.name.trim() && !saving) ? '#1a428a' : '#94a3b8', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: (form.name.trim() && !saving) ? 'pointer' : 'not-allowed', marginTop: '4px'
              }}>{saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Group')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== USER MANAGEMENT ====================
const UserManagement = ({ users, setUsers, rawSetUsers, venues, groups, currentUser, autoOpenForm, clearAutoOpen, isDesktop, theme }) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [statusFilter, setStatusFilter] = useState('active');
  const [sortByActive, setSortByActive] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '', newPassword: '' });
  const colFilters = useColumnFilters();

  const USER_COLS = [
    { key: 'name', label: 'Name', locked: true },
    { key: 'role', label: 'Role' },
    { key: 'username', label: 'Username' },
    { key: 'region', label: 'State' },
    { key: 'repCode', label: 'Rep Code' },
    { key: 'permissions', label: 'Permissions' },
    { key: 'lastActive', label: 'Last Active' },
  ];
  const [visibleCols, setVisibleCols] = useState(USER_COLS.map(c => c.key));
  const colVis = (key) => visibleCols.includes(key);

  useEffect(() => {
    if (autoOpenForm) { setForm({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '', newPassword: '' }); setEditing(null); setShowForm(true); clearAutoOpen(); }
  }, [autoOpenForm]);

  const filtered = (() => {
    let data = users.filter(u => {
      // Hide venue_staff and group_viewer profiles (venue/group logins don't use profiles)
      if (u.role === 'venue_staff' || u.role === 'group_viewer') return false;
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchStatus;
    });
    data = colFilters.applyFilters(data, {
      name: u => u.name || '',
      role: u => ROLE_LABELS[u.role] || u.role,
      username: u => u.username || '',
      region: u => u.region || '',
      repCode: u => u.repCode || '',
      permissions: u => ROLE_PERMISSIONS[u.role] || '',
      lastActive: u => relativeDate(u.lastActive),
    });
    return data.sort((a, b) => {
      if (sortByActive) return (b.lastActive || '').localeCompare(a.lastActive || '');
      return a.name.localeCompare(b.name);
    });
  })();

  const adminApi = async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/.netlify/functions/admin-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Server error');
    return json;
  };

  const handleSave = async () => {
    if (!form.name) return;
    setFormError('');
    const cleaned = { ...form, name: form.name.trim().toUpperCase(), repCode: form.repCode ? form.repCode.trim().toUpperCase() : '', username: form.username ? form.username.trim().toLowerCase() : '' };
    // Duplicate checks
    if (cleaned.username) {
      const dupUser = users.find(u => u.username && u.username.toLowerCase() === cleaned.username.toLowerCase() && u.id !== editing);
      if (dupUser) { setFormError(`Username "${cleaned.username}" is already taken by ${dupUser.name}`); return; }
    }
    if (cleaned.repCode) {
      const dupRep = users.find(u => u.repCode && u.repCode === cleaned.repCode && u.id !== editing);
      if (dupRep) { setFormError(`Rep code "${cleaned.repCode}" is already used by ${dupRep.name}`); return; }
    }
    if (editing) {
      setSaving(true);
      try {
        // If admin set a new password, update via serverless function
        let newAuthId = null;
        if (cleaned.newPassword && cleaned.newPassword.trim()) {
          if (cleaned.newPassword.trim().length < 6) { setFormError('Password must be at least 6 characters.'); setSaving(false); return; }
          const uname = cleaned.username || users.find(u => u.id === editing)?.username;
          if (uname) {
            const result = await adminApi({ action: 'fix-user', email: `${uname.toLowerCase()}@frysmart.app`, password: cleaned.newPassword.trim(), profileId: editing });
            if (result.created && result.userId) newAuthId = result.userId;
          } else {
            await adminApi({ action: 'update-password', userId: editing, password: cleaned.newPassword.trim() });
          }
        }
        const { newPassword, ...profileFields } = cleaned;
        if (newPassword && newPassword.trim()) profileFields.password = newPassword.trim();
        const updatedId = newAuthId || editing;
        setUsers(prev => prev.map(u => u.id === editing ? { ...u, ...profileFields, id: updatedId, venueId: profileFields.venueId || null, groupId: profileFields.groupId || null } : u));
        // If admin changed their own password, re-authenticate to keep session alive
        if (newPassword && newPassword.trim() && currentUser && editing === currentUser.id) {
          const uname = cleaned.username || currentUser.username;
          if (uname) {
            await supabase.auth.signInWithPassword({ email: `${uname.toLowerCase()}@frysmart.app`, password: newPassword.trim() });
          }
        }
        setShowForm(false);
        setEditing(null);
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSaving(false);
      }
    } else {
      // Create: require username + password
      if (!cleaned.username) { setFormError('Username is required.'); return; }
      if (!cleaned.newPassword || cleaned.newPassword.trim().length < 6) { setFormError('Password is required (min 6 characters).'); return; }
      setSaving(true);
      try {
        // 1. Create auth user via serverless function
        const { userId: newId } = await adminApi({ action: 'create-user', username: cleaned.username.toLowerCase(), password: cleaned.newPassword.trim() });
        // 2. Insert profile row
        const profileRow = { id: newId, name: cleaned.name, role: cleaned.role, region: cleaned.region || null, status: cleaned.status, username: cleaned.username.toLowerCase(), password: cleaned.newPassword.trim(), rep_code: cleaned.repCode || null, crm_code: cleaned.crmCode || null, venue_id: cleaned.venueId || null, group_id: cleaned.groupId || null };
        const { error: profileError } = await supabase.from('profiles').insert(profileRow);
        if (profileError) throw new Error(profileError.message);
        // 3. Add to local state via rawSetUsers (bypasses db wrapper to avoid double-insert)
        const { newPassword, ...userFields } = cleaned;
        const newUser = { ...userFields, id: newId, password: cleaned.newPassword.trim(), username: cleaned.username.toLowerCase(), venueId: cleaned.venueId || null, groupId: cleaned.groupId || null };
        rawSetUsers(prev => [...prev, newUser]);
        setShowForm(false);
        setEditing(null);
      } catch (err) {
        setFormError(err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleEdit = (user) => {
    setForm({ name: user.name, role: user.role, venueId: user.venueId || '', groupId: user.groupId || '', region: user.region || '', status: user.status, crmCode: user.crmCode || '', repCode: user.repCode || '', username: user.username || '', newPassword: user.password || '' });
    setEditing(user.id);
    setFormError('');
    setShowForm(true);
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Permanently delete ${user.name}? This removes their profile and login account and cannot be undone.`)) return;
    try {
      const email = user.username ? `${user.username.toLowerCase()}@frysmart.app` : null;
      await adminApi({ action: 'delete-user', userId: user.id, email });
      rawSetUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err) {
      alert('Failed to delete user: ' + err.message);
    }
  };

  const getGroupName = makeGetGroupName(groups);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: '500px' }}>
      <SectionHeader icon={Users} title="User Management" count={users.length} onAdd={() => { setForm({ name: '', role: 'bdm', venueId: '', groupId: '', region: '', status: 'active', crmCode: '', repCode: '', username: '', newPassword: '' }); setEditing(null); setFormError(''); setShowForm(true); }} addLabel="Add User" />

      {/* Status filter + sort + column toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[{ key: 'all', label: 'All', count: users.filter(u => u.role !== 'venue_staff' && u.role !== 'group_viewer').length }, { key: 'active', label: 'Active', count: users.filter(u => u.status === 'active' && u.role !== 'venue_staff' && u.role !== 'group_viewer').length }, { key: 'inactive', label: 'Inactive', count: users.filter(u => u.status === 'inactive' && u.role !== 'venue_staff' && u.role !== 'group_viewer').length }].map(f => {
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

        {filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '40px 20px', textAlign: 'center' }}>
            {users.length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No users yet</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Add BDMs, NAMs, and admins here. Click "Add User" to create the first account.</div>
              </div>
            ) : (
              <span style={{ color: '#64748b', fontSize: '13px' }}>No users match your filters</span>
            )}
          </div>
        ) : !isDesktop ? (
          /* Mobile card view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(user => (
              <div key={user.id} style={{
                background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
                padding: '10px 12px', opacity: user.status === 'inactive' ? 0.5 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>{user.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {user.username ? user.username.toLowerCase() : ''}
                      {user.repCode ? ` · ${user.repCode}` : ''}
                    </div>
                  </div>
                  <RoleBadge theme={theme} role={user.role} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                    {user.region && <StateBadge theme={theme} state={user.region} />}
                    {user.lastActive && <span>{relativeDate(user.lastActive)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleEdit(user)} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><Edit3 size={13} color="#64748b" /></button>
                    <button onClick={() => handleDelete(user)} style={{ padding: '6px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#ef4444" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop table view */
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <FilterableTh colKey="name" label="Name" options={getUniqueValues(users, u => u.name)} filters={colFilters.filters} setFilter={colFilters.setFilter} />
                    {colVis('role') && <FilterableTh colKey="role" label="Role" options={getUniqueValues(users, u => ROLE_LABELS[u.role] || u.role)} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('username') && <FilterableTh colKey="username" label="Username" options={getUniqueValues(users, u => u.username)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('region') && <FilterableTh colKey="region" label="State" options={getUniqueValues(users, u => u.region)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('repCode') && <FilterableTh colKey="repCode" label="Rep Code" options={getUniqueValues(users, u => u.repCode)} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('permissions') && <FilterableTh colKey="permissions" label="Permissions" options={getUniqueValues(users, u => ROLE_PERMISSIONS[u.role] || '')} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    {colVis('lastActive') && <FilterableTh colKey="lastActive" label="Last Active" options={getUniqueValues(users, u => relativeDate(u.lastActive))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    <th style={{ width: '70px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(user => (
                    <tr key={user.id} className={user.status === 'inactive' ? 'inactive-row' : ''} style={{ height: '36px' }}>
                      <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.name}>{user.name}</td>
                      {colVis('role') && <td style={{ textAlign: "center" }}><RoleBadge theme={theme} role={user.role} /></td>}
                      {colVis('username') && <td style={{ fontSize: '12px', color: '#64748b' }}>{user.username ? user.username.toLowerCase() : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('region') && <td><StateBadge theme={theme} state={user.region} /></td>}
                      {colVis('repCode') && <td style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{user.repCode || <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                      {colVis('permissions') && <td style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'normal', maxWidth: '220px', lineHeight: '1.4' }}>{ROLE_PERMISSIONS[user.role] || '—'}</td>}
                      {colVis('lastActive') && <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{relativeDate(user.lastActive) || '—'}</td>}
                      <td style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleEdit(user)} style={{ padding: '6px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} color="#64748b" /></button>
                        <button onClick={() => handleDelete(user)} style={{ padding: '6px', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} color="#ef4444" /></button>
                      </td>
                    </tr>
                  ))}
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
        }} onClick={() => { setShowForm(false); setEditing(null); }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '520px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{editing ? 'Edit User' : 'New User'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {editing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button type="button" onClick={() => setForm(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))} style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                      background: form.status === 'active' ? '#10b981' : '#cbd5e1'
                    }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: form.status === 'active' ? '18px' : '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }} />
                    </button>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: form.status === 'active' ? '#059669' : '#94a3b8' }}>{form.status === 'active' ? 'ACTIVE' : 'INACTIVE'}</span>
                  </div>
                )}
                <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><X size={20} color="#64748b" /></button>
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <FormField label="Full Name" required>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="DAVID ANGELKOVSKI" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </FormField>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Username" required>
                  <input style={inputStyle} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} placeholder="dangelkovski" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
                <FormField label={editing ? 'Change Password' : 'Password'} required={!editing}>
                  <input type="text" style={inputStyle} value={form.newPassword || ''} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} placeholder={editing ? 'Leave blank to keep' : 'Min 6 characters'} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <FormField label="Role" required>
                  <select style={selectStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </FormField>
                <FormField label="State">
                  <select style={selectStyle} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                    <option value="">SELECT STATE...</option>
                    {['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'H/O'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Supabase Auth Email">
                <input type="text" style={{ ...inputStyle, background: '#f8fafc', color: '#94a3b8', cursor: 'default' }} value={form.username ? `${form.username.toLowerCase()}@frysmart.app` : ''} readOnly tabIndex={-1} />
              </FormField>
              {form.role === 'bdm' && (
                <FormField label="Rep Code">
                  <input style={inputStyle} value={form.repCode} onChange={e => setForm(f => ({ ...f, repCode: e.target.value.toUpperCase() }))} placeholder="V16" onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  {form.repCode && users.some(u => u.repCode === form.repCode && u.id !== editing) && (
                    <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>⚠ Rep code "{form.repCode}" already assigned</div>
                  )}
                </FormField>
              )}
              {formError && (
                <div style={{ padding: '10px 14px', marginBottom: '8px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', fontSize: '13px', color: '#991b1b' }}>{formError}</div>
              )}
              <button onClick={handleSave} disabled={!form.name.trim() || saving} style={{
                width: '100%', padding: '10px', background: (!form.name.trim() || saving) ? '#94a3b8' : '#1a428a', color: 'white',
                border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: (!form.name.trim() || saving) ? 'not-allowed' : 'pointer', marginTop: '4px'
              }}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== CONTACT MANAGEMENT ====================

// ==================== PERMISSIONS & ACCESS ====================

const TRIAL_STATUS_CONFIGS = TRIAL_STATUS_COLORS; // from badgeConfig

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
            position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 2000,
            background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '14px', width: 'min(280px, calc(100vw - 32px))'
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

const TrialManagement = ({ venues, setVenues, rawSetVenues, oilTypes, competitors, users, groups, trialReasons, volumeBrackets, isDesktop, tpmReadings, setTpmReadings, dateFrom, setDateFrom, dateTo, setDateTo, allTime, setAllTime, currentUser, theme }) => {
  const [statusFilters, setStatusFilters] = useState([]);
  const [search, setSearch] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [closeTrialModal, setCloseTrialModal] = useState(null);
  const [closeForm, setCloseForm] = useState({ reason: '', soldPrice: '', outcomeDate: new Date().toISOString().split('T')[0], notes: '' });
  const [addReadingModal, setAddReadingModal] = useState(null);
  // readingForm: { date, fryers: { [fryerNum]: { oilAge, litresFilled, tpmValue, setTemperature, actualTemperature, filtered, foodType, notes, notInUse } } }
  const [readingForm, setReadingForm] = useState({ date: new Date().toISOString().split('T')[0], fryers: { 1: { oilAge: '', litresFilled: '0', tpmValue: '', setTemperature: '', actualTemperature: '', filtered: null, foodType: '', notes: '', notInUse: false, staffName: '' } } });
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
    accepted: baseFiltered.filter(v => v.trialStatus === 'accepted').length,
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
          { key: 'accepted', label: 'Awaiting Code', color: '#9a3412', bg: '#ffedd5', activeBg: '#ea580c', activeText: 'white' },
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

        {filtered.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '40px 20px', textAlign: 'center' }}>
            {venues.filter(v => v.trialStatus).length === 0 ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧪</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>No trials yet</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Trials are created from the Venues section when a prospect is added with a trial oil.</div>
              </div>
            ) : (
              <span style={{ color: '#64748b', fontSize: '13px' }}>No trials match your filters</span>
            )}
          </div>
        ) : !isDesktop ? (
          /* Mobile card view */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(venue => {
              const compOil = oilTypes.find(o => o.id === venue.defaultOil);
              const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
              const statusConf = TRIAL_STATUS_CONFIGS[venue.trialStatus] || TRIAL_STATUS_CONFIGS['pending'];
              return (
                <div key={venue.id} onClick={() => setSelectedTrial(venue)} style={{
                  background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${statusConf.accent}`, padding: '10px 12px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {getUserName(venue.bdmId)}{venue.state ? ` · ${venue.state}` : ''}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                      <TrialStatusBadge status={venue.trialStatus} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
                    <OilBadge theme={theme} oil={compOil} competitors={competitors} compact />
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>vs</span>
                    <OilBadge theme={theme} oil={cookersOil} competitors={competitors} compact />
                    {venue.volumeBracket && <VolumePill bracket={venue.volumeBracket} brackets={volumeBrackets} />}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                    {venue.trialStartDate && <span>{formatDate(venue.trialStartDate)}{venue.trialEndDate ? ` — ${formatDate(venue.trialEndDate)}` : ''}</span>}
                    {venue.offeredPricePerLitre && <span style={{ color: '#1a428a', fontWeight: '600' }}>${venue.offeredPricePerLitre.toFixed(2)}/L</span>}
                    {venue.soldPricePerLitre && <span style={{ color: '#065f46', fontWeight: '600' }}>Sold ${venue.soldPricePerLitre.toFixed(2)}/L</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table view */
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
                    {colVis('status') && <FilterableTh colKey="status" label="Status" options={[{value:'pending',label:'Pipeline'},{value:'in-progress',label:'Active'},{value:'completed',label:'Pending'},{value:'accepted',label:'Awaiting'},{value:'won',label:'Successful'},{value:'lost',label:'Unsuccessful'}]} filters={colFilters.filters} setFilter={colFilters.setFilter} style={{ textAlign: 'center' }} />}
                    {colVis('reason') && <FilterableTh colKey="reason" label="Reason" options={trialReasons.filter(r => trials.some(v => v.trialReason === r.key)).map(r => ({value:r.key,label:r.label}))} filters={colFilters.filters} setFilter={colFilters.setFilter} />}
                    <th style={{ width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(venue => {
                    const compOil = oilTypes.find(o => o.id === venue.defaultOil);
                    const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);
                    const comp = compOil?.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;
                    const compTier = compOil ? (COMPETITOR_TIER_COLORS[compOil.tier] || COMPETITOR_TIER_COLORS.standard) : null;
                    const statusConf = TRIAL_STATUS_CONFIGS[venue.trialStatus] || TRIAL_STATUS_CONFIGS['pending'];
                    const reasonObj = venue.trialReason ? trialReasons.find(r => r.key === venue.trialReason) : null;
                    return (
                      <tr key={venue.id} onClick={() => setSelectedTrial(venue)} style={{ cursor: 'pointer', height: '34px' }}>
                        <td style={{ width: '4px', padding: '0', background: statusConf.accent }}></td>
                        <td style={{ fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</td>
                        {colVis('group') && <td style={{ color: '#64748b', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={venue.groupId ? getGroupName(venue.groupId) : 'STREET'}>{venue.groupId ? getGroupName(venue.groupId) : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>STREET</span>}</td>}
                        {colVis('state') && <td><StateBadge theme={theme} state={venue.state} /></td>}
                        {colVis('bdm') && <td style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>{getUserName(venue.bdmId)}</td>}
                        {colVis('volume') && <td style={{ textAlign: "center" }}><VolumePill bracket={venue.volumeBracket} brackets={volumeBrackets} /></td>}
                        {colVis('competitor') && <td style={{ whiteSpace: 'nowrap' }}>{comp ? <CompetitorPill comp={comp} table /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                        {colVis('compOil') && <td style={{ textAlign: 'center', paddingLeft: '4px', paddingRight: '4px' }}>{compOil ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 0', borderRadius: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: compTier.bg, color: compTier.text, border: `1px solid ${compTier.border}`, display: 'inline-block', width: '72px', textAlign: 'center' }}>{compOil.name}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>}
                        {colVis('trialOil') && <td style={{ textAlign: 'center' }}><OilBadge theme={theme} oil={cookersOil} competitors={competitors} compact /></td>}
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
        )}

      {/* Trial Detail Popup — shared modal */}
      {selectedTrial && (
        <TrialDetailModal
          venue={selectedTrial}
          oilTypes={oilTypes}
          competitors={competitors}
          trialReasons={trialReasons}
          readings={tpmReadings}
          onClose={() => setSelectedTrial(null)}
          bdmName={users.find(u => u.id === selectedTrial.bdmId)?.name}
          namName={(() => { const g = selectedTrial.groupId ? groups.find(gr => gr.id === selectedTrial.groupId) : null; return g?.namId ? users.find(u => u.id === g.namId)?.name : null; })()}
        />
      )}

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
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
                  <button disabled={!canSubmit} onClick={async () => {
                    const trialUpdates = {
                      trialStatus: outcome,
                      trialReason: closeForm.reason,
                      outcomeDate: closeForm.outcomeDate,
                      trialNotes: closeForm.notes,
                      ...(isWon ? { soldPricePerLitre: parseFloat(closeForm.soldPrice) } : {}),
                    };
                    rawSetVenues(prev => prev.map(v => v.id === t.id ? { ...v, ...trialUpdates } : v));
                    if (t.trialId) {
                      const dbTrial = unMapTrial({ ...splitTrialFromVenue(t), ...trialUpdates });
                      await supabase.from('trials').update(dbTrial).eq('id', t.trialId);
                    }
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
          return fd.oilAge && fd.tpmValue && fd.setTemperature && fd.actualTemperature
            && fd.filtered !== null && fd.foodType;
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
                    onChange={e => { const val = e.target.value; const fresh = parseInt(val) === 1; setFryer(activeFryerTab, { oilAge: val, ...(fresh ? { filtered: true } : {}) }); }}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box', borderColor: isFreshOil ? '#6ee7b7' : '#e2e8f0',
                      WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                    onFocus={e => e.target.style.borderColor = isFreshOil ? '#10b981' : '#1a428a'}
                    onBlur={e => e.target.style.borderColor = isFreshOil ? '#6ee7b7' : '#e2e8f0'} />
                </div>

                {/* Litres topped up — always shown */}
                <div style={field}>
                  <label style={lbl}>Litres Topped Up</label>
                  <input type="number" step="0.5" min="0" placeholder="0" value={fd.litresFilled ?? '0'}
                    onChange={e => setFryer(activeFryerTab, { litresFilled: e.target.value })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </div>

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

                {/* Staff Name */}
                <div style={field}>
                  <label style={lbl}>Staff Name (optional)</label>
                  <input type="text" placeholder="Name of person recording" value={fd.staffName || ''}
                    onChange={e => setFryer(activeFryerTab, { staffName: e.target.value })}
                    style={{ ...inputStyle, fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
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
                      return {
                        id: `r-${Date.now()}-${n}`,
                        venueId: t.id, trialId: t.trialId || null, fryerNumber: n, readingDate: readingForm.date, takenBy: currentUser?.id || null,
                        notInUse: fdata.notInUse || false,
                        oilAge: fdata.notInUse ? null : parseInt(fdata.oilAge),
                        litresFilled: fdata.notInUse ? 0 : (parseFloat(fdata.litresFilled) || 0),
                        tpmValue: fdata.notInUse ? null : parseFloat(fdata.tpmValue),
                        setTemperature: (!fdata.notInUse && fdata.setTemperature) ? parseFloat(fdata.setTemperature) : null,
                        actualTemperature: (!fdata.notInUse && fdata.actualTemperature) ? parseFloat(fdata.actualTemperature) : null,
                        filtered: fdata.notInUse ? null : fdata.filtered,
                        foodType: fdata.notInUse ? null : fdata.foodType,
                        notes: fdata.notes || '',
                        staffName: fdata.staffName || '',
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

const PERMISSION_CAPABILITIES = [
  { group: 'Data Access', items: [
    { key: 'view_own_venues',     label: 'View own assigned venues' },
    { key: 'view_group_venues',   label: 'View group / linked venues' },
    { key: 'view_state_venues',   label: 'View all venues in state' },
    { key: 'view_national',       label: 'View all data nationally' },
    { key: 'view_system_settings',label: 'View system settings' },
  ]},
  { group: 'Trials', items: [
    { key: 'create_trials',   label: 'Create trials' },
    { key: 'log_readings',    label: 'Log TPM readings' },
    { key: 'end_trials',      label: 'End trials / set outcomes' },
    { key: 'view_pipeline',   label: 'View trial pipeline' },
  ]},
  { group: 'Management', items: [
    { key: 'add_venues',      label: 'Add venues & groups' },
    { key: 'manage_users',    label: 'Manage users' },
    { key: 'manage_competitors', label: 'Manage competitors' },
    { key: 'export_data',     label: 'Export data' },
  ]},
  { group: 'Administration', items: [
    { key: 'edit_permissions', label: 'Edit permissions' },
    { key: 'edit_settings',    label: 'Edit system settings' },
    { key: 'bulk_onboarding',  label: 'Bulk venue onboarding' },
  ]},
];

const ALL_CAPABILITY_KEYS = PERMISSION_CAPABILITIES.flatMap(g => g.items.map(i => i.key));
const ROLES_ORDER = ['bdm', 'nam', 'state_manager', 'mgt', 'admin'];

const DEFAULT_ROLE_CAPABILITIES = {
  bdm:           ['view_own_venues', 'create_trials', 'log_readings', 'end_trials'],
  nam:           ['view_own_venues', 'view_group_venues', 'create_trials', 'log_readings', 'end_trials', 'view_pipeline', 'add_venues', 'export_data'],
  state_manager: ['view_own_venues', 'view_group_venues', 'view_state_venues', 'create_trials', 'log_readings', 'end_trials', 'view_pipeline', 'export_data'],
  mgt:           ['view_own_venues', 'view_group_venues', 'view_state_venues', 'view_national', 'create_trials', 'log_readings', 'end_trials', 'view_pipeline', 'add_venues', 'manage_competitors', 'export_data'],
  admin:         ALL_CAPABILITY_KEYS,
};

const PermissionsAccess = ({ users, systemSettings, setSystemSettings, theme }) => {
  const saved = systemSettings?.permissionsConfig || {};

  const getCapabilities = (role) => saved[role] || DEFAULT_ROLE_CAPABILITIES[role] || [];

  const toggleCapability = async (role, capKey) => {
    const current = [...getCapabilities(role)];
    const idx = current.indexOf(capKey);
    if (idx >= 0) current.splice(idx, 1); else current.push(capKey);
    const next = { ...saved, [role]: current };
    setSystemSettings(prev => ({ ...prev, permissionsConfig: next }));
    const { error } = await supabase.from('system_settings').update({ permissions_config: next }).eq('id', 1);
    if (error) console.error('Failed to save permissions:', error.message);
  };

  const resetRole = async (role) => {
    const next = { ...saved };
    delete next[role];
    setSystemSettings(prev => ({ ...prev, permissionsConfig: next }));
    const { error } = await supabase.from('system_settings').update({ permissions_config: next }).eq('id', 1);
    if (error) console.error('Failed to reset permissions:', error.message);
  };

  const roleCounts = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  const thStyle = { padding: '8px 6px', textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 };
  const tdStyle = { padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };
  const groupRowStyle = { padding: '10px 12px', fontSize: '11px', fontWeight: '700', color: '#1a428a', letterSpacing: '0.3px', textTransform: 'uppercase', background: '#f0f4fa', borderBottom: '1px solid #e2e8f0' };
  const labelTdStyle = { padding: '8px 12px', fontSize: '13px', color: '#1f2937', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

  return (
    <div>
      <SectionHeader icon={Shield} title="Permissions & Access Levels" />

      <div style={{
        background: '#eff6ff', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
        border: '1px solid #bfdbfe', display: 'flex', alignItems: 'flex-start', gap: '10px'
      }}>
        <AlertCircle size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: '1.5' }}>
          Tick or untick capabilities for each role. Changes save automatically. Click a role header to reset it to defaults.
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '12px', minWidth: '200px' }}>Capability</th>
                {ROLES_ORDER.map(role => (
                  <th key={role} style={{ ...thStyle, minWidth: '80px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <RoleBadge theme={theme} role={role} />
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>{roleCounts[role] || 0}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CAPABILITIES.map(group => (
                <React.Fragment key={group.group}>
                  <tr>
                    <td colSpan={ROLES_ORDER.length + 1} style={groupRowStyle}>{group.group}</td>
                  </tr>
                  {group.items.map(item => (
                    <tr key={item.key} style={{ transition: 'background 0.1s' }} onMouseOver={e => e.currentTarget.style.background = '#f8fafc'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
                      <td style={labelTdStyle}>{item.label}</td>
                      {ROLES_ORDER.map(role => {
                        const caps = getCapabilities(role);
                        const checked = caps.includes(item.key);
                        return (
                          <td key={role} style={tdStyle}>
                            <input type="checkbox" checked={checked} onChange={() => toggleCapability(role, item.key)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#1a428a' }} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        {ROLES_ORDER.filter(role => !!saved[role]).map(role => (
          <button key={role} onClick={() => resetRole(role)} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '11px', fontWeight: '600', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RotateCcw size={10} /> Reset <RoleBadge theme={theme} role={role} /> to default
          </button>
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
CUST001,Sample Venue 1,GRP,REP01,VIC,4,100-150
CUST002,Sample Venue 2,GRP,REP01,VIC,6,150-plus
CUST003,Sample Venue 3,,REP02,VIC,2,under-60`;

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
                        ['CUST001', 'Sample Venue 1', 'GRP', 'REP01', 'VIC', '4', '100-150'],
                        ['CUST002', 'Sample Venue 2', 'GRP', 'REP01', 'VIC', '6', '150-plus'],
                        ['CUST003', 'Sample Venue 3', '', 'REP02', 'VIC', '2', 'under-60'],
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

const TrialSettingsConfig = ({ trialReasons, setTrialReasons, volumeBrackets, setVolumeBrackets, systemSettings, setSystemSettings, oilTypeOptions, setOilTypeOptions }) => {
  const [activeTab, setActiveTab] = useState('reasons');
  const [newReason, setNewReason] = useState('');
  const [newReasonType, setNewReasonType] = useState('successful');
  const [newBracket, setNewBracket] = useState({ label: '', color: '#64748b' });
  const [newOilType, setNewOilType] = useState('');

  // ── Theme config — derived from systemSettings, persisted directly ──
  const themeConfig = systemSettings.themeConfig || {};
  const [themeSaved, setThemeSaved] = useState(false);
  const dbSetThemeConfig = useCallback(async (next) => {
    setSystemSettings(prev => ({ ...prev, themeConfig: next }));
    const { error } = await supabase.from('system_settings').update({ theme_config: next }).eq('id', 1);
    if (error) {
      console.error('Failed to save theme config:', error.message);
      return;
    }
    setThemeSaved(true);
    setTimeout(() => setThemeSaved(false), 2000);
  }, [setSystemSettings]);

  // Theme accordion — all categories expanded by default
  const [openCats, setOpenCats] = useState(() => THEME_CATEGORIES.map(c => c.key));
  const toggleCat = (key) => setOpenCats(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

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
    { key: 'targets',  label: 'Performance Targets', icon: TrendingUp, group: 'Trials' },
    { key: 'tpm',      label: 'TPM Thresholds',    icon: AlertCircle, group: 'System' },
    { key: 'fryers',   label: 'Default Fryers',    icon: Settings,    group: 'System' },
    { key: 'reporting',label: 'Reporting',         icon: RefreshCw,   group: 'System' },
    { key: 'theme',    label: 'Theme & Colors',    icon: Palette,     group: 'System' },
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

          {activeTab === 'reasons' && (() => {
            const ReasonTable = ({ title, titleColor, titleBg, type }) => {
              const [newLabel, setNewLabel] = useState('');
              const filtered = [...trialReasons].filter(r => r.type === type).sort((a, b) => a.label.localeCompare(b.label));
              const handleAdd = () => {
                if (!newLabel.trim()) return;
                const key = newLabel.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                setTrialReasons(prev => [...prev, { key, label: newLabel.trim(), type }]);
                setNewLabel('');
              };
              return (
                <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: titleBg, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: titleColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{filtered.length}</span>
                  </div>
                  {filtered.map((r, i) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#1f2937' }}>{r.label}</span>
                      <button onClick={() => removeReason(r.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                        <X size={14} color="#cbd5e1" />
                      </button>
                    </div>
                  ))}
                  <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                    <input style={{ ...inputStyle, flex: 1 }} placeholder="ADD REASON" value={newLabel}
                      onChange={e => setNewLabel(e.target.value.toUpperCase())}
                      onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                    />
                    <button onClick={handleAdd} style={{ padding: '0 14px', background: '#1a428a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                  </div>
                </div>
              );
            };
            return (
              <div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>When a trial outcome is recorded, the BDM selects a reason. Helps track why trials succeed or fail.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  <ReasonTable title="Successful Reasons" titleColor="#065f46" titleBg="#dcfce7" type="successful" />
                  <ReasonTable title="Unsuccessful Reasons" titleColor="#991b1b" titleBg="#fee2e2" type="unsuccessful" />
                </div>
              </div>
            );
          })()}

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

          {activeTab === 'targets' && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>Set performance targets for BDM trial metrics. These are displayed on the BDM dashboard KPI cards.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <FormField label="Target Win Rate (%)">
                  <input type="number" min="0" max="100" step="1" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.targetWinRate ?? 75} onChange={e => setSystemSettings(s => ({ ...s, targetWinRate: parseFloat(e.target.value) || 0 }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
                <FormField label="Target Avg Time to Decision (days)">
                  <input type="number" min="1" max="90" step="1" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.targetAvgTimeToDecision ?? 14} onChange={e => setSystemSettings(s => ({ ...s, targetAvgTimeToDecision: parseInt(e.target.value) || 1 }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
                <FormField label="Target Sold Price / Litre ($)">
                  <input type="number" min="0" step="0.01" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.targetSoldPricePerLitre ?? 2.50} onChange={e => setSystemSettings(s => ({ ...s, targetSoldPricePerLitre: parseFloat(e.target.value) || 0 }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
                <FormField label="Target Trials / Month">
                  <input type="number" min="1" max="100" step="1" style={{ ...inputStyle, textAlign: 'center' }} value={systemSettings.targetTrialsPerMonth ?? 12} onChange={e => setSystemSettings(s => ({ ...s, targetTrialsPerMonth: parseInt(e.target.value) || 1 }))} onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                </FormField>
              </div>
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

          {activeTab === 'theme' && (() => {
            const merged = getThemeColors(themeConfig);
            const updateColor = (catKey, entryKey, prop, value) => {
              const next = { ...themeConfig };
              if (!next[catKey]) next[catKey] = {};
              if (entryKey !== null) {
                if (!next[catKey][entryKey]) next[catKey][entryKey] = {};
                next[catKey][entryKey][prop] = value;
              } else {
                next[catKey][prop] = value;
              }
              dbSetThemeConfig(next);
            };
            const resetEntry = (catKey, entryKey) => {
              const next = { ...themeConfig };
              if (next[catKey]) {
                if (entryKey !== null) { delete next[catKey][entryKey]; if (Object.keys(next[catKey]).length === 0) delete next[catKey]; }
                else delete next[catKey];
              }
              dbSetThemeConfig(next);
            };
            const resetAll = () => dbSetThemeConfig({});
            const isOverridden = (catKey, entryKey) => {
              if (!themeConfig[catKey]) return false;
              if (entryKey !== null) return !!themeConfig[catKey][entryKey];
              return Object.keys(themeConfig[catKey]).length > 0;
            };
            const ColorSwatch = ({ value, onChange, label }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ fontSize: '9px', color: '#94a3b8', width: '38px', textAlign: 'right', fontWeight: '600', textTransform: 'uppercase' }}>{label}</div>
                <input type="color" value={value && value.startsWith('#') ? value : '#000000'} onChange={e => onChange(e.target.value)}
                  style={{ width: '24px', height: '24px', border: '1.5px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', padding: '1px' }} />
                <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
                  style={{ width: '110px', padding: '3px 6px', fontSize: '11px', fontFamily: 'monospace', border: '1.5px solid #e2e8f0', borderRadius: '4px', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#1a428a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
              </div>
            );
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Customise badge and pill colors across the app.</span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: themeSaved ? '#059669' : '#94a3b8', background: themeSaved ? '#d1fae5' : '#f1f5f9', padding: '2px 10px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.3s' }}>
                      <Check size={12} /> {themeSaved ? 'Saved' : 'Auto-saves'}
                    </span>
                  </div>
                  {Object.keys(themeConfig).length > 0 && (
                    <button onClick={resetAll} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: '600', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>
                      <RotateCcw size={12} /> Reset All
                    </button>
                  )}
                </div>
                {THEME_CATEGORIES.map(cat => {
                  const defaults = merged[cat.key];
                  if (!defaults || Array.isArray(defaults)) return null;
                  const entries = cat.flat ? null : Object.entries(defaults);
                  return (
                    <div key={cat.key} style={{ marginBottom: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <div onClick={() => toggleCat(cat.key)} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#1f2937', background: '#fafbfc', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
                        <ChevronDown size={14} style={{ transform: openCats.includes(cat.key) ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{cat.label}</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400' }}>{cat.desc}</span>
                        {themeConfig[cat.key] && Object.keys(themeConfig[cat.key]).length > 0 && (
                          <span style={{ fontSize: '9px', color: '#1a428a', background: '#e8eef6', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>CUSTOMISED</span>
                        )}
                      </div>
                      {openCats.includes(cat.key) && <div style={{ padding: '12px 14px', background: 'white' }}>
                        {cat.flat ? (
                          /* Flat key-value (THEME) */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {Object.entries(defaults).map(([propKey, propVal]) => (
                              <div key={propKey} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', width: '90px' }}>{propKey}</div>
                                <ColorSwatch value={merged[cat.key][propKey]} label="" onChange={v => updateColor(cat.key, null, propKey, v)} />
                                {themeConfig[cat.key]?.[propKey] && (
                                  <button onClick={() => { const next = { ...themeConfig }; delete next[cat.key][propKey]; if (Object.keys(next[cat.key]).length === 0) delete next[cat.key]; dbSetThemeConfig(next); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }} title="Reset to default"><RotateCcw size={12} /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Nested entries (ROLE_COLORS etc.) */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            {entries.map(([entryKey, entryVal]) => (
                              <div key={entryKey} style={{ display: 'grid', gridTemplateColumns: '120px 90px 1fr 28px', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                                {/* Editable label */}
                                <input
                                  type="text"
                                  value={getEntryLabel(themeConfig, cat.key, entryKey)}
                                  onChange={e => {
                                    const next = { ...themeConfig };
                                    if (!next._labels) next._labels = {};
                                    if (!next._labels[cat.key]) next._labels[cat.key] = {};
                                    next._labels[cat.key][entryKey] = e.target.value;
                                    dbSetThemeConfig(next);
                                  }}
                                  style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid transparent', borderRadius: '4px', padding: '2px 4px', background: 'transparent', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                  onFocus={e => e.target.style.borderColor = '#1a428a'}
                                  onBlur={e => e.target.style.borderColor = 'transparent'}
                                />
                                {/* Live preview */}
                                <span style={{
                                  padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  background: entryVal.bg || entryVal.background || 'transparent',
                                  color: entryVal.text || entryVal.color || '#000',
                                  border: entryVal.border ? `1px solid ${entryVal.border}` : 'none',
                                }}>{getEntryLabel(themeConfig, cat.key, entryKey)}</span>
                                {/* Color swatches in fixed grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cat.props.length}, 180px)`, gap: '6px' }}>
                                  {cat.props.map(prop => (
                                    <ColorSwatch key={prop} label={prop} value={merged[cat.key][entryKey]?.[prop] || ''} onChange={v => updateColor(cat.key, entryKey, prop, v)} />
                                  ))}
                                </div>
                                {/* Reset */}
                                {isOverridden(cat.key, entryKey) ? (
                                  <button onClick={() => resetEntry(cat.key, entryKey)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }} title="Reset to default"><RotateCcw size={12} /></button>
                                ) : <div />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
};



// ==================== MAIN ADMIN PANEL ====================
export default function FrysmartAdminPanel({ currentUser, onPreviewVenue }) {
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
    reportFrequency: 'weekly', reminderDays: 7, trialDuration: 7,
    targetWinRate: 75, targetAvgTimeToDecision: 14, targetSoldPricePerLitre: 2.50, targetTrialsPerMonth: 12
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
        { data: trialRows },
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
        supabase.from('trials').select('*'),
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
      // Merge trials into venues so UI continues using venue.trialStatus etc.
      const mappedVenues = (venueRows || []).map(mapVenue);
      const mappedTrials = (trialRows || []).map(mapTrial);
      const mergedVenues = mappedVenues.map(v => {
        const trial = mappedTrials.find(t => t.venueId === v.id);
        return mergeTrialIntoVenue(v, trial);
      });
      setVenues(mergedVenues);
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
        supabase.from('system_settings').update(unMapSystemSettings(next)).eq('id', 1).then(({ error }) => {
          if (error) console.error('Failed to save system settings:', error.message);
        });
        return next;
      });
    } else {
      setSystemSettings(updater);
      supabase.from('system_settings').update(unMapSystemSettings(updater)).eq('id', 1).then(({ error }) => {
        if (error) console.error('Failed to save system settings:', error.message);
      });
    }
  }, []);

  const dbSetOilTypeOptions = useCallback((updater) => {
    if (typeof updater === 'function') {
      setOilTypeOptions(prev => {
        const next = updater(prev);
        supabase.from('system_settings').update({ oil_type_options: next }).eq('id', 1).then(({ error }) => {
          if (error) console.error('Failed to save oil type options:', error.message);
        });
        return next;
      });
    } else {
      setOilTypeOptions(updater);
      supabase.from('system_settings').update({ oil_type_options: updater }).eq('id', 1).then(({ error }) => {
        if (error) console.error('Failed to save oil type options:', error.message);
      });
    }
  }, []);

  // Merged theme from system settings — flows into all badge components
  const theme = getThemeColors(systemSettings.themeConfig);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  // currentView controls which role interface is shown in the role switcher.
  // Values: 'admin' | 'bdm' | 'nam' | 'state_manager' | 'mgt' | 'group' | 'venue'
  // NOTE: 'state_manager' intentionally matches the role key used in user records
  // so the two can be compared directly when role-based views are built out.
  const [currentView, setCurrentView] = useState('admin');

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeSection]);

  const navGroups = [
    { key: 'overview', label: 'Admin Overview', icon: LayoutDashboard },
    { key: 'trials-overview', label: 'Action Items', icon: ClipboardList },
    { key: 'trials', label: 'Trials', icon: AlertTriangle },
    { key: 'trial-analysis', label: 'Trial Analysis', icon: BarChart3 },
    { key: 'management', label: 'Management', icon: Building, children: [
      { key: 'users', label: 'Users', icon: Users },
      { key: 'groups', label: 'Groups', icon: Layers },
      { key: 'venues', label: 'Venues', icon: Building },
      { key: 'onboarding', label: 'Bulk Upload', icon: Copy },
    ]},
    { key: 'configuration', label: 'Configuration', icon: Settings, children: [
      { key: 'permissions', label: 'Permissions', icon: Shield },
      { key: 'competitors', label: 'Competitors', icon: Globe },
      { key: 'settings', label: 'Settings', icon: Settings },
      { key: 'oil-types', label: 'Cookers Oils', icon: Droplets },
    ]},
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'oil-types': return <OilTypeConfig oilTypes={oilTypes} setOilTypes={dbSetOilTypes} competitors={competitors} oilTypeOptions={oilTypeOptions} theme={theme} />;
      case 'competitors': return <CompetitorManagement competitors={competitors} setCompetitors={dbSetCompetitors} oilTypes={oilTypes} setOilTypes={dbSetOilTypes} oilTypeOptions={oilTypeOptions} theme={theme} />;
      case 'trials': return <TrialManagement venues={venues} setVenues={dbSetVenues} rawSetVenues={setVenues} oilTypes={oilTypes} competitors={competitors} users={users} groups={groups} trialReasons={trialReasons} volumeBrackets={volumeBrackets} isDesktop={isDesktop} tpmReadings={tpmReadings} setTpmReadings={dbSetTpmReadings} dateFrom={trialsDateFrom} setDateFrom={setTrialsDateFrom} dateTo={trialsDateTo} setDateTo={setTrialsDateTo} allTime={trialsAllTime} setAllTime={setTrialsAllTime} currentUser={currentUser} theme={theme} />;
      case 'trials-overview': return (() => {
        const allTrials = venues.filter(v => v.status === 'trial-only');
        const todayStr = new Date().toISOString().split('T')[0];

        // Status overview cards data
        const awaitingStart = allTrials.filter(v => v.trialStatus === 'pending');
        const awaitingRecording = allTrials.filter(v => v.trialStatus === 'in-progress' && !tpmReadings.some(r => r.venueId === v.id && r.readingDate === todayStr));
        const awaitingDecision = allTrials.filter(v => v.trialStatus === 'completed');
        const getBdmName = (v) => { const u = users.find(u => u.id === v.bdmId); return u ? u.name : '—'; };

        const OverviewCard = ({ title, icon: Icon, iconColor, items, emptyMsg }) => {
          const [expanded, setExpanded] = React.useState(false);
          const shown = expanded ? items : items.slice(0, 5);
          return (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Icon size={16} color={iconColor} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', flex: 1 }}>{title}</span>
                <span style={{ fontSize: '22px', fontWeight: '800', color: iconColor }}>{items.length}</span>
              </div>
              {items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {shown.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px', minWidth: 0 }}>
                      <span style={{ fontWeight: '600', color: '#1f2937', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                      <StateBadge theme={theme} state={v.state} />
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500', flexShrink: 0 }}>{getBdmName(v)}</span>
                    </div>
                  ))}
                  {items.length > 5 && !expanded && (
                    <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: '#1a428a', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>See all {items.length} →</button>
                  )}
                  {expanded && items.length > 5 && (
                    <button onClick={() => setExpanded(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>Show less</button>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>{emptyMsg}</div>
              )}
            </div>
          );
        };

        return (
          <div style={{ padding: isDesktop ? '0' : '0 4px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px' }}>Action Items</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Actionable trial items at a glance</p>
            </div>

            {/* Status overview cards */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <OverviewCard title="Awaiting Start" icon={Clock} iconColor="#64748b" items={awaitingStart} emptyMsg="No trials awaiting start" />
              <OverviewCard title="Awaiting Recording Today" icon={ClipboardList} iconColor="#1e40af" items={awaitingRecording} emptyMsg="All active trials recorded today" />
              <OverviewCard title="Awaiting Decision" icon={Target} iconColor="#d97706" items={awaitingDecision} emptyMsg="No trials awaiting decision" />
            </div>

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
                      {isDesktop ? (
                        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '6px 2fr 1fr 1fr 1fr 1fr', gap: '12px', padding: '6px 12px', borderBottom: '1.5px solid #e2e8f0', minWidth: '580px' }}>
                            <span />
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px' }}>VENUE</span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>STATE</span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>BDM</span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'center' }}>NAM</span>
                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textAlign: 'right' }}>LAST RECORDING</span>
                          </div>
                          {overdueVenues.slice(0, 8).map((v, i) => {
                            const days = getAgeDays(v.lastTpmDate);
                            const isSevere = days >= 7;
                            const bdm = getOverdueBdm(v);
                            const nam = getOverdueNam(v);
                            return (
                              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '6px 2fr 1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'center', padding: '7px 12px', borderBottom: i < Math.min(overdueVenues.length, 8) - 1 ? '1px solid #f1f5f9' : 'none', minWidth: '580px' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSevere ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                                <span style={{ fontSize: '12px', fontWeight: '500', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                                <div style={{ display: 'flex', justifyContent: 'center' }}><StateBadge theme={theme} state={v.state} /></div>
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
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {overdueVenues.slice(0, 8).map(v => {
                            const days = getAgeDays(v.lastTpmDate);
                            const isSevere = days >= 7;
                            return (
                              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', borderLeft: `3px solid ${isSevere ? '#ef4444' : '#f59e0b'}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                    <StateBadge theme={theme} state={v.state} />
                                  </div>
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: isSevere ? '#ef4444' : '#f59e0b', flexShrink: 0 }}>{days}d ago</div>
                              </div>
                            );
                          })}
                          {overdueVenues.length > 8 && (
                            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '4px 0' }}>+{overdueVenues.length - 8} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })();
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
        // KPIs
        const wonTrials = filtered.filter(v => v.trialStatus === 'won');
        const lostTrials = filtered.filter(v => v.trialStatus === 'lost');
        const closedTrials = [...wonTrials, ...lostTrials];
        const winRate = closedTrials.length > 0 ? Math.round((wonTrials.length / closedTrials.length) * 100) : null;

        // Oil stats — competitor · oil with win/loss
        const compOilDetail = {};
        filtered.forEach(v => {
          if (v.defaultOil) {
            const oil = oilTypes.find(o => o.id === v.defaultOil);
            const oilName = oil ? oil.name : v.defaultOil;
            const comp = oil?.competitorId ? competitors.find(c => c.id === oil.competitorId) : null;
            const compName = comp ? comp.name : 'Unknown';
            const key = `${compName} · ${oilName}`;
            if (!compOilDetail[key]) compOilDetail[key] = { compName, oilName, total: 0, won: 0, lost: 0, other: 0 };
            compOilDetail[key].total += 1;
            if (v.trialStatus === 'won') compOilDetail[key].won += 1;
            else if (v.trialStatus === 'lost') compOilDetail[key].lost += 1;
            else compOilDetail[key].other += 1;
          }
        });
        const topCompOilDetail = Object.entries(compOilDetail).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

        // Top 5 competitors (grouped by competitor, not oil)
        const compDetail = {};
        filtered.forEach(v => {
          if (v.defaultOil) {
            const oil = oilTypes.find(o => o.id === v.defaultOil);
            const comp = oil?.competitorId ? competitors.find(c => c.id === oil.competitorId) : null;
            const compName = comp ? comp.name : 'Unknown';
            if (!compDetail[compName]) compDetail[compName] = { total: 0, won: 0, lost: 0 };
            compDetail[compName].total += 1;
            if (v.trialStatus === 'won') compDetail[compName].won += 1;
            else if (v.trialStatus === 'lost') compDetail[compName].lost += 1;
          }
        });
        const topCompetitorData = Object.entries(compDetail).sort((a, b) => b[1].total - a[1].total).slice(0, 5);

        // BDM avg days to decision (trialEndDate → outcomeDate)
        const bdmDecisionMap = {};
        filtered.filter(v => (v.trialStatus === 'won' || v.trialStatus === 'lost') && v.trialEndDate && v.outcomeDate).forEach(v => {
          const name = v.bdmId ? getUN(v.bdmId) : 'Unassigned';
          if (!bdmDecisionMap[name]) bdmDecisionMap[name] = [];
          const days = Math.round((new Date(v.outcomeDate) - new Date(v.trialEndDate)) / 86400000);
          if (days >= 0) bdmDecisionMap[name].push(days);
        });
        const bdmDecisionEntries = Object.entries(bdmDecisionMap)
          .filter(([, days]) => days.length > 0)
          .map(([name, days]) => ({ name, avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length), count: days.length }))
          .sort((a, b) => a.avg - b.avg);
        // Pick top 2 fastest, median, bottom 2 slowest (5 total, deduped)
        const bdmDecisionDisplay = (() => {
          if (bdmDecisionEntries.length <= 5) return bdmDecisionEntries.map((e, i) => ({ ...e, rank: i }));
          const top2 = bdmDecisionEntries.slice(0, 2);
          const medIdx = Math.floor(bdmDecisionEntries.length / 2);
          const median = bdmDecisionEntries[medIdx];
          const bot2 = bdmDecisionEntries.slice(-2);
          const seen = new Set();
          const result = [];
          [...top2, median, ...bot2].forEach(e => {
            if (!seen.has(e.name)) { seen.add(e.name); result.push(e); }
          });
          return result;
        })();

        // BDM avg days waiting for cust code (accepted trials: outcomeDate → today)
        const bdmCustCodeMap = {};
        const todayDate = new Date();
        filtered.filter(v => v.trialStatus === 'accepted' && v.outcomeDate).forEach(v => {
          const name = v.bdmId ? getUN(v.bdmId) : 'Unassigned';
          if (!bdmCustCodeMap[name]) bdmCustCodeMap[name] = [];
          const days = Math.round((todayDate - new Date(v.outcomeDate + 'T00:00:00')) / 86400000);
          if (days >= 0) bdmCustCodeMap[name].push(days);
        });
        const bdmCustCodeEntries = Object.entries(bdmCustCodeMap)
          .filter(([, days]) => days.length > 0)
          .map(([name, days]) => ({ name, avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length), count: days.length }))
          .sort((a, b) => a.avg - b.avg);
        const bdmCustCodeDisplay = (() => {
          if (bdmCustCodeEntries.length <= 5) return bdmCustCodeEntries;
          const top2 = bdmCustCodeEntries.slice(0, 2);
          const medIdx = Math.floor(bdmCustCodeEntries.length / 2);
          const median = bdmCustCodeEntries[medIdx];
          const bot2 = bdmCustCodeEntries.slice(-2);
          const seen = new Set();
          const result = [];
          [...top2, median, ...bot2].forEach(e => {
            if (!seen.has(e.name)) { seen.add(e.name); result.push(e); }
          });
          return result;
        })();

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

        // Avg days waiting for customer code (accepted trials: outcomeDate → today)
        const avgCustCodeDays = (() => {
          const today = new Date();
          const waiting = filtered.filter(v => v.trialStatus === 'accepted' && v.outcomeDate);
          const days = waiting.map(v => Math.round((today - new Date(v.outcomeDate + 'T00:00:00')) / 86400000));
          return days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
        })();

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
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr 1fr 0.6fr 0.6fr' : 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
              {[
                { label: 'Win Rate', icon: Target, iconColor: '#1a428a', value: winRate !== null ? `${winRate}%` : '—', delta: deltaWinRate, deltaSuffix: '%' },
                { label: 'Successful', icon: Trophy, iconColor: '#10b981', value: wonTrials.length, delta: deltaWon },
                { label: 'Unsuccessful', icon: AlertTriangle, iconColor: '#ef4444', value: lostTrials.length, delta: deltaLost, invert: true },
                { label: 'Avg Decision', icon: Clock, iconColor: '#64748b', value: avgDecision !== null ? `${avgDecision}d` : '—', delta: deltaDec, deltaSuffix: 'd' },
                { label: 'Avg to Cust Code', icon: CheckCircle, iconColor: '#059669', value: avgCustCodeDays !== null ? `${avgCustCodeDays}d` : '—' },
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
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <Trophy size={14} color="#10b981" />
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937' }}>Top Successful Reasons</span>
                </div>
                {wonReasonData.length > 0 ? (
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
                ) : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
              </div>
            </div>

            {/* ── Row 2b: Top 5 Oils + Top 5 Competitors + BDM Decision Days + BDM Cust Code Days ── */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr 1fr 1fr' : '1fr', gap: '8px', marginBottom: '10px' }}>
              {/* Top 5 Oils Trialled Against */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Top 5 Oils Trialled Against</div>
                {topCompOilDetail.length > 0 ? (() => {
                  const maxWon = Math.max(...topCompOilDetail.map(([, d]) => d.won), 1);
                  const maxLost = Math.max(...topCompOilDetail.map(([, d]) => d.lost), 1);
                  const maxTotal = Math.max(...topCompOilDetail.map(([, d]) => d.won + d.lost), 1);
                  return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 6px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Competitor</th>
                        <th style={{ textAlign: 'left', padding: '6px 6px', fontSize: '10px', fontWeight: '700', color: '#64748b', borderBottom: '2px solid #e2e8f0' }}>Oil</th>
                        <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#10b981', borderBottom: '2px solid #e2e8f0' }}>Won</th>
                        <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#ef4444', borderBottom: '2px solid #e2e8f0' }}>Lost</th>
                        <th style={{ textAlign: 'center', padding: '6px 4px', fontSize: '10px', fontWeight: '700', color: '#7c3aed', borderBottom: '2px solid #e2e8f0' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCompOilDetail.map(([key, d]) => {
                        const total = d.won + d.lost;
                        const wonOp = d.won ? Math.max(0.1, (d.won / maxWon) * 0.4) : 0;
                        const lostOp = d.lost ? Math.max(0.08, (d.lost / maxLost) * 0.35) : 0;
                        const totalOp = Math.max(0.1, (total / maxTotal) * 0.35);
                        return (
                        <tr key={key}>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }} title={d.compName}><span style={{ fontSize: '10px', fontWeight: '700', color: '#e53e3e', background: 'rgba(229,62,62,0.08)', padding: '2px 8px', borderRadius: '20px' }}>{d.compName}</span></td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }} title={d.oilName}><span style={{ fontSize: '10px', fontWeight: '600', color: '#1f2937' }}>{d.oilName}</span></td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.won ? <span style={{ fontSize: '11px', fontWeight: '700', color: '#065f46', background: `rgba(16, 185, 129, ${wonOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{d.won}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>{d.lost ? <span style={{ fontSize: '11px', fontWeight: '700', color: '#991b1b', background: `rgba(239, 68, 68, ${lostOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{d.lost}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontSize: '11px', fontWeight: '700', color: '#6d28d9', background: `rgba(139, 92, 246, ${totalOp})`, padding: '2px 8px', borderRadius: '20px', display: 'inline-block', minWidth: '26px' }}>{total}</span></td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  );
                })() : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
              </div>
              {/* Top 5 Competitors Trialled Against */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Top 5 Competitors Trialled Against</div>
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
              {/* Avg Days to Decision — BDMs */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Avg Days to Decision</div>
                {bdmDecisionDisplay.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bdmDecisionDisplay.map((entry, idx) => {
                      const isFastest = bdmDecisionEntries.indexOf(entry) < 2;
                      const isSlowest = bdmDecisionEntries.indexOf(entry) >= bdmDecisionEntries.length - 2;
                      const color = isFastest ? '#059669' : isSlowest ? '#dc2626' : '#ca8a04';
                      const bg = isFastest ? 'rgba(5,150,105,0.08)' : isSlowest ? 'rgba(220,38,38,0.08)' : 'rgba(202,138,4,0.08)';
                      const label = isFastest ? 'Fastest' : isSlowest ? 'Slowest' : 'Median';
                      return (
                        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', background: bg, borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span style={{ fontSize: '8px', fontWeight: '700', color, textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '800', color, flexShrink: 0 }}>{entry.avg}d</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
              </div>
              {/* Avg Days to Cust Code — BDMs */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', marginBottom: '14px' }}>Avg Days to Cust Code</div>
                {bdmCustCodeDisplay.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bdmCustCodeDisplay.map((entry, idx) => {
                      const isFastest = bdmCustCodeEntries.indexOf(entry) < 2;
                      const isSlowest = bdmCustCodeEntries.indexOf(entry) >= bdmCustCodeEntries.length - 2;
                      const color = isFastest ? '#059669' : isSlowest ? '#dc2626' : '#ca8a04';
                      const bg = isFastest ? 'rgba(5,150,105,0.08)' : isSlowest ? 'rgba(220,38,38,0.08)' : 'rgba(202,138,4,0.08)';
                      const label = isFastest ? 'Fastest' : isSlowest ? 'Slowest' : 'Median';
                      return (
                        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 10px', background: bg, borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span style={{ fontSize: '8px', fontWeight: '700', color, textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '800', color, flexShrink: 0 }}>{entry.avg}d</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No data yet</div>}
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
                {isDesktop ? (
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
                ) : (
                  <select value={analysisView} onChange={e => setAnalysisView(e.target.value)} style={{
                    padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                    background: '#1a428a', color: 'white', border: 'none', cursor: 'pointer',
                    appearance: 'auto',
                  }}>
                    {analysisViews.map(av => (
                      <option key={av.key} value={av.key}>{av.label}</option>
                    ))}
                  </select>
                )}
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
      case 'venues': return <VenueManagement venues={venues} setVenues={dbSetVenues} rawSetVenues={setVenues} oilTypes={oilTypes} groups={groups} competitors={competitors} users={users} setUsers={dbSetUsers} rawSetUsers={setUsers} setActiveSection={setActiveSection} isDesktop={isDesktop} autoOpenForm={quickActionForm === 'venues'} clearAutoOpen={() => setQuickActionForm(null)} onPreviewVenue={onPreviewVenue} theme={theme} />;
      case 'groups': return <GroupManagement groups={groups} setGroups={dbSetGroups} rawSetGroups={setGroups} venues={venues} setVenues={dbSetVenues} users={users} setUsers={dbSetUsers} rawSetUsers={setUsers} oilTypes={oilTypes} competitors={competitors} autoOpenForm={quickActionForm === 'groups'} clearAutoOpen={() => setQuickActionForm(null)} theme={theme} />;
      case 'users': return <UserManagement users={users} setUsers={dbSetUsers} rawSetUsers={setUsers} venues={venues} groups={groups} currentUser={currentUser} autoOpenForm={quickActionForm === 'users'} clearAutoOpen={() => setQuickActionForm(null)} isDesktop={isDesktop} theme={theme} />;
      case 'permissions': return <PermissionsAccess users={users} systemSettings={systemSettings} setSystemSettings={dbSetSystemSettings} theme={theme} />;
      case 'onboarding': return <OnboardingFlow oilTypes={oilTypes} venues={venues} groups={groups} users={users} setVenues={dbSetVenues} setGroups={dbSetGroups} setUsers={dbSetUsers} defaultFryerCount={systemSettings.defaultFryerCount} />;
      case 'settings': return <TrialSettingsConfig trialReasons={trialReasons} setTrialReasons={dbSetTrialReasons} volumeBrackets={volumeBrackets} setVolumeBrackets={dbSetVolumeBrackets} systemSettings={systemSettings} setSystemSettings={dbSetSystemSettings} oilTypeOptions={oilTypeOptions} setOilTypeOptions={dbSetOilTypeOptions} />;
      default: return (
        <div>
          <SectionHeader icon={BarChart3} title="Admin Overview" />

          {/* Empty system banner */}
          {dataLoaded && venues.length === 0 && users.length === 0 && (
            <div style={{ background: 'linear-gradient(135deg, #e8eef6 0%, #f0f4ff 100%)', borderRadius: '14px', padding: '20px', marginBottom: '16px', border: '1px solid #c7d7f0', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '36px' }}>🚀</div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a428a', marginBottom: '4px' }}>Welcome to Frysmart Admin</div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>The system is empty. Start by adding venues and users from the sidebar.</div>
              </div>
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
              <div className="breakdown-grid-4" style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '10px' }}>
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
                <div className="breakdown-grid-4" style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '20px' }}>
                  <BreakdownCard title="Calendars by State" icon={Building} iconColor="#10b981" data={calByState} badgeBg="#d1fae5" badgeText="#065f46" />
                  <BreakdownCard title="Trials by State" icon={AlertTriangle} iconColor="#f59e0b" data={trialByState} badgeBg="#fef3c7" badgeText="#92400e" />
                  <BreakdownCard title="Trials by Competitor" icon={Globe} iconColor="#dc2626" data={trialByComp} badgeBg="#fee2e2" badgeText="#991b1b" />
                  <BreakdownCard title="Trials by BDM" icon={Users} iconColor="#f59e0b" data={trialByBdm} badgeBg="#fef3c7" badgeText="#92400e" />
                </div>
              </>
            );
          })()}

        </div>
      );
    }
  };

  return (
    <div style={{
      ...(isDesktop
        ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : { minHeight: '100vh' }),
      background: '#f8fafc',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }}>
      <style>{hideScrollbarCSS}</style>

      {/* Frysmart header bar */}
      <div style={{ ...(isDesktop ? { flexShrink: 0 } : {}), zIndex: 100, background: '#1a428a', padding: isDesktop ? '6px 16px' : '0 0 0 0' }}>
        {isDesktop ? (
          /* Desktop: single row — logo + badge left, name right */
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/images/App header.png" alt="Frysmart with Cookers" style={{ height: '65px' }} />
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                background: HEADER_BADGE_COLORS.admin.bg, color: HEADER_BADGE_COLORS.admin.color, border: `1px solid ${HEADER_BADGE_COLORS.admin.border}`,
                letterSpacing: '0.5px'
              }}>ADMIN</span>
            </div>
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
          </div>
        ) : (
          /* Mobile: two rows — logo on top, badge + name + hamburger below */
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '-4px' }}>
              <img src="/images/App header.png" alt="Frysmart with Cookers" style={{ height: '62px', maxWidth: 'calc(100vw - 16px)', objectFit: 'contain', objectPosition: 'left' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '16px', paddingRight: '12px', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                  background: HEADER_BADGE_COLORS.admin.bg, color: HEADER_BADGE_COLORS.admin.color, border: `1px solid ${HEADER_BADGE_COLORS.admin.border}`,
                  letterSpacing: '0.5px'
                }}>ADMIN</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{currentUser?.name || ''}</span>
              </div>
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
            </div>
          </div>
        )}
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
        <div style={{ display: 'flex', flex: 1, minHeight: 0, maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {/* Persistent sidebar */}
          <div style={{
            width: '240px', flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0',
            padding: '20px 12px', overflowY: 'auto',
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
            {/* Switch Role — hidden for now, not yet functional */}

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
          {/* Main content — scrollable */}
          <div style={{ flex: 1, padding: '24px clamp(16px, 2vw, 32px)', minWidth: 0, overflowY: 'auto' }}>
            {renderContent()}
          </div>
        </div>
      ) : (
        /* =================== MOBILE LAYOUT =================== */
        <>
          {/* Sticky tab bars */}
          <div style={{ position: 'sticky', top: 0, zIndex: 90, transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden' }}>
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
              {/* Switch Role (mobile) — hidden for now, not yet functional */}
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
