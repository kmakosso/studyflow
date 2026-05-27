import { useState, useEffect } from 'react';
import { Plus, Trash2, Bell, BellOff, BellRing } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useReminders } from '../hooks/useReminders';
import { notif } from '../services/notifications';
import Modal from '../components/shared/Modal';

function ReminderForm({ onSubmit, onCancel }) {
  const [v, setV] = useState({
    message:  '',
    datetime: '',
    type:     'free',
  });
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.message.trim() && v.datetime) onSubmit(v); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Message *</label>
        <input value={v.message} onChange={set('message')} placeholder="ex : Réviser les réseaux" required />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date et heure *</label>
          <input type="datetime-local" value={v.datetime} onChange={set('datetime')} required />
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select value={v.type} onChange={set('type')}>
            <option value="free">Libre</option>
            <option value="assignment">Devoir</option>
            <option value="exam">Examen</option>
            <option value="course">Cours</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn-primary">Ajouter</button>
      </div>
    </form>
  );
}

const TYPE_ICONS = { free: '🔔', assignment: '📝', exam: '📚', course: '🏫' };
const TYPE_LABELS = { free: 'Libre', assignment: 'Devoir', exam: 'Examen', course: 'Cours' };

export default function Reminders() {
  const { reminders, loading, add, remove, update } = useReminders();
  const [open, setOpen]   = useState(false);
  const [permission, setPermission] = useState(notif.permission);

  useEffect(() => {
    notif.request().then(p => setPermission(p));
  }, []);

  const upcoming  = reminders.filter(r => !r.triggered).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const triggered = reminders.filter(r => r.triggered).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

  const now = new Date();
  const isOverdue = (r) => new Date(r.datetime) < now;

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <h1 className="page-title">Rappels</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {permission !== 'granted' && (
            <button className="btn-ghost" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => notif.request().then(p => setPermission(p))}>
              <Bell size={14} /> Activer les notifs
            </button>
          )}
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setOpen(true)}>
            <Plus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {/* Permission banner */}
      {permission === 'denied' && (
        <div style={{ padding: '10px 14px', backgroundColor: '#ef444422', border: '1px solid #ef444433', borderRadius: 10, marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
          ⚠️ Les notifications sont bloquées. Autorisez-les dans les paramètres de votre navigateur.
        </div>
      )}
      {permission === 'granted' && (
        <div style={{ padding: '8px 14px', backgroundColor: '#22c55e22', border: '1px solid #22c55e33', borderRadius: 10, marginBottom: 16, fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <BellRing size={13} /> Notifications activées
        </div>
      )}

      {loading ? <p style={{ color: 'var(--muted)' }}>Chargement…</p> :
       reminders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)' }}>Aucun rappel programmé.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {upcoming.length > 0 && (
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                À venir ({upcoming.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcoming.map(r => (
                  <div key={r.id} className="card card-hover" style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    borderLeft: `3px solid ${isOverdue(r) ? 'var(--danger)' : 'var(--primary)'}`,
                  }}>
                    <span style={{ fontSize: 20 }}>{TYPE_ICONS[r.type] || '🔔'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 500, fontSize: 14 }}>{r.message}</p>
                      <p style={{ fontSize: 12, color: isOverdue(r) ? 'var(--danger)' : 'var(--muted)', marginTop: 2 }}>
                        {format(new Date(r.datetime), "d MMMM 'à' HH:mm", { locale: fr })}
                        {isOverdue(r) && ' — en attente de déclenchement'}
                      </p>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 12, backgroundColor: 'var(--border)', color: 'var(--muted)' }}>
                        {TYPE_LABELS[r.type] || 'Libre'}
                      </span>
                    </div>
                    <button onClick={() => confirm('Supprimer ce rappel ?') && remove(r.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {triggered.length > 0 && (
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Déclenchés ({triggered.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {triggered.slice(0, 10).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: 'var(--surface)', borderRadius: 10, opacity: 0.6 }}>
                    <BellOff size={14} color="var(--muted)" />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: 'var(--muted)' }}>{r.message}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>{format(new Date(r.datetime), "d MMM HH:mm", { locale: fr })}</p>
                    </div>
                    <button onClick={() => remove(r.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nouveau rappel">
        <ReminderForm onSubmit={async (data) => { await add(data); setOpen(false); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
