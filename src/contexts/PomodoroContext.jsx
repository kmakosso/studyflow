import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../services/db';
import { notif } from '../services/notifications';

const Ctx = createContext(null);

export const PRESETS = {
  standard: { label: 'Standard (25/5)',   work: 25, break: 5,  longBreak: 15 },
  long:     { label: 'Long (50/10)',       work: 50, break: 10, longBreak: 30 },
  custom:   { label: 'Personnalisé',       work: 25, break: 5,  longBreak: 15 },
};

export function PomodoroProvider({ children }) {
  const [preset, setPreset]               = useState('standard');
  const [custom, setCustom]               = useState({ work: 25, break: 5, longBreak: 15 });
  const [phase, setPhase]                 = useState('work');
  const [timeLeft, setTimeLeft]           = useState(25 * 60);
  const [isRunning, setIsRunning]         = useState(false);
  const [session, setSession]             = useState(1);
  const [totalSessions, setTotalSessions] = useState(4);
  const [completed, setCompleted]         = useState(0);
  const [taskName, setTaskName]           = useState('');
  const [assignmentId, setAssignmentId]   = useState(null);
  const [objective, setObjective]         = useState('');
  const [autoStart, setAutoStart]         = useState(false);
  const [focusMode, setFocusMode]         = useState(false);

  const timerRef    = useRef(null);
  const autoStartRef = useRef(null);

  const durations = useCallback(() => {
    return preset === 'custom' ? custom : PRESETS[preset];
  }, [preset, custom]);

  const advancePhase = useCallback(async () => {
    const d = preset === 'custom' ? custom : PRESETS[preset];

    if (phase === 'work') {
      const newCompleted = completed + 1;
      setCompleted(newCompleted);

      await db.put('pomodoro', {
        id:          crypto.randomUUID(),
        taskName:    taskName || 'Session',
        assignmentId,
        date:        new Date().toISOString().split('T')[0],
        duration:    d.work,
        completedAt: new Date().toISOString(),
      });

      if (newCompleted >= totalSessions) {
        notif.show('StudyFlow', `Bloc terminé ! ${totalSessions} sessions accomplies.`);
        setPhase('work'); setTimeLeft(d.work * 60);
        setSession(1); setCompleted(0); setIsRunning(false);
        return;
      }

      const isLong    = newCompleted % 4 === 0;
      const nextPhase = isLong ? 'longBreak' : 'break';
      const breakDur  = isLong ? d.longBreak : d.break;
      notif.show('StudyFlow', `Session ${newCompleted} terminée ! Pause de ${breakDur} min.`);
      setPhase(nextPhase);
      setTimeLeft(breakDur * 60);
      setSession(s => s + 1);

      if (autoStart) {
        autoStartRef.current = setTimeout(() => setIsRunning(true), 1500);
      }
    } else {
      notif.show('StudyFlow', 'Pause terminée ! On reprend.');
      setPhase('work');
      setTimeLeft(d.work * 60);
      if (autoStart) {
        autoStartRef.current = setTimeout(() => setIsRunning(true), 1500);
      }
    }
  }, [phase, completed, totalSessions, taskName, assignmentId, preset, custom, autoStart]);

  useEffect(() => {
    if (!isRunning) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          advancePhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isRunning, advancePhase]);

  const start  = () => setIsRunning(true);
  const pause  = () => { setIsRunning(false); clearTimeout(autoStartRef.current); };
  const reset  = () => {
    clearInterval(timerRef.current); clearTimeout(autoStartRef.current);
    const d = preset === 'custom' ? custom : PRESETS[preset];
    setPhase('work'); setTimeLeft(d.work * 60);
    setSession(1); setCompleted(0); setIsRunning(false);
  };
  const skip   = () => { clearInterval(timerRef.current); setIsRunning(false); advancePhase(); };

  const changePreset = (p) => {
    clearInterval(timerRef.current); clearTimeout(autoStartRef.current);
    setPreset(p);
    const d = p === 'custom' ? custom : PRESETS[p];
    setPhase('work'); setTimeLeft(d.work * 60);
    setIsRunning(false); setSession(1); setCompleted(0);
  };

  return (
    <Ctx.Provider value={{
      preset, setPreset: changePreset, custom, setCustom,
      phase, timeLeft, isRunning, session, totalSessions, setTotalSessions,
      completed, taskName, setTaskName, assignmentId, setAssignmentId,
      objective, setObjective, autoStart, setAutoStart,
      focusMode, setFocusMode,
      durations, start, pause, reset, skip,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePomodoro() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePomodoro must be inside PomodoroProvider');
  return ctx;
}
