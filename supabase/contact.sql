-- MINIMSAAH — contact_messages (floating chat button inbox)
-- Run once in Supabase Dashboard → SQL Editor AFTER rls.sql (uses public.is_staff(),
-- public.is_owner_editor()).
-- Public can ADD only (never read/change). Staff reads. Bosses delete.

create table if not exists public.contact_messages (
  id text primary key,
  name text not null,
  email text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_read_created_idx
  on public.contact_messages(is_read, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "public_insert_contact" on public.contact_messages;
create policy "public_insert_contact" on public.contact_messages for insert
with check (
  char_length(name) between 1 and 200
  and char_length(email) between 3 and 320
  and email like '%@%.%'
  and char_length(message) between 10 and 2000
);

drop policy if exists "staff_read_contact" on public.contact_messages;
create policy "staff_read_contact" on public.contact_messages for select
using (public.is_staff());

drop policy if exists "staff_update_contact" on public.contact_messages;
create policy "staff_update_contact" on public.contact_messages for update
using (public.is_staff()) with check (public.is_staff());

drop policy if exists "boss_delete_contact" on public.contact_messages;
create policy "boss_delete_contact" on public.contact_messages for delete
using (public.is_owner_editor());

-- No public read/update/delete: visitors can only send. Spam slowed by
-- browser cap (3 per hour) plus staff-side review and delete.
