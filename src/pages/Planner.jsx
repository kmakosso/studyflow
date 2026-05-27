import { useState } from 'react';
import { Wand2, Calendar, Clock, Zap, RefreshCw, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { generateAIPlan, rebalancePlan } from '../services/plannerAI';
import { useAssignments }  from '../hooks/useAssignments';
import { useExams }        from '../hooks/useExams';
import { useSubjects }     from '../hooks/useSubjects';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { SEVERITY_COLOR, SEVERITY_BG } from '../services/rulesEngine';

export default function Planner() {
  const { assignments }  = useAssignments();
  const { exams }        = useExams();
  const { subjects }     = useSubjects();
  const { profile }      = useIntelligence();

  const suggestedHours = profile?.avgFocusDuration
    ? Math.max(2, Math.min(6, Math.round(profile.avgFocusDuration / 60 * 4 * 10) / 10))
    : 3;

  const [config, setConfig]   = useState({ hoursPerDay: suggestedHours, days: 14 });
  const [result, setResult]   = useState(null);
  const [generated, setGenerated] = useState(false);

  const run = () => {
    const pending     = assignments.filter(a => a.status !== 'done');
    const futureExams = exams.filter(e => new Date(e.date) >= new Date()).map(e => ({
      ...e,
      importanceHours: e.importance === 'high' ? 4 : e.importance === 'medium' ? 2.5 : 1.5,
      subjectName: subjects.find(s => s.id === e.subjectId)?.name || 'Examen',
    }));
    const r = generateAIPlan(pending, futureExams, config, subjects, profile);
    setResult(r);
    setGenerated(true);
  };

  const handleRebalance = () => {
    if (!result) return;
    const rebalanced = rebalancePlan(result.days, config.hoursPerDay);
    setResult(prev => ({ ...prev, days: rebalanced }));
  };

  const nonEmpty      = result?.days?.filter(d => d.tasks.length > 0) || [];
  const overloadCount = nonEmpty.filter(d => d.overloaded).length;

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Planning automatique IA</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 22 }}>
        Génère un planning optimisé selon tes devoirs, examens et{profile ? ' ton profil comportemental' : ' ton temps disponible'}.
      </p>

      {/* Config card ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <p style={{ fontWeight: 600 }}>Paramètres</p>
          {profile && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, backgroundColor: 'var(--primary)22', color: 'var(--primary)', fontWeight: 600 }}>
              <User size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              Profil utilisé
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 180 }}>
            <label className="form-label">Heures disponibles / jour</label>
            <input type="number" min={0.5} max={12} step={0.5} value={config.hoursPerDay}
              onChange={e => setConfig(c => ({ ...c, hoursPerDay: Number(e.target.value) }))} />
            {profile && (
              <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'block' }}>
                Suggéré d'après ton profil : {suggestedHours}h
              </span>
            )}
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label className="form-label">Horizon (jours)</label>
            <input type="number" min={3} max={60} value={config.days}
              onChange={e => setConfig(c => ({ ...c, days: Number(e.target.value) }))} />
          </div>
          <button className="btn-primary" onClick={run}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', marginBottom: 2 }}>
            <Wand2 size={16} /> Générer le planning
          </button>
        </div>

        {/* Context summary */}
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            [`${assignments.filter(a => a.status !== 'done').length} devoirs en attente`,       'var(--primary)'],
            [`${exams.filter(e => new Date(e.date) >= new Date()).length} examens à venir`,     'var(--danger)' ],
            ...(profile?.delayTendency > 0.4
              ? [[ `Retard historique : ${Math.round(profile.delayTendency * 100)}%`, 'var(--warning)']] : []),
          ].map(([label, color]) => (
            <span key={label} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, backgroundColor: color + '22', color }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* AI suggestions ──────────────────────────────────────────────── */}
      {generated && result?.suggestions?.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {result.suggestions.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              backgroundColor: SEVERITY_BG[s.severity],
              border: `1px solid ${SEVERITY_COLOR[s.severity]}40`,
            }}>
              <Zap size={13} color={SEVERITY_COLOR[s.severity]} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 13, flex: 1 }}>{s.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rebalance button */}
      {generated && overloadCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn-primary" onClick={handleRebalance}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={13} /> Rééquilibrer automatiquement ({overloadCount} jour{overloadCount > 1 ? 's' : ''} surchargé{overloadCount > 1 ? 's' : ''})
          </button>
        </div>
      )}

      {/* Empty state */}
      {generated && nonEmpty.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>🎉</p>
          <p style={{ color: 'var(--muted)' }}>Aucune tâche à planifier — tu es parfaitement à jour !</p>
        </div>
      )}

      {/* Plan output ─────────────────────────────────────────────────── */}
      {nonEmpty.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
            Planning généré sur {nonEmpty.length} jours actifs
            {result?.profileUsed && <span style={{ color: 'var(--primary)', marginLeft: 6 }}>· adapté à ton profil</span>}
          </p>

          {nonEmpty.map(day => (
            <div key={day.date} className="card" style={{
              borderLeft: `3px solid ${day.overloaded ? 'var(--danger)' : day.underloaded ? 'var(--muted)' : 'var(--primary)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Calendar size={14} color={day.overloaded ? 'var(--danger)' : 'var(--primary)'} />
                <span style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize', flex: 1 }}>
                  {format(parseISO(day.date), 'EEEE d MMMM', { locale: fr })}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {day.overloaded && (
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, backgroundColor: 'var(--danger)22', color: 'var(--danger)', fontWeight: 700 }}>
                      Surchargé
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                    <Clock size={11} /> {day.totalHours.toFixed(1)}h
                  </span>
                  {day.suggestedPomodoros > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      ~{day.suggestedPomodoros} 🍅
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {day.tasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    backgroundColor: t.color + '18',
                    borderLeft: `3px solid ${t.color}`,
                  }}>
                    <span style={{ fontSize: 12 }}>{t.type === 'exam_revision' ? '📚' : '📝'}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.title}</span>
                    {t.subject && <span style={{ fontSize: 12, color: t.color }}>{t.subject}</span>}
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{t.allocHours}h</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
