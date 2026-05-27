import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Maximize2, Volume2, VolumeX } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { usePomodoro, PRESETS } from '../contexts/PomodoroContext';
import { useAssignments } from '../hooks/useAssignments';
import { db } from '../services/db';
import { notif } from '../services/notifications';
import { ambient, AMBIENT_SOUNDS } from '../services/ambientAudio';

const R = 78, CIRC = 2 * Math.PI * R;

function CircleTimer({ timeLeft, total, phase }) {
  const progress = total > 0 ? timeLeft / total : 1;
  const offset   = CIRC * (1 - progress);
  const color    = phase === 'work' ? 'var(--primary)' : phase === 'break' ? 'var(--success)' : '#06b6d4';
  const mins     = Math.floor(timeLeft / 60).toString().padStart(2,'0');
  const secs     = (timeLeft % 60).toString().padStart(2,'0');
  return (
    <svg width={200} height={200} viewBox="0 0 200 200">
      <circle cx={100} cy={100} r={R} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle cx={100} cy={100} r={R} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={CIRC} strokeDashoffset={offset}
        transform="rotate(-90 100 100)"
        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }} />
      <text x={100} y={90}  textAnchor="middle" fill="var(--text)"  fontSize={32} fontWeight={700} fontFamily="monospace">{mins}:{secs}</text>
      <text x={100} y={114} textAnchor="middle" fill="var(--muted)" fontSize={13}>
        {phase === 'work' ? 'Travail' : phase === 'break' ? 'Pause courte' : 'Pause longue'}
      </text>
    </svg>
  );
}

export default function Pomodoro() {
  const {
    preset, setPreset, custom, setCustom,
    phase, timeLeft, isRunning,
    session, totalSessions, setTotalSessions,
    completed, taskName, setTaskName, assignmentId, setAssignmentId,
    objective, setObjective, autoStart, setAutoStart,
    focusMode, setFocusMode,
    durations, start, pause, reset, skip,
  } = usePomodoro();

  const { assignments } = useAssignments();
  const [history, setHistory]         = useState([]);
  const [showCustom, setShowCustom]   = useState(false);
  const [tempCustom, setTempCustom]   = useState({ work: 25, break: 5, longBreak: 15 });
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [soundType, setSoundType]     = useState('brown');
  const [volume, setVolume]           = useState(0.35);

  useEffect(() => {
    db.all('pomodoro').then(data =>
      setHistory(data.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 20))
    );
    notif.request();
  }, [isRunning]);

  const toggleSound = () => {
    if (soundPlaying) { ambient.stop(); setSoundPlaying(false); }
    else { ambient.play(soundType, volume); setSoundPlaying(true); }
  };

  const changeSound = (type) => {
    setSoundType(type);
    if (soundPlaying) ambient.play(type, volume);
  };

  const handleVolume = (v) => {
    setVolume(v);
    ambient.setVolume(v);
  };

  const d        = durations();
  const total    = d[(phase === 'work' ? 'work' : phase === 'break' ? 'break' : 'longBreak')] * 60;
  const active   = assignments.filter(a => a.status !== 'done');
  const progress = assignmentId
    ? (() => { const a = assignments.find(x => x.id === assignmentId); if (!a) return null; const done = a.subtasks?.filter(s => s.done).length; const total = a.subtasks?.length; return total > 0 ? { done, total, pct: Math.round(done / total * 100) } : null; })()
    : null;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ marginBottom: 24 }}>Pomodoro</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Timer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: 28 }}>
          <CircleTimer timeLeft={timeLeft} total={total} phase={phase} />

          {/* Session dots */}
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: totalSessions }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: i < completed ? 'var(--primary)' : 'var(--border)',
                border: i === session - 1 && isRunning ? '2px solid var(--primary)' : 'none',
                transition: 'background-color 0.3s',
              }} />
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Session {session} / {totalSessions}</p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={reset} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', color: 'var(--muted)' }}>
              <RotateCcw size={17} />
            </button>
            <button onClick={isRunning ? pause : start} style={{
              background: 'var(--primary)', border: 'none', borderRadius: 14,
              padding: '13px 28px', color: 'white', fontWeight: 700, fontSize: 15,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {isRunning ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Démarrer</>}
            </button>
            <button onClick={skip} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', color: 'var(--muted)' }}>
              <SkipForward size={17} />
            </button>
          </div>

          {/* Focus + auto-start */}
          <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
            <button onClick={() => setFocusMode(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 12,
              background: 'var(--primary-dim)', border: '1px solid var(--primary)',
              color: 'var(--primary)', fontWeight: 600,
            }}>
              <Maximize2 size={12} /> Mode focus
            </button>
            <button onClick={() => setAutoStart(a => !a)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12,
              background: autoStart ? '#22c55e22' : 'transparent',
              border: `1px solid ${autoStart ? 'var(--success)' : 'var(--border)'}`,
              color: autoStart ? 'var(--success)' : 'var(--muted)', fontWeight: 600,
            }}>
              {autoStart ? '⚡ Auto-start ON' : '⚡ Auto-start'}
            </button>
          </div>
        </div>

        {/* Settings panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Mode */}
          <div className="card">
            <p style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Mode</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} onClick={() => { if (key === 'custom') setShowCustom(c => !c); else setPreset(key); }} style={{
                  padding: '7px 12px', borderRadius: 8, textAlign: 'left',
                  border: `1px solid ${preset === key ? 'var(--primary)' : 'var(--border)'}`,
                  background: preset === key ? 'var(--primary-dim)' : 'transparent',
                  color: preset === key ? 'var(--primary)' : 'var(--muted)',
                  fontSize: 13, fontWeight: 500,
                }}>
                  {p.label} {key !== 'custom' && <span style={{ fontSize: 11 }}>{p.work}/{p.break}min</span>}
                </button>
              ))}
            </div>
            {showCustom && (
              <div style={{ marginTop: 10, padding: 12, backgroundColor: 'var(--surface)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['work','Travail'],['break','Pause courte'],['longBreak','Pause longue']].map(([k, lbl]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 12, color: 'var(--muted)', width: 130 }}>{lbl} (min)</label>
                    <input type="number" min={1} max={120} value={tempCustom[k]}
                      onChange={e => setTempCustom(p => ({ ...p, [k]: Number(e.target.value) }))}
                      style={{ width: 60 }} />
                  </div>
                ))}
                <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px', alignSelf: 'flex-end' }}
                  onClick={() => { setCustom(tempCustom); setPreset('custom'); setShowCustom(false); }}>
                  Appliquer
                </button>
              </div>
            )}
          </div>

          {/* Sessions count */}
          <div className="card">
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Sessions par bloc</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setTotalSessions(n)} style={{
                  width: 34, height: 34, borderRadius: 8, fontWeight: 700, fontSize: 14,
                  border: `1px solid ${totalSessions === n ? 'var(--primary)' : 'var(--border)'}`,
                  background: totalSessions === n ? 'var(--primary-dim)' : 'transparent',
                  color: totalSessions === n ? 'var(--primary)' : 'var(--muted)',
                }}>{n}</button>
              ))}
            </div>
          </div>

          {/* Task + objective */}
          <div className="card">
            <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Tâche</p>
            <input value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="Nom de la tâche…" style={{ marginBottom: 8 }} />
            <input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Objectif de session (ex: finir l'UML)…" />
            {active.length > 0 && (
              <select value={assignmentId || ''} onChange={e => { const id = e.target.value; setAssignmentId(id || null); if (id) setTaskName(assignments.find(a => a.id === id)?.title || ''); }}
                style={{ marginTop: 8, fontSize: 12 }}>
                <option value="">— Lier à un devoir —</option>
                {active.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            )}
            {progress && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sous-tâches</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{progress.done}/{progress.total}</span>
                </div>
                <div style={{ height: 6, backgroundColor: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress.pct}%`, backgroundColor: 'var(--primary)', transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </div>

          {/* Ambient sound */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontWeight: 600, fontSize: 13 }}>Sons ambiants</p>
              <button onClick={toggleSound} style={{ background: 'none', border: 'none', color: soundPlaying ? 'var(--primary)' : 'var(--muted)', display: 'flex', cursor: 'pointer' }}>
                {soundPlaying ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: soundPlaying ? 10 : 0 }}>
              {AMBIENT_SOUNDS.map(s => (
                <button key={s.id} onClick={() => changeSound(s.id)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${soundType === s.id && soundPlaying ? 'var(--primary)' : 'var(--border)'}`,
                  background: soundType === s.id && soundPlaying ? 'var(--primary-dim)' : 'transparent',
                  color: soundType === s.id && soundPlaying ? 'var(--primary)' : 'var(--muted)',
                }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            {soundPlaying && (
              <input type="range" min={0} max={1} step={0.05} value={volume}
                onChange={e => handleVolume(Number(e.target.value))} />
            )}
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Historique récent</h2>
          <div className="card">
            {history.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 90 }}>
                  {format(new Date(h.completedAt), 'd MMM HH:mm', { locale: fr })}
                </span>
                <span style={{ fontSize: 13, flex: 1 }}>{h.taskName}</span>
                <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{h.duration}min</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
