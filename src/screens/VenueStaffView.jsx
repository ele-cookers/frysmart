import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Filter, MessageSquare, X, Check, AlertTriangle, AlertCircle, Clock, Star, Settings, LogOut, Eye, ClipboardList, Calendar, BarChart3, LayoutDashboard } from 'lucide-react';
import { HEADER_BADGE_COLORS, OIL_STATUS_COLORS, getThemeColors } from '../lib/badgeConfig';

// ─────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayString = () => formatDate(new Date());

const getTPMStatus = (tpm, warningThreshold = 18, criticalThreshold = 24) => {
  if (tpm == null) return { color: '#94a3b8', text: 'No reading', bg: '#f1f5f9', level: 'none', icon: 'none' };
  if (tpm < warningThreshold) return { color: '#10b981', text: 'Oil quality good', bg: '#d1fae5', level: 'good', icon: 'check' };
  if (tpm < criticalThreshold) return { color: '#f59e0b', text: 'Recommended to change', bg: '#fef3c7', level: 'warning', icon: 'alert' };
  return { color: '#ef4444', text: 'Must change oil', bg: '#fee2e2', level: 'critical', icon: 'x' };
};

// Oil status label based on oil age — colors from badgeConfig (or merged theme)
const getOilStatus = (oilAge, notInUse, colors = OIL_STATUS_COLORS) => {
  if (notInUse) return colors.not_in_operation;
  if (oilAge === 1 || oilAge === '1') return colors.fresh;
  if (oilAge != null && oilAge !== '' && oilAge > 0) return colors.in_use;
  return null;
};

// Food type options — matches admin panel
const FOOD_TYPES = [
  'Chips/Fries',
  'Crumbed Items',
  'Battered Items',
  'Plain Proteins',
  'Pastries/Donuts',
  'High Starch',
  'Mixed Service'
];

// Group a flat array of readings (DB shape) into { [dateString]: [...readings] }
const groupReadingsByDate = (readings) => {
  const grouped = {};
  readings.forEach(r => {
    const dateKey = r.readingDate;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(r);
  });
  return grouped;
};

// Calculate oil age from reading history for a specific fryer
const calcOilAgeDays = (allReadings, fryerNumber, asOfDate) => {
  const sorted = allReadings
    .filter(r => r.fryerNumber === fryerNumber && r.readingDate <= asOfDate && !r.notInUse)
    .sort((a, b) => b.readingDate.localeCompare(a.readingDate));

  const lastFresh = sorted.find(r => r.oilAge === 1);
  if (!lastFresh) return null;

  const diffMs = new Date(asOfDate) - new Date(lastFresh.readingDate);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const getComplianceColor = (date, groupedReadings) => {
  const dateString = formatDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  if (checkDate > today) return { bg: 'white', border: '#e2e8f0' };

  const dayReadings = groupedReadings[dateString] || [];
  if (dayReadings.length > 0) return { bg: '#d1fae5', border: '#10b981' };
  return { bg: '#fee2e2', border: '#ef4444' };
};

// ─────────────────────────────────────────────
// Success Modal
// ─────────────────────────────────────────────
const SuccessModal = ({ onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: '20px'
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '32px',
        textAlign: 'center', maxWidth: '300px', width: '100%',
        animation: 'scaleIn 0.3s ease-out'
      }}>
        <div style={{
          width: '48px', height: '48px', background: '#10b981',
          borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px'
        }}>
          <Check size={24} color="white" strokeWidth={3} />
        </div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
          Reading Saved
        </h3>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Warning Modal
// ─────────────────────────────────────────────
const WarningModal = ({ fryers, onClose }) => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2001, padding: '20px'
  }}>
    <div style={{
      background: 'white', borderRadius: '16px', padding: '24px',
      maxWidth: '360px', width: '100%'
    }}>
      <div style={{
        width: '40px', height: '40px', background: '#fef3c7',
        borderRadius: '50%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 14px'
      }}>
        <AlertTriangle size={22} color="#f59e0b" strokeWidth={2.5} />
      </div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '8px', textAlign: 'center' }}>
        Oil Change Recommended
      </h3>
      <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.6', marginBottom: '20px', textAlign: 'center' }}>
        {fryers.length === 1 ? `Fryer ${fryers[0]}` : `Fryers ${fryers.join(', ')}`} {fryers.length === 1 ? 'has' : 'have'} reached the recommended oil change threshold. Consider changing the oil soon.
      </p>
      <button onClick={onClose} style={{
        width: '100%', padding: '12px', background: '#1a428a', color: 'white',
        border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
      }}>
        Got it
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Critical Oil Change Modal
// ─────────────────────────────────────────────
const CriticalOilChangeModal = ({ criticalFryers, onClose, onSave, currentUser, venueId }) => {
  const [currentFryerIndex, setCurrentFryerIndex] = useState(0);
  const currentFryerNumber = criticalFryers[currentFryerIndex];
  const [critStaffName, setCritStaffName] = useState('');

  const [fryer, setFryer] = useState({
    fryerNumber: currentFryerNumber,
    oilAge: 1,
    litresFilled: '',
    tpmValue: '',
    setTemperature: '',
    actualTemperature: '',
    foodType: 'Chips/Fries',
    filtered: true,
    notes: '',
    notInUse: false
  });

  const [date] = useState(getTodayString());

  useEffect(() => {
    setFryer({
      fryerNumber: criticalFryers[currentFryerIndex],
      oilAge: 1,
      litresFilled: '',
      tpmValue: '',
      setTemperature: '',
      actualTemperature: '',
      foodType: 'Chips/Fries',
      filtered: true,
      notes: '',
      notInUse: false
    });
  }, [currentFryerIndex, criticalFryers]);

  const updateFryer = (field, value) => {
    setFryer(prev => {
      const next = { ...prev, [field]: value };
      // When oil age is set to 1 (fresh oil), auto-set filtered to true
      if (field === 'oilAge' && (value === '1' || value === 1)) {
        next.filtered = true;
      }
      // When oil age changes away from 1, reset filtered so user must choose
      if (field === 'oilAge' && value !== '1' && value !== 1 && value !== '') {
        next.filtered = null;
      }
      return next;
    });
  };

  const handleSkip = () => {
    if (currentFryerIndex < criticalFryers.length - 1) {
      setCurrentFryerIndex(currentFryerIndex + 1);
    } else {
      onClose();
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (fryer.tpmValue) {
      const reading = {
        venueId,
        fryerNumber: fryer.fryerNumber,
        readingDate: date,
        takenBy: (currentUser?.role === 'venue_staff' || currentUser?.role === 'group_viewer') ? null : (currentUser?.id || null),
        staffName: critStaffName || null,
        oilAge: parseInt(fryer.oilAge) || 1,
        litresFilled: fryer.litresFilled ? parseFloat(fryer.litresFilled) : 0,
        tpmValue: parseFloat(fryer.tpmValue),
        setTemperature: fryer.setTemperature ? parseFloat(fryer.setTemperature) : null,
        actualTemperature: fryer.actualTemperature ? parseFloat(fryer.actualTemperature) : null,
        filtered: fryer.filtered,
        foodType: fryer.foodType || null,
        notes: fryer.notes || null,
        notInUse: false,
        isOilChange: true
      };
      onSave([reading]);

      if (currentFryerIndex < criticalFryers.length - 1) {
        setCurrentFryerIndex(currentFryerIndex + 1);
      } else {
        onClose();
      }
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: '16px', maxWidth: '500px',
        width: '100%', maxHeight: '95vh', overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          padding: '16px', borderBottom: '1px solid #e2e8f0',
          position: 'sticky', top: 0, background: 'white', zIndex: 1
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
              Change Oil — Fryer {currentFryerNumber}
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <X size={20} color="#64748b" />
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Fryer {currentFryerIndex + 1} of {criticalFryers.length}
          </div>
        </div>

        <form onSubmit={handleSave} style={{ padding: '16px' }}>
          {/* Staff Name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
              Staff Name
            </label>
            <input type="text" value={critStaffName}
              onChange={(e) => setCritStaffName(e.target.value)}
              placeholder="Enter your name" required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Oil Age */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
              Oil Age (days)
            </label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.oilAge} required
              onChange={(e) => updateFryer('oilAge', e.target.value.replace(/[^0-9]/g, ''))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Litres Filled */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
              Litres Topped Up
            </label>
            <input type="text" inputMode="decimal" value={fryer.litresFilled} required
              onChange={(e) => updateFryer('litresFilled', e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* TPM */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
              TPM Value (%)
            </label>
            <input type="text" inputMode="decimal" value={fryer.tpmValue} required
              onChange={(e) => updateFryer('tpmValue', e.target.value.replace(/[^0-9.]/g, ''))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Temps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Set Temp (°C)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.setTemperature} required
                onChange={(e) => updateFryer('setTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="180"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Actual Temp (°C)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.actualTemperature} required
                onChange={(e) => updateFryer('actualTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="175"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          {/* Filtered */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Did you filter?</label>
            {(fryer.oilAge == 1) ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 12px', borderRadius: '8px',
                border: '1.5px solid #d1fae5', background: '#f0fdf4', color: '#059669',
                fontSize: '12px', fontWeight: '600'
              }}>
                <Check size={14} strokeWidth={3} /> Yes — fresh oil is always filtered
              </div>
            ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              {[{ val: true, label: 'Yes', activeColor: '#10b981', activeBg: '#d1fae5', activeText: '#059669' },
                { val: false, label: 'No', activeColor: '#ef4444', activeBg: '#fee2e2', activeText: '#dc2626' }
              ].map(opt => (
                <label key={String(opt.val)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  padding: '10px', borderRadius: '8px',
                  border: fryer.filtered === opt.val ? `1.5px solid ${opt.activeColor}` : '1.5px solid #e2e8f0',
                  background: fryer.filtered === opt.val ? opt.activeBg : 'white', transition: 'all 0.2s'
                }}>
                  <input type="radio" name="crit-filtered" checked={fryer.filtered === opt.val}
                    onChange={() => updateFryer('filtered', opt.val)} style={{ display: 'none' }} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: fryer.filtered === opt.val ? opt.activeText : '#1f2937' }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
            )}
          </div>

          {/* Food type */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>What are you frying?</label>
            <select value={fryer.foodType} onChange={(e) => updateFryer('foodType', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box', background: 'white' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            >
              {FOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Notes (optional)</label>
            <textarea value={fryer.notes} onChange={(e) => updateFryer('notes', e.target.value)}
              placeholder="Add notes..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={handleSkip} style={{
              flex: 1, padding: '12px', background: 'white', border: '2px solid #e2e8f0',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#64748b', cursor: 'pointer'
            }}>
              Skip
            </button>
            <button type="submit" style={{
              flex: 1, padding: '12px', background: '#1a428a', border: 'none',
              borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: 'white', cursor: 'pointer'
            }}>
              Save & Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Critical Banner
// ─────────────────────────────────────────────
const CriticalBanner = ({ criticalFryers, onChangeOil, isDesktop }) => (
  <div style={{
    background: '#ef4444', color: 'white',
    padding: isDesktop ? '10px 16px 10px 200px' : '10px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap',
  }}>
    <div style={{ flex: '0 1 auto', minWidth: 0 }}>
      <div style={{ fontSize: '14px', fontWeight: '700' }}>
        ⚠️ Oil Must Be Changed — {criticalFryers.length === 1 ? `Fryer ${criticalFryers[0]}` : `Fryers ${criticalFryers.join(', ')}`}
      </div>
    </div>
    <button onClick={onChangeOil} style={{
      background: 'white', color: '#ef4444', border: 'none', borderRadius: '8px',
      padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
      flexShrink: 0
    }}>
      I have changed the oil
    </button>
  </div>
);

// ─────────────────────────────────────────────
// Recording Form — aligned with tpm_readings schema
// ─────────────────────────────────────────────
const RecordingForm = ({ onSave, currentUser, venue, existingReadings = [] }) => {
  const fryerCount = venue?.fryerCount || 4;
  const [staffName, setStaffName] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [formErrors, setFormErrors] = useState({});

  function makeBlankFryer(num) {
    return {
      fryerNumber: num,
      oilAge: '',
      litresFilled: '',
      tpmValue: '',
      setTemperature: '',
      actualTemperature: '',
      foodType: 'Chips/Fries',
      filtered: null,
      notes: '',
      notInUse: false,
      notInUseOtherReason: ''
    };
  }

  const [fryers, setFryers] = useState(
    Array.from({ length: fryerCount }, (_, i) => makeBlankFryer(i + 1))
  );

  const updateFryer = (index, field, value) => {
    const updated = [...fryers];
    updated[index] = { ...updated[index], [field]: value };

    // When oil age is set to 1 (fresh oil), auto-set filtered to true
    if (field === 'oilAge' && (value === '1' || value === 1)) {
      updated[index].filtered = true;
    }
    // When oil age changes away from 1, reset filtered so user must choose
    if (field === 'oilAge' && value !== '1' && value !== 1 && value !== '') {
      updated[index].filtered = null;
    }

    // When marking skipped, clear reading fields
    if (field === 'notInUse' && value === true) {
      updated[index] = {
        ...updated[index],
        notInUse: true,
        tpmValue: '',
        oilAge: '',
        litresFilled: '',
        setTemperature: '',
        actualTemperature: '',
        filtered: null,
        foodType: '',
        notes: '',
        notInUseOtherReason: ''
      };
    }
    // When marking back in operation, clear reason fields
    if (field === 'notInUse' && value === false) {
      updated[index] = {
        ...updated[index],
        notInUse: false,
        notes: '',
        notInUseOtherReason: ''
      };
    }

    setFryers(updated);
    // Clear error for this field
    if (formErrors[`${index}-${field}`]) {
      setFormErrors(prev => { const n = { ...prev }; delete n[`${index}-${field}`]; return n; });
    }
  };

  const validate = () => {
    const errors = {};
    if (!staffName.trim()) errors['staffName'] = 'Required';
    fryers.forEach((f, i) => {
      if (f.notInUse) return; // no validation needed for skipped fryers
      if (f.tpmValue === '') errors[`${i}-tpmValue`] = 'Required';
      if (f.oilAge === '' || f.oilAge === '0' || parseInt(f.oilAge) < 1) errors[`${i}-oilAge`] = 'Min 1';
      if (f.litresFilled === '') errors[`${i}-litresFilled`] = 'Required';
      if (f.setTemperature === '') errors[`${i}-setTemperature`] = 'Required';
      if (f.actualTemperature === '') errors[`${i}-actualTemperature`] = 'Required';
      if (f.filtered === null) errors[`${i}-filtered`] = 'Required';
      if (!f.foodType) errors[`${i}-foodType`] = 'Required';
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const readings = fryers.map(f => ({
      venueId: venue?.id || null,
      fryerNumber: f.fryerNumber,
      readingDate: date,
      takenBy: (currentUser?.role === 'venue_staff' || currentUser?.role === 'group_viewer') ? null : (currentUser?.id || null),
      staffName: staffName.trim(),
      oilAge: f.notInUse ? null : (parseInt(f.oilAge) || null),
      litresFilled: f.notInUse ? null : (f.litresFilled !== '' ? parseFloat(f.litresFilled) : 0),
      tpmValue: f.notInUse ? null : (f.tpmValue !== '' ? parseFloat(f.tpmValue) : null),
      setTemperature: f.notInUse ? null : (f.setTemperature ? parseFloat(f.setTemperature) : null),
      actualTemperature: f.notInUse ? null : (f.actualTemperature ? parseFloat(f.actualTemperature) : null),
      filtered: f.notInUse ? null : f.filtered,
      foodType: f.notInUse ? null : (f.foodType || null),
      notes: f.notInUse ? (f.notes === 'Other' ? (f.notInUseOtherReason || 'Other') : (f.notes || null)) : (f.notes || null),
      notInUse: f.notInUse
    }));

    onSave(readings);

    // Reset form (keep staffName for convenience)
    setFryers(Array.from({ length: fryerCount }, (_, i) => makeBlankFryer(i + 1)));
    setDate(getTodayString());
    setFormErrors({});
  };

  const inputStyle = (hasError) => ({
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: hasError ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0',
    fontSize: '16px', outline: 'none', boxSizing: 'border-box'
  });

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '10px' }}>New Reading</h2>

      <form onSubmit={handleSubmit}>
        {/* Date + user info */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
              Staff Name
            </label>
            <input type="text" value={staffName}
              onChange={(e) => setStaffName(e.target.value)} required
              placeholder="Enter your name"
              style={{ ...inputStyle(!!formErrors['staffName']), }}
              onFocus={(e) => e.target.style.borderColor = '#1a428a'}
              onBlur={(e) => e.target.style.borderColor = formErrors['staffName'] ? '#ef4444' : '#e2e8f0'}
            />
            {formErrors['staffName'] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Staff name is required</div>}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none',
                  boxSizing: 'border-box', background: 'white', color: '#1f2937',
                  fontFamily: 'inherit', fontWeight: '500',
                  WebkitAppearance: 'none', appearance: 'none',
                  lineHeight: '1.4', height: '40px', cursor: 'pointer'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
          </div>
        </div>

        {/* Fryer cards */}
        {fryers.map((fryer, index) => (
          <div key={index} style={{
            background: fryer.notInUse ? '#f1f5f9' : 'white',
            borderRadius: '12px', marginBottom: '12px',
            boxShadow: fryer.notInUse ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
            border: fryer.notInUse ? '1.5px solid #cbd5e1' : '1.5px solid #e2e8f0',
            overflow: 'hidden', transition: 'all 0.2s'
          }}>
            {/* Fryer header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', borderBottom: '1px solid #f1f5f9'
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                Fryer {fryer.fryerNumber}
              </h3>
              {/* Toggle: In operation / Not in operation */}
              <button type="button" onClick={() => updateFryer(index, 'notInUse', !fryer.notInUse)} style={{
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
                  position: 'relative', transition: 'background 0.2s',
                  flexShrink: 0,
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

            {/* Content area */}
            {fryer.notInUse ? (
              <div style={{ padding: '8px 16px 12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Reason</label>
                <select value={fryer.notes || ''} onChange={(e) => updateFryer(index, 'notes', e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', background: 'white', color: '#1f2937',
                    fontFamily: 'inherit', fontWeight: '500',
                    WebkitAppearance: 'none', appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                    paddingRight: '32px', cursor: 'pointer',
                  }}
                >
                  <option value="">Select reason...</option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Not needed today">Not needed today</option>
                  <option value="Out of order">Out of order</option>
                  <option value="Seasonal shutdown">Seasonal shutdown</option>
                  <option value="Other">Other</option>
                </select>
                {fryer.notes === 'Other' && (
                  <textarea value={fryer.notInUseOtherReason || ''} onChange={(e) => updateFryer(index, 'notInUseOtherReason', e.target.value)}
                    rows="1" placeholder="Specify reason..."
                    style={{ width: '100%', marginTop: '8px', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' }}
                  />
                )}
              </div>
            ) : (
            <div style={{ padding: '12px 16px 16px' }}>
              <>
                {/* Oil Age */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Oil Age (days)</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.oilAge}
                    onChange={(e) => updateFryer(index, 'oilAge', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1 = fresh oil today"
                    style={inputStyle(!!formErrors[`${index}-oilAge`])}
                    onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                    onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-oilAge`] ? '#ef4444' : '#e2e8f0'}
                  />
                  {formErrors[`${index}-oilAge`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Oil age is required (min 1 = fresh oil)</div>}
                </div>

                {/* Litres Filled — required, 0 if no top-up */}
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
                      Litres Topped Up
                    </label>
                    <input type="text" inputMode="decimal" value={fryer.litresFilled}
                      onChange={(e) => updateFryer(index, 'litresFilled', e.target.value.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      style={inputStyle(!!formErrors[`${index}-litresFilled`])}
                      onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                      onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-litresFilled`] ? '#ef4444' : '#e2e8f0'}
                    />
                    {formErrors[`${index}-litresFilled`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Litres is required — enter 0 if no oil was added</div>}
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      Enter 0 if no oil was added today
                    </div>
                </div>

                {/* TPM */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>TPM Value (%)</label>
                  <input type="text" inputMode="decimal" value={fryer.tpmValue}
                    onChange={(e) => updateFryer(index, 'tpmValue', e.target.value.replace(/[^0-9.]/g, ''))}
                    style={inputStyle(!!formErrors[`${index}-tpmValue`])}
                    onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                    onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-tpmValue`] ? '#ef4444' : '#e2e8f0'}
                  />
                  {formErrors[`${index}-tpmValue`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>TPM value is required</div>}
                </div>

                {/* Temperatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
                      <span className="temp-label-mobile">Set Temp</span>
                      <span className="temp-label-desktop">Set Temperature</span> (°C)
                    </label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.setTemperature}
                      onChange={(e) => updateFryer(index, 'setTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="180"
                      style={inputStyle(!!formErrors[`${index}-setTemperature`])}
                      onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                      onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-setTemperature`] ? '#ef4444' : '#e2e8f0'}
                    />
                    {formErrors[`${index}-setTemperature`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Required</div>}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
                      <span className="temp-label-mobile">Actual Temp</span>
                      <span className="temp-label-desktop">Actual Temperature</span> (°C)
                    </label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={fryer.actualTemperature}
                      onChange={(e) => updateFryer(index, 'actualTemperature', e.target.value.replace(/[^0-9]/g, ''))} placeholder="175"
                      style={inputStyle(!!formErrors[`${index}-actualTemperature`])}
                      onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                      onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-actualTemperature`] ? '#ef4444' : '#e2e8f0'}
                    />
                    {formErrors[`${index}-actualTemperature`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Required</div>}
                  </div>
                </div>

                {/* Filtered */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>
                    Did you filter?
                  </label>
                  {(fryer.oilAge == 1) ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '10px 12px', borderRadius: '8px',
                      border: '1.5px solid #d1fae5', background: '#f0fdf4', color: '#059669',
                      fontSize: '12px', fontWeight: '600'
                    }}>
                      <Check size={14} strokeWidth={3} /> Yes — fresh oil is always filtered
                    </div>
                  ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[{ val: true, label: 'Yes', activeColor: '#10b981', activeBg: '#d1fae5', activeText: '#059669' },
                      { val: false, label: 'No', activeColor: '#ef4444', activeBg: '#fee2e2', activeText: '#dc2626' }
                    ].map(opt => (
                      <label key={String(opt.val)} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        cursor: 'pointer', padding: '10px', borderRadius: '8px',
                        border: fryer.filtered === opt.val ? `1.5px solid ${opt.activeColor}` : formErrors[`${index}-filtered`] ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0',
                        background: fryer.filtered === opt.val ? opt.activeBg : 'white', transition: 'all 0.2s'
                      }}>
                        <input type="radio" name={`filtered-${index}`}
                          checked={fryer.filtered === opt.val}
                          onChange={() => updateFryer(index, 'filtered', opt.val)}
                          style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: fryer.filtered === opt.val ? opt.activeText : '#1f2937' }}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  )}
                  {formErrors[`${index}-filtered`] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>Please select yes or no</div>}
                </div>

                {/* Food type */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>What are you frying?</label>
                  <select value={fryer.foodType} onChange={(e) => updateFryer(index, 'foodType', e.target.value)} required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1.5px solid ${formErrors[`${index}-foodType`] ? '#ef4444' : '#e2e8f0'}`, fontSize: '16px', outline: 'none', boxSizing: 'border-box', background: 'white' }}
                    onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                    onBlur={(e) => e.target.style.borderColor = formErrors[`${index}-foodType`] ? '#ef4444' : '#e2e8f0'}
                  >
                    {FOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                {/* Notes */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#1f2937', fontSize: '12px', fontWeight: '600' }}>Notes (optional)</label>
                  <textarea value={fryer.notes} onChange={(e) => updateFryer(index, 'notes', e.target.value)}
                    rows="3" placeholder="Any observations..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '16px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                    onFocus={(e) => e.target.style.borderColor = '#1a428a'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              </>
            </div>
            )}
          </div>
        ))}

        {/* Save */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button type="submit" style={{
            padding: '14px', background: '#1a428a', color: 'white', border: 'none',
            borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
          }}>
            Save Reading
          </button>
        </div>
      </form>
    </div>
  );
};

// ─────────────────────────────────────────────
// Recording Card — reads tpm_readings-shaped data
// ─────────────────────────────────────────────
const RecordingCard = ({ recording, allReadings = [], showDate = false, recordingIndex, totalRecordings }) => {
  const [showComment, setShowComment] = useState(false);

  if (recording.notInUse) {
    return (
      <div style={{
        background: '#fffbeb', borderRadius: '12px', padding: '16px',
        borderLeft: '4px solid #f59e0b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        width: '100%', boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>Not in operation</span>
          {totalRecordings > 1 && (
            <div style={{
              background: recordingIndex === totalRecordings - 1 ? '#92400e' : '#64748b',
              color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap'
            }}>
              {recordingIndex === totalRecordings - 1 ? 'Most Recent' : `#${recordingIndex + 1}`}
            </div>
          )}
        </div>
        {recording.notes && (
          <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{recording.notes}</div>
        )}
        {(recording.staffName || recording.takenByName) && (
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '10px' }}>👤</span> {recording.staffName || recording.takenByName}
          </div>
        )}
        {showDate && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
            {new Date(recording.readingDate).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>
    );
  }

  const status = getTPMStatus(recording.tpmValue);
  const oilAge = calcOilAgeDays(allReadings, recording.fryerNumber, recording.readingDate);

  const StatusIcon = () => {
    if (status.icon === 'check') return <Check size={14} color={status.color} strokeWidth={3} />;
    if (status.icon === 'alert') return <AlertCircle size={14} color={status.color} strokeWidth={2.5} />;
    if (status.icon === 'x') return <X size={14} color={status.color} strokeWidth={3} />;
    return null;
  };

  return (
    <>
      <div style={{
        background: 'white', borderRadius: '10px', padding: '14px',
        borderLeft: `3px solid ${status.color}`, boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        width: '100%', boxSizing: 'border-box', position: 'relative'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: '#94a3b8', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TPM</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: status.color, lineHeight: '1' }}>
              {recording.tpmValue}
            </div>
          </div>
          {totalRecordings > 1 && (
            <div style={{
              background: recordingIndex === totalRecordings - 1 ? '#1a428a' : '#64748b',
              color: 'white', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap'
            }}>
              {recordingIndex === totalRecordings - 1 ? 'Most Recent' : `#${recordingIndex + 1}`}
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{
          fontSize: '11px', color: status.color, fontWeight: '600', background: status.bg,
          padding: '4px 10px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '10px'
        }}>
          <StatusIcon /> {status.text}
        </div>

        {/* Info grid — Oil age, Litres, Set temp, Actual temp, Temp variance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px', fontSize: '12px', lineHeight: '1.5' }}>
          {recording.oilAge && (
            <div>
              <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Oil age</div>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '13px' }}>
                {recording.oilAge} {recording.oilAge === 1 ? 'day' : 'days'}
              </div>
              {(() => { const os = getOilStatus(recording.oilAge, recording.notInUse); return os ? (
                <div style={{ fontSize: '10px', fontWeight: '600', color: os.color, marginTop: '2px' }}>{os.label}</div>
              ) : null; })()}
            </div>
          )}

          {recording.litresFilled != null && (
            <div>
              <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Litres added</div>
              <div style={{ fontWeight: '500', color: recording.litresFilled > 0 ? '#1f2937' : '#94a3b8', fontSize: '13px' }}>
                {recording.litresFilled > 0 ? `${recording.litresFilled}L` : '0L — no top-up'}
              </div>
            </div>
          )}

          {recording.setTemperature && (
            <div>
              <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Set temp</div>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '13px' }}>{recording.setTemperature}°C</div>
            </div>
          )}

          {recording.actualTemperature && (
            <div>
              <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Actual temp</div>
              <div style={{ fontWeight: '500', color: '#1f2937', fontSize: '13px' }}>{recording.actualTemperature}°C</div>
            </div>
          )}

          {recording.setTemperature && recording.actualTemperature && (
            <div>
              <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>Temp variance</div>
              <div style={{
                fontWeight: '600', fontSize: '13px',
                color: Math.abs(((parseFloat(recording.actualTemperature) - parseFloat(recording.setTemperature)) / parseFloat(recording.setTemperature)) * 100) <= 3
                  ? '#10b981'
                  : Math.abs(((parseFloat(recording.actualTemperature) - parseFloat(recording.setTemperature)) / parseFloat(recording.setTemperature)) * 100) <= 7
                  ? '#f59e0b'
                  : '#ef4444'
              }}>
                {(((parseFloat(recording.actualTemperature) - parseFloat(recording.setTemperature)) / parseFloat(recording.setTemperature)) * 100) > 0 ? '+' : ''}
                {(((parseFloat(recording.actualTemperature) - parseFloat(recording.setTemperature)) / parseFloat(recording.setTemperature)) * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {recording.filtered && (
            <div style={{ background: '#dbeafe', color: '#1e40af', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Filter size={12} /> Filtered
            </div>
          )}
          {recording.oilAge === 1 ? (
            <div style={{ background: '#fef3c7', color: '#92400e', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Star size={12} fill="#92400e" /> Fresh Oil
            </div>
          ) : oilAge !== null && (
            <div style={{ background: '#f1f5f9', color: '#475569', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> Day {oilAge}
            </div>
          )}
          {recording.notes && (
            <div onClick={() => setShowComment(true)} style={{
              background: '#f1f5f9', color: '#475569', padding: '5px 10px', borderRadius: '6px',
              fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
              onMouseOver={(e) => e.currentTarget.style.background = '#e2e8f0'}
              onMouseOut={(e) => e.currentTarget.style.background = '#f1f5f9'}
            >
              <MessageSquare size={12} /> Note
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '10px', borderTop: '1px solid #f1f5f9', gap: '12px'
        }}>
          {(recording.foodType || recording.fryingType) ? (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>🍟</span> {recording.foodType || recording.fryingType}
            </div>
          ) : <div />}
          {(recording.staffName || recording.takenByName) && (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px' }}>👤</span> {recording.staffName || recording.takenByName}
            </div>
          )}
        </div>

        {showDate && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
            {new Date(recording.readingDate).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Notes modal */}
      {showComment && (
        <div onClick={() => setShowComment(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, padding: '20px'
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'white', borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '100%', position: 'relative'
          }}>
            <button onClick={() => setShowComment(false)} style={{
              position: 'absolute', top: '12px', right: '12px', background: '#f1f5f9',
              border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center'
            }}>
              <X size={16} color="#64748b" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MessageSquare size={20} color="#1a428a" />
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>Note</h3>
            </div>
            <p style={{ fontSize: '15px', color: '#1f2937', lineHeight: '1.6', margin: 0 }}>{recording.notes}</p>
          </div>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────
// Day View
// ─────────────────────────────────────────────
const DayView = ({ readings, selectedDate, onDateChange, fryerCount = 4 }) => {
  const [expandedHistory, setExpandedHistory] = useState({});
  const dateString = formatDate(selectedDate);
  const grouped = groupReadingsByDate(readings);
  const dayReadings = grouped[dateString] || [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);
  const isToday = sel.getTime() === today.getTime();
  const isFuture = sel > today;

  const navigateDay = (dir) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    onDateChange(d);
  };

  const toggleHistory = (num) => {
    setExpandedHistory(prev => ({ ...prev, [num]: !prev[num] }));
  };

  const hasRecordings = dayReadings.length > 0;
  const hasActiveRecordings = dayReadings.filter(r => !r.notInUse).length > 0;
  const onlyNotInUse = hasRecordings && !hasActiveRecordings;
  const dayBg = isFuture ? '#f8fafc' : hasRecordings ? (onlyNotInUse ? '#fef9c3' : '#d1fae5') : '#fee2e2';

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px', background: dayBg, borderRadius: '12px', minHeight: '300px', transition: 'background 0.3s ease' }}>
      {/* Date navigator — matches Week view layout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigateDay(-1)}
            style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={20} color="#64748b" />
          </button>
          <button onClick={() => navigateDay(1)} disabled={isFuture}
            style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: isFuture ? 'default' : 'pointer', display: 'flex', opacity: isFuture ? 0.3 : 1 }}>
            <ChevronRight size={20} color="#64748b" />
          </button>
        </div>
      </div>

      {/* Status banner for days with no recordings */}
      {dayReadings.length === 0 && (
        <div style={{ background: isFuture ? 'white' : '#fee2e2', border: `1.5px solid ${isFuture ? '#e2e8f0' : '#fca5a5'}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <AlertCircle size={16} color={isFuture ? '#94a3b8' : '#dc2626'} />
          <p style={{ color: isFuture ? '#94a3b8' : '#dc2626', fontSize: '12px', fontWeight: '600', margin: 0 }}>
            {isFuture ? 'This date is in the future.' : isToday ? 'Not recorded yet today' : 'No readings recorded'}
          </p>
        </div>
      )}

      {/* Always show all fryers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: fryerCount }, (_, i) => i + 1).map(fryerNum => {
          const fryerReadings = dayReadings.filter(r => r.fryerNumber === fryerNum);
          // Sort by readingNumber so most recent (highest) is last
          const sorted = [...fryerReadings].sort((a, b) => (a.readingNumber || 1) - (b.readingNumber || 1));
          const latestReading = sorted.length > 0 ? sorted[sorted.length - 1] : null;
          const olderReadings = sorted.length > 1 ? sorted.slice(0, -1).reverse() : [];
          const historyOpen = expandedHistory[fryerNum];

          return (
            <div key={fryerNum} style={{
              background: 'white', borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
              overflow: 'hidden'
            }}>
              {/* Fryer header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderBottom: latestReading ? '1px solid #f1f5f9' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937' }}>Fryer {fryerNum}</span>
                  {fryerReadings.length > 1 && (
                    <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                      {fryerReadings.length} readings
                    </span>
                  )}
                </div>
                {fryerReadings.length === 0 && (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>No recordings</span>
                )}
              </div>

              {/* Reading details — always visible, no accordion toggle */}
              {latestReading && (
                <div style={{ padding: '12px 16px' }}>
                  <RecordingCard recording={latestReading}
                    allReadings={readings} showDate={false}
                    recordingIndex={sorted.length - 1} totalRecordings={sorted.length}
                  />
                  {/* Older readings */}
                  {olderReadings.length > 0 && (
                    <>
                      <button onClick={() => toggleHistory(fryerNum)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                        padding: '6px 10px', marginTop: '8px',
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '10px', fontWeight: '500', color: '#94a3b8'
                      }}>
                        <span>{historyOpen ? 'Hide' : 'Show'} history ({olderReadings.length})</span>
                        <ChevronDown size={9} color="#94a3b8" style={{
                          transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }} />
                      </button>
                      {historyOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                          {olderReadings.map((rec, idx) => (
                            <RecordingCard key={rec.id || idx} recording={rec}
                              allReadings={readings} showDate={false}
                              recordingIndex={idx} totalRecordings={sorted.length}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Week View
// ─────────────────────────────────────────────
const WeekView = ({ readings, selectedDate, onDateChange, fryerCount = 4 }) => {
  const [expandedDays, setExpandedDays] = useState({});
  const [expandedFryers, setExpandedFryers] = useState({});
  const grouped = groupReadingsByDate(readings);

  const startOfWeek = new Date(selectedDate);
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - dow + (dow === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const today = getTodayString();
  const toggleDay = (ds) => setExpandedDays(prev => ({ ...prev, [ds]: !prev[ds] }));
  const toggleFryer = (ds, fn) => {
    const key = `${ds}-${fn}`;
    setExpandedFryers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
          Week of {startOfWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onDateChange(new Date(startOfWeek.getTime() - 7*864e5))}
            style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={20} color="#64748b" />
          </button>
          <button onClick={() => onDateChange(new Date(startOfWeek.getTime() + 7*864e5))}
            style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
            <ChevronRight size={20} color="#64748b" />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {weekDays.map(date => {
          const ds = formatDate(date);
          const dayReadings = grouped[ds] || [];
          const isToday = ds === today;
          const isExpanded = expandedDays[ds];
          const todayDate = new Date(); todayDate.setHours(0,0,0,0);
          const cur = new Date(date); cur.setHours(0,0,0,0);
          const isFuture = cur > todayDate;
          const hasActiveWeek = dayReadings.some(r => !r.notInUse);
          const onlyNotInUseWeek = dayReadings.length > 0 && !hasActiveWeek;
          let bg = 'white';
          if (!isFuture) bg = hasActiveWeek ? '#d1fae5' : onlyNotInUseWeek ? '#fef9c3' : dayReadings.length > 0 ? '#d1fae5' : '#fee2e2';

          // Group by fryer
          const byFryer = {};
          dayReadings.forEach(r => {
            if (!byFryer[r.fryerNumber]) byFryer[r.fryerNumber] = [];
            byFryer[r.fryerNumber].push(r);
          });

          return (
            <div key={ds}>
              <div onClick={() => toggleDay(ds)} style={{
                background: bg, borderRadius: '12px', padding: '14px 16px', cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: isToday ? '2px solid #1a428a' : '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>
                    {date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  {isToday && <span style={{ background: '#1a428a', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>Today</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!isFuture && <span style={{ fontSize: '12px', fontWeight: '600', color: dayReadings.length > 0 ? '#059669' : '#dc2626' }}>
                    {dayReadings.length > 0 ? `${dayReadings.length} reading${dayReadings.length > 1 ? 's' : ''}` : 'None'}
                  </span>}
                  <ChevronDown size={18} color="#64748b" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                </div>
              </div>
              {isExpanded && dayReadings.length > 0 && (
                <div style={{ marginTop: '6px', background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(byFryer).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([fn, unsorted]) => {
                    const recs = [...unsorted].sort((a, b) => (a.readingNumber || 1) - (b.readingNumber || 1));
                    const expandKey = `${ds}-${fn}`;
                    const isExp = expandedFryers[expandKey];
                    const mostRecent = recs[recs.length - 1];
                    const hasMultiple = recs.length > 1;
                    const latestStatus = getTPMStatus(mostRecent.tpmValue);

                    return (
                      <div key={fn} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937' }}>Fryer {fn}</span>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: latestStatus.color }} />
                          </div>
                          {hasMultiple && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{recs.length} readings</span>
                          )}
                        </div>

                        {/* Most recent always shown */}
                        <RecordingCard recording={mostRecent} allReadings={readings} recordingIndex={recs.length - 1} totalRecordings={recs.length} />

                        {/* Accordion for older */}
                        {hasMultiple && (
                          <>
                            <button onClick={() => toggleFryer(ds, fn)} style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                              marginTop: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                              borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                              fontSize: '10px', fontWeight: '500', color: '#94a3b8'
                            }}>
                              {isExp ? 'Hide' : 'Show'} history ({recs.length - 1})
                              <ChevronDown size={9} style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                            </button>
                            {isExp && recs.slice(0, -1).reverse().map((rec, idx) => (
                              <div key={idx} style={{ marginTop: '8px' }}>
                                <RecordingCard recording={rec} allReadings={readings} recordingIndex={recs.length - 2 - idx} totalRecordings={recs.length} />
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Month View
// ─────────────────────────────────────────────
const MonthView = ({ readings, selectedDate, onDateChange, fryerCount = 4 }) => {
  const [selectedFryer, setSelectedFryer] = useState(1);
  const [modalDate, setModalDate] = useState(null);
  const grouped = groupReadingsByDate(readings);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fryerList = Array.from({ length: fryerCount }, (_, i) => i + 1);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());
  const weeks = [];
  let currentWeek = [];
  let cur = new Date(startDate);
  while (cur <= lastDay || currentWeek.length < 7) {
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    currentWeek.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) { currentWeek.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(currentWeek);
  }

  const today = getTodayString();
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
  const maxDay = isCurrentMonth ? todayDate.getDate() : daysInMonth;

  // Month stats for selected fryer
  let totalTPM = 0, count = 0, recordedDays = 0;
  const tempVariances = [];
  const signedTempVariances = [];
  for (let d = 1; d <= maxDay; d++) {
    const ds = formatDate(new Date(year, month, d));
    const allDayRecs = (grouped[ds] || []).filter(r => r.fryerNumber === selectedFryer);
    const dr = allDayRecs.filter(r => !r.notInUse);
    // Count as recorded if ANY recording exists (including notInUse)
    if (allDayRecs.length > 0) {
      recordedDays++;
    }
    // Only use active readings for TPM/temp math
    dr.forEach(r => {
      if (r.tpmValue != null) { totalTPM += r.tpmValue; count++; }
      if (r.setTemperature && r.actualTemperature) {
        const variance = ((r.actualTemperature - r.setTemperature) / r.setTemperature) * 100;
        tempVariances.push(Math.abs(variance));
        signedTempVariances.push(variance);
      }
    });
  }
  const avgTempVariance = tempVariances.length > 0
    ? (tempVariances.reduce((a, b) => a + b, 0) / tempVariances.length).toFixed(1) : 0;
  const avgSignedTempVariance = signedTempVariances.length > 0
    ? (signedTempVariances.reduce((a, b) => a + b, 0) / signedTempVariances.length) : 0;
  // Current streak — count backwards from today (notInUse counts as recorded)
  let currentStreak = 0;
  for (let d = maxDay; d >= 1; d--) {
    const ds = formatDate(new Date(year, month, d));
    const allDayRecsStreak = (grouped[ds] || []).filter(r => r.fryerNumber === selectedFryer);
    if (allDayRecsStreak.length > 0) {
      currentStreak++;
    } else {
      // If checking from today and today has no recording yet, skip it and keep checking
      if (d === maxDay && isCurrentMonth) continue;
      break;
    }
  }
  const stats = {
    compliance: maxDay > 0 ? Math.round((recordedDays / maxDay) * 100) : 0,
    avgTPM: count > 0 ? (totalTPM / count).toFixed(1) : '0',
    avgTempVariance,
    avgSignedTempVariance,
    currentStreak,
    recordedDays, totalDays: maxDay
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
          {selectedDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onDateChange(new Date(year, month - 1, 1))} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={20} color="#64748b" /></button>
          <button onClick={() => onDateChange(new Date(year, month + 1, 1))} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={20} color="#64748b" /></button>
        </div>
      </div>

      {/* Fryer tabs */}
      {fryerList.length > 1 && (
        <div style={{ display: 'flex', gap: '0', marginBottom: '12px' }}>
          {fryerList.map(fn => (
            <button key={fn} onClick={() => setSelectedFryer(fn)} style={{
              flex: '1 1 0', padding: '10px 8px', background: selectedFryer === fn ? '#1a428a' : 'white',
              color: selectedFryer === fn ? 'white' : '#1f2937',
              border: selectedFryer === fn ? '1.5px solid #1a428a' : '1.5px solid #e2e8f0',
              borderRadius: fn === 1 ? '10px 0 0 10px' : fn === fryerList.length ? '0 10px 10px 0' : '0',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer', textAlign: 'center',
              marginLeft: fn > 1 ? '-1.5px' : '0', position: 'relative',
              zIndex: selectedFryer === fn ? 1 : 0
            }}>Fryer {fn}</button>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>Compliance</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: stats.compliance >= 80 ? '#10b981' : stats.compliance >= 50 ? '#f59e0b' : '#ef4444' }}>{stats.compliance}%</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{stats.recordedDays}/{stats.totalDays} days</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>Avg TPM</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: getTPMStatus(parseFloat(stats.avgTPM)).color }}>{stats.avgTPM}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>target &lt;18</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>Temp Variance</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: Math.abs(stats.avgTempVariance) <= 3 ? '#10b981' : Math.abs(stats.avgTempVariance) <= 7 ? '#f59e0b' : '#ef4444' }}>
            {stats.avgSignedTempVariance > 0 ? '+' : stats.avgSignedTempVariance < 0 ? '-' : ''}{Math.abs(stats.avgSignedTempVariance).toFixed(1)}%
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>average</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 8px', textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>Streak</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a428a' }}>{stats.currentStreak}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>days</div>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '13px', fontWeight: '700', color: '#64748b', padding: '10px 4px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{d}</div>
          ))}
          {weeks.flat().map((date, idx) => {
            const ds = formatDate(date);
            const allFryerRecs = (grouped[ds] || []).filter(r => r.fryerNumber === selectedFryer);
            const activeRecs = allFryerRecs.filter(r => !r.notInUse);
            const fryerRecs = activeRecs;
            const isCurrentMo = date.getMonth() === month;
            const isT = ds === today;
            const cd = new Date(date); cd.setHours(0,0,0,0);
            const isFut = cd > todayDate;
            const hasAnyRec = allFryerRecs.length > 0;
            const hasActiveRec = fryerRecs.length > 0;
            const onlyNotInUse = hasAnyRec && !hasActiveRec;
            const latest = fryerRecs[fryerRecs.length - 1];

            // Background: green if active readings, amber if only notInUse, red if missed
            const cellBg = !isCurrentMo ? '#fafafa' : isFut ? 'white' : hasActiveRec ? '#d1fae5' : onlyNotInUse ? '#fef9c3' : '#fee2e2';

            return (
              <div key={idx} onClick={() => hasAnyRec && setModalDate(date)} style={{
                position: 'relative', width: '100%', paddingBottom: '220%',
                cursor: hasAnyRec ? 'pointer' : 'default',
                borderRight: (idx + 1) % 7 !== 0 ? '1px solid #e2e8f0' : 'none',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  padding: '4px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: cellBg,
                  outline: isT ? '2px solid #1a428a' : 'none', outlineOffset: '-2px'
                }}>
                  <div style={{ fontSize: 'clamp(11px, 3vw, 13px)', fontWeight: '700', color: isCurrentMo ? '#1f2937' : '#94a3b8', marginBottom: '1px' }}>{date.getDate()}</div>
                  {hasActiveRec && latest ? (
                    <>
                      <div style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', fontWeight: '600', color: '#64748b', letterSpacing: '0.5px' }}>TPM</div>
                      <div style={{ fontSize: 'clamp(15px, 4vw, 22px)', fontWeight: '700', color: getTPMStatus(latest.tpmValue).color, lineHeight: '1.1', marginBottom: '1px' }}>
                        {latest.tpmValue}
                      </div>
                      {latest.oilAge && (() => { const os = getOilStatus(latest.oilAge, latest.notInUse); return (
                        <div style={{ fontSize: 'clamp(9px, 2.2vw, 11px)', color: os ? os.color : '#64748b', fontWeight: '600' }}>
                          {os ? os.label.replace('Not in Operation', 'N/A').replace('In Use', `${latest.oilAge}d`) : `${latest.oilAge}d`}
                        </div>
                      ); })()}
                      <div style={{ fontSize: 'clamp(9px, 2vw, 11px)', color: '#64748b', lineHeight: '1.4', textAlign: 'center', marginTop: '2px' }}>
                        {latest.setTemperature && <div>S:{latest.setTemperature}°</div>}
                        {latest.actualTemperature && <div>A:{latest.actualTemperature}°</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
                        {latest.filtered && <Filter size={10} color="#1e40af" strokeWidth={2.5} />}
                        {latest.oilAge === 1 && <Star size={10} color="#92400e" fill="#92400e" />}
                        {latest.notes && <MessageSquare size={10} color="#475569" strokeWidth={2.5} />}
                      </div>
                      <div style={{
                        fontSize: 'clamp(8px, 1.8vw, 10px)', color: '#475569', fontWeight: '600',
                        marginTop: '1px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', width: '100%', paddingTop: '1px'
                      }}>
                        {latest.staffName || latest.takenByName || ''}
                      </div>
                    </>
                  ) : onlyNotInUse ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: '2px' }}>
                      <div style={{ fontSize: 'clamp(9px, 2.2vw, 11px)', fontWeight: '600', color: '#92400e', textAlign: 'center', lineHeight: '1.3' }}>
                        Not in use
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: '#64748b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#d1fae5' }} /> Recorded</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fef9c3' }} /> Not in use</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fee2e2' }} /> Missed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Filter size={11} color="#1e40af" strokeWidth={2.5} /> Filtered</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Star size={11} color="#92400e" fill="#92400e" /> Fresh Oil</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={11} color="#475569" strokeWidth={2.5} /> Has Notes</div>
        </div>
      </div>

      {/* Day detail modal */}
      {modalDate && (
        <div onClick={() => setModalDate(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>
                {modalDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} — Fryer {selectedFryer}
              </h3>
              <button onClick={() => setModalDate(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...(grouped[formatDate(modalDate)] || [])].filter(r => r.fryerNumber === selectedFryer)
                .sort((a, b) => (b.readingNumber || 1) - (a.readingNumber || 1))
                .map((rec, idx, arr) => (
                  <RecordingCard key={rec.id || idx} recording={rec} allReadings={readings} recordingIndex={arr.length - 1 - idx} totalRecordings={arr.length} />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Quarterly View
// ─────────────────────────────────────────────
const QuarterView = ({ readings, selectedDate, onDateChange, fryerCount = 4 }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const grouped = groupReadingsByDate(readings);

  // Navigate quarter
  const navigateQuarter = (dir) => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + dir * 3);
    onDateChange(d);
  };

  // Determine quarter boundaries
  const qMonth = Math.floor(selectedDate.getMonth() / 3) * 3; // 0,3,6,9
  const qStart = new Date(selectedDate.getFullYear(), qMonth, 1);
  const qEnd = new Date(selectedDate.getFullYear(), qMonth + 3, 0);
  const qLabel = `Q${Math.floor(qMonth / 3) + 1} ${selectedDate.getFullYear()}`;

  // Build list of all dates in the quarter up to today
  const allDates = [];
  for (let d = new Date(qStart); d <= qEnd && d <= today; d.setDate(d.getDate() + 1)) {
    allDates.push(formatDate(new Date(d)));
  }

  // Per-fryer stats
  const fryerStats = Array.from({ length: fryerCount }, (_, i) => {
    const fNum = i + 1;
    const fryerReadings = readings.filter(r => r.fryerNumber === fNum && !r.notInUse && r.readingDate >= formatDate(qStart) && r.readingDate <= formatDate(qEnd));

    const daysRecorded = new Set(fryerReadings.map(r => r.readingDate)).size;
    const compliance = allDates.length > 0 ? Math.round((daysRecorded / allDates.length) * 100) : 0;

    const tpmValues = fryerReadings.filter(r => r.tpmValue != null).map(r => parseFloat(r.tpmValue));
    const avgTPM = tpmValues.length > 0 ? (tpmValues.reduce((a, b) => a + b, 0) / tpmValues.length).toFixed(1) : '—';

    const filteredCount = fryerReadings.filter(r => r.filtered === true).length;
    const filterRate = fryerReadings.length > 0 ? Math.round((filteredCount / fryerReadings.length) * 100) : 0;

    // Oil changes: detect fresh oil (oilAge === 1)
    let changedEarly = 0, changedLate = 0, changedOnTime = 0;
    const sortedByDate = [...fryerReadings].sort((a, b) => a.readingDate.localeCompare(b.readingDate));
    const byDate = {};
    sortedByDate.forEach(r => { byDate[r.readingDate] = byDate[r.readingDate] || []; byDate[r.readingDate].push(r); });
    const dates = Object.keys(byDate).sort();
    for (let d = 1; d < dates.length; d++) {
      const todayRecs = byDate[dates[d]];
      const fresh = todayRecs.find(r => r.oilAge === 1 || r.oilAge === '1');
      if (!fresh) continue;
      const prevRecs = byDate[dates[d - 1]];
      const prevMax = Math.max(...prevRecs.map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v)));
      if (isNaN(prevMax)) continue;
      if (prevMax >= 24) changedLate++;
      else if (prevMax < 18) changedEarly++;
      else changedOnTime++;
    }
    const totalChanges = changedEarly + changedOnTime + changedLate;

    return { fNum, compliance, daysRecorded, avgTPM, filterRate, changedEarly, changedLate, changedOnTime, totalChanges };
  });

  // Overall stats
  const overallCompliance = fryerStats.length > 0 ? Math.round(fryerStats.reduce((s, f) => s + f.compliance, 0) / fryerStats.length) : 0;
  const compColor = overallCompliance >= 90 ? '#10b981' : overallCompliance >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{qLabel}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigateQuarter(-1)} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={20} color="#64748b" />
          </button>
          <button onClick={() => navigateQuarter(1)} disabled={qEnd > today} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: qEnd > today ? 'default' : 'pointer', display: 'flex', opacity: qEnd > today ? 0.3 : 1 }}>
            <ChevronRight size={20} color="#64748b" />
          </button>
        </div>
      </div>

      {/* Overall summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'Compliance', value: `${overallCompliance}%`, color: compColor },
          { label: 'Days in Quarter', value: `${allDates.length}`, color: '#64748b' },
          { label: 'Fryers', value: `${fryerCount}`, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-fryer breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {fryerStats.map(f => {
          const fCompColor = f.compliance >= 90 ? '#10b981' : f.compliance >= 70 ? '#f59e0b' : '#ef4444';
          return (
            <div key={f.fNum} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937' }}>Fryer {f.fNum}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: fCompColor }}>{f.compliance}% compliant</span>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Avg TPM</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{f.avgTPM}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Filter Rate</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{f.filterRate}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Days Recorded</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{f.daysRecorded}/{allDates.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Oil Changes</div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>{f.totalChanges}</div>
                  </div>
                </div>
                {/* Oil change timing breakdown */}
                {f.totalChanges > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {f.changedOnTime > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px', background: '#d1fae5', color: '#059669' }}>
                        {f.changedOnTime} on time
                      </span>
                    )}
                    {f.changedEarly > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px', background: '#fef3c7', color: '#d97706' }}>
                        {f.changedEarly} early
                      </span>
                    )}
                    {f.changedLate > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px', background: '#fee2e2', color: '#dc2626' }}>
                        {f.changedLate} late
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allDates.length === 0 && (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
          <Calendar size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>No Data</h3>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>This quarter hasn't started yet or has no past dates.</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Yearly View
// ─────────────────────────────────────────────
const YearView = ({ readings, selectedDate, onDateChange, fryerCount = 4 }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const year = selectedDate.getFullYear();

  const navigateYear = (dir) => {
    const d = new Date(selectedDate);
    d.setFullYear(d.getFullYear() + dir);
    onDateChange(d);
  };

  // Build monthly data for the year
  const monthData = Array.from({ length: 12 }, (_, m) => {
    const monthStart = new Date(year, m, 1);
    const monthEnd = new Date(year, m + 1, 0);
    const startStr = formatDate(monthStart);
    const endStr = formatDate(monthEnd);

    // Days in month up to today
    const pastDays = [];
    for (let d = new Date(monthStart); d <= monthEnd && d <= today; d.setDate(d.getDate() + 1)) {
      pastDays.push(formatDate(new Date(d)));
    }

    const monthReadings = readings.filter(r => !r.notInUse && r.readingDate >= startStr && r.readingDate <= endStr);
    const daysRecorded = new Set(monthReadings.map(r => r.readingDate)).size;
    const compliance = pastDays.length > 0 ? Math.round((daysRecorded / pastDays.length) * 100) : null;

    const tpmValues = monthReadings.filter(r => r.tpmValue != null).map(r => parseFloat(r.tpmValue));
    const avgTPM = tpmValues.length > 0 ? (tpmValues.reduce((a, b) => a + b, 0) / tpmValues.length).toFixed(1) : null;

    const filteredCount = monthReadings.filter(r => r.filtered === true).length;
    const filterRate = monthReadings.length > 0 ? Math.round((filteredCount / monthReadings.length) * 100) : null;

    // Oil change analysis
    let changedEarly = 0, changedLate = 0, changedOnTime = 0;
    for (let fNum = 1; fNum <= fryerCount; fNum++) {
      const fryerRecs = monthReadings.filter(r => r.fryerNumber === fNum);
      const byDate = {};
      fryerRecs.forEach(r => { byDate[r.readingDate] = byDate[r.readingDate] || []; byDate[r.readingDate].push(r); });
      const dates = Object.keys(byDate).sort();
      for (let d = 1; d < dates.length; d++) {
        const fresh = byDate[dates[d]].find(r => r.oilAge === 1 || r.oilAge === '1');
        if (!fresh) continue;
        const prevMax = Math.max(...byDate[dates[d - 1]].map(r => parseFloat(r.tpmValue)).filter(v => !isNaN(v)));
        if (isNaN(prevMax)) continue;
        if (prevMax >= 24) changedLate++;
        else if (prevMax < 18) changedEarly++;
        else changedOnTime++;
      }
    }

    const monthName = monthStart.toLocaleDateString('en-US', { month: 'short' });
    const isFuture = monthStart > today;

    return { month: m, monthName, compliance, avgTPM, filterRate, changedEarly, changedLate, changedOnTime, totalChanges: changedEarly + changedOnTime + changedLate, pastDays: pastDays.length, daysRecorded, isFuture };
  });

  // Yearly totals
  const activMonths = monthData.filter(m => m.pastDays > 0);
  const yearCompliance = activMonths.length > 0 ? Math.round(activMonths.reduce((s, m) => s + (m.compliance || 0), 0) / activMonths.length) : 0;
  const yearCompColor = yearCompliance >= 90 ? '#10b981' : yearCompliance >= 70 ? '#f59e0b' : '#ef4444';
  const totalOilChanges = monthData.reduce((s, m) => s + m.totalChanges, 0);
  const totalLate = monthData.reduce((s, m) => s + m.changedLate, 0);
  const totalEarly = monthData.reduce((s, m) => s + m.changedEarly, 0);

  return (
    <div style={{ margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>{year}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigateYear(-1)} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={20} color="#64748b" />
          </button>
          <button onClick={() => navigateYear(1)} disabled={year >= today.getFullYear()} style={{ padding: '8px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', cursor: year >= today.getFullYear() ? 'default' : 'pointer', display: 'flex', opacity: year >= today.getFullYear() ? 0.3 : 1 }}>
            <ChevronRight size={20} color="#64748b" />
          </button>
        </div>
      </div>

      {/* Year summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {[
          { label: 'Compliance', value: `${yearCompliance}%`, color: yearCompColor },
          { label: 'Oil Changes', value: `${totalOilChanges}`, color: '#1f2937' },
          { label: 'Changed Late', value: `${totalLate}`, color: totalLate > 0 ? '#ef4444' : '#10b981' },
          { label: 'Changed Early', value: `${totalEarly}`, color: totalEarly > 0 ? '#f59e0b' : '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', borderRadius: '10px', padding: '12px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Month-by-month grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {monthData.map(m => {
          const compColor = m.isFuture ? '#cbd5e1' : m.compliance >= 90 ? '#10b981' : m.compliance >= 70 ? '#f59e0b' : '#ef4444';
          const compBg = m.isFuture ? '#f8fafc' : m.compliance >= 90 ? '#d1fae5' : m.compliance >= 70 ? '#fef3c7' : '#fee2e2';
          return (
            <div key={m.month} style={{
              background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
              padding: '12px', opacity: m.isFuture ? 0.5 : 1
            }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>{m.monthName}</div>
              {/* Compliance bar */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>Compliance</span>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: compColor }}>{m.compliance != null ? `${m.compliance}%` : '—'}</span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${m.compliance || 0}%`, background: compColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
              </div>
              {/* Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {m.avgTPM != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Avg TPM</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#1f2937' }}>{m.avgTPM}</span>
                  </div>
                )}
                {m.filterRate != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Filtered</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#1f2937' }}>{m.filterRate}%</span>
                  </div>
                )}
                {m.totalChanges > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Oil changes</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#1f2937' }}>{m.totalChanges}</span>
                  </div>
                )}
                {m.changedLate > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#ef4444' }}>Late</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#ef4444' }}>{m.changedLate}</span>
                  </div>
                )}
                {m.changedEarly > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#f59e0b' }}>Early</span>
                    <span style={{ fontSize: '10px', fontWeight: '600', color: '#f59e0b' }}>{m.changedEarly}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Executive Summary View (ported from original)
// ─────────────────────────────────────────────
const SummaryView = ({ readings }) => {
  const grouped = groupReadingsByDate(readings);
  const today = new Date(); today.setHours(0,0,0,0);
  const thirtyDaysAgo = formatDate(new Date(today.getTime() - 30 * 864e5));
  const allActive = readings.filter(r => !r.notInUse && r.tpmValue != null && r.readingDate >= thirtyDaysAgo);

  if (allActive.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <BarChart3 size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>No Data Yet</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Start recording TPM to see executive insights.</p>
      </div>
    );
  }

  const last30Days = [];
  for (let i = 0; i < 30; i++) { const d = new Date(today); d.setDate(d.getDate() - i); last30Days.push(formatDate(d)); }
  const daysRecorded = last30Days.filter(ds => (grouped[ds] || []).length > 0).length;
  const complianceRate = Math.round((daysRecorded / 30) * 100);

  const criticalCount = allActive.filter(r => r.tpmValue >= 24).length;
  const warningCount = allActive.filter(r => r.tpmValue >= 18 && r.tpmValue < 24).length;
  const goodCount = allActive.filter(r => r.tpmValue < 18).length;
  const criticalRate = Math.round((criticalCount / allActive.length) * 100);
  const avgTPM = (allActive.reduce((s, r) => s + r.tpmValue, 0) / allActive.length).toFixed(1);

  const filteredCount = allActive.filter(r => r.filtered === true).length;
  const filteringRate = Math.round((filteredCount / allActive.length) * 100);
  const oilAgeData = allActive.filter(r => r.oilAge);
  const avgOilAge = oilAgeData.length > 0 ? oilAgeData.reduce((s, r) => s + parseInt(r.oilAge), 0) / oilAgeData.length : 0;

  // Total litres
  const totalLitres = allActive.reduce((s, r) => s + (r.litresFilled || 0), 0);

  // Changed Too Early: oil changed to day 1 without prior reading reaching 18 TPM
  const changedTooEarly = (() => {
    let count = 0;
    const byFryer = {};
    allActive.forEach(r => {
      if (!byFryer[r.fryerNumber]) byFryer[r.fryerNumber] = {};
      if (!byFryer[r.fryerNumber][r.readingDate]) byFryer[r.fryerNumber][r.readingDate] = [];
      byFryer[r.fryerNumber][r.readingDate].push(r);
    });
    Object.values(byFryer).forEach(fryerDates => {
      const sortedDates = Object.keys(fryerDates).sort();
      for (let i = 0; i < sortedDates.length; i++) {
        const recs = fryerDates[sortedDates[i]];
        if (recs.some(r => (r.oilAge === 1 || r.oilAge === '1')) && i > 0) {
          let reached = false;
          for (let j = i - 1; j >= 0; j--) {
            if (fryerDates[sortedDates[j]].some(r => r.tpmValue >= 18)) { reached = true; break; }
          }
          if (!reached) count++;
        }
      }
    });
    return count;
  })();

  // Changed Too Late: oil changed after reaching 24 TPM
  const changedTooLate = (() => {
    let count = 0;
    const byFryer = {};
    allActive.forEach(r => {
      if (!byFryer[r.fryerNumber]) byFryer[r.fryerNumber] = {};
      if (!byFryer[r.fryerNumber][r.readingDate]) byFryer[r.fryerNumber][r.readingDate] = [];
      byFryer[r.fryerNumber][r.readingDate].push(r);
    });
    Object.values(byFryer).forEach(fryerDates => {
      const sortedDates = Object.keys(fryerDates).sort();
      for (let i = 0; i < sortedDates.length; i++) {
        const recs = fryerDates[sortedDates[i]];
        if (recs.some(r => (r.oilAge === 1 || r.oilAge === '1')) && i > 0) {
          if (fryerDates[sortedDates[i - 1]].some(r => r.tpmValue >= 24)) count++;
        }
      }
    });
    return count;
  })();

  const tempRecordings = allActive.filter(r => r.setTemperature && r.actualTemperature);
  const tempVariances = tempRecordings.map(r => Math.abs(((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100));
  const signedTempVariancesSummary = tempRecordings.map(r => ((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100);
  const goodTempControl = tempVariances.filter(v => v <= 7).length;
  const tempControlRate = tempRecordings.length > 0 ? Math.round((goodTempControl / tempRecordings.length) * 100) : 0;
  const avgTempVariance = tempVariances.length > 0 ? (tempVariances.reduce((a, b) => a + b, 0) / tempVariances.length).toFixed(1) : 0;
  const avgSignedTempVarianceSummary = signedTempVariancesSummary.length > 0 ? (signedTempVariancesSummary.reduce((a, b) => a + b, 0) / signedTempVariancesSummary.length) : 0;

  const foodTypeData = {};
  allActive.forEach(r => {
    if (!r.foodType) return;
    if (!foodTypeData[r.foodType]) foodTypeData[r.foodType] = { count: 0, totalTPM: 0, criticalCount: 0 };
    foodTypeData[r.foodType].count++;
    foodTypeData[r.foodType].totalTPM += r.tpmValue;
    if (r.tpmValue >= 24) foodTypeData[r.foodType].criticalCount++;
  });
  const foodTypeAnalysis = Object.entries(foodTypeData).map(([type, d]) => ({
    type, count: d.count, avgTPM: (d.totalTPM / d.count).toFixed(1), criticalRate: Math.round((d.criticalCount / d.count) * 100)
  })).sort((a, b) => b.avgTPM - a.avgTPM);

  const getOilGrade = () => {
    let score = 0;
    if (filteringRate >= 80) score += 3; else if (filteringRate >= 60) score += 2; else if (filteringRate >= 40) score += 1;
    if (avgTPM < 15) score += 3; else if (avgTPM < 18) score += 2; else if (avgTPM < 22) score += 1;
    if (criticalRate <= 5) score += 2; else if (criticalRate <= 15) score += 1;
    if (tempControlRate >= 85) score += 2; else if (tempControlRate >= 70) score += 1;
    if (score >= 9) return { grade: 'Excellent', color: '#10b981', bg: '#d1fae5' };
    if (score >= 6) return { grade: 'Good', color: '#f59e0b', bg: '#fef3c7' };
    if (score >= 3) return { grade: 'Fair', color: '#f59e0b', bg: '#fef3c7' };
    return { grade: 'Needs Improvement', color: '#ef4444', bg: '#fee2e2' };
  };
  const oilGrade = getOilGrade();

  // Weekly compliance pattern
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayStats = {};
  dayNames.forEach(d => { dayStats[d] = { recorded: 0, total: 0 }; });
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dn = dayNames[d.getDay()];
    dayStats[dn].total++;
    if ((grouped[formatDate(d)] || []).length > 0) dayStats[dn].recorded++;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '2px' }}>Executive Summary</h2>
      <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>{allActive.length} readings analyzed • Last 30 days</p>

      {/* Top KPIs 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'COMPLIANCE', value: `${complianceRate}%`, color: complianceRate >= 90 ? '#10b981' : complianceRate >= 70 ? '#f59e0b' : '#ef4444', target: '90%+' },
          { label: 'REACHED CRITICAL', value: `${criticalRate}%`, color: criticalRate <= 10 ? '#10b981' : criticalRate <= 25 ? '#f59e0b' : '#ef4444', target: '<10%' },
          { label: 'AVG TPM', value: avgTPM, color: avgTPM < 18 ? '#10b981' : avgTPM < 24 ? '#f59e0b' : '#ef4444', target: '<18' },
          { label: 'FILTERING', value: `${filteringRate}%`, color: filteringRate >= 80 ? '#10b981' : filteringRate >= 60 ? '#f59e0b' : '#ef4444', target: '80%+' }
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'white', borderRadius: '10px', padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>{kpi.label}</div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: kpi.color, lineHeight: '1', marginBottom: '6px' }}>{kpi.value}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>target: {kpi.target}</div>
          </div>
        ))}
      </div>

      {/* Oil Management Overview */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: 0 }}>Oil Management</h3>
          <div style={{ padding: '3px 8px', borderRadius: '5px', background: oilGrade.bg, color: oilGrade.color, fontSize: '11px', fontWeight: '700' }}>{oilGrade.grade}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {[
            { val: avgOilAge.toFixed(1), label: 'Avg Oil Life', sub: 'Longer is better*' },
            { val: changedTooEarly, label: 'Changed Too Early', sub: 'Before 18 TPM' },
            { val: changedTooLate, label: 'Changed Too Late', sub: 'After 24 TPM' },
            { val: `${tempControlRate}%`, label: 'Temp Control', sub: `${avgSignedTempVarianceSummary > 0 ? '+' : avgSignedTempVarianceSummary < 0 ? '-' : ''}${Math.abs(avgSignedTempVarianceSummary).toFixed(1)}% avg` }
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

      {/* Weekly Compliance Pattern */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 4px 0' }}>Weekly Compliance</h3>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>Recording rate by day of week (last 30 days)</p>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          {dayNames.map(day => {
            const rate = dayStats[day].total > 0 ? Math.round((dayStats[day].recorded / dayStats[day].total) * 100) : 0;
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
            const rates = dayNames.map(d => ({ day: d, rate: dayStats[d].total > 0 ? Math.round((dayStats[d].recorded / dayStats[d].total) * 100) : 0 }));
            const lowest = rates.reduce((m, c) => c.rate < m.rate ? c : m);
            const highest = rates.reduce((m, c) => c.rate > m.rate ? c : m);
            return lowest.rate < 50 ? `${lowest.day} is commonly missed • ${highest.day} has best compliance` : 'Great consistency across all days!';
          })()}
        </div>
      </div>

      {/* 7-Day TPM Trend */}
      {(() => {
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i); const ds = formatDate(d);
          const dayRecs = (grouped[ds] || []).filter(r => !r.notInUse && r.tpmValue != null);
          const avg = dayRecs.length > 0 ? dayRecs.reduce((s, r) => s + r.tpmValue, 0) / dayRecs.length : null;
          last7.push({ label: d.toLocaleDateString('en-AU', { weekday: 'short' }), avg, count: dayRecs.length });
        }
        const maxT = Math.max(...last7.filter(d => d.avg != null).map(d => d.avg), 30);
        return (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0' }}>7-Day TPM Trend</h3>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '100px' }}>
              {last7.map((day, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  {day.avg != null ? (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: getTPMStatus(day.avg).color, marginBottom: '3px' }}>{day.avg.toFixed(0)}</div>
                      <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: getTPMStatus(day.avg).color, height: `${Math.max((day.avg / maxT) * 100, 8)}%`, minHeight: '4px' }} />
                    </>
                  ) : (
                    <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
                  )}
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: '600' }}>{day.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '10px', color: '#94a3b8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '2px', background: '#f59e0b' }} /> Warning (18)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '10px', height: '2px', background: '#ef4444' }} /> Critical (24)</div>
            </div>
          </div>
        );
      })()}

      {/* Fryer Comparison */}
      {(() => {
        const fryerMap = {};
        allActive.forEach(r => {
          if (!fryerMap[r.fryerNumber]) fryerMap[r.fryerNumber] = { total: 0, count: 0 };
          fryerMap[r.fryerNumber].total += r.tpmValue; fryerMap[r.fryerNumber].count++;
        });
        if (Object.keys(fryerMap).length <= 1) return null;
        return (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0' }}>Fryer Comparison</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(fryerMap).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([fn, data]) => {
                const avg = (data.total / data.count).toFixed(1);
                const st = getTPMStatus(parseFloat(avg));
                return (
                  <div key={fn} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', minWidth: '56px' }}>Fryer {fn}</div>
                    <div style={{ flex: 1, height: '22px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min((parseFloat(avg) / 30) * 100, 100)}%`, background: st.color, borderRadius: '6px' }} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: st.color, minWidth: '36px', textAlign: 'right' }}>{avg}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Quality Distribution + Most Fried Products */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' }}>Quality Distribution</h3>
          <div style={{ display: 'flex', gap: '0', marginBottom: '6px', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ flex: goodCount, background: '#10b981' }} />
            <div style={{ flex: warningCount, background: '#f59e0b' }} />
            <div style={{ flex: criticalCount, background: '#ef4444' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', textAlign: 'center' }}>
            <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>{Math.round((goodCount/allActive.length)*100)}%</div><div style={{ fontSize: '10px', color: '#64748b' }}>Good ({goodCount})</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b' }}>{Math.round((warningCount/allActive.length)*100)}%</div><div style={{ fontSize: '10px', color: '#64748b' }}>Warning ({warningCount})</div></div>
            <div><div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>{criticalRate}%</div><div style={{ fontSize: '10px', color: '#64748b' }}>Critical ({criticalCount})</div></div>
          </div>
        </div>

        {foodTypeAnalysis.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' }}>Most Fried Products</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {foodTypeAnalysis.slice(0, 3).map(item => (
                <div key={item.type} style={{ padding: '10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', marginBottom: '4px', minHeight: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.type}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', letterSpacing: '0.5px' }}>AVG TPM</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: parseFloat(item.avgTPM) < 18 ? '#10b981' : parseFloat(item.avgTPM) < 24 ? '#f59e0b' : '#ef4444' }}>{item.avgTPM}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{item.count} readings</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Priority Actions */}
      <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '12px', padding: '16px', border: '1px solid #93c5fd' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1e40af', margin: '0 0 8px 0' }}>Priority Actions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {complianceRate < 80 && (
            <div style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Recording Consistency</div>
              <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>Only {complianceRate}% compliance. Implement daily reminders or assign to shift leaders.</div>
            </div>
          )}
          {criticalRate > 15 && (
            <div style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>High Critical Rate</div>
              <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>{criticalRate}% critical. Review oil change procedures and implement earlier replacements.</div>
            </div>
          )}
          {filteringRate < 70 && (
            <div style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Increase Filtering</div>
              <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>Only {filteringRate}% filtered. Daily filtering can extend oil life by 50%.</div>
            </div>
          )}
          {tempControlRate < 80 && (
            <div style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '2px' }}>Temperature Control</div>
              <div style={{ fontSize: '11px', color: '#1e3a8a', lineHeight: '1.5' }}>{100 - tempControlRate}% outside range. Review thermostat calibration.</div>
            </div>
          )}
          {complianceRate >= 80 && criticalRate <= 15 && filteringRate >= 70 && tempControlRate >= 80 && (
            <div style={{ padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#059669', marginBottom: '2px' }}>Great Performance!</div>
              <div style={{ fontSize: '11px', color: '#065f46', lineHeight: '1.5' }}>All metrics within target. Keep up the excellent work.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Dashboard View — Gamified Stats (ported from original)
// ─────────────────────────────────────────────
const DashboardView = ({ readings }) => {
  const grouped = groupReadingsByDate(readings);
  const allActive = readings.filter(r => !r.notInUse && r.tpmValue != null);

  if (allActive.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <BarChart3 size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>No Data Yet</h2>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Start recording TPM to see your stats!</p>
      </div>
    );
  }

  const today = new Date(); today.setHours(0,0,0,0);

  // Current streak
  let currentStreak = 0;
  let checkDate = new Date(today);
  const todayStr = formatDate(checkDate);
  if (!(grouped[todayStr] || []).length) checkDate.setDate(checkDate.getDate() - 1);
  while (true) {
    const ds = formatDate(checkDate);
    if ((grouped[ds] || []).length > 0) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
    else break;
  }

  // Best streak
  let bestStreak = 0, tempStreak = 0;
  const sortedDates = Object.keys(grouped).filter(ds => (grouped[ds] || []).length > 0).sort();
  for (let i = 0; i < sortedDates.length; i++) {
    tempStreak++;
    if (i > 0) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      if (Math.floor((curr - prev) / 864e5) > 1) tempStreak = 1;
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  // Compliance (last 30)
  let daysWithRecs = 0;
  for (let i = 0; i < 30; i++) { const d = new Date(today); d.setDate(d.getDate() - i); if ((grouped[formatDate(d)] || []).length > 0) daysWithRecs++; }
  const complianceRate = Math.round((daysWithRecs / 30) * 100);

  // Temp adherence
  const recsWithTemps = allActive.filter(r => r.setTemperature && r.actualTemperature);
  const goodTemps = recsWithTemps.filter(r => Math.abs(((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100) <= 7);
  const tempAdherence = recsWithTemps.length > 0 ? Math.round((goodTemps.length / recsWithTemps.length) * 100) : 0;

  // Staff leaderboard
  const staffCounts = {};
  allActive.forEach(r => { if (r.staffName) staffCounts[r.staffName] = (staffCounts[r.staffName] || 0) + 1; });
  const topStaff = Object.entries(staffCounts).sort(([,a], [,b]) => b - a).slice(0, 3);

  // Oil habits — multi-factor score out of 10
  const totalRecs = allActive.length;
  const filteredTotal = allActive.filter(r => r.filtered).length;
  const filteringRate = totalRecs > 0 ? (filteredTotal / totalRecs) * 100 : 0;
  const criticalReadings = allActive.filter(r => r.tpmValue >= 24).length;
  const criticalPct = totalRecs > 0 ? (criticalReadings / totalRecs) * 100 : 0;
  const avgTPMVal = totalRecs > 0 ? allActive.reduce((s, r) => s + r.tpmValue, 0) / totalRecs : 0;
  const tempRecsHabits = allActive.filter(r => r.setTemperature && r.actualTemperature);
  const goodTempHabits = tempRecsHabits.filter(r => Math.abs(((parseFloat(r.actualTemperature) - parseFloat(r.setTemperature)) / parseFloat(r.setTemperature)) * 100) <= 7);
  const tempControlPct = tempRecsHabits.length > 0 ? (goodTempHabits.length / tempRecsHabits.length) * 100 : 50;

  // Score: filtering (3pts) + avg TPM (3pts) + critical rate (2pts) + temp control (2pts) = 10 max
  let oilHabitsScore = 0;
  if (filteringRate >= 80) oilHabitsScore += 3; else if (filteringRate >= 50) oilHabitsScore += 2; else if (filteringRate >= 25) oilHabitsScore += 1;
  if (avgTPMVal < 15) oilHabitsScore += 3; else if (avgTPMVal < 18) oilHabitsScore += 2; else if (avgTPMVal < 22) oilHabitsScore += 1;
  if (criticalPct <= 5) oilHabitsScore += 2; else if (criticalPct <= 15) oilHabitsScore += 1;
  if (tempControlPct >= 85) oilHabitsScore += 2; else if (tempControlPct >= 65) oilHabitsScore += 1;

  const oilHabitsRating = oilHabitsScore >= 8 ? 'Excellent' : oilHabitsScore >= 5 ? 'Good' : oilHabitsScore >= 3 ? 'Fair' : 'Needs Work';

  const avgTPM = (allActive.reduce((s, r) => s + r.tpmValue, 0) / allActive.length).toFixed(1);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', marginBottom: '12px' }}>Dashboard</h2>

      {/* Achievement banner */}
      {currentStreak >= 7 && (
        <div style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 8px rgba(245,158,11,0.2)' }}>
          <div style={{ fontSize: '24px' }}>🔥</div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'white', marginBottom: '1px' }}>{currentStreak} Day Streak!</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>Keep it going.</div>
          </div>
        </div>
      )}

      {/* Gamified 2x2 stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)', borderRadius: '10px', padding: '16px 14px', color: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>CURRENT STREAK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '20px' }}>🔥</span>
            <span style={{ fontSize: '26px', fontWeight: '700', lineHeight: '1' }}>{currentStreak}</span>
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>days in a row</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', borderRadius: '10px', padding: '16px 14px', color: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>BEST STREAK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '20px' }}>🏆</span>
            <span style={{ fontSize: '26px', fontWeight: '700', lineHeight: '1' }}>{bestStreak}</span>
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>personal record</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${complianceRate >= 80 ? '#10b981' : complianceRate >= 60 ? '#f59e0b' : '#ef4444'} 0%, ${complianceRate >= 80 ? '#059669' : complianceRate >= 60 ? '#d97706' : '#dc2626'} 100%)`, borderRadius: '10px', padding: '16px 14px', color: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>COMPLIANCE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '20px' }}>✅</span>
            <span style={{ fontSize: '26px', fontWeight: '700', lineHeight: '1' }}>{complianceRate}%</span>
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>last 30 days</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${tempAdherence >= 80 ? '#06b6d4' : tempAdherence >= 60 ? '#f59e0b' : '#ef4444'} 0%, ${tempAdherence >= 80 ? '#0891b2' : tempAdherence >= 60 ? '#d97706' : '#dc2626'} 100%)`, borderRadius: '10px', padding: '16px 14px', color: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '6px', fontWeight: '600', letterSpacing: '0.5px' }}>TEMP CONTROL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '20px' }}>🌡️</span>
            <span style={{ fontSize: '26px', fontWeight: '700', lineHeight: '1' }}>{tempAdherence}%</span>
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>within target</div>
        </div>
      </div>

      {/* Secondary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '4px', letterSpacing: '0.5px' }}>AVG TPM</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937', marginBottom: '2px' }}>{avgTPM}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>all readings</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '4px', letterSpacing: '0.5px' }}>OIL HABITS</div>
          <div style={{ fontSize: '18px', marginBottom: '2px' }}>{oilHabitsScore >= 8 ? '⭐⭐⭐' : oilHabitsScore >= 5 ? '⭐⭐☆' : oilHabitsScore >= 3 ? '⭐☆☆' : '☆☆☆'}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{oilHabitsRating}</div>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '4px', letterSpacing: '0.5px' }}>TOTAL</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a428a', marginBottom: '2px' }}>{totalRecs}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>recordings</div>
        </div>
      </div>

      {/* Staff leaderboard */}
      {topStaff.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1f2937', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>🏆 Top Recorders</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {topStaff.map(([name, count], idx) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: idx === 0 ? '#fef3c7' : idx === 1 ? '#e0e7ff' : '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ fontSize: '20px', minWidth: '26px', textAlign: 'center' }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>{name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{count} recordings</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Settings View — read-only for venue staff config
// ─────────────────────────────────────────────
const SettingsView = ({ venue, systemSettings, onClose, onLogout, isDesktop }) => {
  // logout — no double-confirm, just log out directly

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937', margin: 0 }}>Settings</h2>
        <button onClick={onClose} style={{
          background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px',
          padding: '6px 12px', fontSize: '12px', fontWeight: '600', color: '#64748b', cursor: 'pointer'
        }}>
          Back
        </button>
      </div>

      {/* Venue info — read only */}
      <div style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
          Venue Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Venue Name</div>
            <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '500' }}>{venue?.name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Number of Fryers</div>
            <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '500' }}>{venue?.fryerCount || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>State</div>
            <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '500' }}>{venue?.state || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Customer Code</div>
            <div style={{ fontSize: '13px', color: '#1f2937', fontWeight: '500' }}>{venue?.customerCode || '—'}</div>
          </div>
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
          Venue configuration is managed by your admin or BDM.
        </div>
      </div>

      {/* TPM thresholds — read only */}
      <div style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#1f2937', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
          TPM Thresholds
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Warning Threshold</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b' }}>{systemSettings?.warningThreshold || 18}%</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '2px' }}>Critical Threshold</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>{systemSettings?.criticalThreshold || 24}%</div>
          </div>
        </div>
      </div>

      {/* Log Out — mobile only (desktop has it in sidebar) */}
      {!isDesktop && onLogout && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '20px', marginBottom: '40px' }}>
          <button onClick={() => { if (window.confirm('Are you sure you want to log out?')) onLogout(); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '9px', borderRadius: '8px', border: '1px solid #fca5a5',
            background: '#fff5f5', fontSize: '12px', fontWeight: '600', color: '#dc2626',
            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit'
          }}>
            <LogOut size={14} /> Log Out
          </button>
        </div>
      )}
      {isDesktop && <div style={{ marginBottom: '40px' }} />}
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
/**
 * VenueStaffView — the venue staff interface for FrySmart.
 *
 * Props (all data comes from parent / Supabase):
 *  - currentUser    {object}   { id, name, role, venueId, ... } from profiles table
 *  - venue          {object}   { id, name, fryerCount, state, customerCode, ... } from venues table
 *  - readings       {array}    flat array of tpm_readings rows (camelCase), scoped to this venue
 *  - systemSettings {object}   { warningThreshold, criticalThreshold, ... } from system_settings
 *  - onSaveReadings {function} (readingsArray) => void — parent persists to Supabase
 *  - onLogout       {function} () => void
 */
export default function VenueStaffView({
  currentUser = null,
  venue = null,
  readings: readingsProp = [],
  systemSettings = {},
  onSaveReadings,
  onLogout
}) {
  const readings = readingsProp;
  const settings = {
    warningThreshold: 18,
    criticalThreshold: 24,
    ...systemSettings
  };
  const theme = getThemeColors(systemSettings?.themeConfig);

  const fryerCount = venue?.fryerCount || 4;

  // Responsive breakpoint
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // UI-only state
  const [currentView, setCurrentView] = useState('record');
  const [calendarView, setCalendarView] = useState('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showSuccess, setShowSuccess] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningFryers, setWarningFryers] = useState([]);
  const [criticalFryers, setCriticalFryers] = useState([]);
  const [showCriticalModal, setShowCriticalModal] = useState(false);
  const [savedDate, setSavedDate] = useState(null);

  const grouped = groupReadingsByDate(readings);

  // Detect critical fryers from today's readings
  useEffect(() => {
    const today = getTodayString();
    const todayReadings = grouped[today] || [];
    const fryerGroups = {};
    todayReadings.forEach(rec => {
      if (rec.notInUse) return;
      if (!fryerGroups[rec.fryerNumber]) fryerGroups[rec.fryerNumber] = [];
      fryerGroups[rec.fryerNumber].push(rec);
    });

    const critical = [];
    Object.entries(fryerGroups).forEach(([fryerNum, recs]) => {
      const mostRecent = recs[recs.length - 1];
      const status = getTPMStatus(mostRecent.tpmValue, settings.warningThreshold, settings.criticalThreshold);
      if (status.level === 'critical') critical.push(parseInt(fryerNum));
    });
    setCriticalFryers(critical.sort((a, b) => a - b));
  }, [readings, settings.warningThreshold, settings.criticalThreshold]);

  // Check for duplicates — if any exist, mark as additional records instead of overwriting
  const checkAndSave = (newReadings) => {
    const tagged = newReadings.map(r => {
      const existing = readings.find(
        ex => ex.venueId === r.venueId && ex.fryerNumber === r.fryerNumber && ex.readingDate === r.readingDate
      );
      // If a reading already exists for this fryer/date, add as additional record
      if (existing) return { ...r, isOilChange: true };
      return r;
    });
    commitSave(tagged);
  };

  const commitSave = async (readingsToSave) => {
    const date = readingsToSave[0]?.readingDate || getTodayString();
    setSavedDate(date);

    // Show success immediately (optimistic) — save in background
    setShowSuccess(true);

    // Check for warnings
    const warnings = [];
    readingsToSave.forEach(rec => {
      if (rec.notInUse) return;
      const status = getTPMStatus(rec.tpmValue, settings.warningThreshold, settings.criticalThreshold);
      if (status.level === 'warning' || status.level === 'critical') warnings.push(rec.fryerNumber);
    });

    if (warnings.length > 0) {
      setWarningFryers(warnings);
      setTimeout(() => setShowWarning(true), 2100);
    } else {
      setTimeout(() => {
        setCurrentView('calendar');
        setCalendarView('day');
        setSelectedDate(new Date(date));
      }, 2100);
    }

    // Persist to Supabase in background (non-blocking)
    if (onSaveReadings) {
      onSaveReadings(readingsToSave).catch(err => console.error('Background save error:', err));
    }
  };

  const handleWarningClose = () => {
    setShowWarning(false);
    if (savedDate) {
      setCurrentView('calendar');
      setCalendarView('day');
      setSelectedDate(new Date(savedDate));
    }
  };

  const handleChangeOil = () => setShowCriticalModal(true);

  return (
    <div style={{
      ...(isDesktop
        ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : { minHeight: '100vh' }),
      background: '#f8fafc',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        button, input, select, textarea { font-family: inherit; }
      `}</style>
      {/* Admin preview banner */}
      {currentUser?.role === 'admin' && (
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
          ...(isDesktop ? { flexShrink: 0 } : {}), zIndex: 210
        }}>
          <Eye size={18} color="white" />
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'white', letterSpacing: '0.5px' }}>
            ADMIN PREVIEW — {venue?.name || 'Venue'}
          </span>
          <button onClick={() => { if (onLogout) onLogout(); }} style={{
            padding: '6px 14px', background: 'white', color: '#d97706', border: 'none',
            borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
            marginLeft: '4px'
          }}>← Back to Admin</button>
        </div>
      )}
      {/* Frysmart header bar */}
      <div style={{ ...(isDesktop ? { flexShrink: 0 } : {}), zIndex: 200, background: '#1a428a', padding: isDesktop ? '6px 16px' : '0 0 0 0' }}>
        {isDesktop ? (
          <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/images/App header.png" alt="Frysmart" style={{ height: '65px' }} />
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                background: theme.HEADER_BADGE_COLORS.venue.bg, color: theme.HEADER_BADGE_COLORS.venue.color, border: `1px solid ${theme.HEADER_BADGE_COLORS.venue.border}`,
                letterSpacing: '0.5px'
              }}>VENUE</span>
            </div>
            <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>{venue?.name || currentUser?.name || ''}</span>
          </div>
        ) : (
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {/* Row 1: Logo */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '-4px' }}>
              <img src="/images/App header.png" alt="Frysmart with Cookers" style={{ height: '62px', maxWidth: '100%', objectFit: 'contain', objectPosition: 'left' }} />
            </div>
            {/* Row 2: Badge + venue name (left) | settings (right) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '16px', paddingRight: '12px', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700',
                  background: theme.HEADER_BADGE_COLORS.venue.bg, color: theme.HEADER_BADGE_COLORS.venue.color, border: `1px solid ${theme.HEADER_BADGE_COLORS.venue.border}`,
                  letterSpacing: '0.5px'
                }}>VENUE</span>
                {venue?.name && (
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: '500', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {venue.name}
                  </span>
                )}
              </div>
              <button onClick={() => setCurrentView('settings')} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '10px',
                width: '38px', height: '38px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              >
                <Settings size={20} color="white" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Critical Banner */}
      {criticalFryers.length > 0 && <CriticalBanner criticalFryers={criticalFryers} onChangeOil={handleChangeOil} isDesktop={isDesktop} />}

      {/* Critical Oil Change Modal */}
      {showCriticalModal && criticalFryers.length > 0 && (
        <CriticalOilChangeModal criticalFryers={criticalFryers}
          onClose={() => setShowCriticalModal(false)}
          onSave={(recs) => commitSave(recs)}
          currentUser={currentUser}
          venueId={venue?.id}
        />
      )}

      {/* ─── Desktop: Sidebar + Content ─── */}
      {isDesktop ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Sidebar — fixed height, own scroll */}
          <div style={{
            width: '200px', flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0',
            padding: '20px 12px', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              {/* Core section — Summary + Dashboard */}
              <div style={{ background: '#f0f4fa', borderRadius: '10px', padding: '6px', marginBottom: '14px' }}>
                {[
                  { id: 'summary', label: 'Summary', icon: BarChart3 },
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                ].map(item => {
                  const isActive = currentView === item.id;
                  return (
                    <button key={item.id} onClick={() => setCurrentView(item.id)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '2px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#1a428a' : 'transparent',
                      color: isActive ? 'white' : '#1a428a',
                      fontWeight: '600', fontSize: '13px',
                    }}>
                      <item.icon size={17} color={isActive ? 'white' : '#1a428a'} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              {/* Recording section */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Recording</div>
                {[
                  { id: 'record', label: 'Record', icon: ClipboardList },
                  { id: 'calendar', label: 'Calendar', icon: Calendar },
                ].map(item => {
                  const isActive = currentView === item.id;
                  return (
                    <button key={item.id} onClick={() => setCurrentView(item.id)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#e8eef6' : 'transparent',
                      color: isActive ? '#1a428a' : '#1f2937',
                      fontWeight: isActive ? '600' : '500', fontSize: '13px',
                    }}>
                      <item.icon size={15} />
                      {item.label}
                    </button>
                  );
                })}
                {/* Day / Week / Month / Qtr / Year — always visible under Calendar */}
                <div style={{ paddingLeft: '28px', marginTop: '2px', marginBottom: '4px' }}>
                  {['Day', 'Week', 'Month', 'Quarter', 'Year'].map(v => {
                    const isScale = currentView === 'calendar' && calendarView === v.toLowerCase();
                    return (
                      <button key={v} onClick={() => { setCurrentView('calendar'); setCalendarView(v.toLowerCase()); }} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        marginBottom: '1px', textAlign: 'left',
                        background: isScale ? '#f0f4ff' : 'transparent',
                        color: isScale ? '#1a428a' : '#94a3b8',
                        fontWeight: isScale ? '600' : '500', fontSize: '13px',
                      }}>{v}</button>
                    );
                  })}
                </div>
              </div>
              {/* Configuration section */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Configuration</div>
                {(() => {
                  const isActive = currentView === 'settings';
                  return (
                    <button onClick={() => setCurrentView('settings')} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '9px 12px', paddingLeft: '16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      marginBottom: '1px', transition: 'all 0.15s', textAlign: 'left',
                      background: isActive ? '#e8eef6' : 'transparent',
                      color: isActive ? '#1a428a' : '#1f2937',
                      fontWeight: isActive ? '600' : '500', fontSize: '13px',
                    }}>
                      <Settings size={15} />
                      Settings
                    </button>
                  );
                })()}
              </div>
            </div>
            {/* Logout at bottom */}
            {onLogout && currentUser?.role !== 'admin' && (
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
            )}
          </div>
          {/* Content — scrollable area */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px clamp(16px, 2vw, 32px) 40px' }}>
            {currentView === 'settings' && (
              <SettingsView venue={venue} systemSettings={settings}
                onClose={() => setCurrentView('record')} onLogout={onLogout} isDesktop={isDesktop}
              />
            )}
            {currentView === 'record' && (
              <RecordingForm onSave={checkAndSave} currentUser={currentUser}
                venue={venue} existingReadings={readings}
              />
            )}
            {/* Calendar views — sub-tab selected from sidebar */}
            {currentView === 'calendar' && calendarView === 'day' && (
              <DayView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'week' && (
              <WeekView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'month' && (
              <MonthView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'quarter' && (
              <QuarterView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'year' && (
              <YearView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'summary' && (
              <SummaryView readings={readings} />
            )}
            {currentView === 'dashboard' && (
              <DashboardView readings={readings} />
            )}
          </div>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Mobile: Underline tab bar (matches Admin/GM style) ─── */}
          {currentView !== 'settings' && (
            <div style={{ position: 'sticky', top: 0, zIndex: 100, transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden' }}>
              {/* Main tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                {[
                  { id: 'record', label: 'Record', icon: ClipboardList },
                  { id: 'calendar', label: 'Calendar', icon: Calendar },
                  { id: 'summary', label: 'Summary', icon: BarChart3 },
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                ].map(view => {
                  const active = currentView === view.id;
                  return (
                    <button key={view.id} onClick={() => setCurrentView(view.id)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                      padding: '11px 8px', border: 'none', background: 'transparent',
                      borderBottom: active ? '3px solid #1a428a' : '3px solid transparent',
                      marginBottom: '-1px',
                      color: active ? '#1a428a' : '#64748b',
                      fontSize: '13px', fontWeight: active ? '700' : '500',
                      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}>
                      <view.icon size={15} />
                      {view.label}
                    </button>
                  );
                })}
              </div>
              {/* Calendar sub-tabs */}
              {currentView === 'calendar' && (
                <div style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '6px 16px', gap: '4px' }}>
                  {[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'quarter', label: 'Qtr' }, { id: 'year', label: 'Year' }].map(view => {
                    const active = calendarView === view.id;
                    return (
                      <button key={view.id} onClick={() => setCalendarView(view.id)} style={{
                        flex: 1, padding: '7px 12px', borderRadius: '8px', border: 'none',
                        background: active ? 'white' : 'transparent',
                        color: active ? '#1a428a' : '#64748b',
                        fontSize: '13px', fontWeight: active ? '600' : '500',
                        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      }}>
                        {view.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ paddingBottom: '40px' }}>
            {currentView === 'settings' && (
              <SettingsView venue={venue} systemSettings={settings}
                onClose={() => setCurrentView('record')} onLogout={onLogout} isDesktop={isDesktop}
              />
            )}
            {currentView === 'record' && (
              <RecordingForm onSave={checkAndSave} currentUser={currentUser}
                venue={venue} existingReadings={readings}
              />
            )}
            {currentView === 'calendar' && calendarView === 'day' && (
              <DayView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'week' && (
              <WeekView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'month' && (
              <MonthView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'quarter' && (
              <QuarterView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'calendar' && calendarView === 'year' && (
              <YearView readings={readings} selectedDate={selectedDate}
                onDateChange={setSelectedDate} fryerCount={fryerCount}
              />
            )}
            {currentView === 'summary' && (
              <SummaryView readings={readings} />
            )}
            {currentView === 'dashboard' && (
              <DashboardView readings={readings} />
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showSuccess && <SuccessModal onClose={() => setShowSuccess(false)} />}
      {showWarning && <WarningModal fryers={warningFryers} onClose={handleWarningClose} />}

      {/* CSS */}
      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .temp-label-mobile { display: inline; }
        .temp-label-desktop { display: none; }
        * { -webkit-tap-highlight-color: transparent; }
        input, select, textarea { font-size: 16px !important; }
        input[type="date"] {
          color-scheme: light;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          opacity: 0.5;
          cursor: pointer;
          padding: 4px;
        }
        input[type="date"]::-webkit-date-and-time-value {
          text-align: left;
        }
        @media (min-width: 600px) {
          .temp-label-mobile { display: none; }
          .temp-label-desktop { display: inline; }
          input, select, textarea { font-size: inherit !important; }
        }
      `}</style>
    </div>
  );
}
