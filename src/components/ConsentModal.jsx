/* ── ConsentModal — Privacy consent before sending data to Claude ── */
import { Shield, FileText, X } from 'lucide-react';

/**
 * Props:
 *   documentName  — name of the document / data being sent
 *   dataPreview   — short description of what will be sent
 *   onConfirm     — called when user agrees
 *   onCancel      — called when user refuses
 */
export default function ConsentModal({ documentName, dataPreview, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        backgroundColor: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', padding: 28,
        maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={18} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Envoyer à Claude ?</h3>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>Confirmation requise</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Document info */}
        <div style={{
          backgroundColor: 'var(--card)', borderRadius: 10,
          border: '1px solid var(--border)', padding: '10px 14px',
          marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <FileText size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {documentName || 'Document'}
            </p>
            {dataPreview && (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                {dataPreview}
              </p>
            )}
          </div>
        </div>

        {/* Privacy info */}
        <div style={{
          fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 20,
        }}>
          <p style={{ margin: '0 0 8px' }}>
            Le contenu de ce document sera envoyé à <strong style={{ color: 'var(--text)' }}>Claude (Anthropic)</strong> pour analyse.
          </p>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>Claude ne stocke pas tes données après le traitement</li>
            <li>Le résultat sera sauvegardé localement sur ton appareil</li>
            <li>Tu peux refuser — aucune donnée ne sera transmise</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              border: '1px solid var(--border)', background: 'none',
              color: 'var(--muted)', fontSize: 13.5, cursor: 'pointer',
            }}
          >
            Non, annuler
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 10,
              border: 'none', background: 'var(--primary)',
              color: 'white', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Oui, envoyer à Claude
          </button>
        </div>
      </div>
    </div>
  );
}
