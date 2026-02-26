import { useState, useEffect, useMemo } from 'react';
import {
  X, CheckCircle2, Edit3, ChevronRight, Filter, Star, MessageSquare,
} from 'lucide-react';
import {
  TRIAL_STATUS_COLORS,
} from '../lib/badgeConfig';
import { TrialStatusBadge, OilBadge, StateBadge, VolumePill, CompetitorPill, VOLUME_BRACKETS } from './badges';
import { CustomerCodeInput } from './CustomerCodeInput';

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  padding: '20px',
};

const displayDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
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

export const TrialDetailModal = ({ venue, oilTypes, competitors, trialReasons, readings, onClose, onSaveCustomerCode, onManage, bdmName, namName, renderActions }) => {
  const statusConfig = TRIAL_STATUS_COLORS[venue.trialStatus] || TRIAL_STATUS_COLORS['pending'];
  const compOil = oilTypes.find(o => o.id === venue.defaultOil);
  const cookersOil = oilTypes.find(o => o.id === venue.trialOilId);

  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [selectedCell, setSelectedCell] = useState(null);

  // Pricing & savings
  const liveTrialAvg = calcTrialWeeklyAvg(venue.id, venue.trialStartDate, readings, venue.trialEndDate);
  const preTrialAvg = venue.currentWeeklyAvg;
  const weekLitres = preTrialAvg && liveTrialAvg ? Math.round((preTrialAvg - liveTrialAvg) * 10) / 10 : null;
  const annualLitres = weekLitres !== null ? Math.round(weekLitres * 52) : null;
  const trialPrice = venue.offeredPricePerLitre || venue.currentPricePerLitre;
  const currentPrice = venue.currentPricePerLitre;
  const weekSpend = weekLitres !== null && currentPrice && trialPrice ? Math.round((preTrialAvg * currentPrice - liveTrialAvg * trialPrice) * 100) / 100 : null;
  const annualSpend = weekSpend !== null ? Math.round(weekSpend * 52) : null;

  // TPM Readings
  const venueReadings = readings.filter(r => r.venueId === venue.id);
  const fryerCount = venue.fryerCount || 1;
  const comp = compOil && compOil.competitorId ? competitors.find(c => c.id === compOil.competitorId) : null;

  // Build calendar data for the right panel (desktop)
  const calendarData = useMemo(() => {
    if (!venue.trialStartDate || venue.trialStatus === 'pending') return { days: [], readingsByDate: {}, hasData: false };
    const start = new Date(venue.trialStartDate + 'T00:00:00');
    const end = venue.trialEndDate ? new Date(venue.trialEndDate + 'T00:00:00') : new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cap = venue.trialEndDate ? end : today;
    const days = [];
    const d = new Date(start);
    while (d <= cap) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const readingsByDate = {};
    venueReadings.forEach(r => {
      if (r.readingDate >= (venue.trialStartDate || '')) {
        if (!readingsByDate[r.readingDate]) readingsByDate[r.readingDate] = [];
        readingsByDate[r.readingDate].push(r);
      }
    });
    return { days, readingsByDate, hasData: days.length > 0 };
  }, [venueReadings, venue.trialStartDate, venue.trialEndDate, venue.trialStatus]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: isDesktop && calendarData.hasData ? '95vw' : '600px', maxHeight: '94vh', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', display: isDesktop && calendarData.hasData ? 'flex' : 'block' }} onClick={e => e.stopPropagation()}>

      {/* Left column — existing content */}
      <div style={isDesktop && calendarData.hasData ? { flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: '94vh' } : {}}>

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
            {/* BDM/NAM names for admin view */}
            {(bdmName || namName) && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                {bdmName && <span><span style={{ fontWeight: '600' }}>BDM:</span> {bdmName}</span>}
                {namName && <span><span style={{ fontWeight: '600' }}>NAM:</span> {namName}</span>}
              </div>
            )}
          </div>
          {!(isDesktop && calendarData.hasData) && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, marginLeft: '8px' }}>
              <X size={18} color="#94a3b8" />
            </button>
          )}
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
              (venue.customerCode && !venue.customerCode.startsWith('PRS-')) ? { label: 'Customer Code', value: venue.customerCode } : null,
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
          )}

          {/* TPM Readings Calendar — compact version for mobile only */}
          {!isDesktop && venue.trialStartDate && venue.trialStatus !== 'pending' && (() => {
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
                  {venue.trialStatus === 'lost' ? 'Unsuccessful' : venue.trialStatus === 'accepted' ? 'Accepted' : 'Successful'}
                </span>
                {venue.outcomeDate && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{displayDate(venue.outcomeDate)}</span></>}
                {venue.trialReason && <><span style={{ color: '#cbd5e1' }}>·</span><span style={{ fontSize: '12px', color: '#64748b' }}>{trialReasons.find(r => r.key === venue.trialReason)?.label || venue.trialReason}</span></>}
              </div>
              {(venue.trialStatus === 'won' || venue.trialStatus === 'accepted') && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                  {cookersOil && <OilBadge oil={cookersOil} competitors={competitors} compact />}
                  {venue.soldPricePerLitre && <span style={{ fontSize: '12px', color: '#1f2937', fontWeight: '400' }}>@ ${parseFloat(venue.soldPricePerLitre).toFixed(2)}/L</span>}
                </div>
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
          {venue.trialStatus === 'accepted' && onSaveCustomerCode && (
            <CustomerCodeInput venueId={venue.id} onSave={onSaveCustomerCode} />
          )}

          {/* Admin action buttons (if provided) */}
          {renderActions && (
            <div style={{ marginBottom: '12px' }}>
              {renderActions(venue)}
            </div>
          )}

          {/* Notes Timeline — mobile version */}
          {!isDesktop && (() => {
            const notes = [];
            if (venue.trialNotes) {
              venue.trialNotes.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                const tagMatch = trimmed.match(/^\[(Won|Lost)\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)/);
                if (tagMatch) {
                  notes.push({ date: tagMatch[2], type: tagMatch[1] === 'Won' ? 'outcome-won' : 'outcome-lost', text: tagMatch[3] || `Marked as ${tagMatch[1]}` });
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
            const typeConfig = {
              creation: { label: 'Trial Created', color: '#1a428a', bg: 'rgba(26,66,138,0.06)' },
              reading: { label: 'Recording Note', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
              'outcome-won': { label: venue.trialStatus === 'accepted' ? 'Accepted' : 'Successful', color: '#059669', bg: 'rgba(5,150,105,0.06)' },
              'outcome-lost': { label: 'Unsuccessful', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
            };
            if (notes.length === 0) return null;
            return (
              <div style={{ marginBottom: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: '8px' }}>Notes ({notes.length})</div>
                {notes.map((n, i) => {
                  const cfg = typeConfig[n.type] || typeConfig.creation;
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
                })}
              </div>
            );
          })()}

          {/* Manage link — go to full manage screen */}
          {onManage && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', textAlign: 'center' }}>
              <button onClick={() => { onClose(); if (onManage) onManage(venue); }} style={{
                background: 'none', border: 'none', fontSize: '12px', fontWeight: '600', color: '#1a428a',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '6px 12px',
              }}>
                <Edit3 size={13} /> Manage Trial <ChevronRight size={14} />
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Right column — trial calendar (desktop only) — all fryers shown on separate rows */}
      {isDesktop && calendarData.hasData && (() => {
        const { days, readingsByDate } = calendarData;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const allReadings = Object.values(readingsByDate).flat();
        const totalReadings = allReadings.length;
        const fryerList = Array.from({ length: fryerCount }, (_, i) => i + 1);

        const tpmVals = allReadings.filter(r => r.tpmValue != null).map(r => r.tpmValue);
        const oilAgeVals = allReadings.filter(r => r.oilAge != null && r.oilAge > 0).map(r => r.oilAge);
        const setTempVals = allReadings.filter(r => r.setTemperature != null).map(r => r.setTemperature);
        const actTempVals = allReadings.filter(r => r.actualTemperature != null).map(r => r.actualTemperature);
        const tempVariances = allReadings.filter(r => r.setTemperature != null && r.actualTemperature != null).map(r => Math.abs(r.actualTemperature - r.setTemperature));
        const litreVals = allReadings.filter(r => r.litresFilled > 0).map(r => r.litresFilled);

        const avg = (arr) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        const trialStats = [
          { label: 'Avg Oil Days', value: avg(oilAgeVals) != null ? avg(oilAgeVals).toFixed(1) : '—', suffix: 'd' },
          { label: 'Avg TPM', value: avg(tpmVals) != null ? avg(tpmVals).toFixed(1) : '—', color: avg(tpmVals) != null ? (avg(tpmVals) <= 14 ? '#059669' : avg(tpmVals) <= 18 ? '#d97706' : '#dc2626') : '#94a3b8' },
          { label: 'Min TPM', value: tpmVals.length > 0 ? Math.min(...tpmVals) : '—', color: tpmVals.length > 0 ? (Math.min(...tpmVals) <= 14 ? '#059669' : Math.min(...tpmVals) <= 18 ? '#d97706' : '#dc2626') : '#94a3b8' },
          { label: 'Max TPM', value: tpmVals.length > 0 ? Math.max(...tpmVals) : '—', color: tpmVals.length > 0 ? (Math.max(...tpmVals) <= 14 ? '#059669' : Math.max(...tpmVals) <= 18 ? '#d97706' : '#dc2626') : '#94a3b8' },
          { label: 'Avg Set Temp', value: avg(setTempVals) != null ? `${Math.round(avg(setTempVals))}°` : '—' },
          { label: 'Avg Act. Temp', value: avg(actTempVals) != null ? `${Math.round(avg(actTempVals))}°` : '—' },
          { label: 'Avg Temp Var.', value: avg(tempVariances) != null ? `±${avg(tempVariances).toFixed(1)}°` : '—', color: avg(tempVariances) != null ? (avg(tempVariances) <= 3 ? '#059669' : avg(tempVariances) <= 6 ? '#d97706' : '#dc2626') : '#94a3b8' },
          { label: 'Total Litres', value: litreVals.length > 0 ? Math.round(litreVals.reduce((a, b) => a + b, 0)) + 'L' : '—' },
        ];
        const dayCount = days.length;
        const cellMinW = 58;
        const gridMinW = dayCount > 7 ? dayCount * (cellMinW + 2) : undefined;

        const renderFryerCalendar = (fryerNum) => (
          <div key={fryerNum} style={{ marginBottom: fryerNum < fryerCount ? '12px' : '0' }}>
            {fryerCount > 1 && (
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#1a428a', padding: '0 4px 4px', letterSpacing: '0.3px' }}>Fryer {fryerNum}</div>
            )}
              <div style={{ minWidth: gridMinW ? `${gridMinW}px` : undefined }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dayCount}, 1fr)`, gap: '2px', marginBottom: '1px' }}>
                  {days.map((day, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '8px', fontWeight: '600', color: '#94a3b8', padding: '1px 0', minWidth: `${cellMinW}px` }}>
                      {day.toLocaleDateString('en-AU', { weekday: 'narrow' })}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dayCount}, 1fr)`, gap: '2px' }}>
                  {days.map((day, idx) => {
                    const dateStr = day.toISOString().split('T')[0];
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
                    const canClick = !isFuture && recs.length > 0;
                    const isSelected = selectedCell && selectedCell.dateStr === dateStr && selectedCell.fryerNum === fryerNum;
                    return (
                      <div key={idx} onClick={() => canClick && setSelectedCell(isSelected ? null : { dateStr, fryerNum, recs })} style={{
                        background: cellBg, borderRadius: '5px', padding: '2px 1px', minHeight: '72px', minWidth: `${cellMinW}px`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative',
                        border: isSelected ? '2px solid #1a428a' : isToday ? '2px solid #1a428a' : '1px solid #e2e8f0',
                        opacity: isFuture ? 0.4 : 1, cursor: canClick ? 'pointer' : 'default',
                      }}>
                        <div style={{ fontSize: '9px', fontWeight: '700', color: '#1f2937', marginBottom: '1px' }}>{day.getDate()}</div>
                        {latest ? (
                          <>
                            <div style={{ fontSize: 'clamp(12px, 3vw, 16px)', fontWeight: '700', color: tpmColor, lineHeight: '1.1', marginBottom: '1px' }}>{latest.tpmValue}</div>
                            <div style={{ fontSize: '9px', fontWeight: '600', color: hasFresh ? '#059669' : '#64748b' }}>
                              {hasFresh ? 'Fresh' : `${latest.oilAge}d`}
                            </div>
                            <div style={{ fontSize: '8px', color: '#64748b', lineHeight: '1.2', textAlign: 'center' }}>
                              {latest.setTemperature && <span>S:{latest.setTemperature}° </span>}
                              {latest.actualTemperature && <span>A:{latest.actualTemperature}°</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1px' }}>
                              {hasFiltered && <Filter size={8} color="#1e40af" strokeWidth={2.5} />}
                              {hasFresh && <Star size={8} color="#92400e" fill="#92400e" />}
                              {hasNotes && <MessageSquare size={8} color="#475569" strokeWidth={2.5} />}
                            </div>
                            {latest.litresFilled > 0 && (
                              <div style={{ fontSize: '7px', color: '#1f2937', fontWeight: '600', marginTop: '1px' }}>{latest.litresFilled}L</div>
                            )}
                          </>
                        ) : !isFuture ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '9px', color: '#dc2626', fontWeight: '600' }}>Missed</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
        );

        return (
          <div style={{ flex: 2, minWidth: 0, borderLeft: '1px solid #e2e8f0', overflowY: 'auto', maxHeight: '94vh', background: '#f8fafc' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'white', position: 'sticky', top: 0, zIndex: 2 }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', letterSpacing: '0.3px' }}>Trial Calendar</div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{totalReadings} readings • {days.length} days • {fryerCount} fryer{fryerCount > 1 ? 's' : ''}</div>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {trialStats.map(st => (
                  <div key={st.label} style={{ background: '#f8fafc', borderRadius: '6px', padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: st.color || '#1f2937', lineHeight: 1.2 }}>{st.value}{st.suffix && st.value !== '—' ? st.suffix : ''}</div>
                    <div style={{ fontSize: '7px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.2px', marginTop: '1px' }}>{st.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '8px 6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {fryerList.map(fn => renderFryerCalendar(fn))}
            </div>
            {selectedCell && selectedCell.recs && selectedCell.recs.length > 0 && (() => {
              const r = selectedCell.recs[selectedCell.recs.length - 1];
              const dateObj = new Date(selectedCell.dateStr + 'T00:00:00');
              const dateLabel = dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
              const tpmColor = r.tpmValue <= 14 ? '#059669' : r.tpmValue <= 18 ? '#d97706' : '#dc2626';
              return (
                <div style={{
                  margin: '4px 6px 4px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0',
                  padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#1f2937' }}>
                      {dateLabel} — Fryer {selectedCell.fryerNum}
                    </div>
                    <button onClick={() => setSelectedCell(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                      <X size={14} color="#94a3b8" />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {[
                      { label: 'TPM', value: r.tpmValue ?? '—', color: tpmColor },
                      { label: 'Oil Age', value: r.oilAge ? `${r.oilAge} day${r.oilAge !== 1 ? 's' : ''}` : '—' },
                      { label: 'Filtered', value: r.filtered === true ? 'Yes' : r.filtered === false ? 'No' : '—', color: r.filtered ? '#059669' : undefined },
                      { label: 'Set Temp', value: r.setTemperature ? `${r.setTemperature}°` : '—' },
                      { label: 'Actual Temp', value: r.actualTemperature ? `${r.actualTemperature}°` : '—' },
                      { label: 'Litres', value: r.litresFilled ? `${r.litresFilled}L` : '—' },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: item.color || '#1f2937', lineHeight: 1.2 }}>{item.value}</div>
                        <div style={{ fontSize: '8px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginTop: '1px' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {(r.foodType || r.notes) && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                      {r.foodType && <div style={{ fontSize: '10px', color: '#64748b' }}><span style={{ fontWeight: '600' }}>Food:</span> {r.foodType}</div>}
                      {r.notes && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}><span style={{ fontWeight: '600' }}>Notes:</span> {r.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: '8px', padding: '4px 6px 8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { bg: '#d1fae5', label: 'Recorded' },
                { bg: '#fee2e2', label: 'Missed' },
                { icon: <Filter size={8} color="#1e40af" strokeWidth={2.5} />, label: 'Filtered' },
                { icon: <Star size={8} color="#92400e" fill="#92400e" />, label: 'Fresh Oil' },
                { icon: <MessageSquare size={8} color="#475569" strokeWidth={2.5} />, label: 'Notes' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  {l.bg ? <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.bg }} /> : l.icon}
                  <span style={{ fontSize: '9px', color: '#64748b' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Right column — Notes Timeline */}
      {isDesktop && calendarData.hasData && (() => {
        const notes = [];
        if (venue.trialNotes) {
          const lines = venue.trialNotes.split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const tagMatch = trimmed.match(/^\[(Won|Lost)\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)/);
            if (tagMatch) {
              notes.push({ date: tagMatch[2], type: tagMatch[1] === 'Won' ? 'outcome-won' : 'outcome-lost', text: tagMatch[3] || `Marked as ${tagMatch[1]}` });
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

        const typeConfig = {
          creation: { label: 'Trial Created', color: '#1a428a', bg: 'rgba(26,66,138,0.06)' },
          reading: { label: 'Recording Note', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
          'outcome-won': { label: venue.trialStatus === 'accepted' ? 'Accepted' : 'Successful', color: '#059669', bg: 'rgba(5,150,105,0.06)' },
          'outcome-lost': { label: 'Unsuccessful', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
        };

        return (
          <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #e2e8f0', overflowY: 'auto', maxHeight: '94vh', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'white', position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1f2937', letterSpacing: '0.3px' }}>Notes</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                <X size={16} color="#94a3b8" />
              </button>
            </div>
            <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {notes.length > 0 ? notes.map((n, i) => {
                const cfg = typeConfig[n.type] || typeConfig.creation;
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
                  <MessageSquare size={20} color="#cbd5e1" style={{ marginBottom: '6px' }} />
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>No notes yet</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      </div>
    </div>
  );
};
