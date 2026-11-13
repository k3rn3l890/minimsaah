-- MINIMSAAH - Phase 2 hardening: audit integrity.
-- Run ONCE in Supabase Dashboard -> SQL Editor. Idempotent: safe to run twice.
--
-- WHY: the delete door's daily cap counted audit rows by email + detail
-- text. /api/log-event accepted rows from anyone with any email, so fake
-- "delete:..." rows could lock every admin delete for 24 hours, daily,
-- with no account at all. From now on:
--   * the cap counts rows only where actor_id matches the verified caller
--     AND the delete actually succeeded (success = true). Only the server
--     doors stamp actor_id; visitor rows keep it NULL, so forgeries are
--     invisible to the cap.
--   * every audit row carries source: 'verified' (JWT-checked identity,
--     email forced to the account's real email) or 'client' (visitor
--     telemetry - email is whatever the visitor posted, never evidence).
--   * real sign-ins get their own event: the /api/log-event door accepts
--     that event ONLY with a verified token. It is deliberately NOT in the
--     browser RPC allowlist, which has no way to verify a caller.
--   * a nightly job deletes rows older than 30 days (retention).

-- ─── 1. New columns ───
alter table public.admin_audit add column if not exists actor_id text;
alter table public.admin_audit add column if not exists source text;

-- ─── 2. Index for the per-actor daily cap ───
create index if not exists admin_audit_actor_created_idx
  on public.admin_audit(actor_id, created_at desc);

-- ─── 3. The browser writer stamps itself as untrusted telemetry ───
-- Same rules as before (allowlist, caps, throttle). The only change is
-- the source column, so dashboard review can tell visitor rows apart
-- from verified rows.
create or replace function public.log_admin_event(p_event text, p_email text default null, p_success boolean default false, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('login_failed', 'login_denied', 'guard_denied', 'upload_rejected', 'upload_approved', 'delete_blocked', 'limit_hit', 'input_blocked', 'site_error') then
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
  insert into public.admin_audit (event, email, success, detail, source)
  values (p_event, nullif(p_email, ''), p_success, nullif(p_detail, ''), 'client');
end;
$$;

-- ─── 4. Retention: rows older than 30 days are deleted nightly ───
create extension if not exists pg_cron;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'audit-retention') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'audit-retention' limit 1));
  end if;
end $$;
select cron.schedule('audit-retention', '17 3 * * *',
  $job$ delete from public.admin_audit where created_at < now() - interval '30 days' $job$);

-- ─── Post-run verification (run each SELECT separately) ───
-- select column_name from information_schema.columns
--  where table_name = 'admin_audit' and column_name in ('actor_id','source');
--   -> 2 rows.
-- select jobname, schedule from cron.job where jobname = 'audit-retention';
--   -> 1 row.
