/* ── ApiKeySetup — First-run modal to enter Claude API key ── */
import { useState } from 'react';
import { Key, ExternalLink, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { setApiKey } from '../services/claudeService';

export default function ApiKeySetup({ onClose, onSaved }) {
  const [key,     setKey]     = useState('');
  const [show,    setShow]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('La clé doit commencer par "sk-ant-"');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await setApiKey(trimmed);
      setSuccess(true);
      setTimeout(() => { onSaved?.(); onClose?.(); }, 1200);
    } catch (e) {
      setError('Impossible de sauvegarder la clé.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        backgroundColor: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', padding: 32,
        maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Key size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Configurer l'assistant Claude
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Clé API Anthropic requise
            </p>
          </div>
        </div>

        {/* Privacy notice */}
        <div style={{
          backgroundColor: 'var(--card)', borderRadius: 10,
          border: '1px solid var(--border)', padding: '10px 14px',
          marginBottom: 20, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6,
        }}>
          🔒 <strong style={{ color: 'var(--text)' }}>Confidentialité</strong> — Ta clé est stockée
          uniquement sur ton appareil (IndexedDB). Aucune donnée n'est envoyée à Claude
          sans ta confirmation explicite.
        </div>

        {/* Input */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Clé API Anthropic
        </label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: '1px solid var(--border)', borderRadius: 10,
          backgroundColor: 'var(--card)', padding: '8px 12px',
          marginBottom: 8,
        }}>
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => { setKey(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="sk-ant-api03-..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--text)', fontFamily: 'monospace',
            }}
          />
          <button
            onClick={() => setShow(s => !s)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Error / success */}
        {error && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={13} /> {error}
          </p>
        )}
        {success && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#34d399', display: 'flex', alignItems: 'center', gap: 5 }}>
            <CheckCircle size={13} /> Clé enregistrée avec succès !
          </p>
        )}

        {/* Get key link */}
        <a
          href="https://console.anthropic.com/account/keys"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--primary)', textDecoration: 'none',
            marginBottom: 20,
          }}
        >
          <ExternalLink size={12} /> Obtenir une clé sur console.anthropic.com
        </a>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
                background: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer',
              }}
            >
              Annuler
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!key.trim() || saving || success}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
              background: key.trim() && !saving && !success ? 'var(--primary)' : 'var(--border)',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: key.trim() && !saving && !success ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Enregistrement…' : success ? 'Enregistré ✓' : 'Enregistrer la clé'}
          </button>
        </div>
      </div>
    </div>
  );
}
