import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useExams } from '../hooks/useExams';
import { useSubjects } from '../hooks/useSubjects';
import { useTags } from '../hooks/useTags';
import TagInput from '../components/shared/TagInput';
import Modal from '../components/shared/Modal';

function ExamForm({ initial, subjects, allTags, onSubmit, onCancel }) {
  const [v, setV] = useState({
    subjectId:  initial?.subjectId  || '',
    date:       initial?.date       || '',
    time:       initial?.time       || '09:00',
    room:       initial?.room       || '',
    chapters:   initial?.chapters   || '',
    importance: initial?.importance || 'medium',
    notes:      initial?.notes      || '',
    tags:       initial?.tags       || [],
  });
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.subjectId && v.date) onSubmit(v); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Matière *</label>
          <select value={v.subjectId} onChange={set('subjectId')} required>
            <option value="">— Choisir —</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Importance</label>
          <select value={v.importance} onChange={set('importance')}>
            <option value="low">Faible</option>
            <option value="medium">Normale</option>
            <option value="high">Haute</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date *</label>
          <input type="date" value={v.date} onChange={set('date')} required />
        </div>
        <div className="form-group">
          <label className="form-label">Heure</label>
          <input type="time" value={v.time} onChange={set('time')} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Salle</label>
          <input value={v.room} onChange={set('room')} placeholder="ex : C101" />
        </div>
        <div className="form-group">
          <label className="form-label">Chapitres</label>
          <input value={v.chapters} onChange={set('chapters')} placeholder="ex : Ch. 1 à 6" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Tags</label>
        <TagInput tags={v.tags} onChange={(tags) => setV(p => ({ ...p, tags }))} suggestions={allTags} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea value={v.notes} onChange={set('notes')} rows={2} placeholder="Informations complémentaires…" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

function Countdown({ exam }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const diff  = new Date(`${exam.date}T${exam.time || '00:00'}`) - now;
  if (diff < 0) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>Passé</span>;
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  const secs  = Math.floor((diff % 60000) / 1000);
  const col   = days <= 2 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)';
  if (days > 0) return <span style={{ fontWeight: 700, color: col }}>{days}j {hours}h</span>;
  return <span style={{ fontWeight: 700, color: col, fontFamily: 'monospace' }}>{hours.toString().padStart(2,'0')}:{mins.toString().padStart(2,'0')}:{secs.toString().padStart(2,'0')}</span>;
}

export default function Exams() {
  const { exams, loading, add, update, remove } = useExams();
  const { subjects, byId } = useSubjects();
  const { allTags }        = useTags();
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [tagFilter, setTagFilter] = useState('');

  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };

  const now    = new Date();
  const future = exams.filter(e => new Date(e.date) >= now);
  const past   = exams.filter(e => new Date(e.date) < now);
  const base   = showPast ? exams : future;
  const shown  = tagFilter ? base.filter(e => (e.tags || []).includes(tagFilter)) : base;
  const impCol = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' };

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">Examens</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              <option value="">Tous les tags</option>
              {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          <button onClick={() => setShowPast(p => !p)} className="btn-ghost" style={{ fontSize: 13 }}>
            {showPast ? 'Cacher passés' : `Passés (${past.length})`}
          </button>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       shown.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>Aucun examen.</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(e => {
            const sub    = byId(e.subjectId);
            const isPast = new Date(e.date) < now;
            return (
              <div key={e.id} className="card card-hover" style={{ borderLeft: `4px solid ${sub?.color || impCol[e.importance]}`, opacity: isPast ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{sub?.name || '?'}</span>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 12, fontWeight: 600, backgroundColor: (impCol[e.importance] || 'var(--muted)') + '22', color: impCol[e.importance] || 'var(--muted)' }}>
                        {e.importance === 'high' ? 'Important' : e.importance === 'medium' ? 'Normal' : 'Faible'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>📅 {format(new Date(e.date), 'EEEE d MMMM', { locale: fr })} à {e.time}</span>
                      {e.room && <span style={{ fontSize: 13, color: 'var(--muted)' }}>📍 {e.room}</span>}
                    </div>
                    {e.chapters && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>📖 {e.chapters}</p>}
                    {(e.tags || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        {e.tags.map(t => (
                          <span key={t} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, backgroundColor: 'var(--primary-dim)', color: 'var(--primary)', fontWeight: 600 }}>#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    {!isPast && <Countdown exam={e} />}
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => { setEditing(e); setOpen(true); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}><Pencil size={13} /></button>
                      <button onClick={() => confirm('Supprimer ?') && remove(e.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? "Modifier l'examen" : 'Nouvel examen'}>
        <ExamForm initial={editing} subjects={subjects} allTags={allTags} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}
