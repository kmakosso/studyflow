import { useState, useEffect } from 'react';
import { X, AlertTriangle, Info, Zap } from 'lucide-react';
import { getSmartAlerts } from '../../services/smartNotifications';

const LEVEL_STYLES = {
  critical: { bg: '#ef444418', border: '#ef444440', color: 'var(--danger)',  Icon: Zap },
  warning:  { bg: '#f59e0b18', border: '#f59e0b40', color: 'var(--warning)', Icon: AlertTriangle },
  info:     { bg: '#3b82f618', border: '#3b82f640', color: 'var(--info)',    Icon: Info },
};

export default function SmartBanner() {
  const [alerts, setAlerts]     = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('sf_dismissed') || '[]')); }
    catch { return new Set(); }
  });

  useEffect(() => {
    getSmartAlerts().then(setAlerts);
  }, []);

  const dismiss = (id) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem('sf_dismissed', JSON.stringify([...next]));
  };

  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 16px 0' }}>
      {visible.map(alert => {
        const s = LEVEL_STYLES[alert.level] || LEVEL_STYLES.info;
        const { Icon } = s;
        return (
          <div key={alert.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 10,
            backgroundColor: s.bg, border: `1px solid ${s.border}`,
          }}>
            <Icon size={14} color={s.color} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: s.color, fontWeight: 500 }}>
              {alert.icon} {alert.message}
            </span>
            <button onClick={() => dismiss(alert.id)} style={{
              background: 'none', border: 'none', color: s.color,
              cursor: 'pointer', display: 'flex', padding: 2, opacity: 0.7,
            }}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
