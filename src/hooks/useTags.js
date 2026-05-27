import { useState, useEffect } from 'react';
import { db } from '../services/db';

export function useTags() {
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [assignments, exams, courses] = await Promise.all([
        db.all('assignments'),
        db.all('exams'),
        db.all('courses'),
      ]);
      const set = new Set();
      [...assignments, ...exams, ...courses].forEach(item => {
        (item.tags || []).forEach(t => set.add(t));
      });
      setAllTags([...set].sort());
    };
    load();
  }, []);

  return { allTags };
}
