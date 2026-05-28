-- ═══════════════════════════════════════════════════════════════════
--  StudyFlow — Supabase schema  (idempotent — safe to re-run)
--  Run this in the Supabase SQL editor (Project > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Extensions ────────────────────────────────────────────────────
create extension if not exists moddatetime schema extensions;

-- ─── Main sync table ───────────────────────────────────────────────
create table if not exists public.studyflow_items (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  store      text    not null,
  id         text    not null,
  data       jsonb   not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, store, id)
);

create index if not exists studyflow_items_user_updated
  on public.studyflow_items (user_id, updated_at desc);

create index if not exists studyflow_items_deleted
  on public.studyflow_items (user_id, store, deleted_at)
  where deleted_at is not null;

create or replace trigger handle_updated_at
  before update on public.studyflow_items
  for each row execute procedure extensions.moddatetime(updated_at);

-- ─── Row Level Security — studyflow_items ──────────────────────────
alter table public.studyflow_items enable row level security;

-- Drop existing policies before recreating (CREATE POLICY has no IF NOT EXISTS)
drop policy if exists "Users read own items"   on public.studyflow_items;
drop policy if exists "Users insert own items" on public.studyflow_items;
drop policy if exists "Users update own items" on public.studyflow_items;
drop policy if exists "Users delete own items" on public.studyflow_items;

create policy "Users read own items"
  on public.studyflow_items for select
  using (auth.uid() = user_id);

create policy "Users insert own items"
  on public.studyflow_items for insert
  with check (auth.uid() = user_id);

create policy "Users update own items"
  on public.studyflow_items for update
  using (auth.uid() = user_id);

create policy "Users delete own items"
  on public.studyflow_items for delete
  using (auth.uid() = user_id);

-- ─── Storage: documents bucket ─────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "Users upload own documents" on storage.objects;
drop policy if exists "Users read own documents"   on storage.objects;
drop policy if exists "Users delete own documents" on storage.objects;

create policy "Users upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users read own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Shared content ────────────────────────────────────────────────
create table if not exists public.shared_content (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null,
  title       text        not null,
  content     jsonb       not null,
  author_name text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);

create index if not exists shared_content_expires
  on public.shared_content (expires_at)
  where expires_at is not null;

alter table public.shared_content enable row level security;

drop policy if exists "Anyone can read shared content"   on public.shared_content;
drop policy if exists "Anyone can create shared content" on public.shared_content;

create policy "Anyone can read shared content"
  on public.shared_content for select
  using (true);

create policy "Anyone can create shared content"
  on public.shared_content for insert
  with check (true);
