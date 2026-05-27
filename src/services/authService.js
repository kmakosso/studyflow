/* ── authService.js — Auth operations wrapping Supabase ─────────────
 *
 * All functions are safe no-ops when Supabase is not configured.
 * The caller (AuthContext) checks isSupabaseConfigured before
 * calling sign-in methods and shows appropriate UI.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/* ─── Sign-in methods ────────────────────────────────────────────── */

/**
 * OAuth sign-in with Google.
 * Redirects the browser to Google consent then back to the app.
 */
export async function signInWithGoogle() {
  if (!isSupabaseConfigured) throw new Error('NOT_CONFIGURED');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

/**
 * OAuth sign-in with GitHub.
 */
export async function signInWithGitHub() {
  if (!isSupabaseConfigured) throw new Error('NOT_CONFIGURED');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
}

/**
 * Passwordless sign-in via magic link (email OTP).
 * @param {string} email
 */
export async function signInWithMagicLink(email) {
  if (!isSupabaseConfigured) throw new Error('NOT_CONFIGURED');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

/**
 * Sign out of Supabase (clears session; local data is untouched).
 */
export async function signOut() {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.auth.signOut();
}

/* ─── Session / user helpers ─────────────────────────────────────── */

/**
 * Returns the current Supabase session, or null.
 */
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

/**
 * Returns the current Supabase user, or null.
 */
export async function getUser() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Subscribe to auth state changes.
 * Returns the unsubscribe function.
 * @param {(event: string, session: Session|null) => void} callback
 */
export function onAuthChange(callback) {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}
