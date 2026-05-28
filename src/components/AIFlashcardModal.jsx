/* ── AIFlashcardModal.jsx — Generate flashcards from documents via AI ── */
import { useState, useEffect } from 'react';
import { Brain, FileText, Sparkles, X, Loader, CheckSquare, Square } from 'lucide-react';
import { db } from '../services/db';
import { claude } from '../services/claudeService';
import ApiKeySetup from './ApiKeySetup';

export default function AIFlashcardModal({ onClose, onSaved, defaultSubjectId = null }) {
  const [subjects,          setSubjects]          = useState([]);
  const [docs,              setDocs]              = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(defaultSubjectId || '');
  const [selectedDocIds,    setSelectedDocIds]    = useState([]);
  const [count,             setCount]             = useState(15);
  const [generating,        setGenerating]        = useState(false);
  const [generatedCards,    setGeneratedCards]    = useState(null);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState('');
  const [hasKey,            setHasKey]            = useState(null);
  const [showSetup,         setShowSetup]         = useState(false);

  /* ── Load subjects & check key on mount ── */
  useEffect(() => {
    db.all('subjects').then(s => setSubjects(s.sort((a, b) => a.name.localeCompare(b.name))));
    claude.hasApiKey().then(setHasKey);
  }, []);

  /* ── Load docs when subject filter changes ── */
  useEffect(() => {
    const load = async () => {
      const d = selectedSubjectId
        ? await db.byIndex('documents', 'subjectId', selectedSubjectId)
        : await db.all('documents');
      setDocs(d.sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedDocIds([]);
      setGeneratedCards(null);
      setError('');
    };
    load();
  }, [selectedSubjectId]);

  const toggleDoc = (id) => {
    setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    setGeneratedCards(null);
    setError('');
  };

  const selectAll = () => { setSelectedDocIds(docs.map(d => d.id)); setGeneratedCards(null); };

  /* ── Generate ── */
  const generate = async () => {
    if (selectedDocIds.length === 0) { setError('Sélectionne au moins un document.'); return; }
    if (hasKey === false) { setShowSetup(true); return; }

    setGenerating(true);
    setError('');
    setGeneratedCards(null);

    try {
      // Collect text chunks for selected documents
      const textParts = [];
      for (const docId of selectedDocIds) {
        const chunks = await db.byIndex('documentChunks', 'documentId', docId);
        if (chunks.length > 0) {
          const sorted = chunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
          textParts.push(sorted.map(c => c.content || '').join('\n\n'));
        } else {
          // Fallback to the document's stored content field
          const doc = await db.get('documents', docId);
          if (doc?.content) textParts.push(doc.content);
        }
      }

      const combinedText = textParts.join('\n\n---\n\n').trim();
      if (!combinedText) {
        setError('Ces documents ne contiennent pas de texte extractible. Réessaie avec d\'autres fichiers.');
        return;
      }

      const subjectName = selectedSubjectId
        ? subjects.find(s => s.id === selectedSubjectId)?.name || ''
        : docs.filter(d => selectedDocIds.includes(d.id)).map(d => d.name).join(', ');

      const cards = await claude.generateFlashcardsFromText(combinedText, subjectName, count);

      if (!cards || cards.length === 0) {
        setError('Aucune fiche générée. Vérifie que les documents contiennent bien du texte.');
        return;
      }
      setGeneratedCards(cards);
    } catch (e) {
      const msg = e.message === 'NO_API_KEY' || e.message === 'INVALID_API_KEY'
        ? 'Clé API Claude invalide. Vérifie ta clé dans les paramètres.'
        : `Erreur : ${e.message}`;
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  /* ── Save to revisions store ── */
  const save = async () => {
    if (!generatedCards?.length) return;
    setSaving(true);
    try {
      for (const card of generatedCards) {
        await db.put('revisions', {
          id:         crypto.randomUUID(),
          front:      card.front,
          back:       card.back,
          difficulty: card.difficulty || 'medium',
          subjectId:  selectedSubjectId || null,
          status:     'unseen',
          interval:   0,
          ease:       2.5,
          nextReview: new Date().toISOString().split('T')[0],
          lastReview: null,
          createdAt:  new Date().toISOString(),
          source:     'ai-generated',
        });
      }
      onSaved?.(generatedCards.length);
      onClose?.();
    } catch (e) {
      setError(`Erreur de sauvegarde : ${e.message}`);
      setSaving(false);
    }
  };

  /* ── Key setup overlay ── */
  if (showSetup) {
    return (
      <ApiKeySetup
        onClose={() => setShowSetup(false)}
        onSaved={() => { claude.hasApiKey().then(setHasKey); setShowSetup(false); }}
      />
    );
  }

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        backgroundColor: 'var(--surface)', borderRadius: 16,
        border: '1px solid var(--border)', maxWidth: 560, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--primary), #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Générer des fiches avec l'IA</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Claude analyse tes documents et crée des flashcards SRS</p>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

          {/* Subject selector */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Matière</label>
            <select
              value={selectedSubjectId}
              onChange={e => setSelectedSubjectId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
            >
              <option value="">Toutes les matières</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Documents */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Documents — <span style={{ color: 'var(--primary)' }}>{selectedDocIds.length} sélectionné(s)</span>
              </label>
              {docs.length > 0 && (
                <button
                  onClick={selectedDocIds.length === docs.length ? () => setSelectedDocIds([]) : selectAll}
                  style={{ fontSize: 11.5, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  {selectedDocIds.length === docs.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              )}
            </div>

            {docs.length === 0 ? (
              <div style={{ padding: '14px', backgroundColor: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
                  {selectedSubjectId ? 'Aucun document importé pour cette matière.' : 'Aucun document dans la bibliothèque.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
                {docs.map(doc => {
                  const sel = selectedDocIds.includes(doc.id);
                  const subj = !selectedSubjectId ? subjects.find(s => s.id === doc.subjectId) : null;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDoc(doc.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                        backgroundColor: sel ? 'var(--primary)10' : 'var(--card)',
                        border: `1px solid ${sel ? 'var(--primary)55' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ color: sel ? 'var(--primary)' : 'var(--muted)', flexShrink: 0 }}>
                        {sel ? <CheckSquare size={15} /> : <Square size={15} />}
                      </span>
                      <FileText size={13} color="var(--muted)" style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: sel ? 600 : 400, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.name}
                      </span>
                      {subj && (
                        <span style={{ fontSize: 10.5, color: subj.color, fontWeight: 600, padding: '1px 6px', backgroundColor: subj.color + '18', borderRadius: 4, flexShrink: 0 }}>
                          {subj.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card count */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Nombre de fiches : <strong style={{ color: 'var(--primary)' }}>{count}</strong>
            </label>
            <input type="range" min={5} max={30} step={5} value={count}
              onChange={e => { setCount(+e.target.value); setGeneratedCards(null); }}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {[5, 10, 15, 20, 25, 30].map(n => <span key={n}>{n}</span>)}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#f87171', padding: '8px 12px', backgroundColor: '#f8717112', borderRadius: 8 }}>
              ⚠️ {error}
            </p>
          )}

          {/* Generated preview */}
          {generatedCards && (
            <div style={{ marginBottom: 4, padding: '14px', backgroundColor: 'var(--primary)0d', border: '1px solid var(--primary)33', borderRadius: 10 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                ✅ {generatedCards.length} fiches générées — aperçu :
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {generatedCards.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '7px 10px', backgroundColor: 'var(--card)', borderRadius: 7, border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Q : </span>
                    {c.front.slice(0, 90)}{c.front.length > 90 ? '…' : ''}
                  </div>
                ))}
                {generatedCards.length > 5 && (
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>
                    + {generatedCards.length - 5} autre(s) fiche(s)…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: 13.5, cursor: 'pointer' }}>
            Annuler
          </button>

          {!generatedCards ? (
            <button
              onClick={generate}
              disabled={generating || selectedDocIds.length === 0}
              style={{
                flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                background: generating || selectedDocIds.length === 0
                  ? 'var(--border)'
                  : 'linear-gradient(135deg, var(--primary), #a78bfa)',
                color: 'white', fontSize: 13.5, fontWeight: 600,
                cursor: generating || selectedDocIds.length === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.2s',
              }}
            >
              {generating
                ? <><Loader size={14} style={{ animation: 'ai-spin 1s linear infinite' }} /> Génération en cours…</>
                : <><Sparkles size={14} /> Générer {count} fiches</>
              }
            </button>
          ) : (
            <button
              onClick={save}
              disabled={saving}
              style={{
                flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                background: saving ? 'var(--border)' : 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white', fontSize: 13.5, fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {saving ? 'Sauvegarde…' : `💾 Sauvegarder ${generatedCards.length} fiches`}
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
