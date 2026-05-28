import { useState } from 'react';
import { Wand2, Calendar, Clock, Zap, RefreshCw, User, Sun, Sunset } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateAIPlan, rebalancePlan, getDayHours } from '../services/plannerAI';
import { useAssignments }  from '../hooks/useAssignments';
import { useExams }        from '../hooks/useExams';
import { useSubjects }     from '../hooks/useSubjects';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { SEVERITY_COLOR, SEVERITY_BG } from '../services/rulesEngine';

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
          <div key={slot.id} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:6,
            padding:'12px 16px', borderRadius:12, cursor:'pointer',
            border:`2px solid ${slot.enabled ? 'var(--primary)' : 'var(--border)'}`,
            backgroundColor: slot.enabled ? 'var(--primary)10' : 'var(--card)',
            transition:'all 0.15s', minWidth:110,
            boxShadow: slot.enabled ? '0 2px 8px var(--primary)22' : 'none',
          }}
            onClick={() => onChange(slot.id, 'enabled', !slot.enabled)}
          >
            <span style={{ fontSize:22 }}>{slot.icon}</span>
            <div style={{ textAlign:'center' }}>
              <p style={{ margin:0, fontSize:12.5, fontWeight:700, color: slot.enabled ? 'var(--primary)' : 'var(--muted)' }}>
                {slot.label}
              </p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--muted)' }}>
                {slot.start}–{slot.end}
              </p>
            </div>
            {/* Hours input */}
            <div style={{ display:'flex', alignItems:'center', gap:4 }} onClick={e => e.stopPropagation()}>
              <input
                type="number"
                min={0.5} max={6} step={0.5}
                value={slot.hours}
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

/* ─── Main component ──────────────────────────────────────────────── */

export default function Planner() {
  const { assignments }  = useAssignments();
  const { exams }        = useExams();
  const { subjects }     = useSubjects();
  const { profile }      = useIntelligence();

  const [slotConfig, setSlotConfig] = useState(DEFAULT_SLOTS);
  const [days,       setDays]       = useState(14);
  const [result,     setResult]     = useState(null);
  const [generated,  setGenerated]  = useState(false);

  /* ── Slot mutation ── */
  const mutateSlot = (type, id, key, value) => {
    setSlotConfig(prev => ({
      ...prev,
      [type]: prev[type].map(s => s.id === id ? { ...s, [key]: value } : s),
    }));
    setGenerated(false);
  };

  const weekdayHours = slotConfig.weekday.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
  const weekendHours = slotConfig.weekend.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);

  /* ── Generate ── */
  const run = () => {
    const pending     = assignments.filter(a => a.status !== 'done');
    const futureExams = exams.filter(e => new Date(e.date) >= new Date()).map(e => ({
      ...e,
      importanceHours: e.importance === 'high' ? 4 : e.importance === 'medium' ? 2.5 : 1.5,
      subjectName: subjects.find(s => s.id === e.subjectId)?.name || 'Examen',
    }));
    const r = generateAIPlan(pending, futureExams, { days }, subjects, profile, slotConfig);
    setResult(r);
    setGenerated(true);
  };

  const handleRebalance = () => {
    if (!result) return;
    const avgHours = ((5 * weekdayHours) + (2 * weekendHours)) / 7;
    const rebalanced = rebalancePlan(result.days, avgHours);
    setResult(prev => ({ ...prev, days: rebalanced }));
  };

  const nonEmpty      = result?.days?.filter(d => d.tasks.length > 0) || [];
  const overloadCount = nonEmpty.filter(d => d.overloaded).length;

  return (
    <div style={{ maxWidth:880 }}>
      <h1 className="page-title" style={{ marginBottom:4 }}>Planning automatique IA</h1>
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
              Profil comportemental utilisé
            </span>
          )}
        </div>

        {/* Weekday slots */}
        <div style={{ marginBottom:18 }}>
          <SlotPicker
            label="📅 Lundi → Vendredi"
            slots={slotConfig.weekday}
            onChange={(id, key, val) => mutateSlot('weekday', id, key, val)}
          />
        </div>

        {/* Weekend slots */}
        <div style={{ marginBottom:20, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <SlotPicker
            label="🏖️ Samedi & Dimanche"
            slots={slotConfig.weekend}
            onChange={(id, key, val) => mutateSlot('weekend', id, key, val)}
          />
        </div>

        {/* Horizon + generate */}
        <div style={{ display:'flex', gap:16, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div className="form-group" style={{ minWidth:160, marginBottom:0 }}>
            <label className="form-label">Horizon (jours)</label>
            <input type="number" min={3} max={60} value={days}
              onChange={e => { setDays(Number(e.target.value)); setGenerated(false); }}/>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <span style={{ fontSize:12, color:'var(--muted)' }}>
              ~{Math.round(((5 * weekdayHours + 2 * weekendHours) / 7) * 10) / 10}h/jour en moyenne
            </span>
            <button className="btn-primary" onClick={run}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 22px' }}>
              <Wand2 size={16}/> Générer le planning
            </button>
          </div>
        </div>

        {/* Context chips */}
        <div style={{ marginTop:14, display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            [`${assignments.filter(a => a.status !== 'done').length} devoirs en attente`,    'var(--primary)'],
            [`${exams.filter(e => new Date(e.date) >= new Date()).length} examens à venir`, 'var(--danger)'],
            ...(profile?.delayTendency > 0.4
              ? [[`Retard historique : ${Math.round(profile.delayTendency * 100)}%`, 'var(--warning)']] : []),
          ].map(([label, color]) => (
            <span key={label} style={{ fontSize:12, padding:'3px 10px', borderRadius:20, backgroundColor:color+'22', color }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Suggestions ── */}
      {generated && result?.suggestions?.length > 0 && (
        <div style={{ marginBottom:20, display:'flex', flexDirection:'column', gap:6 }}>
          {result.suggestions.map((s, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'flex-start', gap:10,
              padding:'10px 14px', borderRadius:10,
              backgroundColor: SEVERITY_BG[s.severity],
              border:`1px solid ${SEVERITY_COLOR[s.severity]}40`,
            }}>
              <Zap size={13} color={SEVERITY_COLOR[s.severity]} style={{ marginTop:1, flexShrink:0 }}/>
              <span style={{ fontSize:13, flex:1 }}>{s.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Rebalance ── */}
      {generated && overloadCount > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <button className="btn-primary" onClick={handleRebalance}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <RefreshCw size={13}/> Rééquilibrer automatiquement ({overloadCount} jour{overloadCount > 1?'s':''} surchargé{overloadCount > 1?'s':''})
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {generated && nonEmpty.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:40 }}>
          <p style={{ fontSize:28, marginBottom:8 }}>🎉</p>
          <p style={{ color:'var(--muted)' }}>Aucune tâche à planifier — tu es parfaitement à jour !</p>
        </div>
      )}

      {/* ── Plan output ── */}
      {nonEmpty.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <p style={{ fontSize:13, color:'var(--muted)', marginBottom:4 }}>
            Planning généré sur <strong>{nonEmpty.length} jours actifs</strong>
            {result?.profileUsed && <span style={{ color:'var(--primary)', marginLeft:6 }}>· adapté à ton profil</span>}
          </p>

          {nonEmpty.map(day => {
            // Group tasks by slot
            const bySlot = {};
            for (const t of day.tasks) {
              const slotId = t.slot?.id || 'none';
              if (!bySlot[slotId]) bySlot[slotId] = { slot: t.slot, tasks: [] };
              bySlot[slotId].tasks.push(t);
            }
            const slotGroups = Object.values(bySlot);

            return (
              <div key={day.date} className="card" style={{
                borderLeft:`3px solid ${day.overloaded ? 'var(--danger)' : day.isWeekend ? '#10b981' : 'var(--primary)'}`,
                padding:'16px 18px',
              }}>
                {/* Day header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <Calendar size={14} color={day.overloaded ? 'var(--danger)' : day.isWeekend ? '#10b981' : 'var(--primary)'}/>
                  <span style={{ fontWeight:700, fontSize:15, textTransform:'capitalize', flex:1 }}>
                    {format(parseISO(day.date), 'EEEE d MMMM', { locale:fr })}
                    {day.isWeekend && <span style={{ fontSize:11, marginLeft:8, color:'#10b981', fontWeight:600 }}>Weekend</span>}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {day.overloaded && (
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, backgroundColor:'var(--danger)22', color:'var(--danger)', fontWeight:700 }}>
                        Surchargé
                      </span>
                    )}
                    <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--muted)' }}>
                      <Clock size={11}/> {day.totalHours.toFixed(1)}h / {day.availableHours || '?'}h
                    </span>
                    {day.suggestedPomodoros > 0 && (
                      <span style={{ fontSize:11, color:'var(--muted)' }}>~{day.suggestedPomodoros} 🍅</span>
                    )}
                  </div>
                </div>

                {/* Tasks grouped by slot */}
                {slotGroups.map(({ slot, tasks }) => (
                  <div key={slot?.id || 'none'} style={{ marginBottom:10 }}>
                    {/* Slot header */}
                    {slot && (
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                        <span style={{ fontSize:14 }}>{slot.icon}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)' }}>
                          {slot.label}
                        </span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>
                          {slot.start}–{slot.end}
                        </span>
                        <div style={{ flex:1, height:1, backgroundColor:'var(--border)', marginLeft:4 }}/>
                      </div>
                    )}
                    {/* Tasks in this slot */}
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {tasks.map((t, i) => (
                        <div key={t.id + i} style={{
                          display:'flex', alignItems:'center', gap:10,
                          padding:'8px 12px', borderRadius:8,
                          backgroundColor:t.color+'15',
                          borderLeft:`3px solid ${t.color}`,
                        }}>
                          <span style={{ fontSize:12 }}>{t.type === 'exam_revision' ? '📚' : '📝'}</span>
                          <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{t.title}</span>
                          {t.subject && <span style={{ fontSize:12, color:t.color, fontWeight:600 }}>{t.subject}</span>}
                          <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600, flexShrink:0 }}>
                            {t.allocHours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
