import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Push a set of revision cards to the public shared_content table.
 * Returns the share UUID on success.
 */
export async function shareRevisionCards(cards, title, authorName = '') {
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');

  const payload = cards.map(c => ({ front: c.front, back: c.back }));

  const { data, error } = await supabase
    .from('shared_content')
    .insert({
      type:        'flashcards',
      title:       title || 'Fiches de révision',
      content:     { cards: payload },
      author_name: authorName.trim() || null,
      expires_at:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Fetch shared content by ID (no auth required).
 * Returns null if not found or expired.
 */
export async function getSharedContent(shareId) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('shared_content')
    .select('id, type, title, content, author_name, created_at, expires_at')
    .eq('id', shareId)
    .single();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data;
}
