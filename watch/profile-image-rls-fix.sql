-- Opie Watch: repair profile image upload RLS
-- Run this in Supabase Dashboard -> SQL Editor.
-- Keeps avatar uploads available to signed-in users and banners Gold-only.

-- Publicly readable profile images.
drop policy if exists "images public read" on storage.objects;
create policy "images public read"
  on storage.objects for select
  using (bucket_id in ('avatars', 'banners'));

-- Avatars: each signed-in user may create, replace, and delete only their own files.
drop policy if exists "avatar insert own" on storage.objects;
drop policy if exists "avatar update own" on storage.objects;
drop policy if exists "avatar delete own" on storage.objects;

create policy "avatar insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatar update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatar delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Banners: only Gold supporters / owner may upload or replace; users may delete their own.
drop policy if exists "banner insert gold" on storage.objects;
drop policy if exists "banner update gold" on storage.objects;
drop policy if exists "banner delete own" on storage.objects;

create policy "banner insert gold"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_gold()
  );

create policy "banner update gold"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_gold()
  )
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_gold()
  );

create policy "banner delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Ensure the buckets exist with the intended limits and MIME types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg','image/png','image/webp']),
  ('banners', 'banners', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
