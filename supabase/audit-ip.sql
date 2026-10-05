-- MINIMSAAH — audit IP column (caller address stamped by server door)
-- Run once in Supabase Dashboard → SQL Editor. Changes nothing else.
-- Old rows keep NULL. New server-door rows carry the address.
-- Addresses fall under the existing 30-day cleanup (see audit.sql).

alter table public.admin_audit
  add column if not exists ip text;
