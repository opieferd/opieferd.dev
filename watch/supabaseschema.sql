-- =====================================================================
-- Opie Watch accounts schema (Supabase / Postgres)
-- Run the whole file once: Supabase dashboard -> SQL Editor -> New query.
-- Safe to re-run.
--
-- BEFORE RUNNING: change the owner email below (marked <<< EDIT).
-- Only someone who signs up with that exact (confirmed) email can ever
-- get the username "opieferd" and the owner role.
-- =====================================================================

-- ---------- settings (readable only by the functions below) ----------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;   -- no policies on purpose
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('owner_email', 'nakwolek@gmail.com')          -- <<< EDIT
on conflict (key) do update set value = excluded.value;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  username_lower text generated always as (lower(username)) stored not null unique,
  role          text not null default 'user' check (role in ('user','owner')),
  tier          text not null default 'free' check (tier in ('free','basic','gold')),
  avatar_url    text,
  banner_url    text,
  bio           text not null default '' check (char_length(bio) <= 200),
  accent        text not null default '#ebaf36' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  border        text not null default 'none' check (border in ('none','gold','neon','ember')),
  show_on_wall  boolean not null default false,
  banned        boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- helper functions ----------
create or replace function public.is_owner() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_gold() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and (role = 'owner' or tier = 'gold'));
$$;

create or replace function public.is_reserved_username(n text) returns boolean
language sql immutable as $$
  select lower(n) = any (array['opieferd','admin','administrator','owner','mod','moderator',
                               'staff','support','system','opie','opiewatch','anonymous','deleted']);
$$;

create or replace function public.allowed_accents(eff text) returns text[]
language sql immutable as $$
  select case eff
    when 'gold'  then array['#ebaf36','#e5484d','#3e9bff','#30c48d','#a66bff','#ff7ab6',
                            '#ff9f1c','#00d1c1','#d8d8d8','#ffd700','#7cff6b','#ff5e3a']
    when 'basic' then array['#ebaf36','#e5484d','#3e9bff','#30c48d','#a66bff','#ff7ab6']
    else              array['#ebaf36']
  end;
$$;

-- ---------- create a profile when someone signs up ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname    text := new.raw_user_meta_data ->> 'username';
  owner_em text;
  is_own   boolean;
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Invalid username';
  end if;

  select value into owner_em from public.app_settings where key = 'owner_email';
  is_own := lower(uname) = 'opieferd';

  if is_own then
    if lower(coalesce(new.email, '')) <> lower(coalesce(owner_em, '')) then
      raise exception 'That username is reserved';
    end if;
  elsif public.is_reserved_username(uname) then
    raise exception 'That username is reserved';
  end if;

  insert into public.profiles (id, username, role, tier)
  values (new.id, uname,
          case when is_own then 'owner' else 'user' end,
          case when is_own then 'gold'  else 'free' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- profile security ----------
alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- users can only touch cosmetic columns; role / tier / banned / username are locked
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (avatar_url, banner_url, bio, accent, border, show_on_wall) on public.profiles to authenticated;

-- enforce tier perks on the server (client checks are only for show)
create or replace function public.validate_profile() returns trigger
language plpgsql as $$
declare eff text := case when new.role = 'owner' then 'gold' else new.tier end;
begin
  new.accent := lower(new.accent);

  if new.accent is distinct from old.accent and not (new.accent = any (public.allowed_accents(eff))) then
    raise exception 'That accent colour is not available on your tier';
  end if;
  if new.border is distinct from old.border and new.border <> 'none' and eff <> 'gold' then
    raise exception 'Profile borders are a Gold perk';
  end if;
  if new.banner_url is distinct from old.banner_url and new.banner_url is not null and eff <> 'gold' then
    raise exception 'Banner upload is a Gold perk';
  end if;
  if new.show_on_wall is distinct from old.show_on_wall and new.show_on_wall and eff = 'free' then
    raise exception 'The supporter wall is for supporters';
  end if;
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and new.avatar_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/[A-Za-z0-9/_.?=-]+$' then
    raise exception 'Invalid avatar URL';
  end if;
  if new.banner_url is distinct from old.banner_url and new.banner_url is not null
     and new.banner_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/banners/[A-Za-z0-9/_.?=-]+$' then
    raise exception 'Invalid banner URL';
  end if;
  return new;
end $$;

drop trigger if exists validate_profile_trg on public.profiles;
create trigger validate_profile_trg
  before update on public.profiles
  for each row execute function public.validate_profile();

-- ---------- moderation tables ----------
create table if not exists public.banned_words (
  id   bigint generated always as identity primary key,
  word text not null check (char_length(word) between 2 and 40),
  kind text not null default 'word' check (kind in ('word','contains')),
  unique (word)
);
alter table public.banned_words enable row level security;
drop policy if exists "banned words owner" on public.banned_words;
create policy "banned words owner" on public.banned_words for all
  using (public.is_owner()) with check (public.is_owner());

-- A small starter list (mild profanity). Slurs etc. are NOT pre-loaded:
-- add what you want from the Owner tab on the site, or paste a list here.
insert into public.banned_words (word, kind) values
  ('fuck','word'), ('shit','word'), ('bitch','word'), ('asshole','word'), ('cunt','word')
on conflict do nothing;

create table if not exists public.moderation_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  action      text not null,          -- blocked | reported | auto_hidden | deleted | ban | unban | tier_change
  actor_name  text,
  target_name text,
  media_type  text,
  media_id    integer,
  body        text,
  reason      text
);
alter table public.moderation_log enable row level security;
drop policy if exists "log owner read" on public.moderation_log;
create policy "log owner read" on public.moderation_log for select using (public.is_owner());
revoke insert, update, delete on public.moderation_log from anon, authenticated;

create or replace function public._log(p_action text, p_actor text, p_target text,
                                       p_type text, p_id integer, p_body text, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into public.moderation_log (action, actor_name, target_name, media_type, media_id, body, reason)
  values (p_action, p_actor, p_target, p_type, p_id, left(p_body, 600), p_reason);
$$;
revoke execute on function public._log(text,text,text,text,integer,text,text) from public, anon, authenticated;

-- ---------- the content filter ----------
-- Catches: links, character-spam, and banned words (including l33t-speak,
-- spaced-out letters and stretched letters like "shiiit").
create or replace function public.moderate_text(txt text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  low text := lower(txt);
  norm text;
  squashed text;
  w record;
  cw text;
begin
  if low ~ '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|ru|xyz|gg|ly|me|tv|to|cc|info|co)(/|\s|$))' then
    return 'link';
  end if;
  if txt ~ '(.)\1{11,}' then
    return 'repeated characters';
  end if;

  norm     := regexp_replace(translate(low, '01345@$!', 'oleasasi'), '[^a-z0-9 ]', ' ', 'g');
  squashed := regexp_replace(regexp_replace(norm, '\s', '', 'g'), '(.)\1+', '\1', 'g');

  for w in select word, kind from public.banned_words loop
    cw := regexp_replace(lower(w.word), '[^a-z0-9]', '', 'g');
    continue when cw = '';
    if w.kind = 'word' and norm ~ ('\m' || cw || '\M') then
      return 'word: ' || w.word;
    end if;
    if w.kind = 'contains' and squashed like '%' || regexp_replace(cw, '(.)\1+', '\1', 'g') || '%' then
      return 'contains: ' || w.word;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.moderate_text(text) from public, anon, authenticated;

-- ---------- comments ----------
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('movie','tv')),
  media_id   integer not null check (media_id > 0),
  body       text not null check (char_length(body) between 1 and 500),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_media_idx on public.comments (media_type, media_id, created_at desc);

create table if not exists public.comment_reports (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_reports enable row level security;
revoke all on public.comment_reports from anon, authenticated;

alter table public.comments enable row level security;
drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select
  using (not hidden or public.is_owner());
-- no insert / update / delete policies: everything goes through the functions below
revoke insert, update, delete on public.comments from anon, authenticated;

create or replace function public.post_comment(p_type text, p_id integer, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me     public.profiles;
  body   text := btrim(coalesce(p_body, ''));
  reason text;
  last_at timestamptz;
  recent int;
  strikes int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to comment.');
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Account not ready yet.');
  end if;
  if me.banned then
    return jsonb_build_object('ok', false, 'error', 'This account can no longer comment.');
  end if;
  if p_type not in ('movie','tv') or p_id is null or p_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Invalid title.');
  end if;
  if char_length(body) < 1 or char_length(body) > 500 then
    return jsonb_build_object('ok', false, 'error', 'Comments must be 1 to 500 characters.');
  end if;

  select max(created_at) into last_at from public.comments where user_id = me.id;
  if last_at is not null and last_at > now() - interval '10 seconds' then
    return jsonb_build_object('ok', false, 'error', 'Slow down a little.');
  end if;
  select count(*) into recent from public.comments
    where user_id = me.id and created_at > now() - interval '10 minutes';
  if recent >= 10 then
    return jsonb_build_object('ok', false, 'error', 'You are commenting too fast. Try again in a few minutes.');
  end if;

  select count(*) into strikes from public.moderation_log
    where action = 'blocked' and actor_name = me.username and created_at > now() - interval '1 hour';
  if strikes >= 5 and me.role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Too many blocked comments. Try again later.');
  end if;

  reason := public.moderate_text(body);
  if reason is not null and me.role <> 'owner' then
    perform public._log('blocked', me.username, null, p_type, p_id, body, reason);
    return jsonb_build_object('ok', false, 'error', 'That comment was blocked by the content filter.');
  end if;

  insert into public.comments (user_id, media_type, media_id, body)
  values (me.id, p_type, p_id, body);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.report_comment(p_comment_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  c  public.comments;
  n  int;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'Sign in to report.'); end if;
  select * into c from public.comments where id = p_comment_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Comment not found.'); end if;

  insert into public.comment_reports (comment_id, user_id) values (c.id, me.id)
  on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'message', 'You already reported this.'); end if;

  perform public._log('reported', me.username,
                      (select username from public.profiles where id = c.user_id),
                      c.media_type, c.media_id, c.body, 'user report');

  select count(*) into n from public.comment_reports where comment_id = c.id;
  if n >= 3 and not c.hidden then
    update public.comments set hidden = true where id = c.id;
    perform public._log('auto_hidden', null,
                        (select username from public.profiles where id = c.user_id),
                        c.media_type, c.media_id, c.body, '3 reports');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Thanks. We''ll take a look.');
end $$;

create or replace function public.delete_comment(p_comment_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  c  public.comments;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select * into c from public.comments where id = p_comment_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Comment not found.'); end if;
  if c.user_id <> me.id and me.role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'Not allowed.');
  end if;
  delete from public.comments where id = c.id;
  perform public._log('deleted', me.username,
                      (select username from public.profiles where id = c.user_id),
                      c.media_type, c.media_id, c.body,
                      case when c.user_id = me.id then 'self' else 'owner' end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- owner-only admin functions ----------
create or replace function public.set_tier(target text, new_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Not allowed'; end if;
  if new_tier not in ('free','basic','gold') then raise exception 'Bad tier'; end if;

  update public.profiles set
    tier         = new_tier,
    accent       = case when accent = any (public.allowed_accents(new_tier)) then accent else '#ebaf36' end,
    border       = case when new_tier = 'gold' then border else 'none' end,
    banner_url   = case when new_tier = 'gold' then banner_url else null end,
    show_on_wall = case when new_tier = 'free' then false else show_on_wall end
  where username_lower = lower(target) and role <> 'owner';
  if not found then raise exception 'User not found'; end if;

  perform public._log('tier_change', (select username from public.profiles where id = auth.uid()),
                      target, null, null, null, 'set to ' || new_tier);
end $$;

create or replace function public.set_banned(target text, flag boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Not allowed'; end if;
  update public.profiles set banned = flag where username_lower = lower(target) and role <> 'owner';
  if not found then raise exception 'User not found'; end if;
  perform public._log(case when flag then 'ban' else 'unban' end,
                      (select username from public.profiles where id = auth.uid()),
                      target, null, null, null, null);
end $$;

-- ---------- watchlist (free for every registered user) ----------
create table if not exists public.watchlist (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  media_type  text not null check (media_type in ('movie','tv')),
  media_id    integer not null check (media_id > 0),
  title       text not null check (char_length(title) between 1 and 200),
  poster_path text check (poster_path is null or poster_path = '' or poster_path ~ '^/[A-Za-z0-9_.-]{1,80}$'),
  added_at    timestamptz not null default now(),
  primary key (user_id, media_type, media_id)
);
alter table public.watchlist enable row level security;
drop policy if exists "watchlist read own"   on public.watchlist;
drop policy if exists "watchlist insert own" on public.watchlist;
drop policy if exists "watchlist delete own" on public.watchlist;
create policy "watchlist read own"   on public.watchlist for select using (user_id = auth.uid());
create policy "watchlist insert own" on public.watchlist for insert with check (user_id = auth.uid());
create policy "watchlist delete own" on public.watchlist for delete using (user_id = auth.uid());
revoke update on public.watchlist from anon, authenticated;

create or replace function public.limit_watchlist() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.watchlist where user_id = new.user_id) >= 500 then
    raise exception 'Watchlist is full (500 titles)';
  end if;
  return new;
end $$;
drop trigger if exists limit_watchlist_trg on public.watchlist;
create trigger limit_watchlist_trg before insert on public.watchlist
  for each row execute function public.limit_watchlist();

-- ---------- roadmap voting (Gold perk) ----------
create table if not exists public.features (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 3 and 80),
  details    text not null default '' check (char_length(details) <= 300),
  created_at timestamptz not null default now()
);
create table if not exists public.feature_votes (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  feature_id bigint not null references public.features(id) on delete cascade,
  primary key (user_id, feature_id)
);
alter table public.features enable row level security;
alter table public.feature_votes enable row level security;

drop policy if exists "features read"   on public.features;
drop policy if exists "features owner"  on public.features;
drop policy if exists "votes read"      on public.feature_votes;
drop policy if exists "votes insert"    on public.feature_votes;
drop policy if exists "votes delete"    on public.feature_votes;
create policy "features read"  on public.features for select using (true);
create policy "features owner" on public.features for all using (public.is_owner()) with check (public.is_owner());
create policy "votes read"     on public.feature_votes for select using (true);
create policy "votes insert"   on public.feature_votes for insert with check (user_id = auth.uid() and public.is_gold());
create policy "votes delete"   on public.feature_votes for delete using (user_id = auth.uid());
revoke update on public.feature_votes from anon, authenticated;

-- ---------- image storage (avatars for everyone, banners for Gold) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg','image/png','image/webp']),
  ('banners', 'banners', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "images public read"  on storage.objects;
drop policy if exists "avatar insert own"   on storage.objects;
drop policy if exists "avatar update own"   on storage.objects;
drop policy if exists "avatar delete own"   on storage.objects;
drop policy if exists "banner insert gold"  on storage.objects;
drop policy if exists "banner update gold"  on storage.objects;
drop policy if exists "banner delete own"   on storage.objects;

create policy "images public read" on storage.objects for select
  using (bucket_id in ('avatars','banners'));

create policy "avatar insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "banner insert gold" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text and public.is_gold());
create policy "banner update gold" on storage.objects for update to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text and public.is_gold());
create policy "banner delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);
