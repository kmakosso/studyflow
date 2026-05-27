/* ── SyncBadge.jsx — Cloud sync status indicator ────────────────────
 *
 * Shows a small cloud icon with colour-coded status:
 *   idle     → green  (synced)
 *   syncing  → blue   (animated pulse)
 *   error    → red    (click to retry)
 *   offline  → grey   (no cloud / not logged in)
 *
 * Clicking the badge triggers an immediate flush (if logged in).
 */

import { Cloud, CloudOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_COLORS = {
  idle:    '#22c55e',
  syncing: '#7c6af7',
  error:   '#ef4444',
  offline: 'var(--muted)',
};

const STATUS_LABELS = {
  idle:    'Synchronisé',
  syncing: 'Synchronisation…',
  error:   'Erreur de sync — cliquer pour réessayer',
  offline: 'Mode hors ligne',
};

export default function SyncBadge({ onClick }) {
  const { syncStatus, syncNow, isConfigured } = useAuth();

  const color = STATUS_COLORS[syncStatus] ?? STATUS_COLORS.offline;
  const label = STATUS_LABELS[syncStatus] ?? '';

  const handleClick = () => {
    if (syncStatus === 'error' || syncStatus === 'idle') syncNow?.();
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      title={label}
      aria-label={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 6px',
        borderRadius: 7,
        color,
        transition: 'opacity 0.2s',
        opacity: 0.9,
      }}
    >
      {syncStatus === 'offline' || !isConfigured
        ? <CloudOff size={16}/>
        : (
          <Cloud
            size={16}
            style={{
              animation: syncStatus === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          />
        )
      }
      {/* Dot indicator */}
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: syncStatus === 'syncing' ? `0 0 6px ${color}` : 'none',
        animation: syncStatus === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none',
      }}/>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </button>
  );
}
