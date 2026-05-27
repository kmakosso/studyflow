import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, Search, LogIn, LogOut, Sun, Moon, Keyboard } from 'lucide-react';
import Sidebar from './Sidebar';
import GlobalSearch from '../shared/GlobalSearch';
import SmartBanner from '../shared/SmartBanner';
import SyncBadge from '../shared/SyncBadge';
import AuthModal from '../shared/AuthModal';
import ShortcutsModal from '../shared/ShortcutsModal';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { useAuth } from '../../contexts/AuthContext';
import { startReminderDaemon } from '../../services/notifications';
import { computeStreak } from '../../services/analytics';

/* ── Theme helpers ───────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
}
function getSavedTheme() {
  return localStorage.getItem('sf_theme') || 'dark';
}

/* ── Streak badge ────────────────────────────────────────────────── */
function StreakBadge({ streak }) {
  if (streak < 1) return null;
  return (
    <div title={`${streak} jour${streak > 1 ? 's' : ''} consécutif${streak > 1 ? 's' : ''} d'étude`} style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44',
      fontSize: 12, fontWeight: 700, color: '#f59e0b',
      cursor: 'default', userSelect: 'none',
    }}>
      🔥 {streak}
    </div>
  );
}

export default function Layout() {
  const [collapsed,      setCollapsed]      = useState(false);
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [authOpen,       setAuthOpen]       = useState(false);
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false);
  const [theme,          setTheme]          = useState(getSavedTheme);
  const [streak,         setStreak]         = useState(0);
  const [gPressed,       setGPressed]       = useState(false); // for g+key nav

  const { focusMode, setFocusMode } = usePomodoro();
  const { user, logout, isConfigured } = useAuth();
  const navigate = useNavigate();

  /* ── Apply theme on mount and change ─────────────────────────── */
  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sf_theme', next);
  };

  /* ── Reminder daemon ─────────────────────────────────────────── */
  useEffect(() => startReminderDaemon(), []);

  /* ── Streak ─────────────────────────────────────────────────── */
  useEffect(() => { computeStreak().then(setStreak); }, []);

  /* ── Keyboard shortcuts ─────────────────────────────────────── */
  const NAV_SHORTCUTS = {
    d: '/', r: '/revision', p: '/pomodoro',
    a: '/analytics', l: '/library', e: '/exams',
    s: '/schedule', h: '/assignments', n: '/reminders',
  };

  const handleKeyDown = useCallback((e) => {
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    // Ctrl+K — search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); setSearchOpen(true); return;
    }

    // ? — shortcuts help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      setShortcutsOpen(o => !o); return;
    }

    // Esc — close modals
    if (e.key === 'Escape') {
      setSearchOpen(false); setShortcutsOpen(false); return;
    }

    // g + letter — navigate
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      setGPressed(true);
      setTimeout(() => setGPressed(false), 1500);
      return;
    }
    if (gPressed && NAV_SHORTCUTS[e.key]) {
      e.preventDefault();
      navigate(NAV_SHORTCUTS[e.key]);
      setGPressed(false);
    }
  }, [gPressed, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /* ── Focus mode ─────────────────────────────────────────────── */
  if (focusMode) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        backgroundColor: '#08080e',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <Outlet />
        <button
          onClick={() => setFocusMode(false)}
          style={{
            position: 'fixed', top: 16, right: 16,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--muted)', borderRadius: 8, padding: '6px 14px',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          ✕ Quitter le focus
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
      <Sidebar collapsed={collapsed} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button onClick={() => setCollapsed(c => !c)} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer',
          }}>
            <Menu size={20} />
          </button>

          {/* Search bar */}
          <button onClick={() => setSearchOpen(true)} style={{
            flex: 1, maxWidth: 320, display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', backgroundColor: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
          }}>
            <Search size={14} />
            <span style={{ flex: 1 }}>Rechercher…</span>
            <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Ctrl K</kbd>
          </button>

          {/* Right-side controls */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>

            {/* Streak badge */}
            <StreakBadge streak={streak} />

            {/* Shortcuts help */}
            <button
              onClick={() => setShortcutsOpen(true)}
              title="Raccourcis clavier (?)"
              style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer' }}
            >
              <Keyboard size={16} />
            </button>

            {/* Dark / light toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer' }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Sync status */}
            {isConfigured && (
              <SyncBadge onClick={user ? undefined : () => setAuthOpen(true)} />
            )}

            {/* User */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata.full_name ?? 'Avatar'}
                    title={user.user_metadata.full_name ?? user.email}
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover',
                      border: '2px solid var(--border)', cursor: 'default' }}
                  />
                ) : (
                  <div title={user.email} style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, cursor: 'default',
                  }}>
                    {(user.user_metadata?.full_name ?? user.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  onClick={logout}
                  title="Se déconnecter"
                  style={{
                    background: 'none', border: 'none', color: 'var(--muted)',
                    padding: 5, borderRadius: 6, display: 'flex', cursor: 'pointer',
                  }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : isConfigured ? (
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  background: 'var(--primary)', color: '#fff',
                  border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <LogIn size={14} /> Connexion
              </button>
            ) : null}
          </div>
        </header>

        <SmartBanner />

        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <Outlet />
        </main>
      </div>

      {searchOpen    && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
