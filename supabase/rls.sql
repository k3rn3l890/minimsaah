-- MINIMSAAH — Supabase RLS for beta (Pages + Supabase direct)
-- Run in Supabase Dashboard → SQL Editor. Single project holds DB+Storage.
-- Roles stored in auth.users.user_metadata.role: OWNER, EDITOR, JOURNALIST, VIDEOGRAPHER, SUBSCRIBER

-- 1. Enable RLS
alter table public.users enable row level security;
alter table public.articles enable row level security;
alter table public.videos enable row level security;
alter table public.documentaries enable row level security;
alter table public.events enable row level security;
alter table public.tickers enable row level security;
alter table public.media enable row level security;
alter table public.sessions enable row level security;
-- sessions: deny-all via PostgREST (no policies). Direct Postgres (Prisma/local
-- dev) bypasses RLS so backend register/login/refresh/logout keep working.

-- 2. Helper: is staff (owner/editor/journalist/videographer)
create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') in ('OWNER','EDITOR','JOURNALIST','VIDEOGRAPHER'), false);
$$;

create or replace function public.is_owner_editor()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') in ('OWNER','EDITOR'), false);
$$;

-- 3. Public read: PUBLISHED only
drop policy if exists "public_read_published" on public.articles;
create policy "public_read_published" on public.articles for select using (status = 'PUBLISHED');

drop policy if exists "public_read_published" on public.videos;
create policy "public_read_published" on public.videos for select using (status = 'PUBLISHED');

drop policy if exists "public_read_published" on public.documentaries;
create policy "public_read_published" on public.documentaries for select using (status = 'PUBLISHED');

drop policy if exists "public_read_published" on public.events;
create policy "public_read_published" on public.events for select using (status = 'PUBLISHED');

drop policy if exists "public_read_active" on public.tickers;
create policy "public_read_active" on public.tickers for select using (active = true);

drop policy if exists "staff_read_all" on public.articles;
create policy "staff_read_all" on public.articles for select using (public.is_staff());

drop policy if exists "staff_read_all" on public.videos;
create policy "staff_read_all" on public.videos for select using (public.is_staff());

drop policy if exists "staff_read_all" on public.documentaries;
create policy "staff_read_all" on public.documentaries for select using (public.is_staff());

drop policy if exists "staff_read_all" on public.events;
create policy "staff_read_all" on public.events for select using (public.is_staff());

drop policy if exists "staff_read_all" on public.tickers;
create policy "staff_read_all" on public.tickers for select using (public.is_staff());

-- 4. Writes: staff via anon key (fast path for beta)
drop policy if exists "staff_insert" on public.articles;
create policy "staff_insert" on public.articles for insert with check (public.is_staff());

drop policy if exists "staff_update" on public.articles;
create policy "staff_update" on public.articles for update using (public.is_staff());

drop policy if exists "staff_insert" on public.videos;
create policy "staff_insert" on public.videos for insert with check (public.is_staff());

drop policy if exists "staff_update" on public.videos;
create policy "staff_update" on public.videos for update using (public.is_staff());

drop policy if exists "staff_insert" on public.documentaries;
create policy "staff_insert" on public.documentaries for insert with check (public.is_staff());

drop policy if exists "staff_update" on public.documentaries;
create policy "staff_update" on public.documentaries for update using (public.is_staff());

drop policy if exists "staff_insert" on public.events;
create policy "staff_insert" on public.events for insert with check (public.is_staff());

drop policy if exists "staff_update" on public.events;
create policy "staff_update" on public.events for update using (public.is_staff());

drop policy if exists "staff_write_tickers" on public.tickers;
-- Split: INSERT/UPDATE stay staff-wide (ticker add/toggle for all staff roles);
-- DELETE restricted to OWNER/EDITOR. No anon delete, matching other tables.
drop policy if exists "staff_insert_tickers" on public.tickers;
create policy "staff_insert_tickers" on public.tickers for insert with check (public.is_staff());

drop policy if exists "staff_update_tickers" on public.tickers;
create policy "staff_update_tickers" on public.tickers for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff_delete_tickers" on public.tickers;
create policy "staff_delete_tickers" on public.tickers for delete using (public.is_owner_editor());

-- 4b. Media library rows: staff-only (no anon access — public pages use
-- bucket URLs directly, never this table). No delete policy: beta lock,
-- deletes go via Pages Functions (service_role).
drop policy if exists "staff_read_media" on public.media;
create policy "staff_read_media" on public.media for select using (public.is_staff());

drop policy if exists "staff_insert_media" on public.media;
create policy "staff_insert_media" on public.media for insert with check (public.is_staff());

drop policy if exists "staff_update_media" on public.media;
create policy "staff_update_media" on public.media for update using (public.is_staff()) with check (public.is_staff());

-- 5. Deletes + role changes: BLOCKED via anon, must go via Pages Functions (service_role)
-- No delete policy for anon = deletes fail by default. Functions use service_role to delete.

-- 6. Profiles: users can read own profile, staff can read all
drop policy if exists "own_profile" on public.users;
create policy "own_profile" on public.users for select using (auth.uid()::text = id or public.is_staff());

drop policy if exists "staff_update_users" on public.users;
-- WITH CHECK mirrors USING (both are JWT predicates against the caller).
-- Role changes are locked separately by the lock_user_role trigger below
-- (NEW/OLD are only legal inside triggers, never in policy expressions).
create policy "staff_update_users" on public.users for update using (public.is_owner_editor()) with check (public.is_owner_editor());

-- Own-profile edit: any authenticated user may update ONLY their own row.
-- Role/status escalation stays impossible: the trigger below blocks role
-- changes (non-OWNER) and self-status changes (non-OWNER/service_role).
-- Shipping atomically with the trigger extension is mandatory.
drop policy if exists "own_profile_update" on public.users;
create policy "own_profile_update" on public.users for update to authenticated using (auth.uid()::text = id) with check (auth.uid()::text = id);

-- Role-escalation lock: the ONLY writer of public.users.role via anon key
-- paths is nonexistent in-app (role changes go through service_role
-- auth-migrate/Functions, which bypass RLS but NOT triggers). Fires only
-- when role actually changes, so status-only updates (e.g. suspend) pass
-- through untouched. Allows service_role + OWNER JWT, nobody else.
-- Self-status lock: a user may not change their OWN status (would allow
-- self-unsuspend); OWNER suspending OTHERS still passes (OLD.id is not self).
-- Direct-DB writes (NULL JWT: Prisma local dev, SQL editor, pg_dump restore)
-- bypass RLS but NOT this trigger, so NULL JWT must pass through.
create or replace function public.lock_user_role()
returns trigger language plpgsql as $$
begin
  if auth.jwt() is null then return NEW; end if;
  if NEW.role is distinct from OLD.role then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return NEW; end if;
    if coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'OWNER' then return NEW; end if;
    raise exception 'role changes restricted';
  end if;
  if NEW.status is distinct from OLD.status and OLD.id::text = (auth.uid())::text then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return NEW; end if;
    if coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'OWNER' then return NEW; end if;
    raise exception 'status changes restricted';
  end if;
  return NEW;
end;
$$;

drop trigger if exists lock_user_role on public.users;
create trigger lock_user_role before update of role, status on public.users
for each row execute function public.lock_user_role();

-- 7. View count RPC (avoids backend increment logic)
-- Hardened: explicit table allowlist + row_id shape guard. Anonymous calls stay
-- allowed (public pages increment views) but arbitrary tables/ids are rejected.
create or replace function public.increment_view(table_name text, row_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if table_name not in ('articles', 'videos', 'documentaries') then
    raise exception 'invalid table_name';
  end if;
  if row_id is null or length(row_id) > 64 or row_id !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid row_id';
  end if;
  if table_name = 'articles' then update public.articles set view_count = view_count + 1 where id = row_id;
  elsif table_name = 'videos' then update public.videos set view_count = view_count + 1 where id = row_id;
  elsif table_name = 'documentaries' then update public.documentaries set view_count = view_count + 1 where id = row_id;
  end if;
end;
$$;
