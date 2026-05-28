import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { differenceInDays } from 'date-fns';
import { evaluateRules }                from '../services/rulesEngine';
import { getProfile, computeStudentScore } from '../services/studentProfile';
import { predictRisks, detectDashboardMode } from '../services/predictor';
import { getEnergyStatus }              from '../services/energyModel';
import { db }                           from '../services/db';
import { useSyncRefresh }               from '../hooks/useSyncRefresh';

const IntelligenceContext = createContext(null);

export function IntelligenceProvider({ children }) {
  const [rules,         setRules]         = useState([]);
  const [risks,         setRisks]         = useState([]);
  const [profile,       setProfile]       = useState(null);
  const [score,         setScore]         = useState(null);
  const [dashboardMode, setDashboardMode] = useState('normal');
  const [energy,        setEnergy]        = useState(null);
  const [loading,       setLoading]       = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [ruleResults, riskResults, profileData, energyData, assignments, exams, pomodoro] = await Promise.all([
        evaluateRules(),
        predictRisks(),
        getProfile(),
        getEnergyStatus(),
        db.all('assignments'),
        db.all('exams'),
        db.all('pomodoro'),
      ]);

      const now         = new Date();
      const futureExams = exams.filter(e => { try { return new Date(e.date) >= now; } catch (_) { return false; } });

      const recentPomodoro = pomodoro.filter(s => {
        try { return s.completed && differenceInDays(now, new Date(s.date)) <= 7; } catch (_) { return false; }
      }).length;

      const pending      = assignments.filter(a => a.status !== 'done');
      const avgDailyLoad = (pending.length * 1.5) / 7;

      const mode = detectDashboardMode({ futureExams, assignments, avgDailyLoad, recentPomodoro });

      const weeklyMinutes = pomodoro.filter(s => {
        try { return s.completed && s.phase === 'work' && differenceInDays(now, new Date(s.date)) <= 7; }
        catch (_) { return false; }
      }).reduce((acc, s) => acc + (s.duration || 0), 0) / 60;

      setRules(ruleResults);
      setRisks(riskResults);
      setProfile(profileData);
      setEnergy(energyData);
      setScore(computeStudentScore(profileData, weeklyMinutes));
      setDashboardMode(mode);
    } catch (err) {
      console.error('[Intelligence] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // Refresh profile/intelligence when cloud sync delivers new data
  useSyncRefresh(refresh);

  const topAlerts = [
    ...rules.filter(r => r.severity === 'critical'),
    ...rules.filter(r => r.severity === 'warning'),
    ...rules.filter(r => r.severity === 'info'),
    ...rules.filter(r => r.severity === 'success'),
  ].slice(0, 4);

  return (
    <IntelligenceContext.Provider value={{
      rules, risks, profile, score, dashboardMode, energy, loading, refresh, topAlerts,
    }}>
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligence() {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) throw new Error('useIntelligence must be inside IntelligenceProvider');
  return ctx;
}
