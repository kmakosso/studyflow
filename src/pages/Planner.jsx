import { useState, useMemo } from 'react';
import { Wand2, Calendar, Clock, Zap, RefreshCw, User, Bot, Download, Loader, BookOpen } from 'lucide-react';
import { format, parseISO, addDays, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateAIPlan, rebalancePlan } from '../services/plannerAI';
import { claude } from '../services/claudeService';
import { useAssignments }  from '../hooks/useAssignments';
import { useExams }        from '../hooks/useExams';
import { useSubjects }     from '../hooks/useSubjects';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { useSchedule, toDateStr } from '../hooks/useSchedule';
import { SEVERITY_COLOR, SEVERITY_BG } from '../services/rulesEngine';
import ApiKeySetup from '../components/ApiKeySetup';

/* ─── Default slot config ─────────────────────────────────────────── */

const DEFAULT_SLOTS = {
  weekday: [
    { id:'morning',   label:'Matin',      icon:'🌅', hours:2, start:'08h', end:'10h', enabled:true  },
    { id:'afternoon', label:'Après-midi', icon:'☀️', hours:2, start:'14h', end:'16h', enabled:true  },
    { id:'evening',   label:'Soir',       icon:'🌙', hours:2, start:'19h', end:'21h', enabled:false },
  ],
  weekend: [
    { id:'morning',   label:'Matin',      icon:'🌅', hours:3, start:'09h', end:'12h', enabled:true  },
    { id:'afternoon', label:'Après-midi', icon:'☀️', hours:3, start:'14h', end:'17h', enabled:true  },
    { id:'evening',   label:'Soir',       icon:'🌙', hours:2, start:'19h', end:'21h', enabled:false },
  ],
};

const SLOT_STARTS = { morning:'08:00', afternoon:'14:00', evening:'19:00' };

/* ─── ICS export ──────────────────────────────────────────────────── */

function toICSDate(dateStr, timeStr = '08:00') {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').replace('.000', '');
}

function exportICS(plan, slotConfig, mode) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyFlow//Planning IA//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const normalizeDay = (day) => {
    if (!day || !day.date) return null;
    // AI mode vs algo mode
    const tasks = day.slots
      ? day.slots.flatMap(slot =>
          (slot.tasks || []).map(t => ({
            ...t,
            slotId: slot.id,
            hours:  t.hours || 1,
            subject: t.subject || '',
            title:  t.title || 'Tâche',
          }))
        )
      : (day.tasks || []).map(t => ({
          ...t,
          slotId: t.slot?.id || 'morning',
          hours:  t.allocHours || 1,
          subject: t.subject || '',
          title:  t.title || 'Tâche',
        }));
    return { date: day.date, tasks };
  };

  for (const rawDay of plan) {
    const day = normalizeDay(rawDay);
    if (!day) continue;
    let cursor = { morning: SLOT_STARTS.morning, afternoon: SLOT_STARTS.afternoon, evening: SLOT_STARTS.evening };

    for (const task of day.tasks) {
      const slotId  = task.slotId || 'morning';
      const start   = cursor[slotId] || SLOT_STARTS.morning;
      const [sh, sm] = start.split(':').map(Number);
      const endMin  = sh * 60 + sm + Math.round((task.hours || 1) * 60);
      const endH    = String(Math.floor(endMin / 60)).padStart(2, '0');
      const endM    = String(endMin % 60).padStart(2, '0');
      const endTime = `${endH}:${endM}`;
      cursor[slotId] = endTime;

      const dtStart = toICSDate(day.date, start);
      const dtEnd   = toICSDate(day.date, endTime);
      const summary = task.subject ? `${task.subject} — ${task.title}` : task.title;
      const desc    = task.objective || task.tip || '';

      lines.push(
        'BEGIN:VEVENT',
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        ...(desc ? [`DESCRIPTION:${desc.replace(/,/g, '\\,').replace(/\n/g, '\\n')}`] : []),
        `UID:${crypto.randomUUID()}@studyflow`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'studyflow-planning.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── SlotPicker ──────────────────────────────────────────────────── */

function SlotPicker({ label, slots, onChange }) {
  const total = slots.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:12, color:'var(--primary)', fontWeight:600 }}>
          {total > 0 ? `${total}h disponibles` : 'Aucun créneau'}
        </span>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {slots.map(slot => (
          <div key={slot.id}
            onClick={() => onChange(slot.id, 'enabled', !slot.enabled)}
            style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:6,
              padding:'12px 14px', borderRadius:12, cursor:'pointer', minWidth:106,
              border:`2px solid ${slot.enabled ? 'var(--primary)' : 'var(--border)'}`,
              backgroundColor: slot.enabled ? 'var(--primary)10' : 'var(--card)',
              boxShadow: slot.enabled ? '0 2px 8px var(--primary)22' : 'none',
              transition:'all 0.15s',
            }}
          >
            <span style={{ fontSize:22 }}>{slot.icon}</span>
            <div style={{ textAlign:'center' }}>
              <p style={{ margin:0, fontSize:12.5, fontWeight:700, color: slot.enabled ? 'var(--primary)' : 'var(--muted)' }}>
                {slot.label}
              </p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--muted)' }}>{slot.start}–{slot.end}</p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }} onClick={e => e.stopPropagation()}>
              <input
                type="number" min={0.5} max={6} step={0.5} value={slot.hours}
                disabled={!slot.enabled}
                onChange={e => onChange(slot.id, 'hours', Math.max(0.5, Math.min(6, +e.target.value)))}
                style={{
                  width:40, textAlign:'center', fontSize:12, fontWeight:700,
                  border:`1px solid ${slot.enabled ? 'var(--primary)44' : 'var(--border)'}`,
                  borderRadius:6, padding:'2px 4px',
                  background: slot.enabled ? 'var(--surface)' : 'var(--card)',
                  color: slot.enabled ? 'var(--text)' : 'var(--muted)',
                }}
              />
              <span style={{ fontSize:11, color:'var(--muted)' }}>h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Day card (shared by algo + AI mode) ────────────────────────── */

function DayCard({ day, isAIMode }) {
  // Normalise tasks+slots for display
  const slotGroups = isAIMode
    ? (day.slots || []).map(slot => ({
        slot: { ...slot, icon: DEFAULT_SLOTS.weekday.find(s => s.id === slot.id)?.icon || '📌' },
        tasks: slot.tasks || [],
      })).filter(g => g.tasks.length > 0)
    : (() => {
        const bySlot = {};
        for (const t of day.tasks || []) {
          const k = t.slot?.id || 'none';
          if (!bySlot[k]) bySlot[k] = { slot: t.slot, tasks: [] };
          bySlot[k].tasks.push(t);
        }
        return Object.values(bySlot);
      })();

  const isWeekendDay = day.isWeekend ?? false;
  const totalH    = isAIMode
    ? (day.slots || []).flatMap(s => s.tasks || []).reduce((a, t) => a + (t.hours || 0), 0)
    : day.totalHours || 0;
  const dayCourses   = day.courses || [];
  const courseH      = day.courseHours || 0;

  return (
    <div className="card" style={{
      borderLeft:`3px solid ${isWeekendDay ? '#10b981' : 'var(--primary)'}`,
      padding:'16px 18px',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <Calendar size={14} color={isWeekendDay ? '#10b981' : 'var(--primary)'}/>
        <span style={{ fontWeight:700, fontSize:15, textTransform:'capitalize', flex:1 }}>
          {format(parseISO(day.date), 'EEEE d MMMM', { locale:fr })}
          {isWeekendDay && <span style={{ fontSize:11, marginLeft:8, color:'#10b981', fontWeight:600 }}>Weekend</span>}
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--muted)' }}>
          <Clock size={11}/> {totalH.toFixed(1)}h étude
        </span>
      </div>

      {/* Courses already scheduled (read from timetable) */}
      {dayCourses.length > 0 && (
        <div style={{
          marginBottom:10, padding:'7px 12px', borderRadius:8,
          backgroundColor:'#10b98112', border:'1px solid #10b98133',
          display:'flex', flexWrap:'wrap', gap:6,
        }}>
          <span style={{ fontSize:11.5, fontWeight:700, color:'#10b981', marginRight:2 }}>
            🏫 Cours ({courseH.toFixed(1)}h) :
          </span>
          {dayCourses.map((c, i) => (
            <span key={i} style={{ fontSize:11, color:'#059669', backgroundColor:'#10b98120', borderRadius:4, padding:'1px 7px' }}>
              {c.startTime}–{c.endTime} {c.subjectName || ''}
            </span>
          ))}
        </div>
      )}

      {/* Daily tip (AI mode) */}
      {isAIMode && day.dailyTip && (
        <div style={{
          marginBottom:10, padding:'7px 12px', borderRadius:8,
          backgroundColor:'var(--primary)10', border:'1px solid var(--primary)22',
          fontSize:12.5, color:'var(--primary)', fontStyle:'italic',
        }}>
          💡 {day.dailyTip}
        </div>
      )}

      {/* Slots + tasks */}
      {slotGroups.map(({ slot, tasks }, gi) => (
        <div key={gi} style={{ marginBottom:8 }}>
          {slot && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <span style={{ fontSize:13 }}>{slot.icon || slot.id}</span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>{slot.label || slot.id}</span>
              {slot.start && slot.end && (
                <span style={{ fontSize:11, color:'var(--muted)' }}>{slot.start}–{slot.end}</span>
              )}
              <div style={{ flex:1, height:1, backgroundColor:'var(--border)', marginLeft:4 }}/>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {tasks.map((t, ti) => {
              const color = t.color || 'var(--primary)';
              const hours = isAIMode ? (t.hours || 1) : (t.allocHours || 1);
              return (
                <div key={ti} style={{
                  padding:'9px 12px', borderRadius:8,
                  backgroundColor: isAIMode ? 'var(--card)' : color + '15',
                  border:`1px solid ${isAIMode ? 'var(--border)' : color + '33'}`,
                  borderLeft:`3px solid ${isAIMode ? 'var(--primary)' : color}`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: (t.objective || t.tip) ? 4 : 0 }}>
                    <span style={{ fontSize:11 }}>{t.type === 'exam_revision' ? '📚' : isAIMode ? '📝' : '📝'}</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{t.title}</span>
                    {t.subject && <span style={{ fontSize:12, color:'var(--primary)', fontWeight:600 }}>{t.subject}</span>}
                    <span style={{ fontSize:12, color:'var(--muted)', fontWeight:700, flexShrink:0 }}>{hours}h</span>
                  </div>
                  {(t.objective || t.tip) && (
                    <p style={{ margin:0, fontSize:11.5, color:'var(--muted)', paddingLeft:20, lineHeight:1.4 }}>
                      {t.objective ? `🎯 ${t.objective}` : `💡 ${t.tip}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */

export default function Planner() {
  const { assignments }            = useAssignments();
  const { exams }                  = useExams();
  const { subjects }               = useSubjects();
  const { profile }                = useIntelligence();
  const { forDateStr, weekType }   = useSchedule();

  const [slotConfig,  setSlotConfig]  = useState(DEFAULT_SLOTS);
  const [days,        setDays]        = useState(14);
  const [aiMode,      setAiMode]      = useState('algo');   // 'algo' | 'claude' | 'grok'
  const [grokModel,   setGrokModel]   = useState('grok-3');
  const [result,      setResult]      = useState(null);
  const [aiPlan,      setAiPlan]      = useState(null);     // raw AI JSON plan
  const [generating,  setGenerating]  = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [error,       setError]       = useState('');
  const [showSetup,   setShowSetup]   = useState(false);
  const [notification, setNotification] = useState('');

  // Build a map "YYYY-MM-DD" → courses[] for the planning horizon
  // Uses forDateStr from useSchedule so it respects weekType (A/B) and recurring courses
  const busyPerDay = useMemo(() => {
    const busy  = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d       = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = toDateStr(d);
      busy[dateStr] = forDateStr(dateStr, weekType).map(c => ({
        ...c,
        subjectName: subjects.find(s => s.id === c.subjectId)?.name || '',
      }));
    }
    return busy;
  }, [days, forDateStr, weekType, subjects]);

  // Count of days that have at least one course in the horizon
  const busyDayCount      = Object.values(busyPerDay).filter(cs => cs.length > 0).length;
  const totalCourseSlots  = Object.values(busyPerDay).flat().length;

  const mutateSlot = (type, id, key, value) => {
    setSlotConfig(prev => ({
      ...prev,
      [type]: prev[type].map(s => s.id === id ? { ...s, [key]: value } : s),
    }));
    setResult(null); setAiPlan(null);
  };

  const weekdayHours = slotConfig.weekday.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
  const weekendHours = slotConfig.weekend.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
  const avgHoursDay  = Math.round(((5 * weekdayHours + 2 * weekendHours) / 7) * 10) / 10;

  const notify = (msg) => { setNotification(msg); setTimeout(() => setNotification(''), 4000); };

  /* ── Algo generate ── */
  const runAlgo = () => {
    setError('');
    const pending = assignments.filter(a => a.status !== 'done');
    const futureExams = exams.filter(e => new Date(e.date) >= new Date()).map(e => ({
      ...e,
      importanceHours: e.importance === 'high' ? 4 : e.importance === 'medium' ? 2.5 : 1.5,
    }));
    // Pass busyPerDay so the algo subtracts class hours from each day's capacity
    const r = generateAIPlan(pending, futureExams, { days }, subjects, profile, slotConfig, busyPerDay);
    setResult(r); setAiPlan(null);
  };

  /* ── AI generate (Claude or Grok) ── */
  const runAI = async () => {
    setError(''); setProgress(0); setGenerating(true); setResult(null); setAiPlan(null);
    try {
      const plan = await claude.generateStudyPlanFromAI({
        assignments: assignments.filter(a => a.status !== 'done'),
        exams:       exams.filter(e => new Date(e.date) >= new Date()),
        subjects,
        slotConfig,
        days,
        provider:   aiMode,
        grokModel,
        busyPerDay,   // ← inject timetable into the AI prompt
        onProgress: (chars) => setProgress(Math.min(95, Math.round(chars / 50))),
      });
      if (!plan || plan.length === 0) {
        setError("L'IA n'a pas pu générer de planning. Vérifie ta clé API et réessaie.");
      } else {
        // Enrich AI plan with isWeekend flag + course info from timetable
        const enriched = plan.map(day => ({
          ...day,
          isWeekend: [0, 6].includes(new Date(day.date + 'T12:00:00').getDay()),
          courses:   busyPerDay[day.date] || [],   // attach real courses for display
        }));
        setAiPlan(enriched);
      }
    } catch (e) {
      const msg = e.message === 'NO_API_KEY'      ? 'Clé Claude manquante — configure ta clé API.'
               : e.message === 'NO_GROK_API_KEY'  ? 'Clé Grok manquante — configure ta clé xAI.'
               : e.message === 'INVALID_API_KEY'   ? 'Clé Claude invalide.'
               : e.message === 'INVALID_GROK_KEY'  ? 'Clé Grok invalide.'
               : `Erreur : ${e.message}`;
      setError(msg);
    } finally {
      setGenerating(false); setProgress(0);
    }
  };

  const handleGenerate = () => {
    if (aiMode === 'algo') runAlgo();
    else runAI();
  };

  const handleRebalance = () => {
    if (!result) return;
    const rebalanced = rebalancePlan(result.days, avgHoursDay);
    setResult(prev => ({ ...prev, days: rebalanced }));
  };

  const currentPlan     = aiPlan || result?.days;
  const isAIMode        = !!aiPlan;
  const nonEmpty        = currentPlan?.filter(d => {
    if (isAIMode) return (d.slots || []).some(s => s.tasks?.length > 0);
    return (d.tasks || []).length > 0;
  }) || [];
  const overloadCount   = result?.days?.filter(d => d.overloaded).length || 0;

  return (
    <div style={{ maxWidth:900 }}>
      <h1 className="page-title" style={{ marginBottom:4 }}>Planning automatique</h1>
      <p style={{ color:'var(--muted)', fontSize:13, marginBottom:22 }}>
        Génère un planning optimisé selon tes devoirs, examens et créneaux disponibles.
      </p>

      {/* ── Config card ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
          <p style={{ fontWeight:700, fontSize:14.5, margin:0 }}>Mes créneaux disponibles</p>
          {profile && (
            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, backgroundColor:'var(--primary)22', color:'var(--primary)', fontWeight:600 }}>
              <User size={10} style={{ marginRight:3, verticalAlign:'middle' }}/>
              Profil comportemental
            </span>
          )}
        </div>

        <div style={{ marginBottom:18 }}>
          <SlotPicker label="📅 Lundi → Vendredi" slots={slotConfig.weekday} onChange={(id,k,v) => mutateSlot('weekday',id,k,v)}/>
        </div>
        <div style={{ marginBottom:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <SlotPicker label="🏖️ Samedi & Dimanche" slots={slotConfig.weekend} onChange={(id,k,v) => mutateSlot('weekend',id,k,v)}/>
        </div>

        {/* Mode selector + horizon + generate */}
        <div style={{ paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <p style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Mode de génération</p>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            {[
              { id:'algo',   label:'⚡ Rapide',      desc:'Algorithme instantané (sans IA)' },
              { id:'claude', label:'🤖 Claude IA',   desc:'Claude génère le plan avec conseils' },
              { id:'grok',   label:'⚡ Grok IA',     desc:'Grok (xAI) génère le plan' },
            ].map(m => (
              <button key={m.id} onClick={() => { setAiMode(m.id); setResult(null); setAiPlan(null); setError(''); }}
                style={{
                  padding:'10px 16px', borderRadius:10, cursor:'pointer',
                  border:`2px solid ${aiMode === m.id ? 'var(--primary)' : 'var(--border)'}`,
                  backgroundColor: aiMode === m.id ? 'var(--primary)12' : 'var(--card)',
                  color: aiMode === m.id ? 'var(--primary)' : 'var(--text)',
                  fontWeight: aiMode === m.id ? 700 : 400, fontSize:13,
                  transition:'all 0.15s', textAlign:'left',
                }}>
                <div>{m.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display:'flex', gap:14, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div className="form-group" style={{ minWidth:150, marginBottom:0 }}>
              <label className="form-label">Horizon (jours)</label>
              <input type="number" min={3} max={60} value={days}
                onChange={e => { setDays(Number(e.target.value)); setResult(null); setAiPlan(null); }}/>
            </div>
            {aiMode === 'grok' && (
              <div className="form-group" style={{ minWidth:150, marginBottom:0 }}>
                <label className="form-label">Modèle Grok</label>
                <select value={grokModel} onChange={e => setGrokModel(e.target.value)}>
                  <option value="grok-3">grok-3</option>
                  <option value="grok-3-mini">grok-3-mini</option>
                  <option value="grok-2">grok-2</option>
                </select>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>~{avgHoursDay}h/jour en moyenne</span>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn-primary" onClick={handleGenerate} disabled={generating}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px' }}>
                  {generating
                    ? <><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/> Génération…</>
                    : <><Wand2 size={15}/> Générer le planning</>
                  }
                </button>
                {aiMode !== 'algo' && (
                  <button onClick={() => setShowSetup(true)}
                    style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'none', color:'var(--muted)', fontSize:12.5, cursor:'pointer' }}>
                    🔑 Clé API
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar (AI mode) */}
          {generating && (
            <div style={{ marginTop:14 }}>
              <div style={{ height:4, backgroundColor:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', backgroundColor:'var(--primary)', borderRadius:4, width:`${progress}%`, transition:'width 0.3s' }}/>
              </div>
              <p style={{ fontSize:11.5, color:'var(--muted)', marginTop:4 }}>
                {aiMode === 'claude' ? '🤖 Claude' : '⚡ Grok'} génère ton planning personnalisé…
              </p>
            </div>
          )}

          {error && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, backgroundColor:'#f8717118', border:'1px solid #f87171', fontSize:13, color:'#f87171' }}>
              ⚠️ {error}
              {(error.includes('Claude') || error.includes('Grok')) && (
                <button onClick={() => setShowSetup(true)}
                  style={{ marginLeft:10, fontSize:12, color:'var(--primary)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  Configurer la clé
                </button>
              )}
            </div>
          )}
        </div>

        {/* Context chips */}
        <div style={{ marginTop:14, display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            [`${assignments.filter(a => a.status !== 'done').length} devoirs en attente`,    'var(--primary)'],
            [`${exams.filter(e => new Date(e.date) >= new Date()).length} examens à venir`, 'var(--danger)'],
            ...(profile?.delayTendency > 0.4 ? [[`Retard : ${Math.round(profile.delayTendency * 100)}%`, 'var(--warning)']] : []),
          ].map(([label, color]) => (
            <span key={label} style={{ fontSize:12, padding:'3px 10px', borderRadius:20, backgroundColor:color+'22', color }}>{label}</span>
          ))}
          {/* Timetable chip — shows if the user has courses loaded */}
          {totalCourseSlots > 0 ? (
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, padding:'3px 10px', borderRadius:20, backgroundColor:'#10b98122', color:'#10b981', fontWeight:600 }}>
              <BookOpen size={11}/> {busyDayCount} jour{busyDayCount > 1 ? 's' : ''} de cours pris en compte
            </span>
          ) : (
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, padding:'3px 10px', borderRadius:20, backgroundColor:'var(--border)', color:'var(--muted)' }}>
              <BookOpen size={11}/> Aucun cours dans l'emploi du temps
            </span>
          )}
        </div>
      </div>

      {/* ── Algo suggestions ── */}
      {!isAIMode && result?.suggestions?.length > 0 && (
        <div style={{ marginBottom:20, display:'flex', flexDirection:'column', gap:6 }}>
          {result.suggestions.map((s, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:10,
              padding:'10px 14px', borderRadius:10,
              backgroundColor:SEVERITY_BG[s.severity], border:`1px solid ${SEVERITY_COLOR[s.severity]}40`,
            }}>
              <Zap size={13} color={SEVERITY_COLOR[s.severity]} style={{ marginTop:1, flexShrink:0 }}/>
              <span style={{ fontSize:13, flex:1 }}>{s.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Rebalance (algo only) ── */}
      {!isAIMode && overloadCount > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <button className="btn-primary" onClick={handleRebalance}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <RefreshCw size={13}/> Rééquilibrer ({overloadCount} jour{overloadCount>1?'s':''} surchargé{overloadCount>1?'s':''})
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {nonEmpty.length === 0 && !generating && (result || aiPlan) && (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <p style={{ fontSize:28, marginBottom:8 }}>🎉</p>
          <p style={{ color:'var(--muted)' }}>Aucune tâche à planifier — tu es parfaitement à jour !</p>
        </div>
      )}

      {/* ── Plan output ── */}
      {nonEmpty.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <p style={{ fontSize:13, color:'var(--muted)', margin:0 }}>
              Planning sur <strong>{nonEmpty.length} jours actifs</strong>
              {isAIMode && <span style={{ color:'var(--primary)', marginLeft:6 }}>· généré par {aiMode === 'grok' ? '⚡ Grok' : '🤖 Claude'}</span>}
              {!isAIMode && result?.profileUsed && <span style={{ color:'var(--primary)', marginLeft:6 }}>· adapté à ton profil</span>}
            </p>
            <button
              onClick={() => exportICS(nonEmpty, slotConfig, isAIMode)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--text)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              <Download size={13}/> Exporter .ics
            </button>
          </div>

          {nonEmpty.map(day => (
            <DayCard key={day.date} day={day} isAIMode={isAIMode}/>
          ))}
        </div>
      )}

      {/* Toast */}
      {notification && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 22px', fontSize:13.5, fontWeight:600, boxShadow:'0 4px 24px rgba(0,0,0,0.2)', zIndex:999, color:'var(--success)' }}>
          {notification}
        </div>
      )}

      {showSetup && (
        <ApiKeySetup
          onClose={() => setShowSetup(false)}
          onSaved={() => { setShowSetup(false); notify('✅ Clé API enregistrée !'); }}
        />
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
