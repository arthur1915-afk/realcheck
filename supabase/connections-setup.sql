-- REALCHECK accepted connections list
create or replace function public.list_realcheck_connections()
returns table (
 connection_id uuid,
 connected_at timestamptz,
 member_id uuid,
 display_name text,
 username text,
 avatar_url text,
 headline text,
 is_verified boolean
)
language sql stable security definer set search_path=public
as $$
 select r.id,r.updated_at,p.id,p.display_name,p.username,p.avatar_url,p.headline,
   exists(select 1 from public.identity_verifications v
          where v.user_id=p.id and v.provider='sumsub' and v.status='verified')
 from public.connection_requests r
 join public.profiles p
   on p.id=case when r.sender_id=auth.uid() then r.receiver_id else r.sender_id end
 where auth.uid() is not null
   and r.status='accepted'
   and (r.sender_id=auth.uid() or r.receiver_id=auth.uid())
   and not exists (
     select 1 from public.connection_requests newer
     where newer.status='accepted'
       and ((newer.sender_id=r.sender_id and newer.receiver_id=r.receiver_id)
         or (newer.sender_id=r.receiver_id and newer.receiver_id=r.sender_id))
       and newer.updated_at>r.updated_at
   )
 order by r.updated_at desc
 limit 200;
$$;
revoke all on function public.list_realcheck_connections() from public;
grant execute on function public.list_realcheck_connections() to authenticated;
