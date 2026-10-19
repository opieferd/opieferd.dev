-- Opie Watch: Gold-only Watch Parties access.
-- Run this in Supabase SQL Editor for existing projects.
-- The client-side gate is convenience; these RLS/function checks enforce access server-side.

-- Party rows and member lists are visible only to Gold Supporters (and the owner).
drop policy if exists "watch_parties read" on public.watch_parties;
drop policy if exists "watch_parties insert" on public.watch_parties;
drop policy if exists "watch_parties update host" on public.watch_parties;
drop policy if exists "watch_parties delete host" on public.watch_parties;

create policy "watch_parties read"
  on public.watch_parties for select
  using (public.is_gold() and (kind = 'public' or host_id = auth.uid()));

create policy "watch_parties insert"
  on public.watch_parties for insert
  with check (public.is_gold() and auth.uid() = host_id);

create policy "watch_parties update host"
  on public.watch_parties for update
  using (public.is_gold() and auth.uid() = host_id)
  with check (public.is_gold() and auth.uid() = host_id);

create policy "watch_parties delete host"
  on public.watch_parties for delete
  using (public.is_gold() and auth.uid() = host_id);

drop policy if exists "watch_party_members read" on public.watch_party_members;
drop policy if exists "watch_party_members insert" on public.watch_party_members;
drop policy if exists "watch_party_members delete" on public.watch_party_members;

create policy "watch_party_members read"
  on public.watch_party_members for select
  using (public.is_gold());

create policy "watch_party_members insert"
  on public.watch_party_members for insert
  with check (public.is_gold() and auth.uid() = user_id);

create policy "watch_party_members delete"
  on public.watch_party_members for delete
  using (public.is_gold() and auth.uid() = user_id);

-- SECURITY DEFINER functions bypass table RLS, so check Gold explicitly too.
create or replace function public.transfer_party_host(p_party uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_gold() then return false; end if;
  if not exists (select 1 from public.watch_party_members where party_id = p_party and user_id = me) then
    return false;
  end if;
  update public.watch_parties set host_id = me, updated_at = now() where id = p_party;
  return found;
end $$;

revoke execute on function public.transfer_party_host(uuid) from public, anon;
grant execute on function public.transfer_party_host(uuid) to authenticated;

create or replace function public.join_watch_party_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.watch_parties;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to join a party.');
  end if;
  if not public.is_gold() then
    return jsonb_build_object('ok', false, 'error', 'Watch Parties are a Gold Supporter perk.');
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

create or replace function public.moderate_chat_message(p_party uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  p public.watch_parties;
  body text := btrim(coalesce(p_body, ''));
  reason text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to chat.');
  end if;
  if not public.is_gold() then
    return jsonb_build_object('ok', false, 'error', 'Watch Parties are a Gold Supporter perk.');
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
