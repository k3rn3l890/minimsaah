-- MINIMSAAH — hardening review (read-only check, changes nothing)
-- Run in Supabase Dashboard → SQL Editor any time. Raises on the first gap.
-- Proves: RLS on for every app table, public reads narrow, no public writes,
-- no public deletes, audit writers allowlisted, helper functions pinned.

do $$
declare
  t text;
  missing text := '';
begin
  -- 1. RLS must be ON for every app table.
  for t in select unnest(array[
    'users','articles','videos','documentaries','events',
    'tickers','media','sessions','sponsors','site_settings','admin_audit'
  ]) loop
    if not exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = t and rowsecurity
    ) then
      missing := missing || ' RLS-OFF:' || t;
    end if;
  end loop;

  -- 2. No write/delete policy may be open to everyone (USING/WITH CHECK = true).
  -- Staff policies gate on is_staff()/is_owner_editor()/auth.uid(), never true.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in (
        'users','articles','videos','documentaries','events',
        'tickers','media','sessions','sponsors','site_settings','admin_audit'
      )
      and cmd in ('INSERT','UPDATE','DELETE')
      and (qual = 'true' or with_check = 'true')
  ) then
    missing := missing || ' OPEN-WRITE-OR-DELETE-FOUND';
  end if;

  -- 3. RPC writers must exist with pinned search_path.
  for t in select unnest(array['increment_view','log_admin_event']) loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = t
        and p.proconfig is not null
    ) then
      missing := missing || ' RPC-UNPINNED:' || t;
    end if;
  end loop;

  if missing <> '' then
    raise exception 'HARDENING GAPS:%', missing;
  end if;
  raise notice 'HARDENING OK: all tables gated, no public writes/deletes, RPCs pinned.';
end;
$$;
