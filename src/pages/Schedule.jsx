/* ── Schedule.jsx — Emploi du temps avec calendrier réel ──
 *
 * Vues : Liste (colonnes par jour) · Horaires (grille temporelle) · Mois
 * OCR  : import photo → auto-création matières → cours liés à de vraies dates
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Camera, X, Check, ChevronRight, Loader,
  AlertCircle, CheckCircle, LayoutGrid, Clock, Calendar,
} from 'lucide-react';
import {
  useSchedule, DAYS, getWeekDates, getWeekStart, toDateStr, fromDateStr,
} from '../hooks/useSchedule';
import { useSubjects, COLORS } from '../hooks/useSubjects';
import Modal from '../components/shared/Modal';
import { preprocessImage } from '../services/ocr/imagePreprocessor';
import { extractSchedule }  from '../services/ocr/scheduleExtractor';
import { getApiKey }        from '../services/claudeService';

/* ─── Time-grid constants ────────────────────────────────────────── */

const GRID_START = 7;    // 07:00
const GRID_END   = 21;   // 21:00
const HOUR_H     = 64;   // px per hour

const HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

function timeToMin(t = '00:00') {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function tToY(t)          { return Math.max(0, (timeToMin(t) - GRID_START * 60)) * (HOUR_H / 60); }
function tToH(start, end) { return Math.max(24, (timeToMin(end) - timeToMin(start)) * (HOUR_H / 60)); }

/* ─── Day-name → index (0 = Lundi … 5 = Samedi) ─────────────────── */

const DAY_MAP = {
  lundi:0, monday:0, mon:0, lun:0,
  mardi:1, tuesday:1, tue:1, mar:1,
  mercredi:2, wednesday:2, wed:2, mer:2,
  jeudi:3, thursday:3, thu:3, jeu:3,
  vendredi:4, friday:4, fri:4, ven:4,
  samedi:5, saturday:5, sat:5, sam:5,
};

function parseDayIndex(day) {
  if (day == null) return null;
  const k = String(day).toLowerCase().trim();
  if (k in DAY_MAP) return DAY_MAP[k];
  for (const [key, val] of Object.entries(DAY_MAP)) {
    if (key.startsWith(k.slice(0,3)) || k.startsWith(key.slice(0,3))) return val;
  }
  return null;
}

/* ─── Subject-name normalisation ─────────────────────────────────── */
/* Supprime : numéros de groupe, niveaux, suffixes inutiles           */

function normalizeSubjectName(raw) {
  if (!raw) return '';
  return raw
    .trim()
    // Groupe / Gr / Grp : "Gr 1", "Groupe 3A", "Grp B"
    .replace(/\s+gr(oupe|p)?\.?\s*\d*[A-Za-z]?\s*$/i, '')
    // Nombre seul en fin : "Anglais 4", "Math 3B"
    .replace(/\s+\d+[A-Za-z]?\s*$/, '')
    // Semestre : "S1", "Sem 2", "Semestre I"
    .replace(/\s+(semestre?|sem?)\.?\s*[0-9IVi]+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─── Fuzzy subject matching ─────────────────────────────────────── */

function normStr(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function findClosestSubject(name, subjects) {
  const n = normStr(name);
  if (!n) return '';
  const exact   = subjects.find(s => normStr(s.name) === n);
  if (exact) return exact.id;
  const partial = subjects.find(s => { const sn = normStr(s.name); return sn.includes(n) || n.includes(sn); });
  return partial?.id ?? '';
}

/* ─── Label helpers ──────────────────────────────────────────────── */

function fmtWeekRange(weekDates) {
  const s = weekDates[0].toLocaleDateString('fr-FR', { day:'numeric', month:'long' });
  const e = weekDates[5].toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  return `${s} – ${e}`;
}

function fmtMonth(date) {
  return date.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
}

/* ─── Manual course form ─────────────────────────────────────────── */

function CourseForm({ initial, subjects, onSubmit, onCancel }) {
  const [v, setV] = useState({
    subjectId: initial?.subjectId || '',
    day:       initial?.day       ?? 0,
    startTime: initial?.startTime || '08:00',
    endTime:   initial?.endTime   || '10:00',
    room:      initial?.room      || '',
    weekType:  initial?.weekType  || 'both',
    notes:     initial?.notes     || '',
  });
  const set = k => e => setV(p => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={e => { e.preventDefault(); if (v.subjectId) onSubmit(v); }}
      style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="form-group">
        <label className="form-label">Matière *</label>
        <select value={v.subjectId} onChange={set('subjectId')} required>
          <option value="">— Choisir —</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Jour récurrent</label>
          <select value={v.day} onChange={e => setV(p => ({ ...p, day: Number(e.target.value) }))}>
            {DAYS.map((d,i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Semaine (optionnel)</label>
          <select value={v.weekType} onChange={set('weekType')}>
            <option value="both">A et B</option>
            <option value="A">Semaine A</option>
            <option value="B">Semaine B</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Début</label>
          <input type="time" value={v.startTime} onChange={set('startTime')} />
        </div>
        <div className="form-group">
          <label className="form-label">Fin</label>
          <input type="time" value={v.endTime} onChange={set('endTime')} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Salle</label>
        <input value={v.room} onChange={set('room')} placeholder="ex : B204" />
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">{initial ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

/* ─── View 1 : colonnes par jour (liste) ─────────────────────────── */

function WeekListView({ weekDates, forDateStr, byId, onEdit, onDelete }) {
  const todayStr = toDateStr(new Date());
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:12 }}>
      {weekDates.map((date, i) => {
        const dateStr = toDateStr(date);
        const courses = forDateStr(dateStr);
        const isToday = dateStr === todayStr;
        return (
          <div key={i}>
            {/* Day header */}
            <div style={{ textAlign:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color: isToday ? 'var(--primary)' : 'var(--muted)' }}>
                {DAYS[i]}
              </div>
              <div style={{
                fontSize:18, fontWeight:700, width:32, height:32, borderRadius:'50%',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                backgroundColor: isToday ? 'var(--primary)' : 'transparent',
                color: isToday ? 'white' : 'var(--text)',
              }}>
                {date.getDate()}
              </div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>
                {date.toLocaleDateString('fr-FR', { month:'short' })}
              </div>
            </div>

            {/* Courses */}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {courses.length === 0 ? (
                <div style={{
                  borderRadius:8, border:'1px dashed var(--border)',
                  padding:'14px 6px', textAlign:'center', color:'var(--muted)', fontSize:11,
                }}>Libre</div>
              ) : courses.map(c => {
                const sub = byId(c.subjectId);
                return (
                  <div key={c.id} style={{
                    borderRadius:8, padding:'8px',
                    backgroundColor:(sub?.color||'#7c6af7')+'18',
                    borderLeft:`3px solid ${sub?.color||'var(--primary)'}`,
                    fontSize:11,
                  }}>
                    <p style={{ fontWeight:700, marginBottom:2 }}>{sub?.name||'?'}</p>
                    <p style={{ color:'var(--muted)', fontSize:10 }}>{c.startTime}–{c.endTime}</p>
                    {c.room && <p style={{ color:'var(--muted)', fontSize:10 }}>📍 {c.room}</p>}
                    {c.weekType && c.weekType!=='both' && (
                      <span style={{ backgroundColor:'var(--border)', borderRadius:4, padding:'1px 4px', fontSize:10, display:'inline-block', marginTop:3 }}>
                        Sem.{c.weekType}
                      </span>
                    )}
                    <div style={{ display:'flex', gap:4, marginTop:4 }}>
                      <button onClick={() => onEdit(c)}
                        style={{ background:'none', border:'none', color:'var(--muted)', padding:1, cursor:'pointer', display:'flex' }}>
                        <Pencil size={10}/>
                      </button>
                      <button onClick={() => confirm('Supprimer ?') && onDelete(c.id)}
                        style={{ background:'none', border:'none', color:'var(--muted)', padding:1, cursor:'pointer', display:'flex' }}>
                        <Trash2 size={10}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── View 2 : grille temporelle (horaires) ──────────────────────── */

function WeekTimeGrid({ weekDates, forDateStr, byId, onEdit }) {
  const todayStr = toDateStr(new Date());
  return (
    <div style={{ display:'flex', overflowX:'auto', border:'1px solid var(--border)', borderRadius:12, backgroundColor:'var(--card)' }}>
      {/* Hour sidebar */}
      <div style={{ width:46, flexShrink:0, paddingTop:52, backgroundColor:'var(--surface)', borderRight:'1px solid var(--border)' }}>
        {HOURS.map(h => (
          <div key={h} style={{
            height:HOUR_H, fontSize:10, color:'var(--muted)',
            paddingRight:6, textAlign:'right', lineHeight:`${HOUR_H}px`,
            borderTop:'1px solid var(--border)',
          }}>
            {h}:00
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(6,1fr)', minWidth:480 }}>
        {weekDates.map((date, i) => {
          const dateStr = toDateStr(date);
          const courses = forDateStr(dateStr);
          const isToday = dateStr === todayStr;
          return (
            <div key={i} style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
              {/* Header */}
              <div style={{
                height:52, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                borderBottom:`2px solid ${isToday ? 'var(--primary)' : 'var(--border)'}`,
                backgroundColor: isToday ? 'var(--primary)10' : 'var(--surface)',
                position:'sticky', top:0, zIndex:10,
              }}>
                <span style={{ fontSize:9.5, fontWeight:700, textTransform:'uppercase', color: isToday ? 'var(--primary)' : 'var(--muted)' }}>
                  {DAYS[i].slice(0,3)}
                </span>
                <span style={{ fontSize:18, fontWeight:700, lineHeight:1.1, color: isToday ? 'var(--primary)' : 'var(--text)' }}>
                  {date.getDate()}
                </span>
              </div>

              {/* Grid body */}
              <div style={{ position:'relative', height:(GRID_END-GRID_START)*HOUR_H }}>
                {HOURS.map(h => <>
                  <div key={h} style={{ position:'absolute', left:0, right:0, top:(h-GRID_START)*HOUR_H, borderTop:'1px solid var(--border)', opacity:0.4 }} />
                  <div key={`hh${h}`} style={{ position:'absolute', left:'20%', right:0, top:(h-GRID_START)*HOUR_H+HOUR_H/2, borderTop:'1px dashed var(--border)', opacity:0.2 }} />
                </>)}

                {courses.map(c => {
                  const sub    = byId(c.subjectId);
                  const top    = tToY(c.startTime);
                  const height = tToH(c.startTime, c.endTime);
                  if (top >= (GRID_END-GRID_START)*HOUR_H) return null;
                  return (
                    <div key={c.id} onClick={() => onEdit(c)} style={{
                      position:'absolute', top:top+1, height:height-2,
                      left:2, right:2,
                      backgroundColor:(sub?.color||'#7c6af7')+'28',
                      borderLeft:`3px solid ${sub?.color||'#7c6af7'}`,
                      borderRadius:6, padding:'3px 5px',
                      overflow:'hidden', cursor:'pointer', fontSize:10.5,
                      transition:'opacity 0.1s',
                    }}>
                      <p style={{ margin:0, fontWeight:700, color:sub?.color||'#7c6af7', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {sub?.name||'?'}
                      </p>
                      {height >= 34 && <p style={{ margin:0, color:'var(--muted)', fontSize:9.5 }}>{c.startTime}–{c.endTime}</p>}
                      {c.room && height >= 48 && <p style={{ margin:0, color:'var(--muted)', fontSize:9.5 }}>📍 {c.room}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── View 3 : calendrier mensuel ────────────────────────────────── */

const WK_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function MonthView({ refDate, forDateStr, byId, onDayClick }) {
  const year  = refDate.getFullYear();
  const month = refDate.getMonth();
  const todayStr = toDateStr(new Date());

  const firstDay    = new Date(year, month, 1);
  const lastDay     = new Date(year, month+1, 0);
  const firstDow    = firstDay.getDay();                // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow-1; // offset to Monday

  const gridStart   = new Date(firstDay);
  gridStart.setDate(1 - startOffset);

  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const days        = Array.from({ length:totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
        {WK_LABELS.map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:11, color:'var(--muted)', fontWeight:700, padding:'4px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
        {days.map((d, i) => {
          const dateStr    = toDateStr(d);
          const isCurMonth = d.getMonth() === month;
          const isToday    = dateStr === todayStr;
          const isSunday   = d.getDay() === 0;
          const courses    = isCurMonth && !isSunday ? forDateStr(dateStr) : [];

          return (
            <div key={i} onClick={() => isCurMonth && !isSunday && onDayClick(d)}
              style={{
                minHeight:68, borderRadius:8, padding:'5px 4px',
                border:`1px solid ${isToday ? 'var(--primary)' : 'var(--border)'}`,
                backgroundColor: isToday ? 'var(--primary)0a' : isCurMonth ? 'var(--card)' : 'transparent',
                opacity: isCurMonth ? 1 : 0.3,
                cursor: isCurMonth && !isSunday ? 'pointer' : 'default',
              }}
            >
              <div style={{
                fontSize:12, fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--primary)' : isSunday ? 'var(--muted)' : 'var(--text)',
                marginBottom:3,
              }}>
                {d.getDate()}
              </div>
              {courses.slice(0,2).map(c => {
                const sub = byId(c.subjectId);
                return (
                  <div key={c.id} style={{
                    fontSize:9, fontWeight:600, borderRadius:3,
                    padding:'1px 3px', marginBottom:1,
                    backgroundColor:(sub?.color||'#7c6af7')+'25',
                    color: sub?.color||'#7c6af7',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {sub?.name?.slice(0,12)||'?'}
                  </div>
                );
              })}
              {courses.length > 2 && <div style={{ fontSize:9, color:'var(--muted)' }}>+{courses.length-2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── OCR Import Modal ───────────────────────────────────────────── */

const STEP = {
  IDLE:'idle', PREPROCESSING:'preprocessing', EXTRACTING:'extracting',
  REVIEW:'review', IMPORTING:'importing', DONE:'done', ERROR:'error',
};

function OcrImportModal({ subjects, addSubject, onImport, onClose }) {
  const fileRef = useRef(null);

  const [step,         setStep]         = useState(STEP.IDLE);
  const [progress,     setProgress]     = useState('');
  const [error,        setError]        = useState('');
  const [passes,       setPasses]       = useState([]);
  const [events,       setEvents]       = useState([]);
  const [refWeekStart, setRefWeekStart] = useState(() => getWeekStart());
  const [doneCount,    setDoneCount]    = useState(0);
  const [imageThumb,   setImageThumb]   = useState('');

  /* Enrich raw OCR events: compute real dates + match subjects */
  const enrichEvents = useCallback((rawEvs, monday, currentSubjects) =>
    rawEvs
      .map(ev => {
        const dayIdx = parseDayIndex(ev.day);
        let   date   = null;
        if (dayIdx !== null) {
          const d = new Date(monday);
          d.setDate(d.getDate() + dayIdx);
          date = toDateStr(d);
        }
        const foundId    = findClosestSubject(ev.subject ?? '', currentSubjects);
        const cleanName  = normalizeSubjectName(ev.subject ?? '');
        const subjectId  = foundId || (cleanName ? '__new__' : '');
        return {
          _id:             ev._id ?? crypto.randomUUID(),
          _keep:           ev._keep  ?? true,
          _subjectId:      ev._subjectId !== undefined ? ev._subjectId : subjectId,
          _dayIdx:         dayIdx,
          _date:           date,
          _newSubjectName: cleanName,
          ...ev,
        };
      })
      .filter(ev => ev._dayIdx !== null && ev.startTime && ev.endTime),
  []);

  /* Run OCR pipeline */
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = e => setImageThumb(e.target.result);
    rd.readAsDataURL(file);

    const key = await getApiKey();
    if (!key) {
      setError('Clé API absente. Configurez-la dans Profil → API Claude.');
      setStep(STEP.ERROR);
      return;
    }

    try {
      setStep(STEP.PREPROCESSING);
      setProgress('Prétraitement de l\'image…');
      const preprocessed = await preprocessImage(file);

      setStep(STEP.EXTRACTING);
      const allPasses = await extractSchedule(preprocessed, msg => setProgress(msg));
      setPasses(allPasses);

      const rawEvs = (allPasses[allPasses.length-1]?.events ?? [])
        .map(ev => ({ ...ev, _id: crypto.randomUUID() }));

      const monday   = getWeekStart();
      const enriched = enrichEvents(rawEvs, monday, subjects);

      if (enriched.length === 0) {
        setError('Aucun créneau exploitable extrait. Essayez une image plus nette ou mieux cadrée.');
        setStep(STEP.ERROR);
        return;
      }

      setRefWeekStart(monday);
      setEvents(enriched);
      setStep(STEP.REVIEW);
    } catch (err) {
      setError(err.message || 'Erreur inattendue');
      setStep(STEP.ERROR);
    }
  }, [subjects, enrichEvents]);

  /* Shift reference week → recompute dates, keep user subject choices */
  const shiftRefWeek = (dir) => {
    const newMon = new Date(refWeekStart);
    newMon.setDate(newMon.getDate() + dir * 7);
    setRefWeekStart(newMon);
    setEvents(prev =>
      prev.map(ev => {
        if (ev._dayIdx === null) return ev;
        const d = new Date(newMon);
        d.setDate(d.getDate() + ev._dayIdx);
        return { ...ev, _date: toDateStr(d) };
      })
    );
  };

  const toggleKeep = id  => setEvents(p => p.map(e => e._id === id ? { ...e, _keep: !e._keep } : e));
  const setSubj    = (id, val) => setEvents(p => p.map(e => e._id === id ? { ...e, _subjectId: val } : e));

  /* Confirm: create missing subjects then save courses */
  const confirmImport = async () => {
    const toSave = events.filter(e => e._keep && e._subjectId);
    if (!toSave.length) return;
    setStep(STEP.IMPORTING);

    // Pass 1 — create new subjects (deduplicated by name)
    const nameToId = {};
    for (const ev of toSave.filter(e => e._subjectId === '__new__')) {
      const name = ev._newSubjectName;
      if (!name || nameToId[name]) continue;
      const color  = COLORS[(subjects.length + Object.keys(nameToId).length) % COLORS.length];
      const newSub = await addSubject({ name, color, source:'OCR', createdAt: new Date().toISOString() });
      nameToId[name] = newSub.id;
    }

    // Pass 2 — save courses with real date
    let count = 0;
    for (const ev of toSave) {
      const subjectId = ev._subjectId === '__new__'
        ? nameToId[ev._newSubjectName]
        : ev._subjectId;
      if (!subjectId) continue;
      await onImport({
        subjectId,
        date:      ev._date,      // YYYY-MM-DD — real date
        day:       ev._dayIdx,    // kept as metadata
        startTime: ev.startTime,
        endTime:   ev.endTime,
        room:      ev.room   || '',
        weekType:  'both',
        notes:     ev.type   ? `Type : ${ev.type}` : '',
      });
      count++;
    }

    setDoneCount(count);
    setStep(STEP.DONE);
  };

  /* Derived */
  const keptCount  = events.filter(e => e._keep).length;
  const validCount = events.filter(e => e._keep && e._subjectId).length;
  const newCount   = events.filter(e => e._keep && e._subjectId === '__new__').length;
  const finalConf  = passes.length ? (passes[passes.length-1].confidence*100).toFixed(0) : null;

  const weekLabel = (() => {
    const end = new Date(refWeekStart);
    end.setDate(end.getDate() + 5);
    const s = refWeekStart.toLocaleDateString('fr-FR', { day:'numeric', month:'long' });
    const e = end.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
    return `${s} – ${e}`;
  })();

  const dotFor = ev => {
    if (!ev._keep)                   return null;
    if (!ev._subjectId)              return { c:'#ef4444', t:'Sera ignoré (matière manquante)' };
    if (ev._subjectId === '__new__') return { c:'#f59e0b', t:`Sera créée : ${ev._newSubjectName}` };
    return { c:'#22c55e', t:'Matière existante' };
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      backgroundColor:'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor:'var(--surface)', borderRadius:18,
        border:'1px solid var(--border)',
        width:'100%', maxWidth:700, maxHeight:'93vh',
        overflowY:'auto', boxShadow:'0 -8px 50px rgba(0,0,0,0.28)', padding:24,
      }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Camera size={18} color="white"/>
            </div>
            <div>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>Import photo d'emploi du temps</h2>
              <p style={{ margin:0, fontSize:11.5, color:'var(--muted)' }}>
                Claude Vision · 3 passes max · création auto de matières · dates réelles
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}>
            <X size={18}/>
          </button>
        </div>

        {/* ── IDLE ── */}
        {step === STEP.IDLE && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--primary)'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor='var(--border)'; }}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border:'2px dashed var(--border)', borderRadius:14,
                padding:'44px 20px', textAlign:'center', cursor:'pointer',
                transition:'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
            >
              <Camera size={38} color="var(--primary)" style={{ marginBottom:12, opacity:0.7 }}/>
              <p style={{ margin:'0 0 6px', fontSize:14, fontWeight:600 }}>Glissez ou cliquez pour choisir</p>
              <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>JPG · PNG · WEBP · Capture d'écran</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
              onChange={e => handleFile(e.target.files[0])} />
            <div style={{
              backgroundColor:'var(--bg)', borderRadius:10, padding:'12px 14px',
              border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.75,
            }}>
              <strong style={{ color:'var(--text)' }}>✨ Fonctionnalités :</strong><br/>
              🟢 Matières déjà connues → liées automatiquement<br/>
              🟡 Matières inconnues → créées automatiquement (normalisées)<br/>
              📅 Chaque cours lié à une vraie date (semaine au choix)<br/>
              🔁 Jusqu'à 3 passes IA pour maximiser la précision
            </div>
          </div>
        )}

        {/* ── PREPROCESSING / EXTRACTING ── */}
        {(step === STEP.PREPROCESSING || step === STEP.EXTRACTING) && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:'12px 0' }}>
            {imageThumb && (
              <img src={imageThumb} alt="aperçu" style={{
                width:'100%', maxHeight:160, objectFit:'contain',
                borderRadius:10, border:'1px solid var(--border)', opacity:0.85,
              }}/>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Loader size={20} color="var(--primary)" style={{ animation:'spin 1s linear infinite', flexShrink:0 }}/>
              <p style={{ margin:0, fontSize:13, color:'var(--text)' }}>{progress}</p>
            </div>
            {passes.length > 0 && (
              <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:5 }}>
                {passes.map(p => (
                  <div key={p.pass} style={{
                    display:'flex', alignItems:'center', gap:8, fontSize:11.5,
                    padding:'6px 10px', borderRadius:8,
                    backgroundColor:'var(--bg)', border:'1px solid var(--border)',
                  }}>
                    <CheckCircle size={13} color="#22c55e"/>
                    <span>Passe {p.pass} ({p.variant}) — {p.events.length} créneaux, confiance {(p.confidence*100).toFixed(0)} %</span>
                    <span style={{ marginLeft:'auto', color:'var(--muted)' }}>{(p.timeMs/1000).toFixed(1)} s</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {step === STEP.ERROR && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{
              display:'flex', gap:12, padding:'14px 16px', borderRadius:12,
              backgroundColor:'#fef2f2', border:'1px solid #fecaca',
            }}>
              <AlertCircle size={18} color="#ef4444" style={{ flexShrink:0, marginTop:1 }}/>
              <div>
                <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:700, color:'#b91c1c' }}>Extraction échouée</p>
                <p style={{ margin:0, fontSize:12.5, color:'#ef4444' }}>{error}</p>
              </div>
            </div>
            <button onClick={() => { setStep(STEP.IDLE); setError(''); }} className="btn-primary" style={{ alignSelf:'flex-start' }}>
              Réessayer
            </button>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === STEP.REVIEW && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Reference week picker */}
            <div style={{ padding:'10px 14px', borderRadius:10, backgroundColor:'var(--bg)', border:'1px solid var(--border)' }}>
              <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                📅 Semaine de référence
              </p>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => shiftRefWeek(-1)} style={{
                  padding:'4px 12px', borderRadius:7, border:'1px solid var(--border)',
                  background:'var(--card)', cursor:'pointer', fontSize:16, lineHeight:1,
                }}>‹</button>
                <span style={{ flex:1, textAlign:'center', fontSize:13, fontWeight:600 }}>{weekLabel}</span>
                <button onClick={() => shiftRefWeek(1)} style={{
                  padding:'4px 12px', borderRadius:7, border:'1px solid var(--border)',
                  background:'var(--card)', cursor:'pointer', fontSize:16, lineHeight:1,
                }}>›</button>
              </div>
              <p style={{ margin:'6px 0 0', fontSize:11, color:'var(--muted)' }}>
                Les jours OCR sont assignés à cette semaine. Changez si la photo est d'une autre semaine.
              </p>
            </div>

            {/* Stats */}
            <div style={{
              display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
              padding:'8px 12px', borderRadius:10, backgroundColor:'var(--bg)', border:'1px solid var(--border)', fontSize:12,
            }}>
              <span><strong style={{ color:'var(--primary)' }}>{events.length}</strong> créneaux extraits · confiance {finalConf} %</span>
              {newCount > 0 && <span style={{ color:'#f59e0b' }}>🟡 {newCount} matière{newCount>1?'s':''} à créer</span>}
              <span style={{ color:'var(--muted)', marginLeft:'auto' }}>{keptCount} sélectionnés</span>
            </div>

            {/* Legend */}
            <div style={{ display:'flex', gap:14, fontSize:11, color:'var(--muted)' }}>
              <span>🟢 Matière trouvée</span>
              <span>🟡 Sera créée automatiquement</span>
              <span>🔴 Ignoré</span>
            </div>

            {/* Event rows */}
            <div style={{ display:'flex', flexDirection:'column', gap:7, maxHeight:380, overflowY:'auto' }}>
              {events.map(ev => {
                const dot = dotFor(ev);
                return (
                  <div key={ev._id} style={{
                    display:'flex', gap:10, alignItems:'flex-start',
                    padding:'9px 11px', borderRadius:10,
                    border:`1px solid ${ev._keep ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: ev._keep ? 'var(--primary)06' : 'var(--card)',
                    opacity: ev._keep ? 1 : 0.45,
                    transition:'all 0.15s',
                  }}>
                    {/* Checkbox */}
                    <button onClick={() => toggleKeep(ev._id)} style={{
                      width:20, height:20, borderRadius:5, flexShrink:0, marginTop:1,
                      border:`2px solid ${ev._keep ? 'var(--primary)' : 'var(--border)'}`,
                      backgroundColor: ev._keep ? 'var(--primary)' : 'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                    }}>
                      {ev._keep && <Check size={12} color="white"/>}
                    </button>

                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                      {/* Date + time row */}
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                        {ev._date && (
                          <span style={{
                            padding:'2px 7px', borderRadius:5, fontSize:11, fontWeight:700,
                            backgroundColor:'var(--primary)18', color:'var(--primary)',
                          }}>
                            {fromDateStr(ev._date).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}
                          </span>
                        )}
                        <span style={{ fontSize:12, fontWeight:600 }}>{ev.startTime} – {ev.endTime}</span>
                        {ev.type && (
                          <span style={{ padding:'1px 5px', borderRadius:4, fontSize:10, backgroundColor:'var(--surface)', color:'var(--muted)', border:'1px solid var(--border)' }}>
                            {ev.type}
                          </span>
                        )}
                        {ev.room && <span style={{ fontSize:11, color:'var(--muted)' }}>📍 {ev.room}</span>}
                      </div>

                      {/* Subject row */}
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        {dot && (
                          <div title={dot.t} style={{ width:8, height:8, borderRadius:'50%', backgroundColor:dot.c, flexShrink:0 }}/>
                        )}
                        <span style={{ fontSize:11, color:'var(--muted)', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          « {ev.subject||'?'} »
                        </span>
                        <ChevronRight size={11} color="var(--muted)" style={{ flexShrink:0 }}/>
                        <select value={ev._subjectId} onChange={e => setSubj(ev._id, e.target.value)}
                          style={{
                            flex:1, minWidth:130, padding:'3px 6px', borderRadius:6,
                            border:`1px solid ${ev._subjectId ? 'var(--border)' : '#f87171'}`,
                            backgroundColor:'var(--surface)', fontSize:11.5, color:'var(--text)',
                          }}>
                          <option value="">— Ignorer ce créneau —</option>
                          {ev._newSubjectName && (
                            <option value="__new__">🆕 Créer « {ev._newSubjectName} »</option>
                          )}
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {keptCount > validCount && (
              <p style={{ margin:0, fontSize:12, color:'#f59e0b', display:'flex', alignItems:'center', gap:5 }}>
                <AlertCircle size={13}/>
                {keptCount-validCount} créneau{keptCount-validCount>1?'x':''} sans matière assignée — non importé{keptCount-validCount>1?'s':''}
              </p>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
              <button onClick={onClose} className="btn-ghost">Annuler</button>
              <button onClick={confirmImport} disabled={validCount===0} className="btn-primary"
                style={{ display:'flex', alignItems:'center', gap:6, opacity:validCount===0?0.5:1 }}>
                <Plus size={14}/>
                Importer {validCount} cours{newCount>0?` + créer ${newCount} matière${newCount>1?'s':''}` : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── IMPORTING ── */}
        {step === STEP.IMPORTING && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:'32px 0' }}>
            <Loader size={26} color="var(--primary)" style={{ animation:'spin 1s linear infinite' }}/>
            <p style={{ margin:0, fontSize:14 }}>Création des matières et enregistrement des cours…</p>
          </div>
        )}

        {/* ── DONE ── */}
        {step === STEP.DONE && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, padding:'32px 0' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', backgroundColor:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <CheckCircle size={28} color="#22c55e"/>
            </div>
            <p style={{ margin:0, fontSize:15, fontWeight:700 }}>{doneCount} cours importé{doneCount!==1?'s':''} !</p>
            <p style={{ margin:0, fontSize:13, color:'var(--muted)', textAlign:'center' }}>
              Chaque cours est lié à sa vraie date.<br/>
              Les matières absentes ont été créées automatiquement.
            </p>
            <button onClick={onClose} className="btn-primary">Fermer</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── Main Schedule page ─────────────────────────────────────────── */

const VIEWS = [
  { id:'list',  Icon:LayoutGrid, label:'Liste' },
  { id:'week',  Icon:Clock,      label:'Horaires' },
  { id:'month', Icon:Calendar,   label:'Mois' },
];

export default function Schedule() {
  const { loading, weekType, setWeekType, add, update, remove, forDateStr } = useSchedule();
  const { subjects, byId, add: addSubject } = useSubjects();

  const [view,    setView]    = useState('list');
  const [refDate, setRefDate] = useState(new Date());
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(null);
  const [showOcr, setShowOcr] = useState(false);

  const weekDates = useMemo(() => getWeekDates(refDate), [refDate]);

  /* Navigation */
  const navigate = dir => setRefDate(d => {
    const n = new Date(d);
    if (view === 'month') return new Date(n.getFullYear(), n.getMonth()+dir, 1);
    n.setDate(n.getDate() + dir*7);
    return n;
  });

  const goToday = () => setRefDate(new Date());

  const navLabel = useMemo(
    () => view === 'month' ? fmtMonth(refDate) : fmtWeekRange(weekDates),
    [view, refDate, weekDates],
  );

  /* Course actions */
  const save = async (data) => {
    if (editing) await update(editing.id, data);
    else         await add(data);
    setOpen(false); setEditing(null);
  };
  const onEdit   = c  => { setEditing(c); setOpen(true); };
  const onDelete = id => remove(id);

  const handleOcrImport = async courseData => add(courseData);

  const onDayClick = date => { setRefDate(date); setView('list'); };

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <h1 className="page-title">Emploi du temps</h1>

        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginLeft:'auto' }}>

          {/* View switcher */}
          <div style={{ display:'flex', borderRadius:9, overflow:'hidden', border:'1px solid var(--border)' }}>
            {VIEWS.map(({ id, Icon, label }) => (
              <button key={id} onClick={() => setView(id)} style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'5px 12px', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600,
                backgroundColor: view===id ? 'var(--primary)' : 'var(--card)',
                color: view===id ? 'white' : 'var(--muted)',
                transition:'background 0.15s, color 0.15s',
              }}>
                <Icon size={13}/> {label}
              </button>
            ))}
          </div>

          {/* Week/month navigation */}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={() => navigate(-1)} style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', fontSize:15 }}>‹</button>
            <button onClick={goToday} style={{
              padding:'5px 11px', borderRadius:7, border:'1px solid var(--border)', background:'var(--card)',
              cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap',
            }}>
              {navLabel}
            </button>
            <button onClick={() => navigate(1)} style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', fontSize:15 }}>›</button>
          </div>

          {/* Semaine A/B (optionnel) */}
          {view !== 'month' && (
            <div style={{ display:'flex', gap:3 }}>
              {['A','B'].map(t => (
                <button key={t} onClick={() => setWeekType(t)} style={{
                  padding:'5px 10px', borderRadius:7, fontSize:12, fontWeight:700,
                  border:'1px solid var(--border)', cursor:'pointer',
                  backgroundColor: weekType===t ? 'var(--primary)' : 'var(--card)',
                  color: weekType===t ? 'white' : 'var(--muted)',
                }}>Sem.{t}</button>
              ))}
            </div>
          )}

          {/* OCR import */}
          <button onClick={() => setShowOcr(true)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:600,
            border:'1px solid var(--primary)', cursor:'pointer',
            backgroundColor:'transparent', color:'var(--primary)',
          }}>
            <Camera size={14}/> Photo
          </button>

          {/* Manual add */}
          <button className="btn-primary" style={{ display:'flex', alignItems:'center', gap:6 }}
            onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus size={14}/> Ajouter
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <p style={{ color:'var(--muted)' }}>Chargement…</p>
      ) : view === 'week' ? (
        <WeekTimeGrid weekDates={weekDates} forDateStr={forDateStr} byId={byId} onEdit={onEdit}/>
      ) : view === 'month' ? (
        <MonthView refDate={refDate} forDateStr={forDateStr} byId={byId} onDayClick={onDayClick}/>
      ) : (
        <WeekListView weekDates={weekDates} forDateStr={forDateStr} byId={byId} onEdit={onEdit} onDelete={onDelete}/>
      )}

      {/* ── Modals ── */}
      <Modal isOpen={open} onClose={() => { setOpen(false); setEditing(null); }}
        title={editing ? 'Modifier le cours' : 'Nouveau cours (récurrent)'}>
        <CourseForm initial={editing} subjects={subjects} onSubmit={save} onCancel={() => { setOpen(false); setEditing(null); }}/>
      </Modal>

      {showOcr && (
        <OcrImportModal
          subjects={subjects}
          addSubject={addSubject}
          onImport={handleOcrImport}
          onClose={() => setShowOcr(false)}
        />
      )}
    </div>
  );
}
