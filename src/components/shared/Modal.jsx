import { useEffect } from 'react';
import { X } from 'lucide-react';

const sizes = { sm: '400px', md: '520px', lg: '700px', xl: '900px' };

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: sizes[size],
        maxHeight: '90vh', overflowY: 'auto',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontWeight: 600, fontSize: 16 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'var(--muted)', padding: '4px', borderRadius: '6px',
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
