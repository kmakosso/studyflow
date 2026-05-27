/* ── AuthModal.jsx — Sign-in dialog ─────────────────────────────────
 *
 * Shows three sign-in methods: Google OAuth, GitHub OAuth, magic link.
 * When Supabase is not configured, shows a "local mode" message.
 */

import { useState } from 'react';
import { Chrome, Github, Mail, CheckCircle, AlertCircle, X } from 'lucide-react';
import Modal from './Modal';
import { useAuth } from '../../contexts/AuthContext';

export default function AuthModal({ isOpen, onClose }) {
  const { loginGoogle, loginGitHub, loginMagicLink, isConfigured } = useAuth();
  const [email,     setEmail]     = useState('');
  const [sent,      setSent]      = useState(false);
  const [loading,   setLoading]   = useState(null); // 'google' | 'github' | 'magic'
  const [error,     setError]     = useState('');

  const handle = (name, fn) => async (...args) => {
    setLoading(name);
    setError('');
    try {
      await fn(...args);
      if (name === 'magic') setSent(true);
      else onClose(); // OAuth redirects the page, so this rarely fires
    } catch (e) {
      setError(e.message || 'Une erreur est survenue.');
    } finally {
      setLoading(null);
    }
  };

  const handleMagic = handle('magic', () => loginMagicLink(email));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Se connecter / Sync cloud">
      {!isConfigured ? (
        /* ── Offline-only mode ── */
        <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
          <p style={{ color:'var(--muted)', lineHeight:1.6, marginBottom:12 }}>
            StudyFlow fonctionne en mode <strong>100% local</strong>.
            Tes données restent sur ton appareil.
          </p>
          <p style={{ color:'var(--muted)', fontSize:12.5 }}>
            Pour activer la sync cloud, configure <code>VITE_SUPABASE_URL</code>{' '}
            et <code>VITE_SUPABASE_ANON_KEY</code> dans ton fichier&nbsp;<code>.env.local</code>.
          </p>
        </div>
      ) : sent ? (
        /* ── Magic link sent ── */
        <div style={{ textAlign:'center', padding:'8px 0 16px' }}>
          <CheckCircle size={40} color="#22c55e" style={{ marginBottom:12 }}/>
          <p style={{ fontWeight:600, marginBottom:8 }}>Lien envoyé !</p>
          <p style={{ color:'var(--muted)', fontSize:13 }}>
            Vérifie ta boîte mail <strong>{email}</strong> et clique sur le lien
            pour te connecter.
          </p>
          <button className="btn-ghost" style={{ marginTop:16 }}
            onClick={() => { setSent(false); setEmail(''); onClose(); }}>
            Fermer
          </button>
        </div>
      ) : (
        /* ── Sign-in options ── */
        <div style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:8 }}>
          <p style={{ color:'var(--muted)', fontSize:13, marginBottom:4 }}>
            Connecte-toi pour synchroniser tes données entre appareils. Tes données
            locales sont conservées.
          </p>

          {/* Google */}
          <button
            onClick={handle('google', loginGoogle)}
            disabled={!!loading}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              padding:'11px 16px', borderRadius:10, border:'1px solid var(--border)',
              background:'var(--surface)', color:'var(--text)', fontWeight:600,
              fontSize:14, cursor: loading ? 'wait' : 'pointer',
              opacity: loading && loading !== 'google' ? 0.5 : 1,
              transition:'opacity 0.15s',
            }}
          >
            {loading === 'google'
              ? <span style={{ fontSize:13, color:'var(--muted)' }}>Redirection…</span>
              : <><Chrome size={17}/> Continuer avec Google</>}
          </button>

          {/* GitHub */}
          <button
            onClick={handle('github', loginGitHub)}
            disabled={!!loading}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              padding:'11px 16px', borderRadius:10, border:'1px solid var(--border)',
              background:'var(--surface)', color:'var(--text)', fontWeight:600,
              fontSize:14, cursor: loading ? 'wait' : 'pointer',
              opacity: loading && loading !== 'github' ? 0.5 : 1,
              transition:'opacity 0.15s',
            }}
          >
            {loading === 'github'
              ? <span style={{ fontSize:13, color:'var(--muted)' }}>Redirection…</span>
              : <><Github size={17}/> Continuer avec GitHub</>}
          </button>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'4px 0' }}>
            <hr style={{ flex:1, border:'none', borderTop:'1px solid var(--border)' }}/>
            <span style={{ color:'var(--muted)', fontSize:12 }}>ou par email</span>
            <hr style={{ flex:1, border:'none', borderTop:'1px solid var(--border)' }}/>
          </div>

          {/* Magic link */}
          <form onSubmit={e => { e.preventDefault(); handleMagic(); }}
            style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com"
              required
              disabled={!!loading}
              style={{ fontSize:14, padding:'10px 12px' }}
            />
            <button type="submit" className="btn-primary"
              disabled={!!loading || !email.includes('@')}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading === 'magic'
                ? 'Envoi en cours…'
                : <><Mail size={15}/> Envoyer un lien magique</>}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:8,
              padding:'10px 12px', borderRadius:8, background:'#ef444418',
              color:'#ef4444', fontSize:13,
            }}>
              <AlertCircle size={15} style={{ flexShrink:0, marginTop:1 }}/>
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
