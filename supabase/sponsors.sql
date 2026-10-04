-- MINIMSAAH — sponsors (brand logo strip on home page)
-- Run in Supabase Dashboard → SQL Editor AFTER rls.sql (uses public.is_staff()).
-- Public reads active sponsors only. Staff writes. Deletes OWNER/EDITOR only.

create table if not exists public.sponsors (
  id text primary key,
  name text not null,
  logo_url text not null,
  website text,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsors_active_priority_idx on public.sponsors(active, priority);

alter table public.sponsors enable row level security;

drop policy if exists "public_read_active" on public.sponsors;
create policy "public_read_active" on public.sponsors for select using (active = true);

drop policy if exists "staff_read_all" on public.sponsors;
create policy "staff_read_all" on public.sponsors for select using (public.is_staff());

drop policy if exists "staff_insert_sponsors" on public.sponsors;
create policy "staff_insert_sponsors" on public.sponsors for insert with check (public.is_staff());

drop policy if exists "staff_update_sponsors" on public.sponsors;
create policy "staff_update_sponsors" on public.sponsors for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff_delete_sponsors" on public.sponsors;
create policy "staff_delete_sponsors" on public.sponsors for delete using (public.is_owner_editor());

-- No anon delete policy = deletes fail by default. Deletes go via Pages Functions (service_role).

-- Starter brands (local logos, shown until staff uploads own). Max 12 shown on home.
insert into public.sponsors (id, name, logo_url, website, priority, active) values
  ('sponsor-nike', 'Nike', '/assets/img/partners/nike.svg', null, 5, true),
  ('sponsor-adidas', 'Adidas', '/assets/img/partners/adidas.svg', null, 4, true),
  ('sponsor-puma', 'Puma', '/assets/img/partners/puma.svg', null, 3, true),
  ('sponsor-fila', 'Fila', '/assets/img/partners/fila.svg', null, 2, true),
  ('sponsor-under-armour', 'Under Armour', '/assets/img/partners/under-armour.svg', null, 1, true)
on conflict (id) do nothing;
