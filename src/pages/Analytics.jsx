import { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { fmtMinutes } from '../services/analytics';
import { RefreshCw } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

/* ── Stat card ───────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', letterSpacing: '-0.5px' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</p>}
    </div>
  );
}

/* ── Bar chart (productivity) ────────────────────────────────────── */
function BarChart({ data, compact = false }) {
  const max = Math.max(...data.map(d => d.minutes), 1);
  const h   = compact ? 60 : 100;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: compact ? 3 : 8, height: h + 20 }}>
      {data.map(d => {
        const barH = max > 0 ? (d.minutes / max) * (h - 12) : 0;
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ position: 'relative', height: h - 12, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              {barH > 0 ? (
                <div title={`${d.label} : ${fmtMinutes(d.minutes)}`} style={{
                  width: '100%', height: barH,
                  borderRadius: '3px 3px 0 0',
                  backgroundColor: 'var(--primary)', opacity: 0.85,
                  transition: 'height 0.4s ease', cursor: 'default',
                }} />
              ) : (
                <div style={{ width: '100%', height: 3, borderRadius: 4, backgroundColor: 'var(--border)' }} />
              )}
            </div>
            {!compact && (
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'capitalize' }}>{d.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Subject breakdown bars ──────────────────────────────────────── */
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

/* ── SVG line chart (grade evolution) ────────────────────────────── */
function LineChart({ series }) {
  const W = 560, H = 140, PAD = { t: 10, r: 10, b: 28, l: 36 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  // Collect all points to find global min/max
  const allVals = series.flatMap(s => s.points.map(p => p.value));
  if (allVals.length === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Pas encore de notes enregistrées.</p>;

  const minV = Math.max(0,  Math.floor(Math.min(...allVals)) - 1);
  const maxV = Math.min(20, Math.ceil(Math.max(...allVals))  + 1);
  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
  const nDates = allDates.length;

  const xPos = (date) => nDates < 2 ? iW / 2 : (allDates.indexOf(date) / (nDates - 1)) * iW;
  const yPos = (val)  => iH - ((val - minV) / (maxV - minV)) * iH;

  // Y grid lines
  const yTicks = Array.from({ length: 5 }, (_, i) => minV + ((maxV - minV) / 4) * i);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Grid */}
      {yTicks.map(t => (
        <g key={t}>
          <line
            x1={PAD.l} y1={PAD.t + yPos(t)}
            x2={PAD.l + iW} y2={PAD.t + yPos(t)}
            stroke="var(--border)" strokeWidth={1}
          />
          <text x={PAD.l - 6} y={PAD.t + yPos(t) + 4}
            textAnchor="end" fontSize={9} fill="var(--muted)">
            {t.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Series */}
      {series.map(s => {
        if (s.points.length < 1) return null;
        const pts = s.points.map(p => ({ x: PAD.l + xPos(p.date), y: PAD.t + yPos(p.value) }));
        const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
        return (
          <g key={s.id}>
            {pts.length > 1 && (
              <polyline points={polyline} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            )}
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={s.color}>
                <title>{s.name} — {s.points[i]?.value}/20</title>
              </circle>
            ))}
          </g>
        );
      })}

      {/* X labels: first, middle, last date */}
      {allDates.length > 0 && [0, Math.floor(nDates / 2), nDates - 1]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map(idx => (
          <text key={idx}
            x={PAD.l + xPos(allDates[idx])} y={H - 4}
            textAnchor="middle" fontSize={9} fill="var(--muted)">
            {allDates[idx]?.slice(5)}
          </text>
        ))}
    </svg>
  );
}

/* ── SRS donut chart ─────────────────────────────────────────────── */
function SrsDonut({ srs }) {
  if (!srs || srs.total === 0) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune fiche de révision.</p>;

  const segments = [
    { label: 'Pas vu',   value: srs.unseen,   color: 'var(--muted)' },
    { label: 'En cours', value: srs.learning,  color: 'var(--warning)' },
    { label: 'À revoir', value: srs.review,    color: 'var(--primary)' },
    { label: 'Maîtrisé', value: srs.mastered,  color: 'var(--success)' },
  ].filter(s => s.value > 0);

  const R = 44, CX = 60, CY = 60, CIRC = 2 * Math.PI * R;
  let offset = 0;
  const arcs = segments.map(s => {
    const pct   = s.value / srs.total;
    const dash  = pct * CIRC;
    const gap   = CIRC - dash;
    const arc   = { ...s, pct, dasharray: `${dash} ${gap}`, dashoffset: -offset * CIRC };
    offset += pct;
    return arc;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        {arcs.map((a, i) => (
          <circle key={i} cx={CX} cy={CY} r={R}
            fill="none" stroke={a.color} strokeWidth={14}
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
            transform="rotate(-90 60 60)"
            style={{ transition: 'all 0.5s ease' }}
          >
            <title>{a.label} : {a.value}</title>
          </circle>
        ))}
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={18} fontWeight={800} fill="var(--text)">{srs.total}</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize={9} fill="var(--muted)">fiches</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)', width: 68 }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{s.value}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>({Math.round(s.value / srs.total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Analytics page ─────────────────────────────────────────── */
export default function Analytics() {
  const { stats, loading, reload } = useAnalytics();
  const [period, setPeriod] = useState(7); // 7 or 30 days
  const isMobile = useIsMobile();

  if (loading) return <div style={{ color: 'var(--muted)' }}>Calcul des statistiques…</div>;
  if (!stats)  return <div style={{ color: 'var(--danger)' }}>Erreur de calcul.</div>;

  const { week, allTime, last7, last30, assignments, exams, subjectStats, gradeEvolution, srsStatus } = stats;
  const topSubjects = subjectStats.filter(s => s.minutes > 0);
  const maxSubMin   = topSubjects[0]?.minutes || 1;
  const chartData   = period === 7 ? last7 : last30;
  const hasActivity = chartData.some(d => d.minutes > 0);

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-header">
        <h1 className="page-title">Statistiques</h1>
        <button className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} onClick={reload}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Cette semaine"    value={fmtMinutes(week.minutes)}      sub={`${week.sessions} sessions`}                                          color="var(--primary)" />
        <StatCard label="Total Pomodoro"   value={fmtMinutes(allTime.minutes)}   sub={`${allTime.sessions} sessions`} />
        <StatCard label="Devoirs terminés" value={`${assignments.done}/${assignments.total}`} sub={`${Math.round(assignments.rate * 100)}% complétion`}     color={assignments.rate >= 0.7 ? 'var(--success)' : 'var(--warning)'} />
        <StatCard label="En retard"        value={assignments.overdue}           sub={assignments.avgDaysLate > 0 ? `Moy. ${assignments.avgDaysLate}j` : 'Bravo !'} color={assignments.overdue > 0 ? 'var(--danger)' : 'var(--success)'} />
        <StatCard label="Examens à venir"  value={exams.upcoming}               sub={exams.avgDays !== null ? `Moy. dans ${exams.avgDays}j` : ''}          color="var(--warning)" />
      </div>

      {/* Productivity chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>Productivité (Pomodoro)</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[7, 30].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${period === p ? 'var(--primary)' : 'var(--border)'}`,
                backgroundColor: period === p ? 'var(--primary)' : 'transparent',
                color: period === p ? 'white' : 'var(--muted)',
              }}>
                {p}j
              </button>
            ))}
          </div>
        </div>
        {hasActivity
          ? <BarChart data={chartData} compact={period === 30} />
          : <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucune session sur cette période.</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Assignment breakdown */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Devoirs</p>
          {assignments.total === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun devoir créé.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Terminés',   assignments.done,                              'var(--success)'],
                  ['En attente', assignments.pending - assignments.overdue,     'var(--primary)'],
                  ['En retard',  assignments.overdue,                           'var(--danger)'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 80, fontSize: 13, color: 'var(--muted)' }}>{label}</span>
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

        {/* SRS donut */}
        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Fiches de révision (SRS)</p>
          <SrsDonut srs={srsStatus} />
        </div>
      </div>

      {/* Grade evolution */}
      {gradeEvolution.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Évolution des notes</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {gradeEvolution.map(s => (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: s.color, display: 'inline-block' }} />
                {s.name}
              </span>
            ))}
          </div>
          <LineChart series={gradeEvolution} />
        </div>
      )}

      {/* Subject time breakdown */}
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
