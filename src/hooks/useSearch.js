import { useState, useCallback } from 'react';
import { db } from '../services/db';

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matches(text, query) {
  return normalize(text).includes(normalize(query));
}

export function useSearch() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }

    setLoading(true);
    const [subjects, assignments, exams, courses, grades] = await Promise.all([
      db.all('subjects'),
      db.all('assignments'),
      db.all('exams'),
      db.all('courses'),
      db.all('grades'),
    ]);

    const subMap = Object.fromEntries(subjects.map(s => [s.id, s]));
    const found  = [];

    // Subjects
    subjects.filter(s => matches(s.name, q) || matches(s.teacher, q)).forEach(s =>
      found.push({ type: 'subject', id: s.id, title: s.name, subtitle: s.teacher, color: s.color, to: '/subjects' })
    );

    // Assignments
    assignments.filter(a => matches(a.title, q) || matches(a.description, q) || (a.tags || []).some(t => matches(t, q))).forEach(a =>
      found.push({ type: 'assignment', id: a.id, title: a.title, subtitle: subMap[a.subjectId]?.name, color: subMap[a.subjectId]?.color, to: '/assignments', meta: a.dueDate })
    );

    // Exams
    exams.filter(e => matches(subMap[e.subjectId]?.name, q) || matches(e.chapters, q) || (e.tags || []).some(t => matches(t, q))).forEach(e =>
      found.push({ type: 'exam', id: e.id, title: subMap[e.subjectId]?.name || 'Examen', subtitle: e.date + ' à ' + e.time, color: subMap[e.subjectId]?.color, to: '/exams' })
    );

    // Courses
    courses.filter(c => matches(subMap[c.subjectId]?.name, q) || matches(c.room, q) || (c.tags || []).some(t => matches(t, q))).forEach(c =>
      found.push({ type: 'course', id: c.id, title: subMap[c.subjectId]?.name || 'Cours', subtitle: c.room, color: subMap[c.subjectId]?.color, to: '/schedule' })
    );

    // Grades
    grades.filter(g => matches(subMap[g.subjectId]?.name, q) || matches(g.description, q)).forEach(g =>
      found.push({ type: 'grade', id: g.id, title: subMap[g.subjectId]?.name || 'Note', subtitle: `${g.score}/${g.maxScore || 20}`, color: subMap[g.subjectId]?.color, to: '/grades' })
    );

    setResults(found.slice(0, 30));
    setLoading(false);
  }, []);

  return { query, results, loading, search, clear: () => { setQuery(''); setResults([]); } };
}
