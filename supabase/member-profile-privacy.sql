-- REALCHECK member profile privacy and safe public profile lookup
alter table public.profiles
  add column if not exists is_public boolean not null default true,
  add column if not exists show_location boolean not null default false;

create or replace function public.get_realcheck_public_profile(p_username text)
returns table (
  id uuid,
  display_name text,
  username text,
  headline text,
  bio text,
  avatar_url text,
  location text,
  occupation text,
  interests text,
  languages text,
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
    p.bio,
    p.avatar_url,
    case when p.show_location then p.location else null end,
    p.occupation,
    p.interests,
    p.languages,
    exists (
      select 1
      from public.identity_verifications v
      where v.user_id = p.id
        and v.provider = 'sumsub'
        and v.status = 'verified'
    )
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
    and (p.is_public = true or p.id = auth.uid())
    and auth.uid() is not null
  limit 1;
$$;

revoke all on function public.get_realcheck_public_profile(text) from public;
grant execute on function public.get_realcheck_public_profile(text) to authenticated;
