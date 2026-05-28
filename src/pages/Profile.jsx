import { useState, useEffect, useCallback } from 'react';
import {
  User, Clock, Zap, Target, TrendingUp, Star,
  AlertTriangle, RefreshCw, Edit2, Check, X,
} from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useIntelligence }         from '../contexts/IntelligenceContext';
import { useAuth }                  from '../contexts/AuthContext';
import { computeProfile, WORK_TIME_LABELS } from '../services/studentProfile';
import { buildKnowledgeGraph, getMasteryColor, RISK_LABELS, TREND_ICONS } from '../services/knowledgeGraph';
import { computeStreak }            from '../services/analytics';
import { db }                       from '../services/db';
import { useSyncRefresh }           from '../hooks/useSyncRefresh';
import { format, subDays, getDay, startOfWeek, endOfWeek, isWithinInterval, differenceInDays } from 'date-fns';
import { fr }                       from 'date-fns/locale';

/* ─── Helpers ────────────────────────────────────────────────────────── */

const SCHOOL_LEVELS = [
  '', 'Lycée', 'Licence 1', 'Licence 2', 'Licence 3',
  'Master 1', 'Master 2', 'Doctorat', 'Autre',
];

/* ─── Score ring ─────────────────────────────────────────────────────── */
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

/* ─── Breakdown bar ──────────────────────────────────────────────────── */
function Bar({ label, value, max, color }) {
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:13 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:700, color }}>{value}/{max}</span>
      </div>
      <div style={{ height:7, backgroundColor:'var(--border)', borderRadius:6, overflow:'hidden' }}>
        <div style={{
          height:'100%', borderRadius:6, backgroundColor:color,
          width:`${Math.min(100,(value/max)*100)}%`, transition:'width 0.7s ease',
        }}/>
      </div>
    </div>
  );
}

/* ─── Stat tile ──────────────────────────────────────────────────────── */
function Tile({ icon: Icon, label, value }) {
  return (
    <div style={{ padding:'12px 14px', backgroundColor:'var(--surface)', borderRadius:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
        <Icon size={12} color="var(--primary)"/>
        <span style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize:20, fontWeight:800 }}>{value}</span>
    </div>
  );
}

/* ─── Identity card ──────────────────────────────────────────────────── */
function IdentityCard({ user, displayName, schoolLevel, onSave }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(displayName);
  const [level,   setLevel]   = useState(schoolLevel);

  const initials = (displayName || user?.user_metadata?.full_name || user?.email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const save = () => { onSave(name, level); setEditing(false); };
  const cancel = () => { setName(displayName); setLevel(schoolLevel); setEditing(false); };

  return (
    <div className="card" style={{ display:'flex', alignItems:'center', gap:20, marginBottom:20, flexWrap:'wrap' }}>
      {/* Avatar */}
      {user?.user_metadata?.avatar_url ? (
        <img src={user.user_metadata.avatar_url}
          alt="Avatar" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid var(--primary)' }}/>
      ) : (
        <div style={{
          width:72, height:72, borderRadius:'50%', flexShrink:0,
          background:'var(--primary)', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:26, fontWeight:800,
        }}>
          {initials}
        </div>
      )}

      {/* Info */}
      <div style={{ flex:1 }}>
        {editing ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Ton prénom / pseudo"
              style={{ fontSize:16, fontWeight:700, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)' }}
            />
            <select value={level} onChange={e => setLevel(e.target.value)}
              style={{ fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)' }}>
              {SCHOOL_LEVELS.map(l => <option key={l} value={l}>{l || '— Niveau scolaire —'}</option>)}
            </select>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 12px', borderRadius:8, border:'none', background:'var(--primary)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <Check size={13}/> Sauvegarder
              </button>
              <button onClick={cancel}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 12px', borderRadius:8, border:'1px solid var(--border)', background:'none', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>
                <X size={13}/> Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20, fontWeight:800 }}>
                {displayName || user?.user_metadata?.full_name || 'Étudiant'}
              </span>
              <button onClick={() => setEditing(true)}
                style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', padding:4 }}>
                <Edit2 size={13}/>
              </button>
            </div>
            <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--muted)' }}>
              {schoolLevel || 'Niveau non renseigné'}
              {user?.email && <span> · {user.email}</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Weekly goals ───────────────────────────────────────────────────── */
function WeeklyGoals({ sessions, doneAssignments, reviewedCards, goals, onSaveGoals }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(goals);

  // Keep draft in sync when goals change externally (cloud sync)
  useEffect(() => { setDraft(goals); }, [goals]);

  const save = async () => {
    await onSaveGoals(draft);
    setEditing(false);
  };

  const now      = new Date();
  const wStart   = startOfWeek(now, { weekStartsOn: 1 });
  const wEnd     = endOfWeek(now,   { weekStartsOn: 1 });
  const inWeek   = (d) => { try { return isWithinInterval(new Date(d), { start: wStart, end: wEnd }); } catch { return false; } };

  const weekSessions  = sessions.filter(s => inWeek(s.completedAt || s.date));
  const currentHours  = parseFloat((weekSessions.reduce((a, s) => a + (s.duration || 25), 0) / 60).toFixed(1));
  const currentAssign = doneAssignments;
  const currentCards  = reviewedCards;

  const GoalBar = ({ label, emoji, current, target, color }) => {
    const pct = Math.min(100, (current / Math.max(1, target)) * 100);
    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:13, fontWeight:600 }}>{emoji} {label}</span>
          <span style={{ fontSize:12, color: pct >= 100 ? 'var(--success)' : 'var(--muted)' }}>
            {pct >= 100 ? '✅ ' : ''}{current} / {target}
          </span>
        </div>
        <div style={{ height:8, backgroundColor:'var(--border)', borderRadius:6, overflow:'hidden' }}>
          <div style={{
            height:'100%', borderRadius:6, backgroundColor: pct >= 100 ? 'var(--success)' : color,
            width:`${pct}%`, transition:'width 0.7s ease',
          }}/>
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <p style={{ fontWeight:700, fontSize:14, margin:0 }}>🎯 Objectifs de la semaine</p>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', display:'flex', gap:4, alignItems:'center', fontSize:12 }}>
            <Edit2 size={12}/> Modifier
          </button>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save}
              style={{ background:'var(--primary)', border:'none', color:'#fff', padding:'4px 10px', borderRadius:6, fontSize:12, cursor:'pointer' }}>
              Sauvegarder
            </button>
            <button onClick={() => { setDraft(goals); setEditing(false); }}
              style={{ background:'none', border:'1px solid var(--border)', color:'var(--muted)', padding:'4px 10px', borderRadius:6, fontSize:12, cursor:'pointer' }}>
              Annuler
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { key:'hours',       label:'⏱️ Heures de travail / semaine', unit:'h' },
            { key:'assignments', label:'✅ Devoirs à compléter / semaine', unit:'' },
            { key:'cards',       label:'🃏 Cartes à réviser / semaine', unit:'' },
          ].map(({ key, label, unit }) => (
            <div key={key} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:13, flex:1 }}>{label}</span>
              <input type="number" min={0} max={200} value={draft[key]}
                onChange={e => setDraft(p => ({ ...p, [key]: Number(e.target.value) }))}
                style={{ width:64, padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:14, fontWeight:700 }}
              />
              {unit && <span style={{ fontSize:12, color:'var(--muted)' }}>{unit}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <GoalBar label="Heures de travail"   emoji="⏱️" current={currentHours}  target={goals?.hours       ?? 10} color="var(--primary)"/>
          <GoalBar label="Devoirs complétés"   emoji="✅" current={currentAssign} target={goals?.assignments ?? 5}  color="var(--success)"/>
          <GoalBar label="Cartes révisées"     emoji="🃏" current={currentCards}  target={goals?.cards       ?? 20} color="var(--warning)"/>
        </div>
      )}
    </div>
  );
}

/* ─── Activity heatmap ───────────────────────────────────────────────── */
function ActivityHeatmap({ sessions }) {
  const today   = new Date();
  const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  // Build 91 days (13 weeks), starting from Monday of 13 weeks ago
  const startMonday = subDays(today, 90);
  // Pad from the Monday before our start
  const firstDow = (getDay(startMonday) + 6) % 7; // 0=Mon
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null); // empty cells

  for (let i = 0; i <= 90; i++) {
    const date    = subDays(today, 90 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const count   = sessions.filter(s => (s.completedAt || s.date || '').startsWith(dateStr)).length;
    cells.push({ date, dateStr, count });
  }

  const getColor = (count) => {
    if (!count)  return 'var(--border)';
    if (count === 1) return 'var(--primary)44';
    if (count === 2) return 'var(--primary)88';
    if (count === 3) return 'var(--primary)bb';
    return 'var(--primary)';
  };

  // Generate month labels
  const monthLabels = [];
  for (let i = 0; i <= 90; i++) {
    const d = subDays(today, 90 - i);
    if (i === 0 || format(d, 'd') === '1') {
      const col = Math.floor((firstDow + i) / 7);
      monthLabels.push({ label: format(d, 'MMM', { locale: fr }), col });
    }
  }

  return (
    <div className="card" style={{ marginBottom:20 }}>
      <p style={{ fontWeight:700, fontSize:14, margin:'0 0 14px' }}>📅 Activité (90 derniers jours)</p>

      <div style={{ display:'flex', gap:6 }}>
        {/* Day-of-week labels */}
        <div style={{ display:'grid', gridTemplateRows:'repeat(7,12px)', gap:3, marginTop:18 }}>
          {DOW_LABELS.map((l, i) => (
            <span key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:'12px', textAlign:'right', paddingRight:2 }}>{i % 2 === 0 ? l : ''}</span>
          ))}
        </div>

        {/* Heatmap grid */}
        <div style={{ flex:1, overflowX:'auto' }}>
          {/* Month labels */}
          <div style={{ display:'grid', gridAutoFlow:'column', gridAutoColumns:'15px', gap:3, marginBottom:4, marginLeft:0, height:14 }}>
            {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, colIdx) => {
              const ml = monthLabels.find(m => m.col === colIdx);
              return (
                <div key={colIdx} style={{ gridColumn: colIdx + 1, fontSize:9, color:'var(--muted)', whiteSpace:'nowrap' }}>
                  {ml ? ml.label : ''}
                </div>
              );
            })}
          </div>

          {/* Cells grid */}
          <div style={{
            display:'grid',
            gridTemplateRows:'repeat(7, 12px)',
            gridAutoFlow:'column',
            gridAutoColumns:'12px',
            gap:3,
          }}>
            {cells.map((cell, i) =>
              cell === null ? (
                <div key={`pad-${i}`} style={{ width:12, height:12 }}/>
              ) : (
                <div
                  key={cell.dateStr}
                  title={`${format(cell.date, 'd MMM', { locale: fr })} : ${cell.count} session${cell.count !== 1 ? 's' : ''}`}
                  style={{
                    width:12, height:12, borderRadius:2,
                    backgroundColor: getColor(cell.count),
                    cursor: 'default',
                  }}
                />
              )
            )}
          </div>

          {/* Legend */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:8, justifyContent:'flex-end' }}>
            <span style={{ fontSize:9, color:'var(--muted)' }}>Moins</span>
            {[0,1,2,3,4].map(n => (
              <div key={n} style={{ width:10, height:10, borderRadius:2, backgroundColor: getColor(n) }}/>
            ))}
            <span style={{ fontSize:9, color:'var(--muted)' }}>Plus</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Badges ─────────────────────────────────────────────────────────── */
const BADGES_DEF = [
  { id:'first_session', emoji:'⏱️', label:'Premier pas',    desc:'Première session Pomodoro complétée',    check: d => d.sessions >= 1 },
  { id:'streak_7',      emoji:'🔥', label:'En feu',         desc:'7 jours de streak consécutifs',          check: d => d.streak >= 7 },
  { id:'streak_30',     emoji:'🌟', label:'Mois parfait',   desc:'30 jours de streak consécutifs',         check: d => d.streak >= 30 },
  { id:'sessions_50',   emoji:'💪', label:'Marathonien',    desc:'50 sessions Pomodoro au total',          check: d => d.sessions >= 50 },
  { id:'assign_10',     emoji:'✅', label:'Ponctuel',       desc:'10 devoirs complétés',                   check: d => d.doneAssign >= 10 },
  { id:'assign_0_late', emoji:'🎯', label:'Sans retard',    desc:'Aucun retard (sur 10+ devoirs rendus)',  check: d => d.doneAssign >= 10 && d.lateAssign === 0 },
  { id:'cards_50',      emoji:'🃏', label:'Mémoriseur',     desc:'50 fiches de révision créées',           check: d => d.revisions >= 50 },
  { id:'mastered_25',   emoji:'🏆', label:'Expert',         desc:'25 cartes maîtrisées',                   check: d => d.mastered >= 25 },
  { id:'docs_5',        emoji:'📚', label:'Bibliothécaire', desc:'5 documents importés',                   check: d => d.documents >= 5 },
  { id:'grade_14',      emoji:'⭐', label:'Bon élève',      desc:'Moyenne générale ≥ 14/20',               check: d => d.avgGrade !== null && d.avgGrade >= 14 },
  { id:'sessions_100',  emoji:'🚀', label:'Centurion',      desc:'100 sessions Pomodoro au total',         check: d => d.sessions >= 100 },
  { id:'grade_18',      emoji:'💎', label:'Excellence',     desc:'Moyenne générale ≥ 18/20',               check: d => d.avgGrade !== null && d.avgGrade >= 18 },
];

function BadgesGrid({ data }) {
  const unlocked = BADGES_DEF.filter(b => b.check(data));
  const locked   = BADGES_DEF.filter(b => !b.check(data));

  return (
    <div className="card" style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <p style={{ fontWeight:700, fontSize:14, margin:0 }}>🏅 Badges & jalons</p>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{unlocked.length}/{BADGES_DEF.length} débloqués</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10 }}>
        {/* Unlocked first */}
        {unlocked.map(badge => (
          <div key={badge.id} style={{
            padding:'12px 10px', borderRadius:10, textAlign:'center',
            backgroundColor:'var(--primary)15', border:'1px solid var(--primary)33',
          }}>
            <div style={{ fontSize:28, marginBottom:4 }}>{badge.emoji}</div>
            <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:700, color:'var(--primary)' }}>{badge.label}</p>
            <p style={{ margin:0, fontSize:10.5, color:'var(--muted)', lineHeight:1.4 }}>{badge.desc}</p>
          </div>
        ))}
        {/* Locked */}
        {locked.map(badge => (
          <div key={badge.id} style={{
            padding:'12px 10px', borderRadius:10, textAlign:'center',
            backgroundColor:'var(--surface)', border:'1px solid var(--border)',
            opacity:0.45,
          }}>
            <div style={{ fontSize:28, marginBottom:4, filter:'grayscale(1)' }}>{badge.emoji}</div>
            <p style={{ margin:'0 0 2px', fontSize:12, fontWeight:700, color:'var(--muted)' }}>{badge.label}</p>
            <p style={{ margin:0, fontSize:10.5, color:'var(--muted)', lineHeight:1.4 }}>{badge.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function Profile() {
  const { profile, score, loading, refresh } = useIntelligence();
  const { user }                             = useAuth();
  const isMobile = useIsMobile();
  const [graph,        setGraph]        = useState([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [recomputing,  setRecomputing]  = useState(false);

  // Identity
  const [displayName,  setDisplayName]  = useState('');
  const [schoolLevel,  setSchoolLevel]  = useState('');

  // Weekly goals (lifted from WeeklyGoals sub-component so they sync)
  const [wgPrefs, setWgPrefs] = useState({ hours: 10, assignments: 5, cards: 20 });

  // Extra data for badges + goals
  const [allSessions,   setAllSessions]   = useState([]);
  const [doneAssign,    setDoneAssign]    = useState(0);
  const [lateAssign,    setLateAssign]    = useState(0);
  const [revisionCount, setRevisionCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [streak,        setStreak]        = useState(0);

  // This week reviewed cards (revisions with nextReview updated recently)
  const [weekCards, setWeekCards] = useState(0);

  const load = useCallback(async () => {
    const [sessions, assignments, revisions, documents, userPrefs] = await Promise.all([
      db.all('pomodoro'),
      db.all('assignments'),
      db.all('revisions'),
      db.all('documents'),
      db.get('profile', 'userPrefs').catch(() => null),
    ]);

    // Migration: if no userPrefs in profile store yet, read from settings and migrate
    let prefs = userPrefs;
    if (!prefs) {
      const [name, level, h, a, c] = await Promise.all([
        db.getSetting('userDisplayName', ''),
        db.getSetting('userSchoolLevel', ''),
        db.getSetting('wg_hours', 10),
        db.getSetting('wg_assignments', 5),
        db.getSetting('wg_cards', 20),
      ]);
      prefs = { id: 'userPrefs', displayName: name, schoolLevel: level, wg_hours: h, wg_assignments: a, wg_cards: c };
      // Persist to profile store so it syncs going forward
      await db.put('profile', { ...prefs, updatedAt: new Date().toISOString() });
    }

    setDisplayName(prefs.displayName || '');
    setSchoolLevel(prefs.schoolLevel || '');
    setWgPrefs({ hours: prefs.wg_hours ?? 10, assignments: prefs.wg_assignments ?? 5, cards: prefs.wg_cards ?? 20 });

    setAllSessions(sessions);

    const now    = new Date();
    const wStart = startOfWeek(now, { weekStartsOn: 1 });
    const wEnd   = endOfWeek(now,   { weekStartsOn: 1 });
    const inWeek = (d) => { try { return isWithinInterval(new Date(d), { start: wStart, end: wEnd }); } catch { return false; } };

    const done = assignments.filter(a => a.status === 'done');
    const late = done.filter(a => {
      try { return a.completedAt && a.dueDate && differenceInDays(new Date(a.completedAt), new Date(a.dueDate)) > 0; }
      catch { return false; }
    });

    setDoneAssign(done.length);
    setLateAssign(late.length);
    setRevisionCount(revisions.length);
    setMasteredCount(revisions.filter(r => r.status === 'mastered').length);
    setDocumentCount(documents.length);

    // Cards reviewed this week: cards with nextReview in past or near future (updated recently)
    const weeklyReviewed = revisions.filter(r => r.nextReview && inWeek(r.nextReview)).length;
    setWeekCards(weeklyReviewed);

    const doneThisWeek = done.filter(a => a.completedAt && inWeek(a.completedAt));
    // We'll pass doneThisWeek.length to WeeklyGoals separately below
    window.__sfWeekAssign = doneThisWeek.length; // simple bridge

    const s = await computeStreak();
    setStreak(s);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);   // reload when cloud sync delivers new data

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

  const saveIdentity = async (name, level) => {
    const existing = await db.get('profile', 'userPrefs').catch(() => null) || { id: 'userPrefs' };
    await db.put('profile', { ...existing, id: 'userPrefs', displayName: name, schoolLevel: level, updatedAt: new Date().toISOString() });
    setDisplayName(name);
    setSchoolLevel(level);
  };

  const saveGoals = async (newGoals) => {
    const existing = await db.get('profile', 'userPrefs').catch(() => null) || { id: 'userPrefs' };
    await db.put('profile', {
      ...existing,
      id: 'userPrefs',
      wg_hours:       newGoals.hours,
      wg_assignments: newGoals.assignments,
      wg_cards:       newGoals.cards,
      updatedAt: new Date().toISOString(),
    });
    setWgPrefs(newGoals);
  };

  const sc      = score;
  const scColor = sc?.color || 'var(--primary)';

  const hourData = Array.from({ length:24 }, (_, h) => ({
    hour:  h,
    count: profile?.productiveHours?.find(p => p.hour === h)?.count || 0,
  }));
  const maxCount = Math.max(1, ...hourData.map(h => h.count));

  const badgeData = {
    sessions:  allSessions.length,
    streak,
    doneAssign,
    lateAssign,
    revisions: revisionCount,
    mastered:  masteredCount,
    documents: documentCount,
    avgGrade:  profile?.avgGrade ?? null,
  };

  if (loading) return <p style={{ color:'var(--muted)', padding:40 }}>Analyse du profil…</p>;

  return (
    <div style={{ maxWidth:860 }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Mon profil</h1>
        <button className="btn-ghost" onClick={handleRecompute} disabled={recomputing}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
          <RefreshCw size={13} className={recomputing ? 'spinning' : ''}/>
          {recomputing ? 'Recalcul…' : 'Recalculer'}
        </button>
      </div>

      {/* ── Identity ── */}
      <IdentityCard
        user={user}
        displayName={displayName}
        schoolLevel={schoolLevel}
        onSave={saveIdentity}
      />

      {/* ── Score + breakdown ── */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr', gap:20, marginBottom:20, alignItems:'start' }}>
        <div className="card" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding: isMobile ? '18px' : '28px 36px' }}>
          <ScoreRing value={sc?.total || 0} color={scColor}/>
          <span style={{ fontSize:20, fontWeight:800, color:scColor }}>{sc?.label || '—'}</span>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Score étudiant global</span>
        </div>
        <div className="card" style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <p style={{ fontWeight:700, fontSize:14 }}>Détail du score (/100)</p>
          {sc ? (
            <>
              <Bar label="Régularité (sessions Pomodoro)"    value={sc.breakdown.regularity}  max={30} color="var(--primary)"/>
              <Bar label="Ponctualité (devoirs à temps)"     value={sc.breakdown.punctuality} max={30} color="var(--success)"/>
              <Bar label="Maîtrise (notes & cartes SRS)"     value={sc.breakdown.mastery}     max={20} color="var(--warning)"/>
              <Bar label="Charge hebdo (heures de travail)"  value={sc.breakdown.workload}    max={20} color="#38bdf8"/>
            </>
          ) : (
            <p style={{ color:'var(--muted)', fontSize:13 }}>
              Lance des sessions Pomodoro et complète des devoirs pour générer ton score.
            </p>
          )}
        </div>
      </div>

      {/* ── Weekly goals ── */}
      <WeeklyGoals
        sessions={allSessions}
        doneAssignments={window.__sfWeekAssign || 0}
        reviewedCards={weekCards}
        goals={wgPrefs}
        onSaveGoals={saveGoals}
      />

      {/* ── Activity heatmap ── */}
      <ActivityHeatmap sessions={allSessions}/>

      {/* ── Badges ── */}
      <BadgesGrid data={badgeData}/>

      {/* ── Behavioral profile ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <p style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Profil comportemental</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(175px,1fr))', gap:12 }}>
          <Tile icon={Clock}         label="Heure productive"   value={WORK_TIME_LABELS[profile?.preferredWorkTime] || '—'}/>
          <Tile icon={Zap}           label="Concentration moy." value={profile?.avgFocusDuration ? `${profile.avgFocusDuration} min` : '—'}/>
          <Tile icon={TrendingUp}    label="Sessions / semaine" value={profile?.sessionsPerWeek ?? '—'}/>
          <Tile icon={Target}        label="Taux de complétion" value={profile?.completionRate != null ? `${Math.round(profile.completionRate*100)}%` : '—'}/>
          <Tile icon={AlertTriangle} label="Tendance au retard" value={profile?.delayTendency  != null ? `${Math.round(profile.delayTendency *100)}%` : '—'}/>
          <Tile icon={Star}          label="Note moyenne"       value={profile?.avgGrade != null ? `${profile.avgGrade}/20` : '—'}/>
        </div>
        {profile && (
          <div style={{ marginTop:16, padding:'10px 14px', backgroundColor:'var(--primary)15', borderRadius:10, border:'1px solid var(--primary)33' }}>
            <span style={{ fontSize:13, color:'var(--primary)' }}>
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

      {/* ── Productive hours chart ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <p style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Heures de travail (Pomodoro)</p>
        {!profile?.productiveHours?.length ? (
          <p style={{ color:'var(--muted)', fontSize:13 }}>Lance des sessions Pomodoro pour voir tes créneaux de travail.</p>
        ) : (
          <div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:64, marginBottom:4 }}>
              {hourData.map(({ hour, count }) => (
                <div key={hour} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{
                    width:'100%',
                    height: count > 0 ? `${Math.max(6,(count/maxCount)*56)}px` : '3px',
                    backgroundColor: count > 0 ? 'var(--primary)' : 'var(--border)',
                    borderRadius:'3px 3px 0 0',
                    opacity: count === 0 ? 0.35 : 1,
                    transition:'height 0.5s ease',
                  }}/>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:2 }}>
              {hourData.map(({ hour }) => (
                <div key={hour} style={{ flex:1, textAlign:'center' }}>
                  {hour % 4 === 0 && <span style={{ fontSize:9, color:'var(--muted)' }}>{hour}h</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Knowledge graph ── */}
      <div className="card">
        <p style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Maîtrise par matière (Knowledge Graph)</p>
        {graphLoading ? (
          <p style={{ color:'var(--muted)', fontSize:13 }}>Chargement…</p>
        ) : graph.length === 0 ? (
          <p style={{ color:'var(--muted)', fontSize:13 }}>Ajoute des matières, notes et cartes de révision pour voir l'analyse.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {graph.map(({ subject, gradePct, gradeTrend, revisionMastery, masteryScore, dueCards, pendingAssignments, upcomingExams, riskLevel }) => {
              const col = getMasteryColor(masteryScore);
              return (
                <div key={subject.id} style={{
                  padding:'12px 14px', borderRadius:10, backgroundColor:'var(--surface)',
                  borderLeft:`4px solid ${subject.color || col}`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <span style={{ fontWeight:700, fontSize:14, flex:1 }}>{subject.name}</span>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, backgroundColor:col+'22', color:col }}>
                      {RISK_LABELS[riskLevel]}
                    </span>
                    <span style={{ fontSize:18, fontWeight:800, color:col, minWidth:40, textAlign:'right' }}>{masteryScore}%</span>
                  </div>
                  <div style={{ height:5, backgroundColor:'var(--border)', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
                    <div style={{ height:'100%', width:`${masteryScore}%`, backgroundColor:col, borderRadius:4, transition:'width 0.7s ease' }}/>
                  </div>
                  <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
                    {gradePct !== null && (
                      <span style={{ fontSize:11, color:'var(--muted)' }}>📊 {gradePct}% <span>{TREND_ICONS[gradeTrend]}</span></span>
                    )}
                    {revisionMastery !== null && (
                      <span style={{ fontSize:11, color:'var(--muted)' }}>🃏 Révisions {revisionMastery}%</span>
                    )}
                    {dueCards > 0 && (
                      <span style={{ fontSize:11, color:'var(--warning)', fontWeight:700 }}>⚡ {dueCards} carte{dueCards>1?'s':''} à revoir</span>
                    )}
                    {pendingAssignments > 0 && (
                      <span style={{ fontSize:11, color:'var(--muted)' }}>📝 {pendingAssignments} devoir{pendingAssignments>1?'s':''}</span>
                    )}
                    {upcomingExams > 0 && (
                      <span style={{ fontSize:11, color:'var(--danger)', fontWeight:700 }}>🎓 {upcomingExams} examen{upcomingExams>1?'s':''}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
