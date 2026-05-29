import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, BookOpen, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSubjects, COLORS } from '../hooks/useSubjects';
import { useUEs } from '../hooks/useUEs';
import Modal from '../components/shared/Modal';
import { db } from '../services/db';

/* ─── Subject creation / edit form ──────────────────────────────── */

function Form({ initial, ues, onSubmit, onCancel }) {
  const [v, setV] = useState({
    name:        initial?.name        || '',
    color:       initial?.color       || COLORS[0],
    coefficient: initial?.coefficient ?? 1,
    ueId:        initial?.ueId        || '',
    teacher:     initial?.teacher     || '',
    room:        initial?.room        || '',
    description: initial?.description || '',
  });

  const field = key => ({ value: v[key], onChange: e => setV(p => ({ ...p, [key]: e.target.value })) });

  return (
    <form onSubmit={e => {
        e.preventDefault();
        if (v.name.trim()) onSubmit({ ...v, coefficient: Number(v.coefficient) || 1, ueId: v.ueId || null });
      }}
      style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="form-group">
        <label className="form-label">Nom *</label>
        <input {...field('name')} placeholder="ex : Mathématiques" required />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Coefficient</label>
          <input type="number" min={0.5} step={0.5} {...field('coefficient')} placeholder="1" />
        </div>
        <div className="form-group">
          <label className="form-label">Unité d'Enseignement (UE)</label>
          <select {...field('ueId')}>
            <option value="">— Aucune (Hors UE) —</option>
            {ues.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Couleur</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setV(p => ({ ...p, color:c }))} style={{
              width:28, height:28, borderRadius:'50%', backgroundColor:c, border:'none',
              outline: v.color===c ? '3px solid white' : '2px solid transparent',
              outlineOffset:2, cursor:'pointer', transition:'transform 0.1s',
              transform: v.color===c ? 'scale(1.15)' : 'scale(1)',
            }}/>
          ))}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Professeur</label>
          <input {...field('teacher')} placeholder="ex : M. Dupont" />
        </div>
        <div className="form-group">
          <label className="form-label">Salle</label>
          <input {...field('room')} placeholder="ex : A101" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea {...field('description')} rows={3} placeholder="Notes…" />
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:4 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

/* ─── Subject card ───────────────────────────────────────────────── */

function SubjectCard({ s, ue, docCount, flashcardCount, onEdit, onDelete }) {
  return (
    <div className="card card-hover" style={{ borderLeft:`4px solid ${s.color}`, display:'flex', flexDirection:'column', gap:0 }}>
      {/* Top row: color dot + name + actions */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:12, height:12, borderRadius:'50%', backgroundColor:s.color, flexShrink:0 }}/>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700, fontSize:15 }}>{s.name}</span>
              <span style={{
                fontSize:10, padding:'1px 6px', borderRadius:12, fontWeight:700,
                backgroundColor:'var(--border)', color:'var(--muted)',
              }}>coef {s.coefficient ?? 1}</span>
              {s.source === 'OCR' && (
                <span style={{
                  fontSize:9.5, padding:'1px 5px', borderRadius:4, fontWeight:700,
                  backgroundColor:'#f59e0b22', color:'#f59e0b',
                }}>OCR</span>
              )}
            </div>
            {ue && (
              <span style={{ fontSize:11, color:'var(--muted)' }}>📦 {ue.name}</span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => onEdit(s)}
            style={{ background:'none', border:'none', color:'var(--muted)', padding:4, borderRadius:4, display:'flex', cursor:'pointer' }}>
            <Pencil size={13}/>
          </button>
          <button onClick={() => onDelete(s.id)}
            style={{ background:'none', border:'none', color:'var(--muted)', padding:4, borderRadius:4, display:'flex', cursor:'pointer' }}>
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {/* Metadata */}
      {s.teacher     && <p style={{ color:'var(--muted)', fontSize:12, marginBottom:2 }}>👤 {s.teacher}</p>}
      {s.room        && <p style={{ color:'var(--muted)', fontSize:12, marginBottom:2 }}>📍 {s.room}</p>}
      {s.description && (
        <p style={{
          color:'var(--muted)', fontSize:12, marginTop:6,
          display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
        }}>
          {s.description}
        </p>
      )}

      {/* Library stats + quick link */}
      <div style={{
        marginTop:12, paddingTop:10, borderTop:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', gap:12, fontSize:11.5, color:'var(--muted)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <FileText size={12}/> {docCount} doc{docCount!==1?'s':''}
          </span>
          {flashcardCount > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              🧠 {flashcardCount} fiche{flashcardCount!==1?'s':''}
            </span>
          )}
        </div>
        <Link
          to={`/library?subject=${s.id}`}
          style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'4px 10px', borderRadius:7, fontSize:11.5, fontWeight:600,
            border:`1px solid ${s.color}30`,
            backgroundColor:`${s.color}12`,
            color: s.color,
            textDecoration:'none',
            transition:'background 0.15s',
          }}
        >
          <BookOpen size={12}/> Bibliothèque
        </Link>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */

export default function Subjects() {
  const { subjects, loading, add, update, remove } = useSubjects();
  const { ues, byId: ueById } = useUEs();
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);

  /* Per-subject document / flashcard counts */
  const [docCounts,       setDocCounts]       = useState({});
  const [flashcardCounts, setFlashcardCounts] = useState({});

  useEffect(() => {
    async function loadCounts() {
      const [docs, cards] = await Promise.all([
        db.all('documents'),
        db.all('flashcards'),
      ]);
      const dc = {}, fc = {};
      for (const d of docs)  if (d.subjectId) dc[d.subjectId] = (dc[d.subjectId] || 0) + 1;
      for (const f of cards) if (f.subjectId) fc[f.subjectId] = (fc[f.subjectId] || 0) + 1;
      setDocCounts(dc);
      setFlashcardCounts(fc);
    }
    loadCounts();
  }, [subjects]); // refresh when subjects change (e.g. after OCR auto-create)

  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };

  const del = id => {
    if (confirm('Supprimer cette matière et ses données associées ?')) remove(id);
  };

  return (
    <div style={{ maxWidth:900 }}>
      <div className="page-header">
        <h1 className="page-title">Matières</h1>
        <button className="btn-primary" style={{ display:'flex', alignItems:'center', gap:6 }}
          onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus size={15}/> Ajouter
        </button>
      </div>

      {loading ? (
        <p style={{ color:'var(--muted)' }}>Chargement…</p>
      ) : subjects.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <p style={{ color:'var(--muted)', marginBottom:12 }}>Aucune matière. Commencez par en créer une.</p>
          <p style={{ color:'var(--muted)', fontSize:12 }}>
            💡 Les matières sont aussi créées automatiquement lors d'un import OCR d'emploi du temps.
          </p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:14 }}>
          {subjects.map(s => (
            <SubjectCard
              key={s.id}
              s={s}
              ue={s.ueId ? ueById(s.ueId) : null}
              docCount={docCounts[s.id] || 0}
              flashcardCount={flashcardCounts[s.id] || 0}
              onEdit={sub => { setEditing(sub); setOpen(true); }}
              onDelete={del}
            />
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Modifier la matière' : 'Nouvelle matière'}>
        <Form initial={editing} ues={ues} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }}/>
      </Modal>
    </div>
  );
}
