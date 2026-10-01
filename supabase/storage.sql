-- MINIMSAAH — Storage bucket minimsaah-media (Public ON, no card)
-- Run after creating bucket in Dashboard → Storage → New bucket → minimsaah-media → Public: ON

-- Public read for all (covers hero, covers, thumbnails, w=3840 kept)
drop policy if exists "public_read" on storage.objects;
create policy "public_read" on storage.objects for select using (bucket_id = 'minimsaah-media');

-- Staff-only upload/update (role-gated via public.is_staff(); SUBSCRIBERs denied).
-- Requires supabase/rls.sql (defines is_staff()) to be applied first.
drop policy if exists "staff_upload" on storage.objects;
create policy "staff_upload" on storage.objects for insert
with check (bucket_id = 'minimsaah-media' and public.is_staff());

drop policy if exists "staff_update" on storage.objects;
create policy "staff_update" on storage.objects for update
using (bucket_id = 'minimsaah-media' and public.is_staff())
with check (bucket_id = 'minimsaah-media' and public.is_staff());

-- Deletes only via Pages Functions (service_role), no anon delete policy = blocked by default
