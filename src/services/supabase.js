/* ── supabase.js — Supabase client with graceful degradation ─────────
 *
 * If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent the app
 * runs in pure offline mode: isConfigured = false, every exported
 * function is a safe no-op or returns null.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL  || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/** True only when both env vars are present and non-empty */
export const isSupabaseConfigured =
  !!SUPABASE_URL && !!SUPABASE_ANON_KEY &&
  SUPABASE_URL !== 'https://votre-projet.supabase.co';

/** The live Supabase client — only use after checking isSupabaseConfigured */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession:    true,
        autoRefreshToken:  true,
        detectSessionInUrl: true,
      },
      realtime: { enabled: false }, // we use polling sync, not realtime
    })
  : null;

/* ─── Storage helpers ────────────────────────────────────────────── */

/**
 * Upload a file to the documents bucket.
 * Path: {userId}/{documentId}/{filename}
 * Returns the storage path string, or null on failure / not configured.
 */
export async function uploadDocument(userId, documentId, file) {
  if (!isSupabaseConfigured) return null;
  const path = `${userId}/${documentId}/${file.name}`;
  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: true });
  if (error) { console.warn('[supabase] upload error', error); return null; }
  return path;
}

/**
 * Get a signed URL for a stored document (valid for 1 hour).
 */
export async function getDocumentUrl(storagePath) {
  if (!isSupabaseConfigured || !storagePath) return null;
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600);
  if (error) { console.warn('[supabase] signed URL error', error); return null; }
  return data?.signedUrl ?? null;
}

/**
 * Delete a stored document from the bucket.
 */
export async function deleteDocument(storagePath) {
  if (!isSupabaseConfigured || !storagePath) return;
  await supabase.storage.from('documents').remove([storagePath]);
}
