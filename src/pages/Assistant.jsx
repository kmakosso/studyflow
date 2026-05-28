/* ── Assistant.jsx — Claude-powered Academic Assistant ── */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, RefreshCw, Bot, Key, Settings, Plus,
  MessageSquare, Trash2, ChevronLeft, ChevronRight,
  BookOpen, Save, Calendar, Bell,
} from 'lucide-react';
import { claude } from '../services/claudeService';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { db } from '../services/db';
import ApiKeySetup from '../components/ApiKeySetup';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/* ─── Quick prompts ──────────────────────────────────────────────── */
const QUICK_PROMPTS = [
  { icon: '📅', text: "Qu'est-ce que j'ai à faire cette semaine ?" },
  { icon: '📚', text: 'Crée-moi un planning de révision pour mes examens' },
  { icon: '📊', text: 'Analyse mes résultats et donne-moi des conseils' },
  { icon: '🎯', text: 'Quels sont mes devoirs urgents et en retard ?' },
  { icon: '🧠', text: 'Génère 10 flashcards sur ma matière principale' },
  { icon: '⏱️', text: 'Comment optimiser mes sessions de travail ?' },
];

/* ─── Action detector ────────────────────────────────────────────── */
function detectActions(text) {
  const actions = [];
  // Flashcards: JSON array with "front"/"back" keys
  const fcMatch = text.match(/\[[\s\S]{10,}?"front"[\s\S]*?"back"[\s\S]*?\]/);
  if (fcMatch) {
    try {
      const cards = JSON.parse(fcMatch[0]);
      if (Array.isArray(cards) && cards.length > 0 && cards[0].front && cards[0].back) {
        actions.push({ type: 'flashcards', label: `💾 Sauvegarder ${cards.length} fiche(s)`, data: cards });
      }
    } catch { /* ignore */ }
  }
  // QCM: JSON array with "question"/"choices" keys
  const quizMatch = text.match(/\[[\s\S]{10,}?"question"[\s\S]*?"choices"[\s\S]*?\]/);
  if (quizMatch && !fcMatch) {
    try {
      const quiz = JSON.parse(quizMatch[0]);
      if (Array.isArray(quiz) && quiz.length > 0 && quiz[0].question && quiz[0].choices) {
        actions.push({ type: 'quiz', label: `💾 Sauvegarder le QCM (${quiz.length} questions)`, data: quiz });
      }
    } catch { /* ignore */ }
  }
  return actions;
}

/* ─── Markdown renderer ──────────────────────────────────────────── */
function renderMarkdown(raw) {
  if (!raw) return null;
  const lines = raw.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      out.push(<p key={i} style={{ margin:'10px 0 4px', fontWeight:700, fontSize:13.5, color:'var(--primary)' }}>{line.slice(3)}</p>);
    } else if (line.startsWith('### ')) {
      out.push(<p key={i} style={{ margin:'8px 0 2px', fontWeight:700, fontSize:13 }}>{line.slice(4)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      out.push(
        <div key={i} style={{ display:'flex', gap:6, margin:'2px 0', fontSize:13 }}>
          <span style={{ color:'var(--primary)', flexShrink:0, marginTop:2 }}>•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)/);
      if (m) out.push(
        <div key={i} style={{ display:'flex', gap:6, margin:'2px 0', fontSize:13 }}>
          <span style={{ color:'var(--primary)', flexShrink:0, fontWeight:600, minWidth:18 }}>{m[1]}.</span>
          <span>{formatInline(m[2])}</span>
        </div>
      );
    } else if (line.startsWith('```')) {
      // Code block
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      out.push(
        <pre key={i} style={{ margin:'8px 0', padding:'10px 12px', borderRadius:8, backgroundColor:'var(--bg)', border:'1px solid var(--border)', fontSize:12, overflowX:'auto', lineHeight:1.5 }}>
          {codeLines.join('\n')}
        </pre>
      );
    } else if (line.trim() === '') {
      out.push(<div key={i} style={{ height:6 }}/>);
    } else {
      out.push(<p key={i} style={{ margin:'2px 0', fontSize:13, lineHeight:1.55 }}>{formatInline(line)}</p>);
    }
    i++;
  }
  return out;
}

function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ background:'var(--bg)', padding:'1px 5px', borderRadius:3, fontSize:12, fontFamily:'monospace' }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

/* ─── Bubbles ────────────────────────────────────────────────────── */
function AssistantBubble({ text, streaming, actions, onAction, subjects, activeSubjectId }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:20 }}>
      <div style={{
        width:34, height:34, borderRadius:'50%', flexShrink:0,
        background:'linear-gradient(135deg, var(--primary), #a78bfa)',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 2px 8px rgba(124,106,247,.35)',
      }}>
        <Bot size={16} color="white"/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:'4px 14px 14px 14px', padding:'12px 16px', maxWidth:640,
        }}>
          {renderMarkdown(text)}
          {streaming && (
            <span style={{
              display:'inline-block', width:8, height:16, marginLeft:2,
              backgroundColor:'var(--primary)', borderRadius:2,
              animation:'blink 0.8s step-end infinite', verticalAlign:'text-bottom',
            }}/>
          )}
        </div>
        {/* Action buttons */}
        {!streaming && actions?.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {actions.map((action, i) => (
              <button key={i} onClick={() => onAction(action, activeSubjectId)}
                style={{
                  display:'flex', alignItems:'center', gap:5,
                  padding:'6px 12px', borderRadius:8,
                  border:'1px solid var(--primary)', background:'var(--primary)15',
                  color:'var(--primary)', fontSize:12, fontWeight:600, cursor:'pointer',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background='var(--primary)25'}
                onMouseLeave={e => e.currentTarget.style.background='var(--primary)15'}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
      <div style={{
        background:'var(--primary)', color:'white',
        borderRadius:'14px 4px 14px 14px',
        padding:'9px 14px', maxWidth:440,
        fontSize:13.5, lineHeight:1.45, whiteSpace:'pre-wrap',
      }}>
        {text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:16 }}>
      <div style={{
        width:34, height:34, borderRadius:'50%', flexShrink:0,
        background:'linear-gradient(135deg, var(--primary), #a78bfa)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Bot size={16} color="white"/>
      </div>
      <div style={{
        background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:'4px 14px 14px 14px', padding:'14px 18px',
        display:'flex', gap:5, alignItems:'center',
      }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width:7, height:7, borderRadius:'50%', backgroundColor:'var(--muted)',
            animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`,
          }}/>
        ))}
      </div>
    </div>
  );
}

/* ─── History sidebar ────────────────────────────────────────────── */
function HistorySidebar({ conversations, activeId, onSelect, onNew, onDelete, collapsed, onToggle }) {
  const grouped = {};
  const today     = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

  for (const c of conversations) {
    const d = (c.updatedAt || c.createdAt || '').slice(0,10);
    const label = d === today ? "Aujourd'hui" : d === yesterday ? 'Hier' : d ? format(new Date(d + 'T12:00:00'), 'd MMM', { locale: fr }) : 'Anciens';
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(c);
  }

  if (collapsed) {
    return (
      <div style={{ width:40, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 0', gap:12, backgroundColor:'var(--surface)' }}>
        <button onClick={onToggle} title="Ouvrir l'historique"
          style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:4 }}>
          <ChevronRight size={16}/>
        </button>
        <button onClick={onNew} title="Nouvelle conversation"
          style={{ background:'var(--primary)22', border:'none', color:'var(--primary)', cursor:'pointer', display:'flex', padding:6, borderRadius:8 }}>
          <Plus size={14}/>
        </button>
      </div>
    );
  }

  return (
    <div style={{ width:240, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', backgroundColor:'var(--surface)', flexShrink:0 }}>
      {/* Header */}
      <div style={{ padding:'12px 10px', display:'flex', alignItems:'center', gap:6, borderBottom:'1px solid var(--border)' }}>
        <button onClick={onNew} style={{
          flex:1, display:'flex', alignItems:'center', gap:6, justifyContent:'center',
          padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)',
          background:'none', color:'var(--text)', fontSize:12.5, fontWeight:600, cursor:'pointer',
        }}>
          <Plus size={13}/> Nouvelle conversation
        </button>
        <button onClick={onToggle}
          style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:4 }}>
          <ChevronLeft size={15}/>
        </button>
      </div>

      {/* Conversation list */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 6px' }}>
        {conversations.length === 0 && (
          <p style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'20px 10px' }}>
            Aucune conversation sauvegardée
          </p>
        )}
        {Object.entries(grouped).map(([label, convs]) => (
          <div key={label}>
            <p style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'8px 6px 4px', margin:0 }}>
              {label}
            </p>
            {convs.map(c => (
              <div key={c.id}
                style={{
                  display:'flex', alignItems:'center', gap:4, padding:'6px 8px', borderRadius:8,
                  backgroundColor: c.id === activeId ? 'var(--primary)15' : 'transparent',
                  border: c.id === activeId ? '1px solid var(--primary)33' : '1px solid transparent',
                  cursor:'pointer', marginBottom:2,
                }}
                onClick={() => onSelect(c)}
              >
                <MessageSquare size={11} color="var(--muted)" style={{ flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:12, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.title || 'Sans titre'}
                </span>
                <button onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                  style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:2, flexShrink:0, opacity:0 }}
                  className="del-btn"
                >
                  <Trash2 size={10}/>
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <style>{`.del-btn { opacity: 0; } div:hover > .del-btn { opacity: 1 !important; }`}</style>
    </div>
  );
}

/* ─── Welcome message ────────────────────────────────────────────── */
const WELCOME_TEXT = `Bonjour ! Je suis **Claude**, ton assistant académique dans StudyFlow.

J'ai accès à l'ensemble de tes données : matières, devoirs, examens, notes, révisions, documents, objectifs et rappels.

Je peux t'aider à :
- **Organiser ta semaine** et prioriser tes tâches
- **Créer des plannings** adaptés à tes examens
- **Analyser tes résultats** et suggérer des améliorations
- **Générer des fiches et QCM** que tu peux sauvegarder directement
- **Répondre à toutes tes questions** académiques

Sélectionne une matière pour un contexte ciblé, ou pose ta question directement !`;

/* ─── Main component ─────────────────────────────────────────────── */
export default function Assistant() {
  const { energy }           = useIntelligence();
  const [messages,  setMessages]   = useState([{ id:'welcome', role:'assistant', text:WELCOME_TEXT, actions:[] }]);
  const [input,     setInput]      = useState('');
  const [streaming, setStreaming]  = useState(false);
  const [loading,   setLoading]    = useState(false);
  const [hasKey,    setHasKey]     = useState(null);
  const [hasGrok,   setHasGrok]    = useState(null);
  const [provider,  setProvider]   = useState('claude'); // 'claude' | 'grok'
  const [grokModel, setGrokModel]  = useState('grok-3');
  const [showSetup, setShowSetup]  = useState(false);
  const [subjects,  setSubjects]   = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [conversations,   setConversations]   = useState([]);
  const [activeConvId,    setActiveConvId]    = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notification, setNotification] = useState('');

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const historyRef = useRef([]);

  /* ── Init ── */
  useEffect(() => {
    claude.hasApiKey().then(setHasKey);
    claude.hasGrokApiKey().then(setHasGrok);
    db.all('subjects').then(s => setSubjects(s.sort((a,b) => a.name.localeCompare(b.name))));
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages, loading]);

  const loadConversations = async () => {
    const convs = await db.all('conversations');
    setConversations(convs.sort((a,b) => (b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')));
  };

  /* ── Save current conversation ── */
  const saveConversation = useCallback(async (msgs, convId) => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return convId;

    const title    = userMsgs[0].text.slice(0, 55) + (userMsgs[0].text.length > 55 ? '…' : '');
    const now      = new Date().toISOString();
    const id       = convId || crypto.randomUUID();

    await db.put('conversations', {
      id,
      title,
      subjectId:  activeSubjectId,
      messages:   msgs,
      history:    historyRef.current,
      createdAt:  convId ? undefined : now,
      updatedAt:  now,
    });
    await loadConversations();
    return id;
  }, [activeSubjectId]);

  /* ── Load a past conversation ── */
  const loadConversation = (conv) => {
    setMessages(conv.messages || []);
    historyRef.current = conv.history || [];
    setActiveConvId(conv.id);
    setActiveSubjectId(conv.subjectId || null);
  };

  /* ── New conversation ── */
  const newConversation = () => {
    setMessages([{ id:'welcome', role:'assistant', text:WELCOME_TEXT, actions:[] }]);
    historyRef.current = [];
    setActiveConvId(null);
    setInput('');
  };

  /* ── Delete conversation ── */
  const deleteConversation = async (id) => {
    await db.del('conversations', id);
    if (activeConvId === id) newConversation();
    await loadConversations();
  };

  /* ── Handle direct actions ── */
  const handleAction = async (action, subjectId) => {
    try {
      if (action.type === 'flashcards') {
        for (const card of action.data) {
          await db.put('revisions', {
            id:         crypto.randomUUID(),
            front:      card.front,
            back:       card.back,
            subjectId:  subjectId || null,
            status:     'unseen',
            nextReview: new Date().toISOString().split('T')[0],
            createdAt:  new Date().toISOString(),
          });
        }
        notify(`✅ ${action.data.length} fiche(s) sauvegardée(s) dans Révisions !`);
      }

      if (action.type === 'quiz') {
        await db.put('quizzes', {
          id:        crypto.randomUUID(),
          title:     `QCM — ${new Date().toLocaleDateString('fr-FR')}`,
          subjectId: subjectId || null,
          questions: action.data,
          createdAt: new Date().toISOString(),
        });
        notify(`✅ QCM sauvegardé (${action.data.length} questions) !`);
      }
    } catch (e) {
      notify(`❌ Erreur : ${e.message}`);
    }
  };

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  /* ── Send message ── */
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || streaming || loading) return;
    const activeKey = provider === 'grok' ? hasGrok : hasKey;
    if (!activeKey) { setShowSetup(true); return; }

    setInput('');
    const userMsg = { id: crypto.randomUUID(), role:'user', text:trimmed };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setLoading(true);

    historyRef.current = [...historyRef.current, { role:'user', content:trimmed }];

    const assistantId = crypto.randomUUID();
    let   fullText    = '';

    try {
      setMessages(prev => [...prev, { id:assistantId, role:'assistant', text:'', streaming:true, actions:[] }]);
      setLoading(false);
      setStreaming(true);

      // Build system prompt for Grok (same academic context)
      let stream;
      if (provider === 'grok') {
        const { buildAcademicContext, streamGrok } = await import('../services/claudeService');
        const contextBlock = await buildAcademicContext();
        const system = `Tu es l'assistant académique personnel de cet étudiant dans StudyFlow.\nTu réponds TOUJOURS en français, de façon précise et orientée action.\nCONTEXTE ACADÉMIQUE :\n${contextBlock}`;
        stream = streamGrok({ messages: historyRef.current, system, model: grokModel });
      } else {
        stream = activeSubjectId
          ? await claude.chatWithSubjectContext(historyRef.current, activeSubjectId)
          : await claude.chatWithContext(historyRef.current);
      }

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text:fullText } : m));
      }

      const actions = detectActions(fullText);
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, text:fullText, streaming:false, actions } : m
      ));

      historyRef.current = [...historyRef.current, { role:'assistant', content:fullText }];

      // Auto-save conversation
      const finalMsgs = [...newMsgs, { id:assistantId, role:'assistant', text:fullText, actions }];
      const savedId = await saveConversation(finalMsgs, activeConvId);
      if (!activeConvId) setActiveConvId(savedId);

    } catch (err) {
      setLoading(false);
      const errorText = (err.message === 'NO_API_KEY' || err.message === 'NO_GROK_API_KEY')
                        ? 'Clé API manquante. Configure ta clé dans les paramètres.'
                        : (err.message === 'INVALID_API_KEY' || err.message === 'INVALID_GROK_KEY')
                        ? 'Clé API invalide. Vérifie ta clé dans les paramètres.'
                        : `Erreur : ${err.message}`;
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, text:errorText, streaming:false, error:true, actions:[] } : m
      ));
      historyRef.current = historyRef.current.slice(0,-1);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, streaming, loading, hasKey, messages, activeSubjectId, activeConvId, saveConversation]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const showQuickPrompts = messages.length <= 1 && !streaming && !loading;
  const activeSubject    = subjects.find(s => s.id === activeSubjectId);
  const activeKey        = provider === 'grok' ? hasGrok : hasKey;

  return (
    <div style={{ height:'100%', display:'flex', overflow:'hidden', backgroundColor:'var(--bg)' }}>

      {/* ── History sidebar ── */}
      <HistorySidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={loadConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
      />

      {/* ── Main chat area ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Header */}
        <div style={{
          padding:'12px 16px', borderBottom:'1px solid var(--border)',
          backgroundColor:'var(--surface)',
          display:'flex', alignItems:'center', gap:10, flexShrink:0,
        }}>
          <div style={{
            width:34, height:34, borderRadius:'50%', flexShrink:0,
            background:'linear-gradient(135deg, var(--primary), #a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Bot size={16} color="white"/>
          </div>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontWeight:700, fontSize:14 }}>
              {provider === 'grok' ? '⚡ Assistant Grok' : '🤖 Assistant Claude'}
            </p>
            <p style={{ margin:0, fontSize:10.5, color:'var(--muted)' }}>
              {provider === 'grok'
                ? (hasGrok ? `✓ ${grokModel} · Accès complet` : 'Clé xAI requise')
                : (hasKey  ? '✓ claude-opus-4-7 · Accès complet' : 'Clé Anthropic requise')}
            </p>
          </div>

          {/* Provider selector */}
          <div style={{ display:'flex', gap:4, padding:3, backgroundColor:'var(--card)', borderRadius:8, border:'1px solid var(--border)' }}>
            {[{ id:'claude', label:'🤖 Claude' }, { id:'grok', label:'⚡ Grok' }].map(p => (
              <button key={p.id} onClick={() => { setProvider(p.id); newConversation(); }}
                style={{
                  padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                  backgroundColor: provider === p.id ? 'var(--primary)' : 'transparent',
                  color: provider === p.id ? '#fff' : 'var(--muted)',
                  transition:'all 0.15s',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Grok model selector */}
          {provider === 'grok' && (
            <select value={grokModel} onChange={e => setGrokModel(e.target.value)}
              style={{ padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:11.5, cursor:'pointer' }}>
              <option value="grok-3">grok-3</option>
              <option value="grok-3-mini">grok-3-mini</option>
              <option value="grok-2">grok-2</option>
            </select>
          )}

          {/* Subject selector */}
          <select
            value={activeSubjectId || ''}
            onChange={e => setActiveSubjectId(e.target.value || null)}
            style={{
              padding:'5px 10px', borderRadius:8, border:'1px solid var(--border)',
              background:'var(--card)', color: activeSubjectId ? activeSubject?.color || 'var(--text)' : 'var(--muted)',
              fontSize:12.5, fontWeight: activeSubjectId ? 600 : 400, cursor:'pointer',
              maxWidth:160,
            }}
          >
            <option value="">🌐 Toutes matières</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <button onClick={() => setShowSetup(true)} title="Paramètres API"
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'5px 8px', cursor:'pointer', color:'var(--muted)', display:'flex' }}>
            <Settings size={13}/>
          </button>
        </div>

        {/* No key banner */}
        {activeKey === false && (
          <div style={{ margin:'16px', padding:'14px 16px', backgroundColor:'var(--card)', border:'1px solid var(--border)', borderRadius:12, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg, #f59e0b, #ef4444)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Key size={17} color="white"/>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontSize:13.5, fontWeight:600 }}>
                Clé API {provider === 'grok' ? 'Grok (xAI)' : 'Claude (Anthropic)'} manquante
              </p>
              <p style={{ margin:'2px 0 0', fontSize:12, color:'var(--muted)' }}>
                {provider === 'grok' ? 'Obtiens une clé sur console.x.ai' : 'Obtiens une clé sur console.anthropic.com'}
              </p>
            </div>
            <button onClick={() => setShowSetup(true)}
              style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'var(--primary)', color:'white', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              Configurer
            </button>
          </div>
        )}

        {/* Subject context banner */}
        {activeSubjectId && (
          <div style={{ margin:'0 16px', marginTop:8, padding:'6px 12px', backgroundColor:activeSubject?.color+'18', border:`1px solid ${activeSubject?.color}44`, borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
            <BookOpen size={12} color={activeSubject?.color}/>
            <span style={{ fontSize:12, color:activeSubject?.color, fontWeight:600 }}>
              Contexte ciblé sur {activeSubject?.name} — RAG activé sur les documents de cette matière
            </span>
            <button onClick={() => setActiveSubjectId(null)}
              style={{ marginLeft:'auto', background:'none', border:'none', color:activeSubject?.color, cursor:'pointer', fontSize:11, fontWeight:600 }}>
              Retirer ×
            </button>
          </div>
        )}

        {/* Notification toast */}
        {notification && (
          <div style={{
            position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
            backgroundColor:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:12, padding:'10px 20px', fontSize:13, fontWeight:600,
            boxShadow:'0 4px 20px rgba(0,0,0,0.2)', zIndex:1000,
            color: notification.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
          }}>
            {notification}
          </div>
        )}

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px' }}>
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserBubble key={msg.id} text={msg.text}/>
              : <AssistantBubble key={msg.id} text={msg.text} streaming={msg.streaming}
                  actions={msg.actions} onAction={handleAction} subjects={subjects}
                  activeSubjectId={activeSubjectId}/>
          )}
          {loading && <TypingDots/>}
          <div ref={bottomRef}/>
        </div>

        {/* Quick prompts */}
        {showQuickPrompts && (
          <div style={{ padding:'0 16px 8px', display:'flex', flexWrap:'wrap', gap:6 }}>
            {QUICK_PROMPTS.map((p,i) => (
              <button key={i} onClick={() => sendMessage(p.text)}
                style={{
                  background:'var(--card)', border:'1px solid var(--border)',
                  borderRadius:20, padding:'5px 12px', fontSize:12,
                  color:'var(--text)', cursor:'pointer', fontWeight:500,
                  display:'flex', alignItems:'center', gap:5, transition:'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor='var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
              >
                <span>{p.icon}</span> {p.text}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div style={{ padding:'8px 16px 14px', borderTop:'1px solid var(--border)', backgroundColor:'var(--surface)', flexShrink:0 }}>
          <div style={{
            display:'flex', gap:8, alignItems:'flex-end',
            backgroundColor:'var(--card)', border:'1px solid var(--border)',
            borderRadius:14, padding:'8px 8px 8px 14px', transition:'border-color 0.15s',
          }}
            onFocusCapture={e => e.currentTarget.style.borderColor='var(--primary)'}
            onBlurCapture={e => e.currentTarget.style.borderColor='var(--border)'}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={activeKey
                ? (activeSubjectId ? `Question sur ${activeSubject?.name}…` : 'Pose ta question…')
                : 'Configure ta clé API pour commencer…'}
              disabled={streaming || loading || activeKey === false}
              rows={1}
              style={{
                flex:1, background:'none', border:'none', outline:'none',
                resize:'none', fontSize:13.5, color:'var(--text)',
                lineHeight:1.5, fontFamily:'inherit',
                maxHeight:120, overflowY:'auto',
                opacity: hasKey === false ? 0.5 : 1,
              }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button onClick={() => sendMessage()}
              disabled={!input.trim() || streaming || loading || activeKey === false}
              style={{
                width:34, height:34, borderRadius:10, border:'none',
                background: input.trim() && !streaming && !loading && activeKey ? 'var(--primary)' : 'var(--border)',
                color:'white', cursor: input.trim() && !streaming && !loading && activeKey ? 'pointer' : 'default',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.15s', flexShrink:0,
              }}
            >
              <Send size={15}/>
            </button>
          </div>
          <p style={{ margin:'5px 0 0', fontSize:11, color:'var(--muted)', textAlign:'center' }}>
            Entrée pour envoyer · Shift+Entrée pour nouvelle ligne
          </p>
        </div>
      </div>

      {/* API key setup */}
      {showSetup && (
        <ApiKeySetup onClose={() => setShowSetup(false)} onSaved={() => {
          // Refresh both key states after saving
          claude.hasApiKey().then(setHasKey);
          claude.hasGrokApiKey().then(setHasGrok);
          setShowSetup(false);
        }}/>
      )}

      <style>{`
        @keyframes pulse { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
