/* ── Library.jsx — Bibliothèque par matière + analyse IA ── */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload, FileText, Search, Trash2, Sparkles,
  BookOpen, Brain, HelpCircle, FileCheck,
  X, Plus, AlertCircle, Loader, Eye, Filter,
} from 'lucide-react';
import { db } from '../services/db';
import { claude } from '../services/claudeService';
import { importDocument, ACCEPTED_TYPES, formatFileSize, getDocTypeLabel } from '../services/documentImporter';
import { uploadDocument, deleteDocument as deleteStorageDoc } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import ConsentModal from '../components/ConsentModal';
import ApiKeySetup from '../components/ApiKeySetup';

/* ─── Analysis tasks ──────────────────────────────────────────────── */

const ANALYSIS_TASKS = [
  { id:'summarize',  icon:FileCheck, label:'Résumé',         desc:'Résumé structuré avec points clés' },
  { id:'flashcards', icon:Brain,     label:'Flashcards',     desc:'Fiches de révision Q/R (JSON)' },
  { id:'questions',  icon:HelpCircle,label:'Questions',      desc:'10 questions + réponses détaillées' },
  { id:'quiz',       icon:BookOpen,  label:'QCM',            desc:'QCM 10 questions avec corrigé' },
  { id:'revision',   icon:FileText,  label:'Fiche révision', desc:'Fiche complète en Markdown' },
];

/* ─── File type chip ─────────────────────────────────────────────── */

function DocTypeChip({ ext }) {
  const colors = {
    pdf:'#ef4444', docx:'#3b82f6', doc:'#3b82f6',
    txt:'#6b7280', md:'#8b5cf6', markdown:'#8b5cf6',
    png:'#10b981', jpg:'#10b981', jpeg:'#10b981', webp:'#10b981',
  };
  const bg = colors[ext?.toLowerCase()] ?? '#6b7280';
  return (
    <span style={{
      padding:'2px 7px', borderRadius:4, fontSize:10.5, fontWeight:700,
      backgroundColor:bg+'22', color:bg, letterSpacing:'0.03em',
    }}>
      {getDocTypeLabel(ext)}
    </span>
  );
}

/* ─── Document card ──────────────────────────────────────────────── */

function DocCard({ doc, subjects, onAnalyze, onDelete, onView, onOpen, onDownload }) {
  const subj = subjects.find(s => s.id === doc.subjectId);
  return (
    <div style={{
      backgroundColor:'var(--card)', border:'1px solid var(--border)',
      borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10,
      borderTop: subj ? `3px solid ${subj.color}` : '3px solid var(--border)',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{
          width:38, height:38, borderRadius:8, flexShrink:0,
          backgroundColor:'var(--surface)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <FileText size={18} color="var(--primary)"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, fontWeight:600, fontSize:13.5, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {doc.name}
          </p>
          <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap', alignItems:'center' }}>
            <DocTypeChip ext={doc.ext}/>
            {subj && (
              <span style={{ fontSize:11, color:subj.color, fontWeight:600, padding:'1px 5px', backgroundColor:subj.color+'18', borderRadius:4 }}>
                {subj.name}
              </span>
            )}
            <span style={{ fontSize:11, color:'var(--muted)' }}>{formatFileSize(doc.size)}</span>
            {doc.wordCount > 0 && (
              <span style={{ fontSize:11, color:'var(--muted)' }}>{doc.wordCount.toLocaleString()} mots</span>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(doc.id)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2, flexShrink:0 }}>
          <Trash2 size={14}/>
        </button>
      </div>

      {doc.textPreview && (
        <p style={{
          margin:0, fontSize:11.5, color:'var(--muted)', lineHeight:1.5,
          WebkitLineClamp:2, display:'-webkit-box', WebkitBoxOrient:'vertical', overflow:'hidden',
        }}>
          {doc.textPreview}
        </p>
      )}

      {doc.aiSummary && (
        <div style={{ backgroundColor:'var(--surface)', borderRadius:8, border:'1px solid var(--border)', padding:'8px 12px' }}>
          <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'var(--primary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
            Résumé IA
          </p>
          <p style={{ margin:0, fontSize:12, color:'var(--text)', lineHeight:1.5, WebkitLineClamp:3, display:'-webkit-box', WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {doc.aiSummary}
          </p>
        </div>
      )}

      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {/* Open original file in new tab */}
        <button onClick={() => onOpen(doc)} style={{
          display:'flex', alignItems:'center', gap:4,
          padding:'5px 10px', borderRadius:7,
          border:'1px solid var(--border)', background:'none',
          color:'var(--muted)', fontSize:11.5, cursor:'pointer',
        }}
        title="Ouvrir le fichier original"
        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.color='var(--primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)'; }}
        >
          <Eye size={12}/> Ouvrir
        </button>
        {/* Download original */}
        <button onClick={() => onDownload(doc)} style={{
          display:'flex', alignItems:'center', gap:4,
          padding:'5px 10px', borderRadius:7,
          border:'1px solid var(--border)', background:'none',
          color:'var(--muted)', fontSize:11.5, cursor:'pointer',
        }}
        title="Télécharger le fichier original"
        onMouseEnter={e => { e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.color='var(--primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)'; }}
        >
          ⬇ Télécharger
        </button>
        {/* Extracted text viewer */}
        {doc.text && (
          <button onClick={() => onView(doc)} style={{
            display:'flex', alignItems:'center', gap:4,
            padding:'5px 10px', borderRadius:7,
            border:'1px solid var(--border)', background:'none',
            color:'var(--muted)', fontSize:11.5, cursor:'pointer',
          }}>
            <FileText size={12}/> Texte
          </button>
        )}
        {ANALYSIS_TASKS.map(task => (
          <button key={task.id} onClick={() => onAnalyze(doc, task.id)} style={{
            display:'flex', alignItems:'center', gap:4,
            padding:'5px 10px', borderRadius:7,
            border:'1px solid var(--border)', background:'none',
            color:'var(--text)', fontSize:11.5, cursor:'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='var(--primary)'; e.currentTarget.style.background='var(--surface)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='none'; }}
          >
            <Sparkles size={11} color="var(--primary)"/> {task.label}
          </button>
        ))}
      </div>

      <p style={{ margin:0, fontSize:10.5, color:'var(--muted)' }}>
        Importé le {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
      </p>
    </div>
  );
}

/* ─── Analysis panel ─────────────────────────────────────────────── */

function AnalysisPanel({ result, taskLabel, onClose }) {
  if (!result) return null;
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:900,
      backgroundColor:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', padding:20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor:'var(--surface)', borderRadius:16,
        border:'1px solid var(--border)', padding:24,
        maxWidth:700, width:'100%', maxHeight:'80vh',
        overflowY:'auto', boxShadow:'0 -10px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Sparkles size={16} color="var(--primary)"/>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>{taskLabel} — Résultat</h3>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>
            <X size={16}/>
          </button>
        </div>
        <pre style={{ margin:0, fontSize:12.5, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap', fontFamily:'inherit' }}>
          {result}
        </pre>
      </div>
    </div>
  );
}

/* ─── Subject filter tabs ────────────────────────────────────────── */

function SubjectTabs({ subjects, selected, onSelect }) {
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', padding:'0 20px 12px' }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          padding:'5px 12px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer',
          border:`1.5px solid ${!selected ? 'var(--primary)' : 'var(--border)'}`,
          backgroundColor: !selected ? 'var(--primary)' : 'var(--card)',
          color: !selected ? 'white' : 'var(--muted)',
          transition:'all 0.15s',
        }}
      >
        Tout
      </button>
      {subjects.map(s => (
        <button key={s.id} onClick={() => onSelect(s.id)} style={{
          padding:'5px 12px', borderRadius:20, fontSize:12.5, fontWeight:600, cursor:'pointer',
          border:`1.5px solid ${selected===s.id ? s.color : 'var(--border)'}`,
          backgroundColor: selected===s.id ? s.color+'18' : 'var(--card)',
          color: selected===s.id ? s.color : 'var(--muted)',
          transition:'all 0.15s',
        }}>
          {s.name}
        </button>
      ))}
    </div>
  );
}

/* ─── Main Library page ──────────────────────────────────────────── */

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [search,    setSearch]    = useState('');
  const [hasKey,    setHasKey]    = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [dragging,  setDragging]  = useState(false);

  const [consentDoc,  setConsentDoc]  = useState(null);
  const [consentTask, setConsentTask] = useState(null);

  const [analyzing,    setAnalyzing]    = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [analysisTask, setAnalysisTask] = useState('');
  const [showResult,   setShowResult]   = useState(false);
  const [viewDoc,      setViewDoc]      = useState(null);

  const fileInputRef = useRef(null);
  const { user } = useAuth();

  const filterSubjectId = searchParams.get('subject') || null;
  const setFilter = id => id ? setSearchParams({ subject:id }) : setSearchParams({});

  const load = useCallback(async () => {
    const [docs, subjs] = await Promise.all([db.all('documents'), db.all('subjects')]);
    setDocuments(docs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
    setSubjects(subjs.sort((a,b) => a.name.localeCompare(b.name)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { claude.hasApiKey().then(setHasKey); }, []);

  const activeSubject = filterSubjectId ? subjects.find(s => s.id === filterSubjectId) : null;

  /* ── Process multiple files ───────────────────────────────────── */
  const processFiles = async (files) => {
    if (!files.length) return;
    setImporting(true); setImportErr(''); setImportProgress('');
    let errors = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (files.length > 1) setImportProgress(`${i + 1}/${files.length} — ${file.name}`);
      try {
        const parsed = await importDocument(file);
        if (filterSubjectId) parsed.subjectId = filterSubjectId;

        // 1. Save metadata + extracted text to documents store (synced)
        await db.put('documents', parsed);

        // 2. Save the raw file Blob locally (never synced — stays on device)
        await db.put('documentFiles', { id: parsed.id, blob: file, name: file.name, mimeType: file.type });

        // 3. Upload original file to Supabase Storage when logged in
        if (user) {
          const storagePath = await uploadDocument(user.id, parsed.id, file);
          if (storagePath) await db.put('documents', { ...parsed, storagePath });
        }
      } catch (err) {
        errors.push(`${file.name} : ${err.message}`);
      }
    }
    await load();
    setImporting(false);
    setImportProgress('');
    if (errors.length) setImportErr(errors.join(' · '));
  };

  /* ── Open original file in new tab ───────────────────────────── */
  const openOriginal = async (doc) => {
    const record = await db.get('documentFiles', doc.id);
    if (record?.blob) {
      const url = URL.createObjectURL(record.blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else if (doc.storagePath && user) {
      // Fallback: fetch signed URL from Supabase Storage
      const { getDocumentUrl } = await import('../services/supabase');
      const url = await getDocumentUrl(doc.storagePath);
      if (url) window.open(url, '_blank');
      else setImportErr('Fichier original non disponible sur cet appareil.');
    } else {
      setImportErr('Fichier original non disponible sur cet appareil. Ré-importez le fichier.');
    }
  };

  /* ── Download original file ───────────────────────────────────── */
  const downloadOriginal = async (doc) => {
    const record = await db.get('documentFiles', doc.id);
    if (record?.blob) {
      const url = URL.createObjectURL(record.blob);
      const a   = document.createElement('a');
      a.href = url; a.download = doc.name; a.click();
      URL.revokeObjectURL(url);
    } else if (doc.storagePath && user) {
      const { getDocumentUrl } = await import('../services/supabase');
      const url = await getDocumentUrl(doc.storagePath);
      if (url) {
        const a = document.createElement('a');
        a.href = url; a.download = doc.name; a.click();
      } else {
        setImportErr('Impossible de télécharger depuis le cloud. Ré-importez le fichier.');
      }
    } else {
      setImportErr('Fichier original non disponible. Ré-importez le fichier pour le télécharger.');
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    e.target.value = '';
  };

  /* ── Drag & drop handlers ─────────────────────────────────────── */
  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragEnter = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = (e) => {
    // Only clear if leaving the top-level container
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['pdf','docx','doc','txt','md','markdown','csv','png','jpg','jpeg','webp'].includes(ext);
    });
    if (!files.length) { setImportErr('Format non supporté. Acceptés : PDF, DOCX, TXT, MD, images.'); return; }
    await processFiles(files);
  };

  /* ── Analysis ──────────────────────────────────────────────────── */
  const handleAnalyze = (doc, taskId) => {
    if (!hasKey) { setShowSetup(true); return; }
    setConsentDoc(doc);
    setConsentTask(ANALYSIS_TASKS.find(t => t.id === taskId));
  };

  const runAnalysis = async () => {
    if (!consentDoc || !consentTask) return;
    const doc  = consentDoc;
    const task = consentTask;
    setConsentDoc(null); setConsentTask(null);
    setAnalyzing(true); setAnalysisText(''); setAnalysisTask(task.label); setShowResult(true);

    let full = '';
    try {
      const stream = await claude.analyzeDocument(doc.text || '', task.id);
      for await (const chunk of stream) { full += chunk; setAnalysisText(full); }

      if (task.id === 'summarize') {
        await db.put('documents', { ...doc, aiSummary: full.slice(0,500) });
        await load();
      }
      if (task.id === 'flashcards') {
        try {
          const cards = JSON.parse(full.match(/\[[\s\S]*\]/)?.[0] || '[]');
          for (const card of cards) {
            await db.put('flashcards', {
              id: crypto.randomUUID(), documentId:doc.id,
              subjectId: doc.subjectId || null,
              front:card.front, back:card.back,
              difficulty:card.difficulty||'medium',
              nextReview:new Date().toISOString().split('T')[0],
              createdAt:new Date().toISOString(),
            });
          }
        } catch { /* JSON error */ }
      }
      if (task.id === 'quiz') {
        try {
          const questions = JSON.parse(full.match(/\[[\s\S]*\]/)?.[0] || '[]');
          await db.put('quizzes', {
            id:crypto.randomUUID(), documentId:doc.id,
            subjectId:doc.subjectId||null,
            title:`QCM — ${doc.name}`, questions,
            createdAt:new Date().toISOString(),
          });
        } catch { /* JSON error */ }
      }
    } catch (err) {
      setAnalysisText(`Erreur : ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce document ?')) return;
    const doc = documents.find(d => d.id === id);
    await db.del('documents', id);
    await db.del('documentFiles', id);       // delete local blob
    if (doc?.storagePath) {
      await deleteStorageDoc(doc.storagePath); // delete from Supabase Storage
    }
    await load();
  };

  const filtered = documents.filter(d => {
    const matchSubject = filterSubjectId ? d.subjectId === filterSubjectId : true;
    const matchSearch  = search
      ? d.name.toLowerCase().includes(search.toLowerCase()) ||
        subjects.find(s => s.id===d.subjectId)?.name.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchSubject && matchSearch;
  });

  const countBySubject = {};
  for (const d of documents) {
    if (d.subjectId) countBySubject[d.subjectId] = (countBySubject[d.subjectId]||0)+1;
  }

  return (
    <div
      style={{ height:'100%', display:'flex', flexDirection:'column', backgroundColor:'var(--bg)', overflow:'hidden', position:'relative' }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ── */}
      {dragging && (
        <div style={{
          position:'absolute', inset:0, zIndex:50,
          backgroundColor:'var(--primary)18',
          border:'3px dashed var(--primary)',
          borderRadius:12,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:12,
          pointerEvents:'none',
        }}>
          <Upload size={40} color="var(--primary)" />
          <p style={{ fontSize:18, fontWeight:700, color:'var(--primary)' }}>Dépose tes fichiers ici</p>
          <p style={{ fontSize:13, color:'var(--primary)', opacity:0.7 }}>PDF, DOCX, TXT, images…</p>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        padding:'16px 20px', borderBottom:'1px solid var(--border)',
        backgroundColor:'var(--surface)', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      }}>
        <div>
          <h1 style={{ margin:0, fontSize:18, fontWeight:700 }}>
            {activeSubject ? (
              <span><span style={{ color:activeSubject.color }}>●</span>{' '}Bibliothèque — {activeSubject.name}</span>
            ) : 'Bibliothèque'}
          </h1>
          <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>
            {filtered.length} document{filtered.length!==1?'s':''} · Glisse-dépose ou clique pour importer
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {hasKey===false && (
            <button onClick={() => setShowSetup(true)} style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'8px 14px', borderRadius:10, border:'1px solid #f59e0b',
              background:'none', color:'#f59e0b', fontSize:13, cursor:'pointer',
            }}>
              <Sparkles size={14}/> Config API
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            onChange={handleFileSelect}
            style={{ display:'none' }}
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 16px', borderRadius:10, border:'none',
            background:'var(--primary)', color:'white',
            fontSize:13, fontWeight:600, cursor:'pointer',
          }}>
            {importing
              ? <Loader size={14} style={{ animation:'spin 1s linear infinite' }}/>
              : <Upload size={14}/>}
            {importing
              ? (importProgress || 'Import…')
              : filterSubjectId ? `Importer dans ${activeSubject?.name}` : 'Importer'}
          </button>
        </div>
      </div>

      {/* ── Subject filter tabs ── */}
      {subjects.length > 0 && (
        <div style={{ paddingTop:12, borderBottom:'1px solid var(--border)', backgroundColor:'var(--surface)', flexShrink:0 }}>
          <SubjectTabs
            subjects={subjects.map(s => ({ ...s, _count: countBySubject[s.id]||0 }))}
            selected={filterSubjectId}
            onSelect={setFilter}
          />
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ padding:'12px 20px', flexShrink:0 }}>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          backgroundColor:'var(--card)', border:'1px solid var(--border)',
          borderRadius:10, padding:'7px 12px',
        }}>
          <Search size={14} color="var(--muted)"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={filterSubjectId ? `Rechercher dans ${activeSubject?.name}…` : 'Rechercher un document…'}
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, color:'var(--text)' }}
          />
          {(search || filterSubjectId) && (
            <button onClick={() => { setSearch(''); setFilter(null); }}
              style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:0, display:'flex' }}>
              <X size={14}/>
            </button>
          )}
        </div>
        {importErr && (
          <p style={{ margin:'8px 0 0', fontSize:12.5, color:'#f87171', display:'flex', alignItems:'center', gap:5 }}>
            <AlertCircle size={13}/> {importErr}
          </p>
        )}
      </div>

      {/* ── Documents grid ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
        {filtered.length === 0 ? (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', height:280, gap:12, color:'var(--muted)',
          }}>
            <FileText size={40} style={{ opacity:0.3 }}/>
            <p style={{ margin:0, fontSize:14 }}>
              {filterSubjectId
                ? `Aucun document dans ${activeSubject?.name}`
                : search ? 'Aucun document trouvé' : 'Glisse-dépose des fichiers ou clique sur Importer'}
            </p>
            {!search && (
              <button onClick={() => fileInputRef.current?.click()} style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'8px 16px', borderRadius:10,
                border:'1px solid var(--primary)', background:'none',
                color:'var(--primary)', fontSize:13, cursor:'pointer',
              }}>
                <Plus size={14}/>
                {filterSubjectId ? `Importer dans ${activeSubject?.name}` : 'Importer un document'}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:14 }}>
            {filtered.map(doc => (
              <DocCard key={doc.id} doc={doc} subjects={subjects}
                onAnalyze={handleAnalyze} onDelete={handleDelete} onView={setViewDoc}
                onOpen={openOriginal} onDownload={downloadOriginal}/>
            ))}
          </div>
        )}
      </div>

      {/* ── Consent modal ── */}
      {consentDoc && consentTask && (
        <ConsentModal
          documentName={consentDoc.name}
          dataPreview={`${consentDoc.wordCount?.toLocaleString()??'?'} mots · Tâche : ${consentTask.label}`}
          onConfirm={runAnalysis}
          onCancel={() => { setConsentDoc(null); setConsentTask(null); }}
        />
      )}

      {/* ── Analysis result panel ── */}
      {showResult && (
        <AnalysisPanel
          result={analyzing ? (analysisText||null) : analysisText}
          taskLabel={analysisTask}
          onClose={() => setShowResult(false)}
        />
      )}

      {/* ── Document viewer ── */}
      {viewDoc && (
        <div style={{
          position:'fixed', inset:0, zIndex:900,
          backgroundColor:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }} onClick={() => setViewDoc(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor:'var(--surface)', borderRadius:16,
            border:'1px solid var(--border)', padding:24,
            maxWidth:700, width:'100%', maxHeight:'80vh',
            overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15, fontWeight:700 }}>{viewDoc.name}</h3>
              <button onClick={() => setViewDoc(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>
                <X size={16}/>
              </button>
            </div>
            <pre style={{ margin:0, fontSize:12.5, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap', fontFamily:'inherit' }}>
              {viewDoc.text?.slice(0,10000)}
              {viewDoc.text?.length>10000 && '\n\n[… tronqué à 10 000 caractères]'}
            </pre>
          </div>
        </div>
      )}

      {/* ── API key setup ── */}
      {showSetup && (
        <ApiKeySetup onClose={() => setShowSetup(false)} onSaved={() => { setHasKey(true); setShowSetup(false); }}/>
      )}

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
