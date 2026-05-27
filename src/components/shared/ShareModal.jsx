import { useState } from 'react';
import { Copy, Check, Share2, AlertCircle, Loader } from 'lucide-react';
import { isSupabaseConfigured } from '../../services/supabase';
import { shareRevisionCards } from '../../services/shareService';

export default function ShareModal({ cards, title, onClose }) {
  const [step, setStep]           = useState('config'); // config | loading | done | error
  const [authorName, setAuthorName] = useState('');
  const [shareUrl, setShareUrl]   = useState('');
  const [copied, setCopied]       = useState(false);
  const [errMsg, setErrMsg]       = useState('');

  if (!isSupabaseConfigured) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} color="var(--warning)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Partage non disponible</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Le partage nécessite Supabase. Configure{' '}
          <code style={{ backgroundColor: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>
            VITE_SUPABASE_URL
          </code>{' '}
          et{' '}
          <code style={{ backgroundColor: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>
            VITE_SUPABASE_ANON_KEY
          </code>.
        </p>
        <button className="btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    );
  }

  const handleShare = async () => {
    setStep('loading');
    try {
      const id  = await shareRevisionCards(cards, title, authorName);
      setShareUrl(`${window.location.origin}/share/${id}`);
      setStep('done');
    } catch (err) {
      setErrMsg(err.message || 'Erreur inconnue');
      setStep('error');
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 'loading') return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Loader size={28} color="var(--primary)" style={{ margin: '0 auto 14px', display: 'block', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Création du lien de partage…</p>
    </div>
  );

  if (step === 'error') return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AlertCircle size={18} color="var(--danger)" />
        <span style={{ fontWeight: 700, fontSize: 15 }}>Échec du partage</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>{errMsg}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" onClick={onClose}>Fermer</button>
        <button className="btn-primary" onClick={() => setStep('config')}>Réessayer</button>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 16 }}>🎉 Lien créé !</p>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        Envoie ce lien à tes camarades. Ils pourront voir et importer tes{' '}
        <strong>{cards.length}</strong> fiche{cards.length > 1 ? 's' : ''}.
        Le lien est valable <strong>30 jours</strong>.
      </p>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: 'var(--surface)', borderRadius: 10,
        padding: '10px 14px', border: '1px solid var(--border)',
      }}>
        <span style={{
          flex: 1, fontSize: 13, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--primary)',
        }}>
          {shareUrl}
        </span>
        <button
          onClick={copy}
          title={copied ? 'Copié !' : 'Copier'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          {copied
            ? <Check size={16} color="var(--success)" />
            : <Copy size={16} color="var(--muted)" />}
        </button>
      </div>
      <button className="btn-primary" onClick={onClose}>Fermer</button>
    </div>
  );

  // step === 'config'
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Share2 size={18} color="var(--primary)" />
        <span style={{ fontWeight: 700, fontSize: 15 }}>Partager les fiches</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        {cards.length} fiche{cards.length > 1 ? 's' : ''} seront partagée{cards.length > 1 ? 's' : ''} via un lien public,
        accessible par n'importe qui.
      </p>
      <div className="form-group">
        <label className="form-label">Ton prénom (optionnel)</label>
        <input
          type="text"
          value={authorName}
          onChange={e => setAuthorName(e.target.value)}
          placeholder="ex : Amine"
          maxLength={50}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn-primary" onClick={handleShare} disabled={cards.length === 0}>
          Créer le lien
        </button>
      </div>
    </div>
  );
}
