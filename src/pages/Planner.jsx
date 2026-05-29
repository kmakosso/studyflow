import { useState, useMemo } from 'react';
import {
  Wand2, Calendar, Clock, CalendarPlus, Bell, Download, Loader,
  BookOpen, Sparkles, AlertTriangle, Plus, X, Check,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateTimedPlan, exportPlanICS, timeToMin } from '../services/planScheduler';
import { enrichPlanWithAI } from '../services/claudeService';
import { useAssignments } from '../hooks/useAssignments';
import { useExams }       from '../hooks/useExams';
import { useSubjects }    from '../hooks/useSubjects';
import { useReminders }   from '../hooks/useReminders';
import { useSchedule, toDateStr } from '../hooks/useSchedule';
import { useIsMobile }    from '../hooks/useIsMobile';
import ApiKeySetup from '../components/ApiKeySetup';

/* ─── Defaults ───────────────────────────────────────────────────── */
const DEFAULT_WINDOWS = {
  weekday: { enabled: true,  ranges: [{ start: '17:00', end: '21:00' }] },
  weekend: { enabled: true,  ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
};

/* ─── Time-range editor ──────────────────────────────────────────── */
function WindowEditor({ label, emoji, win, onToggle, onRange, onAdd, onRemove }) {
  return (
    <div style={{ opacity: win.enabled ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button onClick={onToggle} style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
          background: win.enabled ? 'var(--primary)' : 'var(--border)', transition: 'background 0.15s',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: win.enabled ? 20 : 2,
            width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
          }} />
        </button>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{emoji} {label}</span>
      </div>

      {win.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
          {win.ranges.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="time" value={r.start} onChange={e => onRange(i, 'start', e.target.value)}
                style={{ width: 110, fontSize: 13 }} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>→</span>
              <input type="time" value={r.end} onChange={e => onRange(i, 'end', e.target.value)}
                style={{ width: 110, fontSize: 13 }} />
              {win.ranges.length > 1 && (
                <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button onClick={onAdd} style={{
            display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
            color: 'var(--muted)', fontSize: 12, padding: '5px 10px', cursor: 'pointer',
          }}>
            <Plus size={12} /> Ajouter un créneau
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Day card with merged timeline ──────────────────────────────── */
function DayCard({ day, addedSet, remindedSet, onAddSchedule, onAddReminder }) {
  // Merge courses + study blocks, sorted by time
  const items = [
    ...day.courses.map(c => ({
      kind: 'course', start: c.startTime, end: c.endTime,
      title: c.subjectName || 'Cours', room: c.room,
    })),
    ...day.blocks.map(b => ({ kind: 'study', ...b, start: b.startTime, end: b.endTime })),
  ].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  const studyH = Math.round(day.studyMinutes / 6) / 10;

  return (
    <div className="card" style={{ borderLeft: `3px solid ${day.isWeekend ? '#10b981' : 'var(--primary)'}`, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Calendar size={14} color={day.isWeekend ? '#10b981' : 'var(--primary)'} />
        <span style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize', flex: 1 }}>
          {format(parseISO(day.date), 'EEEE d MMMM', { locale: fr })}
          {day.isWeekend && <span style={{ fontSize: 11, marginLeft: 8, color: '#10b981', fontWeight: 600 }}>Week-end</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          <Clock size={11} /> {studyH}h
        </span>
      </div>

      {day.dailyTip && (
        <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, backgroundColor: 'var(--primary)10', border: '1px solid var(--primary)22', fontSize: 12.5, color: 'var(--primary)', fontStyle: 'italic' }}>
          💡 {day.dailyTip}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, idx) => {
          if (it.kind === 'course') {
            return (
              <div key={`c-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, backgroundColor: '#10b98112', border: '1px solid #10b98126' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#10b981', fontFamily: 'monospace', minWidth: 86 }}>
                  {it.start}–{it.end}
                </span>
                <span style={{ fontSize: 13, color: '#059669', flex: 1 }}>🏫 {it.title}{it.room ? ` · ${it.room}` : ''}</span>
              </div>
            );
          }
          const added    = addedSet.has(it.id);
          const reminded = remindedSet.has(it.id);
          return (
            <div key={it.id} style={{
              padding: '9px 12px', borderRadius: 8,
              backgroundColor: it.color + '12', border: `1px solid ${it.color}30`, borderLeft: `3px solid ${it.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', minWidth: 86 }}>
                  {it.start}–{it.end}
                </span>
                <span style={{ fontSize: 11 }}>{it.type === 'revision' ? '📚' : '📝'}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, minWidth: 100 }}>{it.title}</span>
                {it.subject && <span style={{ fontSize: 12, color: it.color, fontWeight: 600 }}>{it.subject}</span>}
                {it.overdue && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', backgroundColor: 'var(--danger)18', padding: '1px 6px', borderRadius: 10 }}>en retard</span>}

                {/* Per-block actions */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onAddSchedule(it)} disabled={added}
                    title="Ajouter à l'emploi du temps"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: added ? 'default' : 'pointer',
                      border: `1px solid ${added ? 'var(--success)' : 'var(--border)'}`,
                      background: added ? 'var(--success)18' : 'none',
                      color: added ? 'var(--success)' : 'var(--muted)' }}>
                    {added ? <><Check size={11} /> Ajouté</> : <><CalendarPlus size={11} /> EDT</>}
                  </button>
                  <button onClick={() => onAddReminder(it)} disabled={reminded}
                    title="Créer un rappel"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: reminded ? 'default' : 'pointer',
                      border: `1px solid ${reminded ? 'var(--warning)' : 'var(--border)'}`,
                      background: reminded ? 'var(--warning)18' : 'none',
                      color: reminded ? 'var(--warning)' : 'var(--muted)' }}>
                    {reminded ? <><Check size={11} /> Rappel</> : <><Bell size={11} /> Rappel</>}
                  </button>
                </div>
              </div>
              {(it.objective || it.tip) && (
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--muted)', paddingLeft: 20, lineHeight: 1.4 }}>
                  {it.objective ? `🎯 ${it.objective}` : `💡 ${it.tip}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function Planner() {
  const { assignments } = useAssignments();
  const { exams }       = useExams();
  const { subjects }    = useSubjects();
  const { add: addCourse, forDateStr, weekType } = useSchedule();
  const { add: addReminder } = useReminders();
  const isMobile = useIsMobile();

  const [windows,    setWindows]    = useState(DEFAULT_WINDOWS);
  const [sessionLen, setSessionLen] = useState(60);
  const [horizon,    setHorizon]    = useState(14);
  const [plan,       setPlan]       = useState(null);
  const [aiProvider, setAiProvider] = useState('claude');
  const [grokModel,  setGrokModel]  = useState('grok-3');
  const [enriching,  setEnriching]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [error,      setError]      = useState('');
  const [showSetup,  setShowSetup]  = useState(false);
  const [notification, setNotification] = useState('');
  const [added,    setAdded]    = useState(new Set());
  const [reminded, setReminded] = useState(new Set());

  /* Timetable per day */
  const busyPerDay = useMemo(() => {
    const busy = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < horizon; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const dateStr = toDateStr(d);
      busy[dateStr] = forDateStr(dateStr, weekType).map(c => ({
        ...c, subjectName: subjects.find(s => s.id === c.subjectId)?.name || '',
      }));
    }
    return busy;
  }, [horizon, forDateStr, weekType, subjects]);

  const busyDayCount = Object.values(busyPerDay).filter(cs => cs.length > 0).length;
  const pendingCount = assignments.filter(a => a.status !== 'done').length;
  const examCount    = exams.filter(e => new Date(e.date) >= new Date()).length;

  const notify = (msg) => { setNotification(msg); setTimeout(() => setNotification(''), 3500); };

  /* Window mutators */
  const toggleWin = (type) => { setWindows(p => ({ ...p, [type]: { ...p[type], enabled: !p[type].enabled } })); setPlan(null); };
  const setRange  = (type, i, k, v) => setWindows(p => ({ ...p, [type]: { ...p[type], ranges: p[type].ranges.map((r, j) => j === i ? { ...r, [k]: v } : r) } }));
  const addRange  = (type) => setWindows(p => ({ ...p, [type]: { ...p[type], ranges: [...p[type].ranges, { start: '14:00', end: '16:00' }] } }));
  const removeRange = (type, i) => setWindows(p => ({ ...p, [type]: { ...p[type], ranges: p[type].ranges.filter((_, j) => j !== i) } }));

  /* Generate (algo) */
  const generate = () => {
    setError(''); setAdded(new Set()); setReminded(new Set());
    const pending = assignments.filter(a => a.status !== 'done');
    const futureExams = exams.filter(e => new Date(e.date) >= new Date());
    const result = generateTimedPlan(pending, futureExams, subjects, { windows, sessionLen, horizon }, busyPerDay);
    setPlan(result);
    if (result.stats.blocks === 0) notify('🎉 Rien à planifier — tu es à jour !');
  };

  /* Improve with AI */
  const improveWithAI = async () => {
    if (!plan) return;
    setError(''); setProgress(0); setEnriching(true);
    try {
      const enriched = await enrichPlanWithAI(plan.days, {
        provider: aiProvider, grokModel,
        onProgress: (chars) => setProgress(Math.min(95, Math.round(chars / 40))),
      });
      setPlan(p => ({ ...p, days: enriched }));
      notify('✨ Planning enrichi par l\'IA !');
    } catch (e) {
      const msg = e.message === 'NO_API_KEY'     ? 'Clé Claude manquante — configure ta clé API.'
               : e.message === 'NO_GROK_API_KEY' ? 'Clé Grok manquante — configure ta clé xAI.'
               : e.message === 'INVALID_API_KEY' ? 'Clé Claude invalide.'
               : `Erreur : ${e.message}`;
      setError(msg);
    } finally { setEnriching(false); setProgress(0); }
  };

  /* Per-block actions */
  const onAddSchedule = async (block) => {
    await addCourse({
      date: block.date, startTime: block.startTime, endTime: block.endTime,
      subjectId: block.subjectId || null, room: '', title: block.title, type: 'study',
    });
    setAdded(s => new Set(s).add(block.id));
    notify('✅ Ajouté à l\'emploi du temps');
  };
  const onAddReminder = async (block) => {
    await addReminder({
      datetime: new Date(`${block.date}T${block.startTime}:00`).toISOString(),
      message: `${block.subject ? block.subject + ' — ' : ''}${block.title}`,
    });
    setReminded(s => new Set(s).add(block.id));
    notify('🔔 Rappel créé');
  };

  /* Bulk actions */
  const allBlocks = plan ? plan.days.flatMap(d => d.blocks) : [];
  const addAllSchedule = async () => {
    for (const b of allBlocks) if (!added.has(b.id)) await onAddScheduleSilent(b);
    notify(`✅ ${allBlocks.length} blocs ajoutés à l'emploi du temps`);
  };
  const onAddScheduleSilent = async (block) => {
    await addCourse({ date: block.date, startTime: block.startTime, endTime: block.endTime, subjectId: block.subjectId || null, room: '', title: block.title, type: 'study' });
    setAdded(s => new Set(s).add(block.id));
  };
  const addAllReminders = async () => {
    for (const b of allBlocks) if (!reminded.has(b.id)) {
      await addReminder({ datetime: new Date(`${b.date}T${b.startTime}:00`).toISOString(), message: `${b.subject ? b.subject + ' — ' : ''}${b.title}` });
      setReminded(s => new Set(s).add(b.id));
    }
    notify(`🔔 ${allBlocks.length} rappels créés`);
  };

  const activeDays = plan ? plan.days.filter(d => d.blocks.length > 0) : [];

  return (
    <div style={{ maxWidth: 880 }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Planning automatique</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Génère un agenda d'étude placé à des heures précises, autour de tes cours.
      </p>

      {/* ── Config ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 14.5, margin: '0 0 16px' }}>Mes disponibilités</p>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
          <WindowEditor label="Lundi → Vendredi" emoji="📅" win={windows.weekday}
            onToggle={() => toggleWin('weekday')} onRange={(i, k, v) => setRange('weekday', i, k, v)}
            onAdd={() => addRange('weekday')} onRemove={(i) => removeRange('weekday', i)} />
          <WindowEditor label="Samedi & Dimanche" emoji="🏖️" win={windows.weekend}
            onToggle={() => toggleWin('weekend')} onRange={(i, k, v) => setRange('weekend', i, k, v)}
            onAdd={() => addRange('weekend')} onRemove={(i) => removeRange('weekend', i)} />
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="form-group" style={{ width: 150, marginBottom: 0 }}>
            <label className="form-label">Durée d'une session</label>
            <select value={sessionLen} onChange={e => { setSessionLen(Number(e.target.value)); setPlan(null); }}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 heure</option>
              <option value={90}>1h30</option>
            </select>
          </div>
          <div className="form-group" style={{ width: 130, marginBottom: 0 }}>
            <label className="form-label">Horizon</label>
            <select value={horizon} onChange={e => { setHorizon(Number(e.target.value)); setPlan(null); }}>
              <option value={7}>7 jours</option>
              <option value={14}>14 jours</option>
              <option value={21}>21 jours</option>
              <option value={30}>30 jours</option>
            </select>
          </div>
          <button className="btn-primary" onClick={generate}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
            <Wand2 size={15} /> Générer
          </button>
        </div>

        {/* Context chips */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, backgroundColor: 'var(--primary)22', color: 'var(--primary)' }}>{pendingCount} devoirs</span>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, backgroundColor: 'var(--danger)22', color: 'var(--danger)' }}>{examCount} examens</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 10px', borderRadius: 20,
            backgroundColor: busyDayCount ? '#10b98122' : 'var(--border)', color: busyDayCount ? '#10b981' : 'var(--muted)', fontWeight: 600 }}>
            <BookOpen size={11} /> {busyDayCount ? `${busyDayCount} jours de cours pris en compte` : 'Aucun cours'}
          </span>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, backgroundColor: '#f8717118', border: '1px solid #f87171', fontSize: 13, color: '#f87171' }}>
          ⚠️ {error}
          {error.includes('clé') && (
            <button onClick={() => setShowSetup(true)} style={{ marginLeft: 10, fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Configurer
            </button>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {plan && activeDays.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
          <p style={{ color: 'var(--muted)' }}>Aucune tâche à planifier — tu es parfaitement à jour !</p>
        </div>
      )}

      {plan && activeDays.length > 0 && (
        <>
          {/* Stats + bulk actions */}
          <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 20, flex: 1, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{plan.stats.totalHours}h</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>d'étude</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 800 }}>{plan.stats.blocks}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>blocs</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 800 }}>{plan.stats.activeDays}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>jours actifs</div></div>
              {plan.stats.unscheduled > 0 && (
                <div title="Sessions non casées faute de créneaux libres">
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{plan.stats.unscheduled}</div>
                  <div style={{ fontSize: 11, color: 'var(--warning)' }}>non casées</div>
                </div>
              )}
            </div>
          </div>

          {plan.stats.unscheduled > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--warning)15', border: '1px solid var(--warning)40', fontSize: 12.5, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} /> {plan.stats.unscheduled} session(s) n'ont pas pu être placées — ajoute des créneaux ou augmente l'horizon.
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={addAllSchedule} style={actionBtn}>
              <CalendarPlus size={13} /> Tout ajouter à l'EDT
            </button>
            <button onClick={addAllReminders} style={actionBtn}>
              <Bell size={13} /> Tout en rappels
            </button>
            <button onClick={() => exportPlanICS(activeDays)} style={actionBtn}>
              <Download size={13} /> Export .ics
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={aiProvider} onChange={e => setAiProvider(e.target.value)}
                style={{ width: 'auto', fontSize: 12, padding: '6px 8px' }}>
                <option value="claude">🤖 Claude</option>
                <option value="grok">⚡ Grok</option>
              </select>
              {aiProvider === 'grok' && (
                <select value={grokModel} onChange={e => setGrokModel(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '6px 8px' }}>
                  <option value="grok-3">grok-3</option>
                  <option value="grok-3-mini">grok-3-mini</option>
                </select>
              )}
              <button onClick={improveWithAI} disabled={enriching}
                style={{ ...actionBtn, border: '1px solid var(--primary)', color: 'var(--primary)', background: 'var(--primary)10' }}>
                {enriching
                  ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Enrichissement…</>
                  : <><Sparkles size={13} /> Améliorer avec l'IA</>}
              </button>
            </div>
          </div>

          {enriching && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 4, backgroundColor: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: 'var(--primary)', borderRadius: 4, width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* Days */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeDays.map(day => (
              <DayCard key={day.date} day={day} addedSet={added} remindedSet={reminded}
                onAddSchedule={onAddSchedule} onAddReminder={onAddReminder} />
            ))}
          </div>
        </>
      )}

      {/* Toast */}
      {notification && (
        <div style={{ position: 'fixed', bottom: isMobile ? 80 : 24, left: '50%', transform: 'translateX(-50%)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 22px', fontSize: 13.5, fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', zIndex: 999, whiteSpace: 'nowrap' }}>
          {notification}
        </div>
      )}

      {showSetup && (
        <ApiKeySetup onClose={() => setShowSetup(false)} onSaved={() => { setShowSetup(false); notify('✅ Clé API enregistrée !'); }} />
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

const actionBtn = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'none', color: 'var(--text)',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
