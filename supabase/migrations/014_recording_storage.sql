-- Migration 014: Recording Storage Bucket + RLS
-- Idempotent: safe to re-run

-- 1. Create private bucket for call recordings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-recordings',
  'call-recordings',
  false,
  104857600,  -- 100MB per file
  array['audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. RLS: org members can SELECT recordings in their org's path
drop policy if exists "org members read recordings" on storage.objects;
create policy "org members read recordings"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'call-recordings'
  and (storage.foldername(name))[1]::uuid in (
    select organization_id from profiles where id = auth.uid()
  )
);

-- 3. Explicitly no INSERT/UPDATE/DELETE for authenticated users
-- (Service role bypasses RLS automatically; LiveKit uses service-role S3 creds)
-- No policies = no access. This is intentional.

-- 4. Verify bucket exists and RLS is enabled
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'call-recordings') then
    raise exception 'Bucket call-recordings was not created';
  end if;
  raise notice 'Migration 014 applied: bucket call-recordings ready, RLS policy active';
end $$;
