/* ── Student Workspace — Notes, Checklist, Journal, Goals ── */
import { useState, useRef } from 'react';
import {
  FileText, CheckSquare, BookOpen, Target,
  Plus, Trash2, Check, Edit3, Save, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useNotes, useJournal, useGoals, useChecklist } from '../hooks/useWorkspace';

/* ── shared mini-button ── */
const IconBtn = ({ icon: Icon, onClick, color, title }) => (
  <button onClick={onClick} title={title} style={{
    background: 'none', border: 'none', cursor: 'pointer',
    color: color || 'var(--muted)', padding: 4, borderRadius: 6,
    display: 'flex', alignItems: 'center',
    transition: 'color 0.15s',
  }}
    onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
  >
    <Icon size={15} />
  </button>
);

/* ──────────────────────────── NOTES TAB ──────────────────────────── */
function NotesTab() {
  const { notes, save, remove } = useNotes();
  const [editing, setEditing]   = useState(null); // null | { id?, title, content }
  const [search,  setSearch]    = useState('');

  const filtered = notes.filter(n =>
    n.title?.toLowerCase().includes(search.toLowerCase()) ||
    n.content?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew  = () => setEditing({ title: '', content: '' });
  const openEdit = (n) => setEditing({ ...n });
  const cancel   = () => setEditing(null);

  const doSave = async () => {
    if (!editing.title.trim() && !editing.content.trim()) return;
    await save(editing);
    setEditing(null);
  };

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <input
        autoFocus
        value={editing.title}
        onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
        placeholder="Titre de la note…"
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', fontSize: 15, fontWeight: 700,
          color: 'var(--text)', outline: 'none',
        }}
      />
      <textarea
        value={editing.content}
        onChange={e => setEditing(p => ({ ...p, content: e.target.value }))}
        placeholder="Contenu de la note…"
        style={{
          flex: 1, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', fontSize: 13.5, color: 'var(--text)',
          outline: 'none', resize: 'none', lineHeight: 1.6, fontFamily: 'inherit',
          minHeight: 200,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doSave} style={{
          flex: 1, background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Save size={14} /> Enregistrer
        </button>
        <button onClick={cancel} style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer',
          color: 'var(--muted)',
        }}>
          Annuler
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une note…"
          style={{
            flex: 1, background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 12px', fontSize: 13, color: 'var(--text)', outline: 'none',
          }}
        />
        <button onClick={openNew} style={{
          background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Plus size={14} /> Nouvelle
        </button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          <FileText size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Aucune note</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>Crée ta première note pour commencer</p>
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10, alignContent: 'start',
        }}>
          {filtered.map(n => (
            <div key={n.id} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              onClick={() => openEdit(n)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  {n.title || 'Sans titre'}
                </p>
                <IconBtn icon={Trash2} color="var(--danger)"
                  onClick={e => { e.stopPropagation(); remove(n.id); }} title="Supprimer" />
              </div>
              <p style={{
                margin: 0, fontSize: 12, color: 'var(--muted)',
                display: '-webkit-box', WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                lineHeight: 1.5,
              }}>
                {n.content || 'Vide'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                {new Date(n.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── CHECKLIST TAB ──────────────────────────── */
function ChecklistTab() {
  const { items, add, toggle, remove, clearDone, doneCount } = useChecklist();
  const [newText, setNewText] = useState('');
  const inputRef = useRef(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await add(newText.trim());
    setNewText('');
    inputRef.current?.focus();
  };

  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Progress */}
      {items.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Progression du jour</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: progress === 100 ? 'var(--success)' : 'var(--text)' }}>
              {doneCount}/{items.length} · {progress}%
            </span>
          </div>
          <div style={{
            height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width 0.4s',
              width: `${progress}%`,
              background: progress === 100 ? 'var(--success)' : 'var(--primary)',
            }} />
          </div>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="Ajouter une tâche pour aujourd'hui…"
          style={{
            flex: 1, background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', fontSize: 13.5, color: 'var(--text)', outline: 'none',
          }}
        />
        <button type="submit" style={{
          background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Plus size={14} /> Ajouter
        </button>
      </form>

      {/* List */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>
          <CheckSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Aucune tâche aujourd'hui</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '9px 12px',
              opacity: item.done ? 0.6 : 1, transition: 'opacity 0.2s',
            }}>
              <button onClick={() => toggle(item.id)} style={{
                width: 20, height: 20, borderRadius: 6, border: '2px solid',
                borderColor: item.done ? 'var(--success)' : 'var(--border)',
                background: item.done ? 'var(--success)' : 'none',
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {item.done && <Check size={11} color="white" strokeWidth={3} />}
              </button>
              <span style={{
                flex: 1, fontSize: 13.5, color: 'var(--text)',
                textDecoration: item.done ? 'line-through' : 'none',
              }}>
                {item.text}
              </span>
              <IconBtn icon={Trash2} color="var(--danger)" onClick={() => remove(item.id)} title="Supprimer" />
            </div>
          ))}
        </div>
      )}

      {doneCount > 0 && (
        <button onClick={clearDone} style={{
          background: 'none', border: '1px dashed var(--border)',
          borderRadius: 8, padding: '7px', fontSize: 12, color: 'var(--muted)',
          cursor: 'pointer', width: '100%',
        }}>
          Effacer les tâches terminées ({doneCount})
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────── JOURNAL TAB ──────────────────────────── */
function JournalTab() {
  const { entries, saveEntry, getTodayEntry, remove, today } = useJournal();
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState('');
  const [mood,     setMood]     = useState('😐');
  const [expanded, setExpanded] = useState(null);

  const MOODS = ['😃', '🙂', '😐', '😕', '😩'];

  const todayEntry = getTodayEntry();

  const openToday = () => {
    setDraft(todayEntry?.content || '');
    setMood(todayEntry?.mood || '😐');
    setEditing(true);
  };

  const doSave = async () => {
    if (!draft.trim()) return;
    const entry = { ...(todayEntry || {}), date: today, content: draft, mood };
    await saveEntry(entry);
    setEditing(false);
  };

  const pastEntries = entries.filter(e => e.date !== today);

  if (editing) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
          Comment tu te sens aujourd'hui ?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {MOODS.map(m => (
            <button key={m} onClick={() => setMood(m)} style={{
              fontSize: 22, background: mood === m ? 'var(--card)' : 'none',
              border: mood === m ? '2px solid var(--primary)' : '2px solid transparent',
              borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}>{m}</button>
          ))}
        </div>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Qu'est-ce qui s'est passé aujourd'hui ? Qu'as-tu appris ? Comment tu te sens ?"
        rows={8}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', fontSize: 13.5, color: 'var(--text)',
          outline: 'none', resize: 'none', lineHeight: 1.65, fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doSave} style={{
          flex: 1, background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 8, padding: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Save size={14} /> Enregistrer
        </button>
        <button onClick={() => setEditing(false)} style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)',
        }}>Annuler</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Today card */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 14 }}>
              {todayEntry ? `${todayEntry.mood} Entrée d'aujourd'hui` : "📝 Aujourd'hui"}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={openToday} style={{
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Edit3 size={13} /> {todayEntry ? 'Modifier' : 'Écrire'}
          </button>
        </div>
        {todayEntry && (
          <p style={{
            margin: '10px 0 0', fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {todayEntry.content}
          </p>
        )}
      </div>

      {/* Past entries */}
      {pastEntries.length > 0 && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700,
            color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Entrées précédentes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pastEntries.map(e => (
              <div key={e.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{e.mood || '📖'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {new Date(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IconBtn icon={Trash2} color="var(--danger)" onClick={ev => { ev.stopPropagation(); remove(e.id); }} title="Supprimer" />
                    {expanded === e.id ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                  </div>
                </div>
                {expanded === e.id && (
                  <p style={{
                    margin: 0, padding: '0 14px 12px', fontSize: 13,
                    color: 'var(--text)', lineHeight: 1.65, borderTop: '1px solid var(--border)',
                    paddingTop: 10,
                  }}>
                    {e.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pastEntries.length === 0 && !todayEntry && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>
          <BookOpen size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Aucune entrée de journal</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>Commence à écrire pour suivre ton parcours</p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── GOALS TAB ──────────────────────────── */
function GoalsTab() {
  const { goals, save, toggle, remove } = useGoals();
  const [form, setForm]   = useState(null); // null | { title, type, deadline }
  const TYPES = [
    { value: 'weekly',   label: 'Cette semaine' },
    { value: 'monthly',  label: 'Ce mois'       },
    { value: 'semester', label: 'Ce semestre'   },
    { value: 'custom',   label: 'Autre'         },
  ];

  const openNew  = () => setForm({ title: '', type: 'weekly', deadline: '' });
  const doSave   = async () => {
    if (!form.title.trim()) return;
    await save(form);
    setForm(null);
  };

  const byType = TYPES.map(t => ({
    ...t, items: goals.filter(g => g.type === t.value),
  })).filter(t => t.items.length > 0 || form?.type === t.value);

  const totalDone = goals.filter(g => g.done).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {goals.length === 0 ? 'Définis tes objectifs' : `${totalDone}/${goals.length} objectifs accomplis`}
          </p>
        </div>
        <button onClick={openNew} style={{
          background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Plus size={13} /> Nouvel objectif
        </button>
      </div>

      {/* New goal form */}
      {form && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--primary)',
          borderRadius: 10, padding: '14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="Décris ton objectif…"
            style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 10px', fontSize: 13.5, color: 'var(--text)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              style={{
                flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none',
              }}
            >
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              type="date"
              value={form.deadline}
              onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
              style={{
                flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doSave} style={{
              flex: 1, background: 'var(--primary)', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Enregistrer
            </button>
            <button onClick={() => setForm(null)} style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)',
            }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Groups */}
      {byType.length === 0 && !form && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
          <Target size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Aucun objectif défini</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>Crée un objectif pour rester motivé·e</p>
        </div>
      )}

      {TYPES.map(t => {
        const typeGoals = goals.filter(g => g.type === t.value);
        if (typeGoals.length === 0) return null;
        return (
          <div key={t.value}>
            <p style={{
              margin: '0 0 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {t.label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {typeGoals.map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px',
                  opacity: g.done ? 0.6 : 1, transition: 'opacity 0.2s',
                }}>
                  <button onClick={() => toggle(g.id)} style={{
                    width: 20, height: 20, borderRadius: '50%', border: '2px solid',
                    borderColor: g.done ? 'var(--success)' : 'var(--border)',
                    background: g.done ? 'var(--success)' : 'none',
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {g.done && <Check size={10} color="white" strokeWidth={3} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      margin: 0, fontSize: 13.5, color: 'var(--text)',
                      textDecoration: g.done ? 'line-through' : 'none',
                    }}>
                      {g.title}
                    </p>
                    {g.deadline && (
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                        Échéance : {new Date(g.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                  <IconBtn icon={Trash2} color="var(--danger)" onClick={() => remove(g.id)} title="Supprimer" />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── MAIN PAGE ──────────────────────────── */
const TABS = [
  { id: 'notes',     icon: FileText,    label: 'Notes'      },
  { id: 'checklist', icon: CheckSquare, label: 'Checklist'  },
  { id: 'journal',   icon: BookOpen,    label: 'Journal'    },
  { id: 'goals',     icon: Target,      label: 'Objectifs'  },
];

export default function Workspace() {
  const [active, setActive] = useState('checklist');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800 }}>Espace de travail</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Notes, liste du jour, journal personnel et objectifs — tout hors-ligne.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 4,
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: active === t.id ? 'var(--primary)' : 'none',
            color: active === t.id ? 'white' : 'var(--muted)',
            transition: 'background 0.15s, color 0.15s',
          }}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {active === 'notes'     && <NotesTab />}
        {active === 'checklist' && <ChecklistTab />}
        {active === 'journal'   && <JournalTab />}
        {active === 'goals'     && <GoalsTab />}
      </div>
    </div>
  );
}
