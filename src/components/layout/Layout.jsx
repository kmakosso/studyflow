import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Search, LogIn, LogOut, Sun, Moon, X } from 'lucide-react';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import GlobalSearch from '../shared/GlobalSearch';
import SmartBanner from '../shared/SmartBanner';
import SyncBadge from '../shared/SyncBadge';
import AuthModal from '../shared/AuthModal';
import ShortcutsModal from '../shared/ShortcutsModal';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { useAuth } from '../../contexts/AuthContext';
import { startReminderDaemon } from '../../services/notifications';
import { computeStreak } from '../../services/analytics';

/* ── Responsive breakpoint ─────────────────────────────────────── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

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
  const [collapsed,     setCollapsed]     = useState(false);
  const [drawerOpen,    setDrawerOpen]    = useState(false); // mobile drawer
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [authOpen,      setAuthOpen]      = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [theme,         setTheme]         = useState(getSavedTheme);
  const [streak,        setStreak]        = useState(0);
  const [gPressed,      setGPressed]      = useState(false);

  const { focusMode, setFocusMode } = usePomodoro();
  const { user, logout, isConfigured } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isMobile  = useIsMobile();

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  /* ── Apply theme ─────────────────────────────────────────────── */
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) { setShortcutsOpen(o => !o); return; }
    if (e.key === 'Escape') { setSearchOpen(false); setShortcutsOpen(false); setDrawerOpen(false); return; }
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

      {/* ── Desktop sidebar ── */}
      {!isMobile && <Sidebar collapsed={collapsed} />}

      {/* ── Mobile drawer overlay ── */}
      {isMobile && drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 299,
              backgroundColor: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(2px)',
            }}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
            width: 240,
            backgroundColor: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            animation: 'slideInLeft 0.22s ease-out',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 12px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, backgroundColor: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: 12,
                }}>SF</div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>StudyFlow</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 4, cursor: 'pointer', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            <Sidebar collapsed={false} inDrawer />
          </div>
        </>
      )}

      {/* ── Main content area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: isMobile ? '8px 12px' : '10px 16px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {/* Hamburger */}
          <button
            onClick={() => isMobile ? setDrawerOpen(d => !d) : setCollapsed(c => !c)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer', flexShrink: 0 }}
          >
            <Menu size={20} />
          </button>

          {/* Search bar */}
          <button onClick={() => setSearchOpen(true)} style={{
            flex: 1,
            maxWidth: isMobile ? 'none' : 320,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', backgroundColor: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--muted)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
          }}>
            <Search size={14} />
            <span style={{ flex: 1 }}>Rechercher…</span>
            {!isMobile && (
              <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Ctrl K</kbd>
            )}
          </button>

          {/* Right-side controls */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, flexShrink: 0 }}>

            {/* Streak (hidden on mobile to save space) */}
            {!isMobile && <StreakBadge streak={streak} />}

            {/* Dark / light toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer' }}
            >
              {theme === 'dark' ? <Sun size={isMobile ? 18 : 16} /> : <Moon size={isMobile ? 18 : 16} />}
            </button>

            {/* Sync status */}
            {isConfigured && (
              <SyncBadge onClick={user ? undefined : () => setAuthOpen(true)} />
            )}

            {/* User */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata.full_name ?? 'Avatar'}
                    title={user.user_metadata.full_name ?? user.email}
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', cursor: 'default' }}
                  />
                ) : (
                  <div title={user.email} style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, cursor: 'default', flexShrink: 0,
                  }}>
                    {(user.user_metadata?.full_name ?? user.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                {!isMobile && (
                  <button
                    onClick={logout}
                    title="Se déconnecter"
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', padding: 5, borderRadius: 6, display: 'flex', cursor: 'pointer' }}
                  >
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            ) : isConfigured ? (
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isMobile ? '6px 10px' : '6px 12px',
                  borderRadius: 8, background: 'var(--primary)', color: '#fff',
                  border: 'none', fontSize: isMobile ? 12 : 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <LogIn size={14} />
                {!isMobile && 'Connexion'}
              </button>
            ) : null}
          </div>
        </header>

        <SmartBanner />

        {/* Page content */}
        <main
          className="sf-main"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isMobile ? '16px 14px' : '24px 28px',
            paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : undefined,
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      {isMobile && <MobileNav />}

      {/* ── Modals ── */}
      {searchOpen    && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
