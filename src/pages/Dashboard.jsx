import { useState } from 'react';
import { Link }     from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { fr }       from 'date-fns/locale';
import {
  Calendar, CheckSquare, GraduationCap, Timer, ArrowRight,
  Brain, TrendingUp, CalendarRange, BookOpen, Zap,
  AlertTriangle, CheckCircle, RotateCcw, User,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useSubjects }     from '../hooks/useSubjects';
import { useSchedule }     from '../hooks/useSchedule';
import { useAssignments }  from '../hooks/useAssignments';
import { useExams }        from '../hooks/useExams';
import { usePomodoro }     from '../contexts/PomodoroContext';
import { useIntelligence } from '../contexts/IntelligenceContext';
import { SEVERITY_COLOR, SEVERITY_BG } from '../services/rulesEngine';
import { DASHBOARD_MODE_LABELS, DASHBOARD_MODE_COLORS } from '../services/predictor';

const fmt = s =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

/* ── generic section card ─────────────────────────────────────────────── */
function Section({ icon: Icon, color, title, to, children }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={15} color={color} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        </div>
        <Link to={to} style={{ color: 'var(--primary)', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
          Tout voir <ArrowRight size={11} />
        </Link>
      </div>
      {children}
    </div>
  );
}

const Empty = ({ text }) => <p style={{ color: 'var(--muted)', fontSize: 13 }}>{text}</p>;

/* ── small score badge linking to profile ─────────────────────────────── */
function ScoreBadge({ score }) {
  if (!score) return null;
  return (
    <Link to="/profile" style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 20,
        backgroundColor: score.color + '22',
        border: `1px solid ${score.color}44`,
      }}>
        <User size={12} color={score.color} />
        <span style={{ fontSize: 13, fontWeight: 800, color: score.color }}>{score.total}</span>
        <span style={{ fontSize: 11, color: score.color }}>{score.label}</span>
      </div>
    </Link>
  );
}

/* ── AI alerts panel ──────────────────────────────────────────────────── */
function AlertsPanel({ rules, risks }) {
  const [expanded, setExpanded] = useState(false);
  const ORDER = { critical: 0, warning: 1, info: 2, success: 3 };
  const all = [
    ...rules,
    ...risks.filter(r => !rules.some(rl => rl.id === r.type)),
  ].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));

  if (all.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', marginBottom: 16,
        backgroundColor: 'var(--success)18',
        border: '1px solid var(--success)44', borderRadius: 10,
      }}>
        <CheckCircle size={14} color="var(--success)" />
        <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
          Tout est en ordre — continue sur ta lancée !
        </span>
      </div>
    );
  }

  const shown = expanded ? all : all.slice(0, 2);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map((a, i) => (
          <div key={a.id || a.type || i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            backgroundColor: SEVERITY_BG[a.severity],
            border: `1px solid ${SEVERITY_COLOR[a.severity]}40`,
          }}>
            <Zap size={13} color={SEVERITY_COLOR[a.severity]} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, flex: 1 }}>{a.message}</span>
          </div>
        ))}
      </div>
      {all.length > 2 && (
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'none', border: 'none', color: 'var(--primary)',
          fontSize: 12, cursor: 'pointer', marginTop: 6,
          display: 'flex', alignItems: 'center', gap: 4, padding: 0,
        }}>
          {expanded
            ? <><ChevronUp size={12} /> Réduire</>
            : <><ChevronDown size={12} /> +{all.length - 2} alerte{all.length - 2 > 1 ? 's' : ''}</>}
        </button>
      )}
    </div>
  );
}

/* ══ MODE — NORMAL ════════════════════════════════════════════════════════ */
function NormalMode({ todayCourses, urgentList, upcomingExams, pomo, byId, now, daysUntil }) {
  const d = pomo.durations();
  const pomoPaused = !pomo.isRunning && pomo.timeLeft === d.work * 60;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>

      <Section icon={Calendar} color="var(--primary)" title="Cours du jour" to="/schedule">
        {todayCourses.length === 0 ? <Empty text="Aucun cours aujourd'hui" /> :
          todayCourses.map(c => {
            const sub = byId(c.subjectId);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
                <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, backgroundColor: sub?.color || 'var(--primary)', flexShrink: 0 }}/>
                <div>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{sub?.name || '?'}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 12 }}>{c.startTime} – {c.endTime}{c.room ? ` · ${c.room}` : ''}</p>
                </div>
              </div>
            );
          })}
      </Section>

      <Section icon={CheckSquare} color="var(--warning)" title="Devoirs urgents" to="/assignments">
        {urgentList.length === 0 ? <Empty text="Aucun devoir urgent" /> :
          urgentList.slice(0, 4).map(a => {
            const sub  = byId(a.subjectId);
            const days = differenceInDays(new Date(a.dueDate), now);
            const col  = days <= 0 ? 'var(--danger)' : days === 1 ? 'var(--warning)' : 'var(--muted)';
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: a.priority === 'high' ? 'var(--danger)' : a.priority === 'medium' ? 'var(--warning)' : 'var(--success)' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                  {sub && <p style={{ color: sub.color, fontSize: 11 }}>{sub.name}</p>}
                </div>
                <span style={{ color: col, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  {days <= 0 ? 'Auj.' : days === 1 ? 'Dem.' : `${days}j`}
                </span>
              </div>
            );
          })}
      </Section>

      <Section icon={GraduationCap} color="var(--danger)" title="Examens à venir" to="/exams">
        {upcomingExams.length === 0 ? <Empty text="Aucun examen prévu" /> :
          upcomingExams.map(e => {
            const sub  = byId(e.subjectId);
            const days = daysUntil(e);
            const col  = days <= 3 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)';
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{sub?.name || '?'}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(new Date(e.date), 'd MMM', { locale: fr })} à {e.time}</p>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: col + '22', color: col }}>
                  {days === 0 ? 'Auj.' : `${days}j`}
                </span>
              </div>
            );
          })}
      </Section>

      <Section icon={Timer} color="var(--primary)" title="Pomodoro" to="/pomodoro">
        {pomoPaused && pomo.completed === 0 ? (
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 10 }}>Aucune session active</p>
            <Link to="/pomodoro"><button className="btn-primary" style={{ fontSize: 13 }}>Démarrer</button></Link>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 30, fontWeight: 800, color: pomo.phase === 'work' ? 'var(--primary)' : 'var(--success)' }}>
              {fmt(pomo.timeLeft)}
            </span>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13 }}>{pomo.taskName || 'Session focus'}</p>
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>
                Session {pomo.session}/{pomo.totalSessions} · {pomo.phase === 'work' ? 'Travail' : 'Pause'}
                {!pomo.isRunning ? ' (pause)' : ''}
              </p>
            </div>
          </div>
        )}
      </Section>

      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { to: '/revision',  icon: Brain,         label: 'Révisions',     color: 'var(--primary)' },
            { to: '/analytics', icon: TrendingUp,    label: 'Statistiques',  color: 'var(--success)' },
            { to: '/planner',   icon: CalendarRange, label: 'Planning auto', color: 'var(--warning)' },
            { to: '/grades',    icon: BookOpen,      label: 'Notes',         color: '#38bdf8'        },
            { to: '/profile',   icon: User,          label: 'Mon profil',    color: 'var(--muted)'   },
          ].map(({ to, icon: Icon, label, color }) => (
            <Link key={to} to={to} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, backgroundColor: 'var(--card)', border: '1px solid var(--border)', color, fontWeight: 600, fontSize: 13 }}>
                <Icon size={14} /> {label}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══ MODE — EXAM ══════════════════════════════════════════════════════════ */
function ExamMode({ allExams, byId, daysUntil }) {
  const nearestExam = allExams[0];
  const sub  = nearestExam ? byId(nearestExam.subjectId) : null;
  const days = nearestExam ? daysUntil(nearestExam) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {nearestExam && (
        <div style={{ padding: '18px 22px', backgroundColor: '#ef444412', border: '2px solid #ef444440', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <GraduationCap size={20} color="var(--danger)" />
            <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--danger)' }}>
              🎓 Mode Examen — {sub?.name || '?'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>TEMPS RESTANT</p>
              <p style={{ fontWeight: 800, fontSize: 32, color: days <= 2 ? 'var(--danger)' : 'var(--warning)', lineHeight: 1 }}>{days}j</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>DATE</p>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{format(new Date(nearestExam.date), 'EEEE d MMMM', { locale: fr })}</p>
            </div>
            {nearestExam.room && (
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>SALLE</p>
                <p style={{ fontWeight: 600, fontSize: 15 }}>{nearestExam.room}</p>
              </div>
            )}
          </div>
          {nearestExam.chapters && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>📖 Chapitres : {nearestExam.chapters}</p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        <Section icon={Brain} color="var(--primary)" title="Révisions" to="/revision">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Lance une session de cartes mémoire pour ancrer tes connaissances.</p>
          <Link to="/revision"><button className="btn-primary" style={{ fontSize: 13 }}>Réviser maintenant →</button></Link>
        </Section>
        <Section icon={Timer} color="var(--success)" title="Pomodoro focus examen" to="/pomodoro">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sessions longues recommandées à J-3. Focus total, sans distractions.</p>
          <Link to="/pomodoro"><button className="btn-primary" style={{ fontSize: 13 }}>Démarrer →</button></Link>
        </Section>
        {allExams.length > 1 && (
          <Section icon={GraduationCap} color="var(--danger)" title="Autres examens" to="/exams">
            {allExams.slice(1, 4).map(e => {
              const s = byId(e.subjectId);
              const d = daysUntil(e);
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500, fontSize: 13 }}>{s?.name || '?'}</p>
                    <p style={{ color: 'var(--muted)', fontSize: 12 }}>{format(new Date(e.date), 'd MMM', { locale: fr })}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: d <= 3 ? 'var(--danger)' : 'var(--warning)' }}>{d}j</span>
                </div>
              );
            })}
          </Section>
        )}
      </div>
    </div>
  );
}

/* ══ MODE — OVERLOAD ══════════════════════════════════════════════════════ */
function OverloadMode({ urgentList, byId, now }) {
  const critical = urgentList.filter(a => {
    try { return differenceInDays(new Date(a.dueDate), now) <= 2; } catch (_) { return false; }
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '14px 18px', backgroundColor: '#f59e0b12', border: '2px solid #f59e0b40', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <AlertTriangle size={16} color="var(--warning)" />
          <span style={{ fontWeight: 800, color: 'var(--warning)', fontSize: 15 }}>Surcharge détectée</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Ta charge de travail est élevée. Voici uniquement les tâches critiques.
        </p>
      </div>

      <Section icon={CheckSquare} color="var(--danger)" title="Tâches critiques (≤ 2j)" to="/assignments">
        {critical.length === 0
          ? <Empty text="Aucune tâche imminente — commence les plus proches !" />
          : critical.map(a => {
              const sub  = byId(a.subjectId);
              const days = differenceInDays(new Date(a.dueDate), now);
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: 'var(--surface)', borderRadius: 10, borderLeft: '3px solid var(--danger)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</p>
                    {sub && <p style={{ fontSize: 11, color: sub.color }}>{sub.name}</p>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>
                    {days <= 0 ? 'EN RETARD' : `${days}j`}
                  </span>
                </div>
              );
            })}
      </Section>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 10 }}>Actions suggérées</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/planner"><button className="btn-primary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><CalendarRange size={13} /> Rééquilibrer le planning</button></Link>
          <Link to="/pomodoro"><button className="btn-ghost" style={{ fontSize: 13 }}>Démarrer Pomodoro</button></Link>
        </div>
      </div>
    </div>
  );
}

/* ══ MODE — REST ══════════════════════════════════════════════════════════ */
function RestMode({ score }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '22px 26px', backgroundColor: 'var(--success)12', border: '2px solid var(--success)40', borderRadius: 14, textAlign: 'center' }}>
        <p style={{ fontSize: 32, marginBottom: 8 }}>🎉</p>
        <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--success)', marginBottom: 6 }}>Tu es en avance sur ton planning !</p>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aucun devoir urgent ni examen imminent. Profite pour consolider tes acquis.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        <Section icon={Brain}      color="var(--primary)" title="Avancer les révisions" to="/revision">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Révise tes cartes mémoire en avance pour consolider les acquis.</p>
          <Link to="/revision"><button className="btn-primary" style={{ fontSize: 13 }}>Réviser →</button></Link>
        </Section>
        <Section icon={TrendingUp} color="var(--success)" title="Statistiques" to="/analytics">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Analyse ta progression et identifie tes axes d'amélioration.</p>
          <Link to="/analytics"><button className="btn-ghost" style={{ fontSize: 13 }}>Voir les stats →</button></Link>
        </Section>
        <Section icon={User}       color="var(--muted)"   title="Mon profil"    to="/profile">
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Score actuel : <strong style={{ color: score?.color }}>{score?.total ?? '—'}/100{score?.label ? ` — ${score.label}` : ''}</strong>
          </p>
          <Link to="/profile"><button className="btn-ghost" style={{ fontSize: 13 }}>Voir profil →</button></Link>
        </Section>
      </div>
    </div>
  );
}

/* ══ MODE — CATCHUP ═══════════════════════════════════════════════════════ */
function CatchupMode({ assignments, byId, now }) {
  const all     = assignments || [];
  const overdue = all.filter(a => {
    try { return a.status !== 'done' && differenceInDays(new Date(a.dueDate), now) < 0; } catch (_) { return false; }
  });
  const next = all
    .filter(a => a.status !== 'done' && !overdue.includes(a))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '14px 18px', backgroundColor: '#f59e0b12', border: '2px solid #f59e0b40', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <RotateCcw size={16} color="var(--warning)" />
          <span style={{ fontWeight: 800, color: 'var(--warning)', fontSize: 15 }}>Mode Rattrapage</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {overdue.length > 0
            ? `${overdue.length} devoir${overdue.length > 1 ? 's' : ''} en retard — commençons par les rattraper.`
            : 'Peu de sessions de travail récentes — reprenons le rythme ensemble.'}
        </p>
      </div>

      {overdue.length > 0 && (
        <Section icon={AlertTriangle} color="var(--danger)" title={`En retard (${overdue.length})`} to="/assignments">
          {overdue.map(a => {
            const sub  = byId(a.subjectId);
            const late = Math.abs(differenceInDays(new Date(a.dueDate), now));
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: '#ef444410', borderRadius: 10, borderLeft: '3px solid var(--danger)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</p>
                  {sub && <p style={{ fontSize: 11, color: sub.color }}>{sub.name}</p>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', flexShrink: 0 }}>{late}j de retard</span>
              </div>
            );
          })}
        </Section>
      )}

      {next.length > 0 && (
        <Section icon={CheckSquare} color="var(--primary)" title="Prochaines échéances" to="/assignments">
          {next.map(a => {
            const sub  = byId(a.subjectId);
            const days = differenceInDays(new Date(a.dueDate), now);
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500, fontSize: 13 }}>{a.title}</p>
                  {sub && <p style={{ fontSize: 11, color: sub.color }}>{sub.name}</p>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{days}j</span>
              </div>
            );
          })}
        </Section>
      )}

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 10 }}>Plan de rattrapage</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/planner"><button className="btn-primary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><CalendarRange size={13} /> Générer un planning</button></Link>
          <Link to="/pomodoro"><button className="btn-ghost" style={{ fontSize: 13 }}>Session Pomodoro</button></Link>
        </div>
      </div>
    </div>
  );
}

/* ══ MAIN DASHBOARD ═══════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { byId }                        = useSubjects();
  const { today: getToday }             = useSchedule();
  const { urgent, assignments }         = useAssignments();
  const { upcoming, daysUntil }         = useExams();
  const pomo                            = usePomodoro();
  const { rules, risks, score, dashboardMode } = useIntelligence();

  const [modeOverride, setModeOverride] = useState(null);

  const now           = new Date();
  const todayCourses  = getToday();
  const urgentList    = urgent();
  const upcomingExams = upcoming(30).slice(0, 3);
  const allExams      = upcoming(30);

  const activeMode = modeOverride || dashboardMode;
  const modeColor  = DASHBOARD_MODE_COLORS[activeMode] || 'var(--muted)';
  const modeLabel  = DASHBOARD_MODE_LABELS[activeMode] || 'Mode normal';
  const MODE_ICONS = { exam: '🎓', overload: '⚠️', rest: '✅', catchup: '🔄', normal: '📚' };

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, textTransform: 'capitalize', letterSpacing: '-0.5px' }}>
            {format(now, 'EEEE d MMMM', { locale: fr })}
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 2 }}>Bonne journée !</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, backgroundColor: modeColor + '22', border: `1px solid ${modeColor}50`, color: modeColor }}>
            {MODE_ICONS[activeMode]} {modeLabel}
            {modeOverride && <span style={{ marginLeft: 4, opacity: 0.7 }}>(manuel)</span>}
          </div>

          {activeMode !== 'exam' && (
            <button onClick={() => setModeOverride('exam')} style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)' }}>
              🎓 Mode examen
            </button>
          )}

          {modeOverride && (
            <button onClick={() => setModeOverride(null)} style={{ padding: '5px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)' }}>
              ✕ Auto
            </button>
          )}

          <ScoreBadge score={score} />
        </div>
      </div>

      {/* AI Alerts ───────────────────────────────────────────────────── */}
      <AlertsPanel rules={rules} risks={risks} />

      {/* Mode content ────────────────────────────────────────────────── */}
      {activeMode === 'exam'     && <ExamMode allExams={allExams} byId={byId} daysUntil={daysUntil} />}
      {activeMode === 'overload' && <OverloadMode urgentList={urgentList} byId={byId} now={now} />}
      {activeMode === 'rest'     && <RestMode score={score} />}
      {activeMode === 'catchup'  && <CatchupMode assignments={assignments || []} byId={byId} now={now} />}
      {activeMode === 'normal'   && (
        <NormalMode
          todayCourses={todayCourses} urgentList={urgentList}
          upcomingExams={upcomingExams} pomo={pomo}
          byId={byId} now={now} daysUntil={daysUntil}
        />
      )}
    </div>
  );
}
