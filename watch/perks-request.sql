-- Perks requests: signed-in users submit the wallet they paid from; it is written to moderation_log.
create or replace function public.request_perks(p_wallet text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles%rowtype;
  wallet text := btrim(coalesce(p_wallet, ''));
  recent int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to contact for perks.');
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found or me.banned then
    return jsonb_build_object('ok', false, 'error', 'Account not available.');
  end if;
  if wallet !~ '^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid Bitcoin address.');
  end if;
  select count(*) into recent from public.moderation_log
    where action = 'perks_request' and actor_name = me.username and created_at > now() - interval '1 hour';
  if recent >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Too many requests. Try again later.');
  end if;
  perform public._log('perks_request', me.username, me.username, null, null, wallet, 'Contact for perks');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.request_perks(text) from public, anon;
grant execute on function public.request_perks(text) to authenticated;
