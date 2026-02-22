import { useState, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export const FilterableTh = ({ colKey, label, options, filters, setFilter, style = {}, children }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [alignRight, setAlignRight] = useState(false);
  const thRef = useRef(null);

  const activeVal = filters[colKey] || null;
  const hasFilter = !!activeVal;
  const allOptions = options.map(opt => ({ value: String(typeof opt === 'object' ? opt.value : opt), label: String(typeof opt === 'object' ? opt.label : opt) }));
  const allValues = allOptions.map(o => o.value);

  const currentDraft = draft !== null ? draft : (hasFilter ? new Set(Array.isArray(activeVal) ? activeVal : [activeVal]) : new Set(allValues));
  const draftAllSelected = currentDraft.size >= allValues.length;
  const filteredOpts = search ? allOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : allOptions;

  const openDropdown = () => {
    setDraft(hasFilter ? new Set(Array.isArray(activeVal) ? activeVal : [activeVal]) : new Set(allValues));
    setSearch('');
    if (thRef.current) {
      const rect = thRef.current.getBoundingClientRect();
      setAlignRight(rect.left + 200 > window.innerWidth);
    }
    setOpen(true);
  };
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
    <th ref={thRef} style={{ ...style, position: 'sticky', top: 0, zIndex: open ? 30 : 20, background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (!open) openDropdown(); }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: style.textAlign === 'center' ? 'center' : 'flex-start' }}>
        {children || label}
        <ChevronDown size={10} color={hasFilter ? '#1a428a' : '#94a3b8'} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        {hasFilter && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#1a428a', flexShrink: 0 }} />}
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999 }} onClick={e => { e.stopPropagation(); cancelAndClose(); }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', ...(alignRight ? { right: 0 } : { left: 0 }), marginTop: '2px', zIndex: 2000, background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
