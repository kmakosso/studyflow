/* ── Assistant.jsx — Claude-powered Academic Assistant (StudyFlow V5) ── */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, RefreshCw, Bot, Key, Settings, ChevronRight,
  Sparkles, BookOpen, Calendar, BarChart2, Brain,
} from 'lucide-react';
import { claude } from '../services/claudeService';
import { useIntelligence } from '../contexts/IntelligenceContext';
import ApiKeySetup from '../components/ApiKeySetup';

/* ─── Quick prompt suggestions ────────────────────────────────────── */
const QUICK_PROMPTS = [
  { icon: '📅', text: 'Qu\'est-ce que j\'ai à faire cette semaine ?' },
  { icon: '📚', text: 'Crée-moi un planning de révision pour mes prochains examens' },
  { icon: '📊', text: 'Analyse mes résultats et donne-moi des conseils' },
  { icon: '⏱️', text: 'Comment optimiser mes sessions de travail ?' },
  { icon: '🎯', text: 'Quels sont mes devoirs urgents ?' },
  { icon: '🧠', text: 'Génère 10 questions de révision sur ma matière principale' },
];

/* ─── Message bubble components ─────────────────────────────────── */

function AssistantBubble({ text, streaming }) {
  // Render markdown-like text: bold (**text**), headers (##), lists (- item)
  const renderText = (raw) => {
    if (!raw) return null;
    const lines = raw.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('## ')) {
        elements.push(
          <p key={i} style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: 13.5, color: 'var(--primary)' }}>
            {line.slice(3)}
          </p>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <p key={i} style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
            {line.slice(4)}
          </p>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: 6, margin: '2px 0', fontSize: 13, color: 'var(--text)' }}>
            <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }}>•</span>
            <span>{formatInline(line.slice(2))}</span>
          </div>
        );
      } else if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+)\.\s(.*)/);
        if (match) {
          elements.push(
            <div key={i} style={{ display: 'flex', gap: 6, margin: '2px 0', fontSize: 13, color: 'var(--text)' }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0, fontWeight: 600, minWidth: 18 }}>{match[1]}.</span>
              <span>{formatInline(match[2])}</span>
            </div>
          );
        }
      } else if (line.trim() === '') {
        elements.push(<div key={i} style={{ height: 6 }} />);
      } else {
        elements.push(
          <p key={i} style={{ margin: '2px 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.55 }}>
            {formatInline(line)}
          </p>
        );
      }
      i++;
    }
    return elements;
  };

  const formatInline = (text) => {
    // Bold: **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    );
  };

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(124,106,247,.35)',
      }}>
        <Bot size={16} color="white" />
      </div>

      {/* Bubble */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '4px 14px 14px 14px', padding: '12px 16px',
        maxWidth: 600, flex: 1, minWidth: 0,
      }}>
        {renderText(text)}
        {streaming && (
          <span style={{
            display: 'inline-block', width: 8, height: 16, marginLeft: 2,
            backgroundColor: 'var(--primary)', borderRadius: 2,
            animation: 'blink 0.8s step-end infinite',
            verticalAlign: 'text-bottom',
          }} />
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
      <div style={{
        background: 'var(--primary)', color: 'white',
        borderRadius: '14px 4px 14px 14px',
        padding: '9px 14px', maxWidth: 420,
        fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap',
      }}>
        {text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Bot size={16} color="white" />
      </div>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '4px 14px 14px 14px', padding: '14px 18px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--muted)',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Energy pill ────────────────────────────────────────────────── */
function EnergyPill({ energy }) {
  if (!energy) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      backgroundColor: 'var(--card)', border: '1px solid var(--border)',
      fontSize: 12, color: 'var(--muted)',
    }}>
      <span style={{ fontSize: 14 }}>{energy.icon}</span>
      <span>Énergie <strong style={{ color: energy.color }}>{energy.label}</strong></span>
      <span>·</span>
      <span>{energy.todaySessions} session{energy.todaySessions !== 1 ? 's' : ''} · {energy.todayWorkMinutes} min</span>
    </div>
  );
}

/* ─── No API key banner ──────────────────────────────────────────── */
function NoKeyBanner({ onSetup }) {
  return (
    <div style={{
      margin: '20px 20px 0', padding: '14px 16px',
      backgroundColor: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Key size={17} color="white" />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Clé API manquante</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          Configure ta clé Anthropic pour activer l'assistant Claude
        </p>
      </div>
      <button
        onClick={onSetup}
        style={{
          padding: '7px 14px', borderRadius: 8,
          border: 'none', background: 'var(--primary)',
          color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Configurer
      </button>
    </div>
  );
}

/* ─── Welcome message ────────────────────────────────────────────── */
const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  text: `Bonjour ! Je suis **Claude**, ton assistant académique personnel dans StudyFlow.

Je connais ton emploi du temps, tes matières, devoirs et examens à venir. Je peux t'aider à :

- **Organiser ta semaine** et prioriser tes tâches
- **Créer des plannings de révision** adaptés à tes examens
- **Analyser tes résultats** et te suggérer des axes d'amélioration
- **Générer des fiches et QCM** à partir de tes documents
- **Répondre à toutes tes questions** académiques

Tout ce que tu m'envoies reste confidentiel — tu contrôles ce qui me parvient.`,
};

/* ─── Main component ─────────────────────────────────────────────── */
export default function Assistant() {
  const { energy }         = useIntelligence();
  const [messages,  setMessages]  = useState([WELCOME]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);     // currently streaming
  const [loading,   setLoading]   = useState(false);     // waiting for first token
  const [hasKey,    setHasKey]    = useState(null);      // null = unknown
  const [showSetup, setShowSetup] = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  // Conversation history for Claude (role/content format)
  const historyRef = useRef([]);

  /* check API key on mount */
  useEffect(() => {
    claude.hasApiKey().then(setHasKey);
  }, []);

  /* scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || streaming || loading) return;

    if (!hasKey) { setShowSetup(true); return; }

    setInput('');
    const userMsg = { id: crypto.randomUUID(), role: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Add to Claude history
    historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }];

    const assistantId = crypto.randomUUID();
    let   fullText    = '';

    try {
      // Create placeholder assistant message
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '', streaming: true }]);
      setLoading(false);
      setStreaming(true);

      const stream = await claude.chatWithContext(historyRef.current);

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, text: fullText } : m
        ));
      }

      // Mark done
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, text: fullText, streaming: false } : m
      ));

      // Save assistant turn in history
      historyRef.current = [...historyRef.current, { role: 'assistant', content: fullText }];

    } catch (err) {
      setLoading(false);
      const errorText = err.message === 'NO_API_KEY'
        ? 'Clé API manquante. Configure ta clé dans les paramètres.'
        : err.message === 'INVALID_API_KEY'
        ? 'Clé API invalide. Vérifie ta clé dans les paramètres.'
        : `Erreur : ${err.message}. Réessaie dans quelques instants.`;

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, text: errorText, streaming: false, error: true }
          : m
      ));
      // Remove failed turn from history
      historyRef.current = historyRef.current.slice(0, -1);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, streaming, loading, hasKey]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([WELCOME]);
    historyRef.current = [];
  };

  const handleSetupSaved = () => {
    setHasKey(true);
    setShowSetup(false);
  };

  const showQuickPrompts = messages.length <= 1 && !streaming && !loading;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(124,106,247,.35)',
          }}>
            <Bot size={18} color="white" />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Assistant Claude</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
              {hasKey ? '✓ Connecté · claude-opus-4-7' : 'Clé API requise'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EnergyPill energy={energy} />
          <button
            onClick={() => setShowSetup(true)}
            title="Paramètres API"
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 8px', cursor: 'pointer',
              color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12,
            }}
          >
            <Settings size={13} />
          </button>
          <button
            onClick={clearChat}
            title="Nouvelle conversation"
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 8px', cursor: 'pointer',
              color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12,
            }}
          >
            <RefreshCw size={13} /> Nouveau
          </button>
        </div>
      </div>

      {/* ── No key banner ── */}
      {hasKey === false && <NoKeyBanner onSetup={() => setShowSetup(true)} />}

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
        {messages.map(msg =>
          msg.role === 'user'
            ? <UserBubble key={msg.id} text={msg.text} />
            : <AssistantBubble key={msg.id} text={msg.text} streaming={msg.streaming} />
        )}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ── */}
      {showQuickPrompts && (
        <div style={{ padding: '0 20px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p.text)}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '5px 12px', fontSize: 12,
                color: 'var(--text)', cursor: 'pointer', fontWeight: 500,
                transition: 'border-color 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <span>{p.icon}</span> {p.text}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={{
        padding: '10px 16px 16px', borderTop: '1px solid var(--border)',
        backgroundColor: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          backgroundColor: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '8px 8px 8px 14px',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={hasKey ? 'Pose ta question…' : 'Configure ta clé API pour commencer…'}
            disabled={streaming || loading || hasKey === false}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              resize: 'none', fontSize: 13.5, color: 'var(--text)',
              lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
              opacity: hasKey === false ? 0.5 : 1,
            }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming || loading || hasKey === false}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: input.trim() && !streaming && !loading && hasKey ? 'var(--primary)' : 'var(--border)',
              color: 'white', cursor: input.trim() && !streaming && !loading && hasKey ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s', flexShrink: 0,
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Entrée pour envoyer · Shift+Entrée pour nouvelle ligne · Tes données restent locales
        </p>
      </div>

      {/* ── Modals ── */}
      {showSetup && (
        <ApiKeySetup
          onClose={() => setShowSetup(false)}
          onSaved={handleSetupSaved}
        />
      )}

      {/* CSS */}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1);   }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
