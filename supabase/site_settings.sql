-- MINIMSAAH — site_settings (editable section titles on home page)
-- Run in Supabase Dashboard → SQL Editor AFTER rls.sql (uses public.is_owner_editor()).
-- Public reads all (titles are public). Only OWNER/EDITOR can write.

create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "public_read_all" on public.site_settings;
create policy "public_read_all" on public.site_settings for select using (true);

drop policy if exists "boss_write_settings" on public.site_settings;
create policy "boss_write_settings" on public.site_settings for insert with check (public.is_owner_editor());

drop policy if exists "boss_update_settings" on public.site_settings;
create policy "boss_update_settings" on public.site_settings for update using (public.is_owner_editor()) with check (public.is_owner_editor());

-- No delete policy = deletes fail by default. Titles are never deleted, only changed.

-- Starter titles (current home words). Max 40 letters each.
insert into public.site_settings (key, value) values
  ('section_featured', 'FEATURED STORY'),
  ('section_videos', 'VIDEO STORIES'),
  ('section_docs', 'DOCUMENTARIES'),
  ('section_news', 'NEWS & ARTICLES'),
  ('section_events', 'EVENTS & PROMOS'),
  ('section_partners', 'PARTNERS')
on conflict (key) do nothing;
