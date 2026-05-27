import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, BookOpen, CheckSquare, GraduationCap, Calendar, BarChart2 } from 'lucide-react';
import { useSearch } from '../../hooks/useSearch';

const TYPE_ICONS = {
  subject:    <BookOpen size={14} />,
  assignment: <CheckSquare size={14} />,
  exam:       <GraduationCap size={14} />,
  course:     <Calendar size={14} />,
  grade:      <BarChart2 size={14} />,
};

const TYPE_LABELS = {
  subject: 'Matière', assignment: 'Devoir', exam: 'Examen', course: 'Cours', grade: 'Note',
};

export default function GlobalSearch({ onClose }) {
  const { query, results, loading, search, clear } = useSearch();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (result) => {
    navigate(result.to);
    onClose();
  };

  const grouped = results.reduce((acc, r) => {
    acc[r.type] = acc[r.type] || [];
    acc[r.type].push(r);
    return acc;
  }, {});

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '80px 16px',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 600,
        backgroundColor: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={18} color="var(--muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="Rechercher cours, devoirs, examens, notes…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text)' }}
          />
          {query && (
            <button onClick={() => { clear(); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={16} />
            </button>
          )}
          <kbd style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {!query && (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Tapez pour rechercher dans tous vos contenus
            </div>
          )}
          {query && loading && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Recherche…</div>
          )}
          {query && !loading && results.length === 0 && (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Aucun résultat pour « {query} »</div>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {TYPE_LABELS[type]}
              </div>
              {items.map(r => (
                <button key={r.id} onClick={() => go(r)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <span style={{ color: r.color || 'var(--primary)', display: 'flex', flexShrink: 0 }}>
                    {TYPE_ICONS[type]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                    {r.subtitle && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{r.subtitle}</p>}
                  </div>
                  {r.meta && <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{r.meta}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          {[['↑↓','Naviguer'],['↵','Ouvrir'],['Esc','Fermer']].map(([k,l]) => (
            <span key={k} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 10 }}>{k}</kbd>{l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
