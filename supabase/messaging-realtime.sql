-- REALCHECK messaging: safe conversation member display + realtime feed

create or replace function public.get_realcheck_conversation_member(p_conversation_id uuid)
returns table(display_name text, username text)
language sql
stable
security definer
set search_path = public
as $$
    select p.display_name, p.username
    from public.realcheck_conversations c
    join public.profiles p
      on p.id = case
          when c.participant_a = auth.uid() then c.participant_b
          else c.participant_a
      end
    where c.id = p_conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
      and public.realcheck_users_are_connected(
          case
              when c.participant_a = auth.uid() then c.participant_b
              else c.participant_a
          end
      )
    limit 1;
$$;

revoke all on function public.get_realcheck_conversation_member(uuid) from public;
grant execute on function public.get_realcheck_conversation_member(uuid) to authenticated;

-- Enable Supabase Realtime for newly inserted chat messages.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'realcheck_messages'
    ) then
        alter publication supabase_realtime add table public.realcheck_messages;
    end if;
end $$;
