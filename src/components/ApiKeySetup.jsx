/* ── ApiKeySetup — Configure Claude and/or Grok API keys ── */
import { useState, useEffect } from 'react';
import { Key, ExternalLink, Eye, EyeOff, CheckCircle, AlertCircle, Bot } from 'lucide-react';
import { setApiKey, getApiKey, setGrokApiKey, getGrokApiKey } from '../services/claudeService';

const PROVIDERS = [
  {
    id:          'claude',
    name:        'Claude (Anthropic)',
    emoji:       '🤖',
    placeholder: 'sk-ant-api03-…',
    prefix:      'sk-ant-',
    color:       '#7c6af7',
    link:        'https://console.anthropic.com/account/keys',
    linkLabel:   'console.anthropic.com',
    getter:      getApiKey,
    setter:      setApiKey,
    models:      ['claude-opus-4-7', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  {
    id:          'grok',
    name:        'Grok (xAI)',
    emoji:       '⚡',
    placeholder: 'xai-…',
    prefix:      'xai-',
    color:       '#10b981',
    link:        'https://console.x.ai/',
    linkLabel:   'console.x.ai',
    getter:      getGrokApiKey,
    setter:      setGrokApiKey,
    models:      ['grok-3', 'grok-3-mini', 'grok-2'],
  },
];

export default function ApiKeySetup({ onClose, onSaved }) {
  const [tab,     setTab]     = useState('claude');
  const [keys,    setKeys]    = useState({ claude: '', grok: '' });
  const [show,    setShow]    = useState({ claude: false, grok: false });
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState('');

  // Load existing keys on mount
  useEffect(() => {
    Promise.all([getApiKey(), getGrokApiKey()]).then(([claude, grok]) => {
      setKeys({ claude: claude || '', grok: grok || '' });
    });
  }, []);

  const provider = PROVIDERS.find(p => p.id === tab);

  const handleSave = async () => {
    const key = keys[tab].trim();
    if (!key) { setError('Saisis une clé API.'); return; }
    if (tab === 'claude' && !key.startsWith('sk-ant-')) {
      setError('La clé Claude doit commencer par "sk-ant-"'); return;
    }
    // Grok keys start with "xai-" but we allow any non-empty key to be flexible
    if (tab === 'grok' && key.length < 10) {
      setError('La clé semble trop courte, vérifie ta clé xAI.'); return;
    }

    setSaving(true); setError('');
    try {
      await provider.setter(key);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSaved?.(); onClose?.(); }, 1200);
    } catch {
      setError('Impossible de sauvegarder la clé.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      backgroundColor:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div style={{
        backgroundColor:'var(--surface)', borderRadius:16,
        border:'1px solid var(--border)', padding:28,
        maxWidth:500, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div style={{
            width:44, height:44, borderRadius:12,
            background:`linear-gradient(135deg, ${provider.color}, ${provider.color}88)`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
          }}>
            {provider.emoji}
          </div>
          <div>
            <h2 style={{ margin:0, fontSize:17, fontWeight:700 }}>Configurer les IA</h2>
            <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>Clés stockées localement sur ton appareil</p>
          </div>
        </div>

        {/* Provider tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:20, padding:'4px', backgroundColor:'var(--card)', borderRadius:10, border:'1px solid var(--border)' }}>
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => { setTab(p.id); setError(''); setSuccess(false); }}
              style={{
                flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer',
                backgroundColor: tab === p.id ? p.color : 'transparent',
                color: tab === p.id ? '#fff' : 'var(--muted)',
                fontWeight: tab === p.id ? 700 : 500, fontSize:13,
                transition:'all 0.15s',
              }}>
              {p.emoji} {p.name}
            </button>
          ))}
        </div>

        {/* Available models */}
        <div style={{ marginBottom:14, padding:'8px 12px', backgroundColor:'var(--card)', borderRadius:8, border:'1px solid var(--border)' }}>
          <span style={{ fontSize:11.5, color:'var(--muted)' }}>
            Modèles disponibles : {' '}
            {provider.models.map((m, i) => (
              <span key={m}>
                <code style={{ fontSize:11, backgroundColor:'var(--surface)', padding:'1px 5px', borderRadius:3 }}>{m}</code>
                {i < provider.models.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        </div>

        {/* Privacy notice */}
        <div style={{
          backgroundColor:'var(--card)', borderRadius:10, border:'1px solid var(--border)',
          padding:'10px 14px', marginBottom:18, fontSize:12.5, color:'var(--muted)', lineHeight:1.6,
        }}>
          🔒 Ta clé est stockée uniquement dans ton navigateur (IndexedDB). Aucune donnée n'est envoyée sans ta confirmation.
        </div>

        {/* Key input */}
        <label style={{ display:'block', fontSize:13, fontWeight:600, marginBottom:6 }}>
          Clé API {provider.name}
        </label>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          border:`1px solid ${keys[tab] ? provider.color + '66' : 'var(--border)'}`,
          borderRadius:10, backgroundColor:'var(--card)', padding:'8px 12px', marginBottom:8,
          transition:'border-color 0.15s',
        }}>
          <input
            type={show[tab] ? 'text' : 'password'}
            value={keys[tab]}
            onChange={e => { setKeys(k => ({ ...k, [tab]: e.target.value })); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={provider.placeholder}
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, color:'var(--text)', fontFamily:'monospace' }}
          />
          <button onClick={() => setShow(s => ({ ...s, [tab]: !s[tab] }))}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2 }}>
            {show[tab] ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
          {keys[tab].length > 10 && (
            <span style={{ fontSize:10, color:provider.color, fontWeight:700 }}>✓</span>
          )}
        </div>

        {/* Error / success */}
        {error && (
          <p style={{ margin:'0 0 10px', fontSize:12.5, color:'#f87171', display:'flex', alignItems:'center', gap:5 }}>
            <AlertCircle size={13}/> {error}
          </p>
        )}
        {success && (
          <p style={{ margin:'0 0 10px', fontSize:12.5, color:'#34d399', display:'flex', alignItems:'center', gap:5 }}>
            <CheckCircle size={13}/> Clé enregistrée !
          </p>
        )}

        {/* Get key link */}
        <a href={provider.link} target="_blank" rel="noreferrer"
          style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:provider.color, textDecoration:'none', marginBottom:20 }}>
          <ExternalLink size={12}/> Obtenir une clé sur {provider.linkLabel}
        </a>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          {onClose && (
            <button onClick={onClose}
              style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid var(--border)', background:'none', color:'var(--muted)', fontSize:14, cursor:'pointer' }}>
              Fermer
            </button>
          )}
          <button onClick={handleSave} disabled={!keys[tab].trim() || saving || success}
            style={{
              flex:2, padding:'10px 0', borderRadius:10, border:'none',
              background: keys[tab].trim() && !saving && !success ? provider.color : 'var(--border)',
              color:'white', fontSize:14, fontWeight:600,
              cursor: keys[tab].trim() && !saving && !success ? 'pointer' : 'default',
              transition:'background 0.15s',
            }}>
            {saving ? 'Enregistrement…' : success ? 'Enregistré ✓' : `Enregistrer la clé ${provider.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
