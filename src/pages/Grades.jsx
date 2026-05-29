import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Package, SlidersHorizontal } from 'lucide-react';
import { useGrades } from '../hooks/useGrades';
import { useSubjects } from '../hooks/useSubjects';
import { useUEs } from '../hooks/useUEs';
import Modal from '../components/shared/Modal';
import {
  subjectAverage, subjectCoef, ueAverage, ueCoef, generalAverage,
  normalizeGrade, avgColor, isValidated,
} from '../services/gradeCalc';

/* ─── Formulaire de note ─────────────────────────────────────────── */
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
          <label className="form-label">Coefficient de la note</label>
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

/* ─── Gestion des UE ─────────────────────────────────────────────── */
function UEManager({ ues, subjects, onAdd, onUpdate, onDelete }) {
  const [name, setName] = useState('');
  const [coef, setCoef] = useState(1);
  const [editId, setEditId] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editId) await onUpdate(editId, { name: name.trim(), coefficient: Number(coef) || 1 });
    else        await onAdd({ name: name.trim(), coefficient: Number(coef) || 1 });
    setName(''); setCoef(1); setEditId(null);
  };

  const startEdit = (u) => { setEditId(u.id); setName(u.name); setCoef(u.coefficient ?? 1); };

  const subjectCount = (ueId) => subjects.filter(s => s.ueId === ueId).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <form onSubmit={submit} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div className="form-group" style={{ flex:1, minWidth:140 }}>
          <label className="form-label">Nom de l'UE</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ex : UE1 Fondamentaux" />
        </div>
        <div className="form-group" style={{ width:110 }}>
          <label className="form-label">Coef / Crédits</label>
          <input type="number" min={0.5} step={0.5} value={coef} onChange={e => setCoef(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary" style={{ height:38 }}>
          {editId ? 'Modifier' : 'Ajouter'}
        </button>
        {editId && (
          <button type="button" className="btn-ghost" style={{ height:38 }}
            onClick={() => { setEditId(null); setName(''); setCoef(1); }}>
            Annuler
          </button>
        )}
      </form>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {ues.length === 0 && (
          <p style={{ color:'var(--muted)', fontSize:13 }}>Aucune UE. Crée ta première unité d'enseignement ci-dessus.</p>
        )}
        {ues.map(u => (
          <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', backgroundColor:'var(--surface)', borderRadius:8 }}>
            <Package size={14} color="var(--primary)" />
            <span style={{ flex:1, fontSize:14, fontWeight:600 }}>{u.name}</span>
            <span style={{ fontSize:11, padding:'1px 8px', borderRadius:12, backgroundColor:'var(--border)', color:'var(--muted)' }}>
              coef {u.coefficient ?? 1}
            </span>
            <span style={{ fontSize:11, color:'var(--muted)' }}>
              {subjectCount(u.id)} matière{subjectCount(u.id) > 1 ? 's' : ''}
            </span>
            <button onClick={() => startEdit(u)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:2 }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => { if (confirm(`Supprimer l'UE « ${u.name} » ? Les matières seront déplacées en « Hors UE ».`)) onDelete(u.id); }}
              style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:2 }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Ligne matière (dépliable) ──────────────────────────────────── */
function SubjectRow({ subject, gradeList, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const avg = subjectAverage(gradeList);

  return (
    <div style={{ borderRadius:8, backgroundColor:'var(--surface)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor: gradeList.length ? 'pointer' : 'default' }}
        onClick={() => gradeList.length && setExpanded(e => !e)}>
        <div style={{ width:8, height:8, borderRadius:'50%', backgroundColor: subject.color, flexShrink:0 }} />
        <span style={{ fontWeight:600, fontSize:14, flex:1 }}>{subject.name}</span>
        <span style={{ fontSize:11, padding:'1px 6px', borderRadius:12, backgroundColor:'var(--border)', color:'var(--muted)' }}>
          coef {subjectCoef(subject)}
        </span>
        <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:15, color: avgColor(avg), minWidth:74, textAlign:'right' }}>
          {avg !== null ? avg.toFixed(2) + '/20' : '—'}
        </span>
        <span style={{ color:'var(--muted)', fontSize:11, minWidth:54, textAlign:'right' }}>
          {gradeList.length} note{gradeList.length > 1 ? 's' : ''}
        </span>
        {gradeList.length > 0
          ? (expanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />)
          : <span style={{ width:14 }} />}
      </div>

      {expanded && gradeList.length > 0 && (
        <div style={{ padding:'0 12px 10px', display:'flex', flexDirection:'column', gap:5 }}>
          {gradeList.map(g => {
            const norm = normalizeGrade(g);
            return (
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 10px', backgroundColor:'var(--card)', borderRadius:8 }}>
                <span style={{ fontWeight:700, fontSize:13, color: avgColor(norm), fontFamily:'monospace', minWidth:50 }}>
                  {g.score}/{g.maxScore || 20}
                </span>
                <span style={{ fontSize:11, padding:'1px 6px', borderRadius:12, backgroundColor:'var(--border)', color:'var(--muted)' }}>
                  ×{g.coefficient ?? 1}
                </span>
                <span style={{ flex:1, fontSize:13, color:'var(--muted)' }}>{g.description}</span>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{g.date}</span>
                <button onClick={(e) => { e.stopPropagation(); onEdit(g); }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:2 }}>
                  <Pencil size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(g.id); }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:2 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Bloc UE ────────────────────────────────────────────────────── */
function UEBlock({ ue, subjects, forSubject, onEditGrade, onDeleteGrade }) {
  const [open, setOpen] = useState(true);
  const { average, gradedCount } = ueAverage(subjects, forSubject);
  const validated = isValidated(average);

  return (
    <div className="card" style={{ borderLeft:`4px solid ${ue ? 'var(--primary)' : 'var(--border)'}` }}>
      {/* En-tête UE */}
      <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => setOpen(o => !o)}>
        <Package size={16} color={ue ? 'var(--primary)' : 'var(--muted)'} />
        <div style={{ flex:1 }}>
          <span style={{ fontWeight:700, fontSize:15 }}>{ue ? ue.name : 'Hors UE'}</span>
          {ue && (
            <span style={{ marginLeft:8, fontSize:11, padding:'1px 8px', borderRadius:12, backgroundColor:'var(--border)', color:'var(--muted)' }}>
              coef {ueCoef(ue)}
            </span>
          )}
        </div>
        {average !== null && (
          <>
            <span style={{
              fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:12,
              backgroundColor: validated ? 'var(--success)22' : 'var(--danger)22',
              color: validated ? 'var(--success)' : 'var(--danger)',
            }}>
              {validated ? '✓ Validée' : '✗ < 10'}
            </span>
            <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:17, color: avgColor(average), minWidth:78, textAlign:'right' }}>
              {average.toFixed(2)}/20
            </span>
          </>
        )}
        {average === null && (
          <span style={{ fontSize:12, color:'var(--muted)' }}>Aucune note</span>
        )}
        {open ? <ChevronUp size={15} color="var(--muted)" /> : <ChevronDown size={15} color="var(--muted)" />}
      </div>

      {/* Matières */}
      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
          {subjects.length === 0 ? (
            <p style={{ color:'var(--muted)', fontSize:13 }}>Aucune matière dans cette UE.</p>
          ) : subjects.map(s => (
            <SubjectRow key={s.id} subject={s} gradeList={forSubject(s.id)}
              onEdit={onEditGrade} onDelete={onDeleteGrade} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function Grades() {
  const { grades, loading, add, update, remove, forSubject } = useGrades();
  const { subjects } = useSubjects();
  const { ues, add: addUE, update: updateUE, remove: removeUE } = useUEs();

  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(null);
  const [ueOpen, setUeOpen]   = useState(false);

  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };

  /* Regroupement matières par UE */
  const subjectsForUE = (ueId) => subjects.filter(s => (s.ueId || null) === ueId);
  const orphanSubjects = subjects.filter(s => !s.ueId || !ues.some(u => u.id === s.ueId));

  /* Groupes : UE réelles + groupe "Hors UE" */
  const groups = [
    ...ues.map(u => ({ ue: u, subjects: subjectsForUE(u.id) })),
    ...(orphanSubjects.length ? [{ ue: null, subjects: orphanSubjects }] : []),
  ];

  /* Moyenne générale pondérée par coef UE */
  const groupAverages = groups.map(g => ({
    ue: g.ue,
    average: ueAverage(g.subjects, forSubject).average,
  }));
  const { average: globalAvg } = generalAverage(groupAverages);

  /* Crédits validés */
  const validatedCredits = groupAverages
    .filter(g => g.ue && isValidated(g.average))
    .reduce((s, g) => s + ueCoef(g.ue), 0);
  const totalCredits = ues.reduce((s, u) => s + ueCoef(u), 0);

  const onDeleteGrade = (id) => confirm('Supprimer cette note ?') && remove(id);
  const onEditGrade   = (g) => { setEditing(g); setOpen(true); };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notes & Moyennes</h1>
          {globalAvg !== null && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              Moyenne générale : <strong style={{ color: avgColor(globalAvg) }}>{globalAvg.toFixed(2)} / 20</strong>
              {totalCredits > 0 && (
                <span> · {validatedCredits}/{totalCredits} crédits validés</span>
              )}
            </p>
          )}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setUeOpen(true)}>
            <SlidersHorizontal size={15} /> Gérer les UE
          </button>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={15} /> Ajouter une note
          </button>
        </div>
      </div>

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       subjects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)' }}>Créez d'abord des matières.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g, i) => (
            <UEBlock
              key={g.ue?.id || `orphan-${i}`}
              ue={g.ue}
              subjects={g.subjects}
              forSubject={forSubject}
              onEditGrade={onEditGrade}
              onDeleteGrade={onDeleteGrade}
            />
          ))}
        </div>
      )}

      {/* Modal note */}
      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? 'Modifier la note' : 'Nouvelle note'}>
        <GradeForm initial={editing} subjects={subjects} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }} />
      </Modal>

      {/* Modal gestion UE */}
      <Modal isOpen={ueOpen} onClose={() => setUeOpen(false)} title="Unités d'Enseignement (UE)">
        <UEManager ues={ues} subjects={subjects} onAdd={addUE} onUpdate={updateUE} onDelete={removeUE} />
      </Modal>
    </div>
  );
}
