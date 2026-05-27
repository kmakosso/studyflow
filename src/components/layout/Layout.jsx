import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Search, LogIn, LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import GlobalSearch from '../shared/GlobalSearch';
import SmartBanner from '../shared/SmartBanner';
import SyncBadge from '../shared/SyncBadge';
import AuthModal from '../shared/AuthModal';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { useAuth } from '../../contexts/AuthContext';

export default function Layout() {
  const [collapsed,   setCollapsed]   = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [authOpen,    setAuthOpen]    = useState(false);
  const { focusMode, setFocusMode }   = usePomodoro();
  const { user, logout, isConfigured } = useAuth();

  // Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
            {/* Sync status (only when cloud is configured) */}
            {isConfigured && (
              <SyncBadge onClick={user ? undefined : () => setAuthOpen(true)} />
            )}

            {/* User avatar / sign-in button */}
            {user ? (
              /* Logged-in: avatar + sign-out */
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
              /* Not logged in + Supabase configured: sign-in button */
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

        {/* Smart banners */}
        <SmartBanner />

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <Outlet />
        </main>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
