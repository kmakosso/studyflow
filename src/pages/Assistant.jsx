/* ── Assistant.jsx — Claude-powered Academic Assistant ── */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, Key, Settings, Plus,
  MessageSquare, Trash2, ChevronLeft, ChevronRight,
  BookOpen, Mic, MicOff, ImagePlus, Volume2, VolumeX, X,
} from 'lucide-react';
import { claude } from '../services/claudeService';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { db } from '../services/db';
import { useSyncRefresh } from '../hooks/useSyncRefresh';
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

  // "Actions possibles" section detected → add quick-action shortcuts
  if (text.includes('Actions possibles') || text.includes('actions possibles')) {
    if (!fcMatch) {
      actions.push({ type: 'quick_flashcards', label: '✅ Créer des fiches de révision', data: null });
    }
    if (!quizMatch) {
      actions.push({ type: 'quick_quiz',       label: '🧠 Générer un quiz',             data: null });
    }
    actions.push({ type: 'quick_simplify', label: '🔁 Version encore plus simple', data: null });
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
function AssistantBubble({ text, streaming, actions, onAction, subjects, activeSubjectId, onSpeak, speaking }) {
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
          position:'relative',
        }}>
          {renderMarkdown(text)}
          {streaming && (
            <span style={{
              display:'inline-block', width:8, height:16, marginLeft:2,
              backgroundColor:'var(--primary)', borderRadius:2,
              animation:'blink 0.8s step-end infinite', verticalAlign:'text-bottom',
            }}/>
          )}
          {/* TTS button */}
          {!streaming && text && onSpeak && (
            <button
              onClick={onSpeak}
              title={speaking ? 'Arrêter la lecture' : 'Écouter la réponse'}
              style={{
                position:'absolute', top:8, right:8,
                background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6,
                color: speaking ? 'var(--primary)' : 'var(--muted)',
                opacity: speaking ? 1 : 0.5,
                transition:'opacity 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = speaking ? '1' : '0.5'; }}
            >
              {speaking ? <Volume2 size={13}/> : <VolumeX size={13}/>}
            </button>
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

function UserBubble({ text, imagePreview }) {
  return (
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14, flexDirection:'column', alignItems:'flex-end', gap:6 }}>
      {imagePreview && (
        <img
          src={imagePreview}
          alt="Image jointe"
          style={{ maxWidth:220, maxHeight:160, borderRadius:10, border:'2px solid var(--primary)44', objectFit:'cover' }}
        />
      )}
      <div style={{
        background:'var(--primary)', color:'white',
        borderRadius:'14px 4px 14px 14px',
        padding:'9px 14px', maxWidth:440,
        fontSize:13.5, lineHeight:1.45, whiteSpace:'pre-wrap',
      }}>
        {text || '📷 Analyse cette image'}
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
const WELCOME_TEXT = `👋 Bonjour ! Je suis ton **assistant de révision** dans StudyFlow.

Je ne suis pas un cours ou un manuel — je suis un **prof sympa** qui t'explique simplement, avec des exemples concrets, comme à l'oral.

🎯 **Ce que je fais pour toi :**
- Expliquer n'importe quelle notion en **30 secondes chrono**
- Créer des **fiches mémorisables** (pas des pavés indigestes)
- Générer des **quiz** pour tester tes connaissances
- Analyser ta **semaine, tes devoirs, tes examens**
- Répondre à tes questions **avec des exemples du quotidien**

📷 Tu peux aussi **envoyer une photo** de tes notes ou d'un exercice, je l'analyse !

Sélectionne une matière pour un contexte ciblé, ou pose ta question — je m'adapte à toi !`;

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
  const [notification,   setNotification]   = useState('');
  const [attachedImage,  setAttachedImage]  = useState(null);  // { base64, type, preview }
  const [isListening,    setIsListening]    = useState(false);
  const [speaking,       setSpeaking]       = useState(null);  // id of message being spoken

  const bottomRef     = useRef(null);
  const inputRef      = useRef(null);
  const historyRef    = useRef([]);
  const fileInputRef  = useRef(null);
  const recognitionRef = useRef(null);

  /* ── Init ── */
  useEffect(() => {
    claude.hasApiKey().then(setHasKey);
    claude.hasGrokApiKey().then(setHasGrok);
    db.all('subjects').then(s => setSubjects(s.sort((a,b) => a.name.localeCompare(b.name))));
    loadConversations();
  }, []);

  // Reload conversation list when cloud sync delivers new data
  const loadConvsCallback = useCallback(() => { loadConversations(); }, []);
  useSyncRefresh(loadConvsCallback);

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

  /* ── Image attachment ── */
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      setAttachedImage({ base64: data.split(',')[1], type: file.type, preview: data });
    };
    reader.readAsDataURL(file);
  };

  /* ── Voice recognition ── */
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      notify('❌ Micro non supporté sur ce navigateur. Utilise Chrome ou Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setIsListening(true);
    rec.onend   = () => setIsListening(false);

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      setInput(transcript);
      // Auto-send if final result and not empty
      if (e.results[e.results.length - 1]?.isFinal && transcript.trim()) {
        // Small delay to let state settle
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    rec.onerror = (e) => {
      setIsListening(false);
      const messages = {
        'network':       '❌ Erreur réseau : la reconnaissance vocale nécessite une connexion à Google. Tape ta question à la place.',
        'not-allowed':   '❌ Permission micro refusée. Autorise le microphone dans les paramètres du navigateur.',
        'audio-capture': '❌ Aucun microphone détecté.',
        'aborted':       null, // user stopped — ignore
        'no-speech':     null, // nothing heard — ignore
      };
      const msg = messages[e.error];
      if (msg) notify(msg);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setIsListening(false);
      notify('❌ Impossible de démarrer le microphone. Réessaie.');
    }
  };

  /* ── Text-to-speech ── */
  const speakText = (text, msgId) => {
    if (!('speechSynthesis' in window)) { notify('❌ Synthèse vocale non supportée.'); return; }
    window.speechSynthesis.cancel();
    if (speaking === msgId) { setSpeaking(null); return; }
    const clean = text
      .replace(/\*\*/g, '').replace(/`[^`]*`/g, '').replace(/#{1,3} /g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 2500);
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'fr-FR';
    utt.rate = 1.05;
    utt.onend  = () => setSpeaking(null);
    utt.onerror = () => setSpeaking(null);
    setSpeaking(msgId);
    window.speechSynthesis.speak(utt);
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
            difficulty: card.difficulty || 'medium',
            subjectId:  subjectId || null,
            status:     'unseen',
            interval:   0,
            ease:       2.5,
            nextReview: new Date().toISOString().split('T')[0],
            createdAt:  new Date().toISOString(),
            source:     'ai-assistant',
          });
        }
        notify(`✅ ${action.data.length} fiche(s) sauvegardée(s) dans Révisions !`);
        return;
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
        return;
      }

      // Quick follow-up actions (trigger a new message)
      const followUps = {
        quick_flashcards: 'Génère maintenant 10 flashcards sur ce sujet au format JSON [{"front":"…","back":"…","difficulty":"easy|medium|hard"}].',
        quick_quiz:       'Génère un QCM de 5 questions sur ce sujet au format JSON [{"question":"…","choices":["A:…","B:…","C:…","D:…"],"answer":"A","explanation":"…"}].',
        quick_simplify:   'Explique la même notion mais encore plus simplement, avec des mots encore plus accessibles et un exemple différent.',
      };
      const followUp = followUps[action.type];
      if (followUp) sendMessage(followUp);

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
    const isVision = !!attachedImage;
    if ((!trimmed && !isVision) || streaming || loading) return;

    const activeKey = provider === 'grok' ? hasGrok : hasKey;
    if (!activeKey) { setShowSetup(true); return; }
    if (isVision && !hasKey) { notify('❌ Vision IA nécessite une clé Claude (Anthropic).'); setShowSetup(true); return; }

    setInput('');
    // Capture image before clearing state
    const imgSnapshot = attachedImage;
    if (isVision) setAttachedImage(null);

    const displayText = trimmed || (isVision ? '📷 Analyse cette image' : '');
    const userMsg = { id: crypto.randomUUID(), role:'user', text: displayText, imagePreview: isVision ? imgSnapshot.preview : null };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setLoading(true);

    const assistantId = crypto.randomUUID();
    let   fullText    = '';

    try {
      setMessages(prev => [...prev, { id:assistantId, role:'assistant', text:'', streaming:true, actions:[] }]);
      setLoading(false);
      setStreaming(true);

      let stream;
      if (isVision) {
        // Vision: history does NOT include current message — chatVisionWithContext constructs it
        stream = await claude.chatVisionWithContext(trimmed, imgSnapshot.base64, imgSnapshot.type, historyRef.current);
        // Add text-only marker to history
        historyRef.current = [...historyRef.current, { role:'user', content: trimmed + ' [image jointe]' }];
      } else if (provider === 'grok') {
        historyRef.current = [...historyRef.current, { role:'user', content:trimmed }];
        const { buildAcademicContext, buildSystemPrompt, streamGrok } = await import('../services/claudeService');
        const contextBlock = await buildAcademicContext();
        const system = buildSystemPrompt(contextBlock);
        stream = streamGrok({ messages: historyRef.current, system, model: grokModel });
      } else {
        historyRef.current = [...historyRef.current, { role:'user', content:trimmed }];
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

      // Auto-save conversation (strip imagePreview data — too large for IndexedDB)
      const finalMsgs = [...newMsgs, { id:assistantId, role:'assistant', text:fullText, actions }]
        .map(({ imagePreview: _img, ...rest }) => rest);
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
  }, [input, streaming, loading, hasKey, hasGrok, provider, grokModel, attachedImage, messages, activeSubjectId, activeConvId, saveConversation]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Stop TTS when switching conversations
  const loadConversationWithStop = (conv) => {
    window.speechSynthesis?.cancel();
    setSpeaking(null);
    loadConversation(conv);
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
        onSelect={loadConversationWithStop}
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
              ? <UserBubble key={msg.id} text={msg.text} imagePreview={msg.imagePreview}/>
              : <AssistantBubble key={msg.id} text={msg.text} streaming={msg.streaming}
                  actions={msg.actions} onAction={handleAction} subjects={subjects}
                  activeSubjectId={activeSubjectId}
                  speaking={speaking === msg.id}
                  onSpeak={() => speakText(msg.text, msg.id)}
                />
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

          {/* Image preview */}
          {attachedImage && (
            <div style={{ marginBottom:8, display:'flex', alignItems:'flex-start', gap:8 }}>
              <div style={{ position:'relative', display:'inline-block' }}>
                <img
                  src={attachedImage.preview}
                  alt="Aperçu"
                  style={{ maxWidth:120, maxHeight:90, borderRadius:8, border:'2px solid var(--primary)44', objectFit:'cover', display:'block' }}
                />
                <button
                  onClick={() => setAttachedImage(null)}
                  style={{
                    position:'absolute', top:-6, right:-6,
                    width:20, height:20, borderRadius:'50%', border:'none',
                    background:'#ef4444', color:'white', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', padding:0,
                  }}
                >
                  <X size={11}/>
                </button>
              </div>
              <span style={{ fontSize:12, color:'var(--muted)', alignSelf:'center' }}>
                📷 Image jointe — demande à Claude de l'analyser
              </span>
            </div>
          )}

          <div style={{
            display:'flex', gap:6, alignItems:'flex-end',
            backgroundColor:'var(--card)', border:`1px solid ${isListening ? '#ef4444' : 'var(--border)'}`,
            borderRadius:14, padding:'8px 8px 8px 14px', transition:'border-color 0.15s',
          }}
            onFocusCapture={e => { if (!isListening) e.currentTarget.style.borderColor='var(--primary)'; }}
            onBlurCapture={e => { if (!isListening) e.currentTarget.style.borderColor='var(--border)'; }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                isListening ? '🎙️ Parle maintenant…'
                : activeKey
                  ? (attachedImage ? 'Décris ce que tu veux analyser (optionnel)…' : activeSubjectId ? `Question sur ${activeSubject?.name}…` : 'Pose ta question…')
                  : 'Configure ta clé API pour commencer…'
              }
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

            {/* Image button — only for Claude (vision) */}
            {provider !== 'grok' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display:'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Joindre une image"
                  disabled={streaming || loading}
                  style={{
                    width:32, height:32, borderRadius:8, border:'none',
                    background: attachedImage ? 'var(--primary)22' : 'none',
                    color: attachedImage ? 'var(--primary)' : 'var(--muted)',
                    cursor: streaming || loading ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink:0, transition:'all 0.15s',
                  }}
                >
                  <ImagePlus size={15}/>
                </button>
              </>
            )}

            {/* Mic button */}
            <button
              onClick={toggleVoice}
              title={isListening ? 'Arrêter l\'écoute' : 'Parler à l\'IA'}
              disabled={streaming || loading}
              style={{
                width:32, height:32, borderRadius:8, border:'none',
                background: isListening ? '#ef444422' : 'none',
                color: isListening ? '#ef4444' : 'var(--muted)',
                cursor: streaming || loading ? 'default' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0, transition:'all 0.15s',
                animation: isListening ? 'micPulse 1s ease-in-out infinite' : 'none',
              }}
            >
              {isListening ? <Mic size={15}/> : <MicOff size={15}/>}
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !attachedImage) || streaming || loading || activeKey === false}
              style={{
                width:34, height:34, borderRadius:10, border:'none',
                background: (input.trim() || attachedImage) && !streaming && !loading && activeKey ? 'var(--primary)' : 'var(--border)',
                color:'white', cursor: (input.trim() || attachedImage) && !streaming && !loading && activeKey ? 'pointer' : 'default',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.15s', flexShrink:0,
              }}
            >
              <Send size={15}/>
            </button>
          </div>
          <p style={{ margin:'5px 0 0', fontSize:11, color:'var(--muted)', textAlign:'center' }}>
            Entrée pour envoyer · Shift+Entrée pour nouvelle ligne · 📷 image · 🎙️ voix
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
        @keyframes pulse    { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes micPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
