import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1.5px solid #e2e8f0', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box', background: 'white', color: '#1f2937',
  fontFamily: 'inherit', fontWeight: '500',
};

export function CustomerCodeInput({ venueId, onSave }) {
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
