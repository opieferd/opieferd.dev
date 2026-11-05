-- Run once in the existing Supabase project's SQL Editor (safe to re-run).
-- Private per-account watch history; no changes to public profiles or watchlists.
begin;

create table if not exists public.watch_history_preferences (
    user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
    enabled boolean not null default false
);
create table if not exists public.watch_history (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    media_type text not null check (media_type in ('movie', 'tv')),
    media_id integer not null check (media_id > 0),
    title text not null check (char_length(title) between 1 and 200),
    poster_path text not null default '' check (poster_path = '' or poster_path ~ '^/[A-Za-z0-9_.-]{1,80}$'),
    season integer not null default 0 check (season >= 0),
    episode integer not null default 0 check (episode >= 0),
    position double precision not null default 0 check (position >= 0 and position < 604800),
    duration double precision not null default 0 check (duration >= 0 and duration < 604800),
    updated_at timestamptz not null default now(),
    primary key (user_id, media_type, media_id)
);
create index if not exists watch_history_recent on public.watch_history (user_id, updated_at desc);

-- Use the database clock for ordering across devices.
create or replace function public.touch_watch_history() returns trigger
language plpgsql set search_path = public as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
drop trigger if exists touch_watch_history on public.watch_history;
create trigger touch_watch_history before insert or update on public.watch_history
    for each row execute function public.touch_watch_history();

alter table public.watch_history_preferences enable row level security;
alter table public.watch_history enable row level security;
revoke all on public.watch_history_preferences, public.watch_history from anon;
grant select, insert, update, delete on public.watch_history_preferences, public.watch_history to authenticated;

drop policy if exists "own history preferences" on public.watch_history_preferences;
create policy "own history preferences" on public.watch_history_preferences
    for all to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
drop policy if exists "own watch history" on public.watch_history;
create policy "own watch history" on public.watch_history
    for all to authenticated using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

commit;
