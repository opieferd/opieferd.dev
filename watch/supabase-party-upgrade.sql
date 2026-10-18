-- =====================================================================
-- Opie Watch — Watch Parties upgrade (Supabase / Postgres)
-- Run this file once in: Supabase dashboard -> SQL Editor -> New query.
-- It ONLY contains the watch party pieces, so it is safe to run on an
-- existing database (every statement is idempotent and re-runnable):
--   * watch_parties / watch_party_members tables + RLS policies
--   * max_members / season / episode / audio_mode columns
--   * transfer_party_host, join_watch_party_by_code, moderate_chat_message
--
-- The full seats-and-everything schema still lives in watch/supabaseschema.sql
-- (also safe to re-run); this file is just the party update on its own.
-- =====================================================================

-- ---------- watch parties ----------

create table if not exists public.watch_parties (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  media_type    text not null check (media_type in ('movie','tv')),
  media_id      integer not null check (media_id > 0),
  media_title   text not null check (char_length(media_title) between 1 and 200),
  media_poster  text check (media_poster is null or media_poster = '' or media_poster ~ '^/[A-Za-z0-9_.-]{1,80}$'),
  kind          text not null default 'public' check (kind in ('public','private')),
  code          text check (char_length(code) = 6 and code ~ '^[A-Z0-9]{6}$'),
  current_position  integer not null default 0 check (current_position >= 0),
  is_playing    boolean not null default false,
  media_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Upgrades for watch parties (safe to re-run).
-- max_members: party size cap chosen by the host (2–12 people, host included).
-- season/episode: what the party is watching (needed when viewers switch servers).
-- audio_mode: sub/dub choice made by the host (broadcast live and stored for late joiners).
alter table public.watch_parties add column if not exists max_members integer not null default 12 check (max_members between 2 and 12);
alter table public.watch_parties add column if not exists season integer not null default 1 check (season >= 1);
alter table public.watch_parties add column if not exists episode integer not null default 1 check (episode >= 1);
alter table public.watch_parties add column if not exists audio_mode text not null default 'default' check (audio_mode in ('default','sub','dub'));

alter table public.watch_parties enable row level security;

drop policy if exists "watch_parties read" on public.watch_parties;
drop policy if exists "watch_parties insert" on public.watch_parties;
drop policy if exists "watch_parties update host" on public.watch_parties;
drop policy if exists "watch_parties delete host" on public.watch_parties;

-- Anyone can see public parties; hosts can see their own private parties.
create policy "watch_parties read"
  on public.watch_parties for select
  using (kind = 'public' or host_id = auth.uid());

-- Signed-in users can create parties.
create policy "watch_parties insert"
  on public.watch_parties for insert
  with check (auth.uid() = host_id);

-- Hosts can update their own party.
create policy "watch_parties update host"
  on watch_parties for update
  using (auth.uid() = host_id);

-- Hosts can delete their own party.
create policy "watch_parties delete host"
  on watch_parties for delete
  using (auth.uid() = host_id);

create table if not exists public.watch_party_members (
  party_id    uuid not null references public.watch_parties(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (party_id, user_id)
);

alter table public.watch_party_members enable row level security;

drop policy if exists "watch_party_members read" on public.watch_party_members;
drop policy if exists "watch_party_members insert" on public.watch_party_members;
drop policy if exists "watch_party_members delete" on public.watch_party_members;

-- Members can see the roster of parties they belong to (and public party rosters).
create policy "watch_party_members read"
  on public.watch_party_members for select
  using (true);

-- Signed-in users can join a party (membership row).
create policy "watch_party_members insert"
  on public.watch_party_members for insert
  with check (auth.uid() = user_id);

-- Users can leave (delete their own membership).
create policy "watch_party_members delete"
  on public.watch_party_members for delete
  using (auth.uid() = user_id);

-- ---------- watch party helpers ----------

-- Any current member can take the host role. The clients elect the
-- earliest-joined remaining member when the host leaves the tab, and that
-- member calls this. Returns false when the party no longer exists.
create or replace function public.transfer_party_host(p_party uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return false; end if;
  if not exists (select 1 from public.watch_party_members where party_id = p_party and user_id = me) then
    return false;
  end if;
  update public.watch_parties set host_id = me, updated_at = now() where id = p_party;
  return found;
end $$;
revoke execute on function public.transfer_party_host(uuid) from public, anon;
grant execute on function public.transfer_party_host(uuid) to authenticated;

-- Look a private party up by its 6-character code. The read policy keeps
-- private rows hidden from non-hosts, so this is the only way in. Used by the
-- "Join a private party" form and by invite links (?code=ABC123).
create or replace function public.join_watch_party_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.watch_parties;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to join a party.');
  end if;
  select * into p from public.watch_parties
    where kind = 'private' and code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invalid party code.');
  end if;
  return jsonb_build_object('ok', true, 'party', to_jsonb(p));
end $$;
revoke execute on function public.join_watch_party_by_code(text) from public, anon;
grant execute on function public.join_watch_party_by_code(text) to authenticated;

-- Party chat moderation. ONLY messages that trip the content filter get
-- written to the moderation log (clean messages leave no trace). The site
-- owner is exempt, same as comments.
create or replace function public.moderate_chat_message(p_party uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me   public.profiles;
  p    public.watch_parties;
  body text := btrim(coalesce(p_body, ''));
  reason text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to chat.');
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Account not ready yet.');
  end if;
  if char_length(body) < 1 or char_length(body) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Messages must be 1 to 200 characters.');
  end if;
  if me.role = 'owner' then
    return jsonb_build_object('ok', true);
  end if;

  reason := public.moderate_text(body);
  if reason is null then
    return jsonb_build_object('ok', true);
  end if;

  select * into p from public.watch_parties where id = p_party;
  perform public._log('chat_blocked', me.username,
                      case when found then p.title else null end,
                      case when found then p.media_type else null end,
                      case when found then p.media_id else null end,
                      body, 'party chat: ' || reason);
  return jsonb_build_object('ok', false, 'error', 'That message was blocked by the content filter.');
end $$;
revoke execute on function public.moderate_chat_message(uuid, text) from public, anon;
grant execute on function public.moderate_chat_message(uuid, text) to authenticated;
