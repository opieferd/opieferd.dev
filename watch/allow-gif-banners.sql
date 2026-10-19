-- Opie Watch: allow animated GIF profile banners.
-- Run this in Supabase Dashboard -> SQL Editor.
-- This updates the existing banners bucket without changing its public setting.

update storage.buckets
set allowed_mime_types = array(
  select distinct mime_type
  from unnest(
    coalesce(allowed_mime_types, array[]::text[]) || array['image/gif']::text[]
  ) as mime_type
)
where id = 'banners';

-- If the banners bucket doesn't exist yet, create it with the expected settings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 3145728, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  allowed_mime_types = array(
    select distinct mime_type
    from unnest(
      coalesce(storage.buckets.allowed_mime_types, array[]::text[]) || array['image/gif']::text[]
    ) as mime_type
  );
