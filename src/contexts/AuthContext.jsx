/* ── AuthContext.jsx — Global auth + sync state ──────────────────────
 *
 * Provides:
 *   user          — Supabase User | null
 *   syncStatus    — 'idle' | 'syncing' | 'error' | 'offline'
 *   isConfigured  — true when Supabase env vars are present
 *   signInGoogle / signInGitHub / signInMagicLink / signOut
 *
 * When the user logs in for the first time we push all local data to
 * the cloud. On every subsequent login we pull remote changes first.
 */

import {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import {
  signInWithGoogle, signInWithGitHub, signInWithMagicLink,
  signOut as sbSignOut, onAuthChange, getSession,
} from '../services/authService';
import { isSupabaseConfigured } from '../services/supabase';
import { syncEngine, onSyncStatus } from '../services/syncEngine';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline');
  const [loading,    setLoading]    = useState(true);

  /* ── Subscribe to sync-engine status ──────────────────────────── */
  useEffect(() => {
    const unsub = onSyncStatus(setSyncStatus);
    return unsub;
  }, []);

  /* ── Auth state listener ──────────────────────────────────────── */
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setSyncStatus('offline');
      return;
    }

    // Restore session on mount
    getSession().then(session => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) _handleLogin(u, false);
      setLoading(false);
    });

    // Listen for future auth changes
    const unsub = onAuthChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === 'SIGNED_IN')  _handleLogin(u, true);
      if (event === 'SIGNED_OUT') _handleLogout();
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Login: init sync engine ──────────────────────────────────── */
  async function _handleLogin(u, isNewLogin) {
    await syncEngine.init(u.id);
    if (isNewLogin) {
      // Push any data written while offline before pulling
      await syncEngine.pushAll();
    }
  }

  function _handleLogout() {
    syncEngine.stop();
    setSyncStatus('offline');
  }

  /* ── Public sign-in helpers ───────────────────────────────────── */
  const loginGoogle = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const loginGitHub = useCallback(async () => {
    await signInWithGitHub();
  }, []);

  const loginMagicLink = useCallback(async (email) => {
    await signInWithMagicLink(email);
  }, []);

  const logout = useCallback(async () => {
    await sbSignOut();
  }, []);

  const value = {
    user,
    syncStatus,
    loading,
    isConfigured: isSupabaseConfigured,
    loginGoogle,
    loginGitHub,
    loginMagicLink,
    logout,
    syncNow: () => syncEngine.flush(),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
