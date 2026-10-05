-- MINIMSAAH — admin audit log (A09: security logging)
-- Run in Supabase Dashboard → SQL Editor AFTER rls.sql (uses public.is_staff()).
-- Design: append-only. NOBODY writes directly (no anon/authenticated INSERT
-- policy); all writes go through log_admin_event() which enforces an
-- event allowlist, field caps, and a global per-minute throttle so the
-- public anon key cannot be used to flood the table.
-- Reads: staff only (review in Dashboard → Table Editor).
-- Retention: enable pg_cron and uncomment the schedule at the bottom,
-- or delete rows older than 30 days manually.

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  email text,
  success boolean not null default false,
  detail text
);

alter table public.admin_audit enable row level security;

drop policy if exists "staff_read_audit" on public.admin_audit;
create policy "staff_read_audit" on public.admin_audit for select using (public.is_staff());

-- Throttled, allowlisted writer. SECURITY DEFINER so anon callers can log
-- (e.g. failed logins have no session) without direct table access.
-- SET search_path pins resolution (same hardening as increment_view).
create or replace function public.log_admin_event(p_event text, p_email text default null, p_success boolean default false, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('login_failed', 'login_denied', 'guard_denied', 'upload_rejected', 'delete_blocked', 'limit_hit', 'input_blocked') then
    raise exception 'invalid event';
  end if;
  if length(coalesce(p_email, '')) > 320 then
    raise exception 'email too long';
  end if;
  if length(coalesce(p_detail, '')) > 500 then
    raise exception 'detail too long';
  end if;
  if (select count(*) from public.admin_audit where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'throttled';
  end if;
  insert into public.admin_audit (event, email, success, detail)
  values (p_event, nullif(p_email, ''), p_success, nullif(p_detail, ''));
end;
$$;

-- Harden existing RPC the same way (pin search_path; behavior unchanged).
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

-- Retention (requires pg_cron; leave commented if unavailable):
-- select cron.schedule('audit-retention', '0 3 * * *',
--   $$ delete from public.admin_audit where created_at < now() - interval '30 days' $$);
