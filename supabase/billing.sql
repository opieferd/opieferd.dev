-- RLS enabled with no policies: only the service role (edge functions) can read/write.
create table if not exists public.btc_invoices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  received_at timestamptz not null default now()
);
alter table public.btc_invoices enable row level security;

create table if not exists public.btc_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,
  expires_at timestamptz not null
);
alter table public.btc_subscriptions enable row level security;

-- Downgrade expired supporters hourly (requires the pg_cron extension).
create or replace function public.expire_btc_subscriptions() returns void
language sql security definer set search_path = public as $$
  update profiles set tier = 'free'
  where id in (select user_id from btc_subscriptions where expires_at < now())
    and role <> 'owner' and tier <> 'free';
$$;
revoke all on function public.expire_btc_subscriptions() from public, anon, authenticated;
select cron.schedule('expire-btc-subscriptions', '0 * * * *', 'select public.expire_btc_subscriptions()');
