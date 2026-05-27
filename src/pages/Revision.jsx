import { useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, ChevronRight, Share2, FileDown } from 'lucide-react';
import { useRevision } from '../hooks/useRevision';
import { useSubjects } from '../hooks/useSubjects';
import { computeNextReview, getStatusColor, getStatusLabel, isDue } from '../services/srs';
import Modal from '../components/shared/Modal';
import ShareModal from '../components/shared/ShareModal';
import { printFlashcards } from '../services/printService';

function CardForm({ initial, subjects, onSubmit, onCancel }) {
  const [v, setV] = useState({
    subjectId: initial?.subjectId || '',
    front:     initial?.front     || '',
    back:      initial?.back      || '',
  });
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.front && v.back) onSubmit(v); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Matière</label>
        <select value={v.subjectId} onChange={set('subjectId')}>
          <option value="">— Aucune —</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Question / Recto *</label>
        <textarea value={v.front} onChange={set('front')} rows={3} placeholder="ex : Définir une liste chaînée" required />
      </div>
      <div className="form-group">
        <label className="form-label">Réponse / Verso *</label>
        <textarea value={v.back} onChange={set('back')} rows={4} placeholder="La réponse détaillée…" required />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Créer'}</button>
      </div>
    </form>
  );
}

function StudySession({ cards, onRate, onExit }) {
  const [idx, setIdx]       = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone]     = useState(0);

  const card = cards[idx];
  if (!card) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ fontSize: 22, marginBottom: 8 }}>🎉</p>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Session terminée !</p>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{done} cartes révisées</p>
      <button className="btn-primary" onClick={onExit}>Retour</button>
    </div>
  );

  const rate = (q) => {
    onRate(card.id, q);
    setFlipped(false);
    setIdx(i => i + 1);
    setDone(d => d + 1);
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{idx + 1} / {cards.length}</span>
        <div style={{ flex: 1, height: 4, backgroundColor: 'var(--border)', borderRadius: 4, margin: '0 12px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(idx / cards.length) * 100}%`, backgroundColor: 'var(--primary)', transition: 'width 0.3s' }} />
        </div>
        <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onExit}>Quitter</button>
      </div>

      {/* Card */}
      <div onClick={() => !flipped && setFlipped(true)} style={{
        cursor: flipped ? 'default' : 'pointer',
        minHeight: 200, padding: 28, borderRadius: 16,
        backgroundColor: 'var(--card)', border: `2px solid ${flipped ? 'var(--primary)' : 'var(--border)'}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        transition: 'border-color 0.2s',
      }}>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {flipped ? '✅ Réponse' : '❓ Question'}
        </p>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.6 }}>{flipped ? card.back : card.front}</p>
        {!flipped && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16, display: 'flex', alignItems: 'center', gap: 4 }}>
            Cliquer pour révéler <ChevronRight size={12} />
          </p>
        )}
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {[
            [1, 'À revoir',  '#ef4444'],
            [3, 'Difficile', '#f59e0b'],
            [4, 'Bien',      '#3b82f6'],
            [5, 'Facile',    '#22c55e'],
          ].map(([q, label, color]) => (
            <button key={q} onClick={() => rate(q)} style={{
              flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none',
              backgroundColor: color + '22', color, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Revision() {
  const { cards, loading, add, update, remove, dueToday } = useRevision();
  const { subjects, byId } = useSubjects();
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState(null);
  const [studying, setStudying]   = useState(false);
  const [subFilter, setSubFilter] = useState('all');
  const [shareOpen, setShareOpen] = useState(false);

  const due = dueToday();

  const handleRate = async (cardId, quality) => {
    const card    = cards.find(c => c.id === cardId);
    const updates = computeNextReview(card, quality);
    await update(cardId, updates);
  };

  const filtered = subFilter === 'all' ? cards : cards.filter(c => c.subjectId === subFilter);

  if (studying) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1 className="page-title" style={{ marginBottom: 24 }}>Session de révision</h1>
        <StudySession
          cards={due}
          onRate={handleRate}
          onExit={() => setStudying(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Révisions</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
            {due.length > 0 ? `${due.length} carte${due.length > 1 ? 's' : ''} à réviser aujourd'hui` : 'Aucune carte due — excellente forme !'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {due.length > 0 && (
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setStudying(true)}>
              <RotateCcw size={14} /> Réviser ({due.length})
            </button>
          )}
          {filtered.length > 0 && (
            <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShareOpen(true)}>
              <Share2 size={14} /> Partager
            </button>
          )}
          {filtered.length > 0 && (
            <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => printFlashcards(filtered, subFilter === 'all' ? 'Mes fiches de révision' : subjects.find(s => s.id === subFilter)?.name ?? 'Fiches')}>
              <FileDown size={14} /> Exporter PDF
            </button>
          )}
          <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={14} /> Créer
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['Pas vu',   cards.filter(c => c.status === 'unseen').length,   'var(--muted)'],
          ['En cours', cards.filter(c => c.status === 'learning').length, 'var(--warning)'],
          ['Maîtrisé', cards.filter(c => c.status === 'mastered').length, 'var(--success)'],
        ].map(([label, n, color]) => (
          <div key={label} style={{ padding: '8px 14px', backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <span style={{ fontWeight: 700, color, marginRight: 6 }}>{n}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 16 }}>
        <select value={subFilter} onChange={e => setSubFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Toutes les matières ({cards.length})</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({cards.filter(c => c.subjectId === s.id).length})</option>)}
        </select>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)' }}>Aucune carte. Créez votre première carte de révision !</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map(c => {
            const sub = byId(c.subjectId);
            const due = isDue(c);
            return (
              <div key={c.id} className="card card-hover" style={{ borderLeft: `3px solid ${getStatusColor(c.status)}`, position: 'relative' }}>
                {due && <span style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)' }} title="À réviser aujourd'hui" />}
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, paddingRight: 16 }}>{c.front}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.back}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {sub && <span style={{ fontSize: 11, color: sub.color }}>{sub.name}</span>}
                    <span style={{ fontSize: 11, color: getStatusColor(c.status) }}>{getStatusLabel(c.status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setEditing(c); setOpen(true); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => confirm('Supprimer cette carte ?') && remove(c.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {c.nextReview && <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Prochaine révision : {c.nextReview}</p>}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? 'Modifier la carte' : 'Nouvelle carte de révision'}>
        <CardForm
          initial={editing} subjects={subjects}
          onSubmit={async (data) => { editing ? await update(editing.id, data) : await add(data); setOpen(false); setEditing(null); }}
          onCancel={() => { setOpen(false); setEditing(null); }}
        />
      </Modal>

      <Modal isOpen={shareOpen} onClose={() => setShareOpen(false)} title="Partager les fiches">
        <ShareModal
          cards={filtered}
          title={subFilter === 'all' ? 'Mes fiches de révision' : subjects.find(s => s.id === subFilter)?.name ?? 'Fiches'}
          onClose={() => setShareOpen(false)}
        />
      </Modal>
    </div>
  );
}
