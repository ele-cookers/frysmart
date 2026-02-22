import { useState } from 'react';
import { Settings } from 'lucide-react';

export const ColumnToggle = ({ columns, visible, setVisible }) => {
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
