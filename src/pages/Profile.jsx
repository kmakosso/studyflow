import { useState, useEffect } from 'react';
import { User, Clock, Zap, Target, TrendingUp, Star, AlertTriangle, RefreshCw } from 'lucide-react';
import { useIntelligence }         from '../contexts/IntelligenceContext';
import { computeProfile, WORK_TIME_LABELS } from '../services/studentProfile';
import { buildKnowledgeGraph, getMasteryColor, RISK_LABELS, TREND_ICONS } from '../services/knowledgeGraph';

/* ── circular score ring ─────────────────────────────────────────────── */
function ScoreRing({ value, color, size = 120 }) {
  const R    = (size - 14) / 2;
  const CIRC = 2 * Math.PI * R;
  const off  = CIRC * (1 - Math.min(100, value) / 100);
  const cx   = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--border)" strokeWidth={9}/>
      <circle cx={cx} cy={cx} r={R} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={CIRC} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={cx} y={cx + 2} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={26} fontWeight={800} fontFamily="inherit">
        {value}
      </text>
    </svg>
  );
}

/* ── breakdown bar ───────────────────────────────────────────────────── */
function Bar({ label, value, max, color }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 7, backgroundColor: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 6, backgroundColor: color,
          width: `${Math.min(100, (value / max) * 100)}%`,
          transition: 'width 0.7s ease',
        }}/>
      </div>
    </div>
  );
}

/* ── stat tile ───────────────────────────────────────────────────────── */
function Tile({ icon: Icon, label, value }) {
  return (
    <div style={{ padding: '12px 14px', backgroundColor: 'var(--surface)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={12} color="var(--primary)" />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: 20, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function Profile() {
  const { profile, score, loading, refresh } = useIntelligence();
  const [graph,        setGraph]        = useState([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [recomputing,  setRecomputing]  = useState(false);

  useEffect(() => {
    buildKnowledgeGraph().then(g => { setGraph(g); setGraphLoading(false); });
  }, []);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await computeProfile();
      await refresh();
      const g = await buildKnowledgeGraph();
      setGraph(g);
    } finally {
      setRecomputing(false);
    }
  };

  // Productive hours bar chart (0–23)
  const hourData  = Array.from({ length: 24 }, (_, h) => ({
    hour:  h,
    count: profile?.productiveHours?.find(p => p.hour === h)?.count || 0,
  }));
  const maxCount = Math.max(1, ...hourData.map(h => h.count));

  if (loading) return <p style={{ color: 'var(--muted)', padding: 40 }}>Analyse du profil…</p>;

  const sc = score;
  const scColor = sc?.color || 'var(--primary)';

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Mon profil</h1>
        <button className="btn-ghost" onClick={handleRecompute} disabled={recomputing}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} className={recomputing ? 'spinning' : ''} />
          {recomputing ? 'Recalcul…' : 'Recalculer'}
        </button>
      </div>

      {/* Score + breakdown ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '28px 36px' }}>
          <ScoreRing value={sc?.total || 0} color={scColor} />
          <span style={{ fontSize: 20, fontWeight: 800, color: scColor }}>{sc?.label || '—'}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Score étudiant global</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14 }}>Détail du score (/100)</p>
          {sc ? (
            <>
              <Bar label="Régularité (sessions Pomodoro)"  value={sc.breakdown.regularity}  max={30} color="var(--primary)"  />
              <Bar label="Ponctualité (devoirs à temps)"   value={sc.breakdown.punctuality} max={30} color="var(--success)"  />
              <Bar label="Maîtrise (notes & cartes SRS)"  value={sc.breakdown.mastery}     max={20} color="var(--warning)"  />
              <Bar label="Charge hebdo (heures de travail)" value={sc.breakdown.workload}  max={20} color="#38bdf8"          />
            </>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Lance des sessions Pomodoro et complète des devoirs pour générer ton score.
            </p>
          )}
        </div>
      </div>

      {/* Behavioral profile ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Profil comportemental</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
          <Tile icon={Clock}         label="Heure productive"     value={WORK_TIME_LABELS[profile?.preferredWorkTime] || '—'} />
          <Tile icon={Zap}           label="Concentration moy."   value={profile?.avgFocusDuration ? `${profile.avgFocusDuration} min` : '—'} />
          <Tile icon={TrendingUp}    label="Sessions / semaine"   value={profile?.sessionsPerWeek ?? '—'} />
          <Tile icon={Target}        label="Taux de complétion"   value={profile?.completionRate != null ? `${Math.round(profile.completionRate * 100)}%` : '—'} />
          <Tile icon={AlertTriangle} label="Tendance au retard"   value={profile?.delayTendency  != null ? `${Math.round(profile.delayTendency  * 100)}%` : '—'} />
          <Tile icon={Star}          label="Note moyenne"         value={profile?.avgGrade != null ? `${profile.avgGrade}/20` : '—'} />
        </div>

        {/* Smart tip based on profile */}
        {profile && (
          <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: 'var(--primary)15', borderRadius: 10, border: '1px solid var(--primary)33' }}>
            <span style={{ fontSize: 13, color: 'var(--primary)' }}>
              💡{' '}
              {profile.preferredWorkTime === 'morning'   && "Tu es plus efficace le matin — planifie tes tâches difficiles avant midi."}
              {profile.preferredWorkTime === 'afternoon' && "Tu travailles mieux l'après-midi — réserve ce créneau pour les sujets exigeants."}
              {profile.preferredWorkTime === 'evening'   && "Tu es dans ton élément le soir — profite-en pour les révisions intensives."}
              {profile.preferredWorkTime === 'night'     && "Tu travailles la nuit — veille à ne pas négliger ton sommeil pour rester efficace."}
              {!profile.preferredWorkTime && "Utilise Pomodoro régulièrement pour que l'app apprenne tes habitudes."}
              {profile.delayTendency > 0.5 ? " Attention : tu as tendance à reporter — commence chaque tâche 1 jour à l'avance." : ""}
            </span>
          </div>
        )}
      </div>

      {/* Productive hours chart ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Heures de travail (Pomodoro)</p>
        {!profile?.productiveHours?.length ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Lance des sessions Pomodoro pour voir tes créneaux de travail.
          </p>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, marginBottom: 4 }}>
              {hourData.map(({ hour, count }) => (
                <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%',
                    height: count > 0 ? `${Math.max(6, (count / maxCount) * 56)}px` : '3px',
                    backgroundColor: count > 0 ? 'var(--primary)' : 'var(--border)',
                    borderRadius: '3px 3px 0 0',
                    opacity: count === 0 ? 0.35 : 1,
                    transition: 'height 0.5s ease',
                  }}/>
                </div>
              ))}
            </div>
            {/* x-axis labels */}
            <div style={{ display: 'flex', gap: 2 }}>
              {hourData.map(({ hour }) => (
                <div key={hour} style={{ flex: 1, textAlign: 'center' }}>
                  {hour % 4 === 0 && (
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>{hour}h</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Knowledge graph ────────────────────────────────────────────── */}
      <div className="card">
        <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Maîtrise par matière (Knowledge Graph)</p>
        {graphLoading ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>
        ) : graph.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Ajoute des matières, notes et cartes de révision pour voir l'analyse.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {graph.map(({ subject, gradePct, gradeTrend, revisionMastery, masteryScore, dueCards, pendingAssignments, upcomingExams, riskLevel }) => {
              const col = getMasteryColor(masteryScore);
              return (
                <div key={subject.id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  backgroundColor: 'var(--surface)',
                  borderLeft: `4px solid ${subject.color || col}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{subject.name}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                      backgroundColor: col + '22', color: col,
                    }}>{RISK_LABELS[riskLevel]}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: col, minWidth: 40, textAlign: 'right' }}>
                      {masteryScore}%
                    </span>
                  </div>

                  {/* Mastery bar */}
                  <div style={{ height: 5, backgroundColor: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${masteryScore}%`, backgroundColor: col, borderRadius: 4, transition: 'width 0.7s ease' }}/>
                  </div>

                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    {gradePct !== null && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        📊 {gradePct}% <span title={gradeTrend}>{TREND_ICONS[gradeTrend]}</span>
                      </span>
                    )}
                    {revisionMastery !== null && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>🃏 Révisions {revisionMastery}%</span>
                    )}
                    {dueCards > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 700 }}>
                        ⚡ {dueCards} carte{dueCards > 1 ? 's' : ''} à revoir
                      </span>
                    )}
                    {pendingAssignments > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        📝 {pendingAssignments} devoir{pendingAssignments > 1 ? 's' : ''}
                      </span>
                    )}
                    {upcomingExams > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                        🎓 {upcomingExams} examen{upcomingExams > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
