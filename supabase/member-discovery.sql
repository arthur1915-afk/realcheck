-- REALCHECK member discovery
-- Search returns only public, discoverable profiles and never returns email or identity documents.
create or replace function public.search_realcheck_members(p_query text)
returns table (
  id uuid,
  display_name text,
  username text,
  headline text,
  avatar_url text,
  location text,
  occupation text,
  is_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.username,
    p.headline,
    p.avatar_url,
    case when p.show_location then p.location else null end,
    p.occupation,
    exists (
      select 1 from public.identity_verifications v
      where v.user_id = p.id and v.provider = 'sumsub' and v.status = 'verified'
    )
  from public.profiles p
  where auth.uid() is not null
    and p.is_public = true
    and p.id <> auth.uid()
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      p.username ilike '%' || trim(p_query) || '%'
      or p.display_name ilike '%' || trim(p_query) || '%'
    )
  order by
    case when lower(p.username) = lower(trim(p_query)) then 0 else 1 end,
    p.display_name
  limit 30;
$$;
revoke all on function public.search_realcheck_members(text) from public;
grant execute on function public.search_realcheck_members(text) to authenticated;
