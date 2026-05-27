import { useState } from 'react';
import { X } from 'lucide-react';

export default function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [input, setInput] = useState('');
  const [showSugg, setShowSugg] = useState(false);

  const add = (raw) => {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
    setShowSugg(false);
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  const filtered = suggestions.filter(s => !tags.includes(s) && s.includes(input.toLowerCase()) && input.length > 0);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px',
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, minHeight: 38,
      }}>
        {tags.map(t => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            backgroundColor: 'var(--primary-dim)', color: 'var(--primary)',
          }}>
            #{t}
            <button type="button" onClick={() => remove(t)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setShowSugg(true); }}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); add(input); }
            if (e.key === 'Backspace' && !input && tags.length > 0) remove(tags[tags.length - 1]);
          }}
          onFocus={() => setShowSugg(true)}
          onBlur={() => setTimeout(() => setShowSugg(false), 150)}
          placeholder={tags.length === 0 ? 'Ajouter des tags… (Entrée pour valider)' : ''}
          style={{
            flex: 1, minWidth: 120, background: 'none', border: 'none',
            outline: 'none', color: 'var(--text)', fontSize: 13, padding: '2px 4px',
          }}
        />
      </div>

      {showSugg && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          backgroundColor: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {filtered.slice(0, 6).map(s => (
            <button key={s} type="button" onMouseDown={() => add(s)} style={{
              display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
              background: 'none', border: 'none', color: 'var(--text)', fontSize: 13,
              cursor: 'pointer',
            }}>
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
