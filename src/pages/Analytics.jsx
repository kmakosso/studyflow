import { useAnalytics } from '../hooks/useAnalytics';
import { fmtMinutes } from '../services/analytics';
import { RefreshCw } from 'lucide-react';

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', letterSpacing: '-0.5px' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</p>}
    </div>
  );
}

function BarChart({ data, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.minutes), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
      {data.map(d => {
        const h = max > 0 ? (d.minutes / max) * 88 : 0;
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative', height: 88, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              {h > 0 && (
                <div title={fmtMinutes(d.minutes)} style={{
                  width: '100%', height: h, borderRadius: '4px 4px 0 0',
                  backgroundColor: 'var(--primary)', opacity: 0.85,
                  transition: 'height 0.4s ease',
                  cursor: 'default',
                }} />
              )}
              {h === 0 && (
                <div style={{ width: '100%', height: 3, borderRadius: 4, backgroundColor: 'var(--border)' }} />
              )}
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'capitalize' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SubjectBar({ subject, maxMin }) {
  const pct = maxMin > 0 ? (subject.minutes / maxMin) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: subject.color, flexShrink: 0 }} />
      <span style={{ width: 120, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject.name}</span>
      <div style={{ flex: 1, height: 8, backgroundColor: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: subject.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 40, textAlign: 'right' }}>{fmtMinutes(subject.minutes)}</span>
    </div>
  );
}

export default function Analytics() {
  const { stats, loading, reload } = useAnalytics();

  if (loading) return <div style={{ color: 'var(--muted)' }}>Calcul des statistiques…</div>;
  if (!stats)  return <div style={{ color: 'var(--danger)' }}>Erreur de calcul.</div>;

  const { week, allTime, last7, assignments, exams, subjectStats } = stats;
  const topSubjects = subjectStats.filter(s => s.minutes > 0);
  const maxSubMin   = topSubjects[0]?.minutes || 1;

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-header">
        <h1 className="page-title">Statistiques</h1>
        <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} onClick={reload}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Cette semaine"   value={fmtMinutes(week.minutes)}  sub={`${week.sessions} sessions`} color="var(--primary)" />
        <StatCard label="Total Pomodoro"  value={fmtMinutes(allTime.minutes)} sub={`${allTime.sessions} sessions`} />
        <StatCard label="Devoirs terminés" value={`${assignments.done}/${assignments.total}`} sub={`${Math.round(assignments.rate * 100)}% de complétion`} color={assignments.rate >= 0.7 ? 'var(--success)' : 'var(--warning)'} />
        <StatCard label="En retard" value={assignments.overdue} sub={assignments.avgDaysLate > 0 ? `Moy. ${assignments.avgDaysLate}j` : 'Bravo !'} color={assignments.overdue > 0 ? 'var(--danger)' : 'var(--success)'} />
        <StatCard label="Examens à venir" value={exams.upcoming} sub={exams.avgDays !== null ? `Moy. dans ${exams.avgDays}j` : ''} color="var(--warning)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Productivity chart */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Productivité — 7 derniers jours</p>
          {last7.every(d => d.minutes === 0)
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune session enregistrée cette semaine.</p>
            : <BarChart data={last7} />
          }
        </div>

        {/* Assignment breakdown */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Devoirs</p>
          {assignments.total === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun devoir créé.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Terminés', assignments.done, 'var(--success)'],
                  ['En attente', assignments.pending - assignments.overdue, 'var(--primary)'],
                  ['En retard', assignments.overdue, 'var(--danger)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 90, fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                    <div style={{ flex: 1, height: 10, backgroundColor: 'var(--surface)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: assignments.total > 0 ? `${(val / assignments.total) * 100}%` : '0%', backgroundColor: color, borderRadius: 5 }} />
                    </div>
                    <span style={{ fontSize: 12, color, fontWeight: 700, minWidth: 16 }}>{val}</span>
                  </div>
                ))}
                <div style={{ marginTop: 4, padding: '10px', backgroundColor: 'var(--surface)', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: assignments.rate >= 0.7 ? 'var(--success)' : 'var(--warning)' }}>
                    {Math.round(assignments.rate * 100)}%
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>taux de complétion</span>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Subject breakdown */}
      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Temps par matière (Pomodoro)</p>
        {topSubjects.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Associez des Pomodoros à des devoirs pour voir les stats par matière.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topSubjects.slice(0, 8).map(s => (
                <SubjectBar key={s.id} subject={s} maxMin={maxSubMin} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
