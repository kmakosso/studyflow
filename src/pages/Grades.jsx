import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useGrades } from '../hooks/useGrades';
import { useSubjects } from '../hooks/useSubjects';
import Modal from '../components/shared/Modal';

function GradeForm({ initial, subjects, onSubmit, onCancel }) {
  const [v, setV] = useState({
    subjectId:   initial?.subjectId   || '',
    score:       initial?.score       ?? '',
    maxScore:    initial?.maxScore    ?? 20,
    coefficient: initial?.coefficient ?? 1,
    description: initial?.description || '',
    date:        initial?.date        || new Date().toISOString().split('T')[0],
  });
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!v.subjectId || v.score === '') return;
      onSubmit({ ...v, score: Number(v.score), maxScore: Number(v.maxScore), coefficient: Number(v.coefficient) });
    }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Matière *</label>
        <select value={v.subjectId} onChange={set('subjectId')} required>
          <option value="">— Choisir —</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Note *</label>
          <input type="number" min={0} step={0.01} value={v.score} onChange={set('score')} placeholder="ex : 15" required />
        </div>
        <div className="form-group">
          <label className="form-label">Sur</label>
          <input type="number" min={1} value={v.maxScore} onChange={set('maxScore')} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Coefficient</label>
          <input type="number" min={0.5} step={0.5} value={v.coefficient} onChange={set('coefficient')} />
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" value={v.date} onChange={set('date')} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Description (épreuve, contrôle…)</label>
        <input value={v.description} onChange={set('description')} placeholder="ex : Contrôle chapitre 3" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

function avgColor(avg) {
  if (avg === null) return 'var(--muted)';
  if (avg >= 16) return 'var(--success)';
  if (avg >= 12) return 'var(--warning)';
  return 'var(--danger)';
}

function SubjectBlock({ subject, gradeList, onEdit, onDelete, average }) {
  const [expanded, setExpanded] = useState(true);
  const avg = average(gradeList);

  return (
    <div className="card" style={{ borderLeft: `4px solid ${subject.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: subject.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{subject.name}</span>
        {gradeList.length > 0 && (
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: avgColor(avg) }}>
            {avg !== null ? avg.toFixed(2) + ' / 20' : '—'}
          </span>
        )}
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{gradeList.length} note{gradeList.length > 1 ? 's' : ''}</span>
        {expanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
      </div>

      {expanded && gradeList.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gradeList.map(g => {
            const norm = (g.score / (g.maxScore || 20)) * 20;
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', backgroundColor: 'var(--surface)', borderRadius: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: avgColor(norm), fontFamily: 'monospace', minWidth: 44 }}>
                  {g.score}/{g.maxScore || 20}
                </span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 12, backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
                  ×{g.coefficient}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>{g.description}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{g.date}</span>
                <button onClick={() => onEdit(g)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => onDelete(g.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {expanded && gradeList.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Aucune note.</p>
      )}
    </div>
  );
}

export default function Grades() {
  const { grades, loading, add, update, remove, forSubject, average } = useGrades();
  const { subjects } = useSubjects();
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(null);

  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };

  const allGrades   = grades;
  const globalAvg   = average(allGrades);
  const subjectsWithGrades = subjects.filter(s => forSubject(s.id).length > 0);
  const subjectsNoGrades   = subjects.filter(s => forSubject(s.id).length === 0);

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notes & Moyennes</h1>
          {globalAvg !== null && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              Moyenne générale : <strong style={{ color: avgColor(globalAvg) }}>{globalAvg.toFixed(2)} / 20</strong>
            </p>
          )}
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={15} /> Ajouter une note
        </button>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       subjects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)' }}>Créez d'abord des matières.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subjectsWithGrades.map(s => (
            <SubjectBlock key={s.id} subject={s} gradeList={forSubject(s.id)}
              onEdit={(g) => { setEditing(g); setOpen(true); }}
              onDelete={(id) => confirm('Supprimer cette note ?') && remove(id)}
              average={average}
            />
          ))}
          {subjectsNoGrades.map(s => (
            <SubjectBlock key={s.id} subject={s} gradeList={[]}
              onEdit={() => {}} onDelete={() => {}} average={average}
            />
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? 'Modifier la note' : 'Nouvelle note'}>
        <GradeForm initial={editing} subjects={subjects} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}
