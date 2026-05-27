import { useState, useEffect } from 'react';
import { computeStats } from '../services/analytics';

export function useAnalytics() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await computeStats();
    setStats(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { stats, loading, reload: load };
}
