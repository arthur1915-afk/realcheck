-- REALCHECK connection requests
create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_requests_not_self check (sender_id <> receiver_id)
);
create index if not exists connection_requests_receiver_status_idx on public.connection_requests(receiver_id,status,created_at desc);
create index if not exists connection_requests_sender_status_idx on public.connection_requests(sender_id,status,created_at desc);
alter table public.connection_requests enable row level security;
revoke all on public.connection_requests from anon, authenticated;

create or replace function public.send_realcheck_connection_request(p_username text)
returns text language plpgsql security definer set search_path=public
as $$
declare target_id uuid; existing_status text;
begin
 if auth.uid() is null then raise exception 'Please log in first.'; end if;
 select id into target_id from public.profiles
 where lower(username)=lower(trim(p_username)) and is_public=true;
 if target_id is null then raise exception 'This member is unavailable.'; end if;
 if target_id=auth.uid() then raise exception 'You cannot send a request to yourself.'; end if;
 select status into existing_status from public.connection_requests
 where (sender_id=auth.uid() and receiver_id=target_id) or (sender_id=target_id and receiver_id=auth.uid())
 order by created_at desc limit 1;
 if existing_status='pending' then return 'pending'; end if;
 if existing_status='accepted' then return 'connected'; end if;
 insert into public.connection_requests(sender_id,receiver_id,status)
 values(auth.uid(),target_id,'pending');
 return 'sent';
end; $$;

create or replace function public.respond_realcheck_connection_request(p_request_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path=public
as $$
declare req public.connection_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'Please log in first.'; end if;
 select * into req from public.connection_requests where id=p_request_id for update;
 if not found or req.receiver_id<>auth.uid() then raise exception 'Request not found.'; end if;
 if req.status<>'pending' then raise exception 'This request is no longer pending.'; end if;
 update public.connection_requests set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now() where id=p_request_id;
 return case when p_accept then 'accepted' else 'declined' end;
end; $$;

create or replace function public.cancel_realcheck_connection_request(p_request_id uuid)
returns text language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'Please log in first.'; end if;
 update public.connection_requests set status='cancelled',updated_at=now()
 where id=p_request_id and sender_id=auth.uid() and status='pending';
 if not found then raise exception 'Pending request not found.'; end if;
 return 'cancelled';
end; $$;

create or replace function public.list_realcheck_connection_requests()
returns table (
 request_id uuid, status text, direction text, created_at timestamptz,
 member_id uuid, display_name text, username text, avatar_url text, headline text, is_verified boolean
) language sql stable security definer set search_path=public
as $$
 select r.id,r.status,
   case when r.receiver_id=auth.uid() then 'incoming' else 'outgoing' end,
   r.created_at,p.id,p.display_name,p.username,p.avatar_url,p.headline,
   exists(select 1 from public.identity_verifications v where v.user_id=p.id and v.provider='sumsub' and v.status='verified')
 from public.connection_requests r
 join public.profiles p on p.id=case when r.receiver_id=auth.uid() then r.sender_id else r.receiver_id end
 where auth.uid() is not null and (r.sender_id=auth.uid() or r.receiver_id=auth.uid())
 order by r.created_at desc limit 100;
$$;
revoke all on function public.send_realcheck_connection_request(text) from public;
revoke all on function public.respond_realcheck_connection_request(uuid,boolean) from public;
revoke all on function public.cancel_realcheck_connection_request(uuid) from public;
revoke all on function public.list_realcheck_connection_requests() from public;
grant execute on function public.send_realcheck_connection_request(text) to authenticated;
grant execute on function public.respond_realcheck_connection_request(uuid,boolean) to authenticated;
grant execute on function public.cancel_realcheck_connection_request(uuid) to authenticated;
grant execute on function public.list_realcheck_connection_requests() to authenticated;
