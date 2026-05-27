import { X } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],   desc: 'Recherche globale' },
  { keys: ['?'],           desc: 'Afficher cette aide' },
  { keys: ['G', 'puis D'], desc: 'Aller au Dashboard' },
  { keys: ['G', 'puis R'], desc: 'Aller aux Révisions' },
  { keys: ['G', 'puis P'], desc: 'Aller au Pomodoro' },
  { keys: ['G', 'puis A'], desc: 'Aller aux Statistiques' },
  { keys: ['G', 'puis L'], desc: 'Aller à la Bibliothèque' },
  { keys: ['G', 'puis E'], desc: 'Aller aux Examens' },
  { keys: ['G', 'puis S'], desc: 'Aller à l\'Emploi du temps' },
  { keys: ['Esc'],         desc: 'Fermer un modal / annuler' },
];

function Key({ label }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
      backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
      color: 'var(--text)', fontFamily: 'monospace', minWidth: 24,
    }}>
      {label}
    </kbd>
  );
}

export default function ShortcutsModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: 'var(--card)', borderRadius: 16,
        border: '1px solid var(--border)', padding: 28,
        width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Raccourcis clavier</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{desc}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {keys.map((k, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && k.startsWith('puis') === false && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+</span>}
                    <Key label={k} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 20, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Appuie sur <Key label="?" /> n'importe où pour afficher cette aide
        </p>
      </div>
    </div>
  );
}
