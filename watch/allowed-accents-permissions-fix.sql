-- Fix profile updates failing with: permission denied for function allowed_accents
-- The profiles validation trigger calls this helper as part of normal member updates.
-- Its only output is the public list of accent colors available for a tier.

grant execute on function public.allowed_accents(text) to authenticated;
grant execute on function public.allowed_accents(text) to anon;
