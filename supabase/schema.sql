-- ═══════════════════════════════════════════════════════════════════
--  StudyFlow — Supabase schema
--  Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Extensions ────────────────────────────────────────────────────
-- pgcrypto for gen_random_uuid() (available by default on Supabase)
-- moddatetime for auto-updating updated_at trigger
create extension if not exists moddatetime schema extensions;

-- ─── Main sync table ───────────────────────────────────────────────
-- One row per (user, store, item). The entire item is stored as JSONB
-- so we never need to run a migration when local stores evolve.
-- Soft-delete: deleted_at is set instead of dropping rows, so every
-- device can learn about deletions on next pull.

create table if not exists public.studyflow_items (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  store      text    not null,   -- IndexedDB store name, e.g. 'subjects', 'courses'
  id         text    not null,   -- item id (UUID string)
  data       jsonb   not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,        -- null = alive; non-null = soft-deleted
  primary key (user_id, store, id)
);

-- Index for efficient per-user pulls (ordered by updated_at for incremental sync)
create index if not exists studyflow_items_user_updated
  on public.studyflow_items (user_id, updated_at desc);

-- Index for efficient deleted-item cleanup queries
create index if not exists studyflow_items_deleted
  on public.studyflow_items (user_id, store, deleted_at)
  where deleted_at is not null;

-- Auto-update updated_at on any row change
create or replace trigger handle_updated_at
  before update on public.studyflow_items
  for each row execute procedure extensions.moddatetime(updated_at);

-- ─── Row Level Security ─────────────────────────────────────────────
alter table public.studyflow_items enable row level security;

-- Users can only read their own rows
create policy "Users read own items"
  on public.studyflow_items for select
  using (auth.uid() = user_id);

-- Users can insert rows for themselves only
create policy "Users insert own items"
  on public.studyflow_items for insert
  with check (auth.uid() = user_id);

-- Users can update their own rows
create policy "Users update own items"
  on public.studyflow_items for update
  using (auth.uid() = user_id);

-- Users can hard-delete their own rows (used only for purge, not normal sync)
create policy "Users delete own items"
  on public.studyflow_items for delete
  using (auth.uid() = user_id);

-- ─── Storage: documents bucket ─────────────────────────────────────
-- Files uploaded to the Library (PDFs, images) are stored here.
-- Path convention: {user_id}/{document_id}/{filename}

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Upload: users can only upload under their own folder
create policy "Users upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: users can only read their own files
create policy "Users read own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: users can delete their own files
create policy "Users delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Shared content (flashcard sharing) ───────────────────────────
-- Public table — no user_id. Anyone with the UUID can read the row.
-- Inserts are allowed to any authenticated or anonymous user (anon key).
-- Rows auto-expire after 30 days (enforced at app level too).

create table if not exists public.shared_content (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null,          -- 'flashcards'
  title       text        not null,
  content     jsonb       not null,          -- { cards: [{front, back}] }
  author_name text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

-- Index for fast lookup by id (already indexed as PK)
-- Index to let a cron job purge expired rows efficiently
create index if not exists shared_content_expires
  on public.shared_content (expires_at)
  where expires_at is not null;

alter table public.shared_content enable row level security;

-- Anyone (including anon) can read shared content
create policy "Anyone can read shared content"
  on public.shared_content for select
  using (true);

-- Anyone (including anon key) can create a share — no auth required
create policy "Anyone can create shared content"
  on public.shared_content for insert
  with check (true);

-- Optional cron to purge expired shares:
-- select cron.schedule(
--   'purge-expired-shares',
--   '0 4 * * *',   -- daily at 4 AM
--   $$
--     delete from public.shared_content
--     where expires_at < now();
--   $$
-- );

-- ─── Helper: purge old soft-deleted rows (optional cron) ───────────
-- You can schedule this in Supabase Cron (or pg_cron) to keep the
-- table tidy. Removes rows soft-deleted more than 90 days ago.
--
-- select cron.schedule(
--   'purge-deleted-items',
--   '0 3 * * 0',   -- every Sunday at 3 AM
--   $$
--     delete from public.studyflow_items
--     where deleted_at < now() - interval '90 days';
--   $$
-- );
