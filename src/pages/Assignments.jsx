import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAssignments } from '../hooks/useAssignments';
import { useSubjects } from '../hooks/useSubjects';
import { useTags } from '../hooks/useTags';
import TagInput from '../components/shared/TagInput';
import Modal from '../components/shared/Modal';

const STATUS_LABELS   = { todo: 'À faire', in_progress: 'En cours', done: 'Terminé' };
const PRIORITY_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Haute' };

function AssignmentForm({ initial, subjects, allTags, onSubmit, onCancel }) {
  const [v, setV] = useState({
    title:       initial?.title       || '',
    subjectId:   initial?.subjectId   || '',
    description: initial?.description || '',
    dueDate:     initial?.dueDate     || '',
    priority:    initial?.priority    || 'medium',
    status:      initial?.status      || 'todo',
    subtasks:    initial?.subtasks    || [],
    tags:        initial?.tags        || [],
  });
  const [newSub, setNewSub] = useState('');
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));

  const addSub = () => {
    if (!newSub.trim()) return;
    setV(p => ({ ...p, subtasks: [...p.subtasks, { id: crypto.randomUUID(), text: newSub.trim(), done: false }] }));
    setNewSub('');
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.title.trim() && v.dueDate) onSubmit(v); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Titre *</label>
        <input value={v.title} onChange={set('title')} placeholder="ex : TP Java" required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Matière</label>
          <select value={v.subjectId} onChange={set('subjectId')}>
            <option value="">— Aucune —</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Date limite *</label>
          <input type="date" value={v.dueDate} onChange={set('dueDate')} required />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Priorité</label>
          <select value={v.priority} onChange={set('priority')}>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Haute</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select value={v.status} onChange={set('status')}>
            <option value="todo">À faire</option>
            <option value="in_progress">En cours</option>
            <option value="done">Terminé</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Tags</label>
        <TagInput tags={v.tags} onChange={(tags) => setV(p => ({ ...p, tags }))} suggestions={allTags} />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea value={v.description} onChange={set('description')} rows={2} placeholder="Détails…" />
      </div>
      <div className="form-group">
        <label className="form-label">Sous-tâches</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Nouvelle sous-tâche…"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} />
          <button type="button" className="btn-primary" style={{ padding: '8px 12px', flexShrink: 0 }} onClick={addSub}>+</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {v.subtasks.map(st => (
            <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', backgroundColor: 'var(--surface)', borderRadius: 6 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{st.text}</span>
              <button type="button" onClick={() => setV(p => ({ ...p, subtasks: p.subtasks.filter(s => s.id !== st.id) }))}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

function AssignmentCard({ a, sub, onEdit, onDelete, onToggleSubtask, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const daysLeft = Math.ceil((new Date(a.dueDate) - new Date()) / 86400000);
  const dateColor = daysLeft < 0 ? 'var(--danger)' : daysLeft <= 1 ? 'var(--warning)' : 'var(--muted)';

  return (
    <div className="card card-hover" style={{ borderLeft: `3px solid ${sub?.color || 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={() => onStatusChange(a.id, a.status === 'done' ? 'todo' : 'done')} style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          border: `2px solid ${a.status === 'done' ? 'var(--success)' : 'var(--border)'}`,
          backgroundColor: a.status === 'done' ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {a.status === 'done' && <Check size={11} color="white" />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, textDecoration: a.status === 'done' ? 'line-through' : 'none', color: a.status === 'done' ? 'var(--muted)' : 'var(--text)' }}>
              {a.title}
            </span>
            <span className={`badge priority-${a.priority}`}>{PRIORITY_LABELS[a.priority]}</span>
            <span className={`badge status-${a.status}`}>{STATUS_LABELS[a.status]}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {sub && <span style={{ fontSize: 12, color: sub.color }}>{sub.name}</span>}
            <span style={{ fontSize: 12, color: dateColor, fontWeight: 500 }}>
              {daysLeft < 0 ? `${-daysLeft}j de retard` : daysLeft === 0 ? "Aujourd'hui" : `${daysLeft}j`}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{format(new Date(a.dueDate), 'd MMM', { locale: fr })}</span>
          </div>
          {(a.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {a.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, backgroundColor: 'var(--primary-dim)', color: 'var(--primary)', fontWeight: 600 }}>#{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {a.subtasks?.length > 0 && (
            <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <button onClick={() => onEdit(a)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}><Pencil size={13} /></button>
          <button onClick={() => onDelete(a.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}><Trash2 size={13} /></button>
        </div>
      </div>

      {expanded && a.subtasks?.length > 0 && (
        <div style={{ marginTop: 10, paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {a.subtasks.map(st => (
            <div key={st.id} onClick={() => onToggleSubtask(a.id, st.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '3px 0' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${st.done ? 'var(--success)' : 'var(--border)'}`, backgroundColor: st.done ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {st.done && <Check size={9} color="white" />}
              </div>
              <span style={{ fontSize: 13, textDecoration: st.done ? 'line-through' : 'none', color: st.done ? 'var(--muted)' : 'var(--text)' }}>{st.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Assignments() {
  const { assignments, loading, add, update, remove, toggleSubtask } = useAssignments();
  const { subjects, byId } = useSubjects();
  const { allTags }        = useTags();
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [subFilter, setSubFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');

  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };

  const filtered = assignments.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (subFilter !== 'all' && a.subjectId !== subFilter) return false;
    if (tagFilter && !(a.tags || []).includes(tagFilter)) return false;
    return true;
  });

  const counts = { all: assignments.length, todo: 0, in_progress: 0, done: 0 };
  assignments.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">Devoirs & Projets</h1>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['all','Tous',counts.all],['todo','À faire',counts.todo],['in_progress','En cours',counts.in_progress],['done','Terminés',counts.done]].map(([val,label,n]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${filter === val ? 'var(--primary)' : 'var(--border)'}`,
            background: filter === val ? 'var(--primary-dim)' : 'transparent',
            color: filter === val ? 'var(--primary)' : 'var(--muted)',
          }}>{label} ({n})</button>
        ))}
        <select value={subFilter} onChange={e => setSubFilter(e.target.value)} style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}>
          <option value="all">Toutes matières</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}>
            <option value="">Tous les tags</option>
            {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       filtered.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--muted)' }}>Aucun devoir.</p></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(a => (
            <AssignmentCard key={a.id} a={a} sub={byId(a.subjectId)}
              onEdit={(a) => { setEditing(a); setOpen(true); }}
              onDelete={(id) => confirm('Supprimer ?') && remove(id)}
              onToggleSubtask={toggleSubtask}
              onStatusChange={(id, status) => update(id, { status })}
            />
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? 'Modifier le devoir' : 'Nouveau devoir'} size="lg">
        <AssignmentForm initial={editing} subjects={subjects} allTags={allTags} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}
