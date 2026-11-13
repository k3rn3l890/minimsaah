-- MINIMSAAH - Phase 1 hardening: close the privilege-escalation chain.
-- Run ONCE in Supabase Dashboard -> SQL Editor. Idempotent: safe to run twice.
--
-- WHY: the old is_staff()/is_owner_editor() helpers trusted the role inside
-- auth.users.user_metadata. Supabase lets any logged-in account edit its own
-- user_metadata (auth.updateUser), so a user could self-write role = 'OWNER'
-- and gain staff powers. These replacements resolve the role from
-- public.users (the database) and require status ACTIVE, so the database is
-- the only place a role exists.
--
-- BEFORE RUNNING: run the pre-flight query in section 0 on its own.
-- It must return ZERO rows. If it returns rows, staff profile rows are
-- missing - insert them manually first (emergency SQL at the bottom).
-- AFTER RUNNING: test one admin save + one admin delete with a real staff
-- login to confirm nothing broke.

-- ─── 0. Pre-flight: staff auth accounts missing a public.users row ───
-- (Commented: run this SELECT alone first. Expect zero rows.)
-- select a.email, a.id
-- from auth.users a
-- where (a.user_metadata ->> 'role') in ('OWNER','EDITOR','JOURNALIST','VIDEOGRAPHER')
--   and not exists (select 1 from public.users u where u.id = a.id::text);

-- ─── 1. Backfill missing profile rows ───
-- Deliberately conservative: every auto-created row is SUBSCRIBER. The
-- database never trusts user_metadata for a role - auth-migrate.js already
-- linked proper staff profiles when they were provisioned, so any row-less
-- auth account here is a visitor/invited account until the boss promotes
-- it manually. (Self-written metadata roles must never auto-promote.)
insert into public.users (id, email, first_name, last_name, role, status)
select
  a.id::text,
  a.email,
  coalesce(nullif(a.user_metadata ->> 'firstName', ''), 'Staff'),
  coalesce(nullif(a.user_metadata ->> 'lastName', ''), 'Member'),
  'SUBSCRIBER'::"Role",
  'ACTIVE'::"UserStatus"
from auth.users a
where a.email is not null
  and not exists (select 1 from public.users u where u.id = a.id::text)
  and not exists (select 1 from public.users u2 where u2.email = a.email)
on conflict (id) do nothing;

-- ─── 2. Role helpers: the database is the only truth ───
-- SECURITY DEFINER so they can read public.users regardless of the
-- caller's own row visibility. search_path pinned (same hardening as the
-- other writers). auth.uid() is the verified session id from the JWT.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()::text
      and u.role::text in ('OWNER', 'EDITOR', 'JOURNALIST', 'VIDEOGRAPHER')
      and u.status::text = 'ACTIVE'
  );
$$;

create or replace function public.is_owner_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()::text
      and u.role::text in ('OWNER', 'EDITOR')
      and u.status::text = 'ACTIVE'
  );
$$;

-- ─── 3. Role-change lock: the OWNER check now comes from the DB row ───
-- Same behaviour as before, except a self-written metadata claim no longer
-- satisfies it - only a real ACTIVE OWNER row does.
create or replace function public.lock_user_role()
returns trigger language plpgsql as $$
begin
  if auth.jwt() is null then return NEW; end if;
  if NEW.role is distinct from OLD.role then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return NEW; end if;
    if exists (
      select 1 from public.users u
      where u.id = auth.uid()::text and u.role::text = 'OWNER' and u.status::text = 'ACTIVE'
    ) then return NEW; end if;
    raise exception 'role changes restricted';
  end if;
  if NEW.status is distinct from OLD.status and OLD.id::text = auth.uid()::text then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return NEW; end if;
    if exists (
      select 1 from public.users u
      where u.id = auth.uid()::text and u.role::text = 'OWNER' and u.status::text = 'ACTIVE'
    ) then return NEW; end if;
    raise exception 'status changes restricted';
  end if;
  return NEW;
end;
$$;

-- ─── 4. Audit log reads: boss-only (matches the staff runbook) ───
drop policy if exists "staff_read_audit" on public.admin_audit;
create policy "staff_read_audit" on public.admin_audit
for select using (public.is_owner_editor());

-- ─── 5. Attribution is bound at the database ───
-- INSERT: a staff member can only create content attributed to their own
-- verified session id. admin.js supaSave already stamps author_id from the
-- live session, so the admin forms keep working unchanged - only a direct
-- API writer forging someone else's attribution is now refused.
drop policy if exists "staff_insert" on public.articles;
create policy "staff_insert" on public.articles for insert
with check (public.is_staff() and author_id = (auth.uid())::text);

drop policy if exists "staff_insert" on public.videos;
create policy "staff_insert" on public.videos for insert
with check (public.is_staff() and author_id = (auth.uid())::text);

drop policy if exists "staff_insert" on public.documentaries;
create policy "staff_insert" on public.documentaries for insert
with check (public.is_staff() and author_id = (auth.uid())::text);

drop policy if exists "staff_insert" on public.events;
create policy "staff_insert" on public.events for insert
with check (public.is_staff() and author_id = (auth.uid())::text);

-- UPDATE: author_id becomes immutable for per-user JWTs. Editors can still
-- edit each other's content - they just cannot silently re-attribute it.
-- No per-user JWT (service_role doors, SQL editor, migrations) passes.
create or replace function public.protect_author_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_id is distinct from old.author_id then
    if auth.uid() is null then return new; end if;
    raise exception 'author_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_author_id on public.articles;
create trigger protect_author_id before update on public.articles
for each row execute function public.protect_author_id();

drop trigger if exists protect_author_id on public.videos;
create trigger protect_author_id before update on public.videos
for each row execute function public.protect_author_id();

drop trigger if exists protect_author_id on public.documentaries;
create trigger protect_author_id before update on public.documentaries
for each row execute function public.protect_author_id();

drop trigger if exists protect_author_id on public.events;
create trigger protect_author_id before update on public.events
for each row execute function public.protect_author_id();

-- ─── Post-run verification (run each SELECT separately; expect: ) ───
-- select role, status, count(*) from public.users group by 1, 2 order by 1;
--   -> your staff accounts: their real role, ACTIVE.
-- select proname, prosecdef, proconfig from pg_proc
--  where proname in ('is_staff','is_owner_editor','protect_author_id');
--   -> prosecdef = true, proconfig contains search_path.

-- ─── EMERGENCY (only if a staff account is wrongly locked out): ───
-- Give back a role by hand, from the Dashboard, with the account's auth id:
-- update public.users set role = 'OWNER' where id = '<auth-user-id>';
-- (Run as table editor or SQL. This bypasses metadata entirely.)
