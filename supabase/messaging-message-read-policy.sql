-- REALCHECK: ensure conversation participants can read their own message history.
-- This does not grant access to messages in conversations they do not belong to.

alter table public.realcheck_messages enable row level security;

drop policy if exists "realcheck_messages_select_participants" on public.realcheck_messages;

create policy "realcheck_messages_select_participants"
on public.realcheck_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.realcheck_conversations c
    where c.id = realcheck_messages.conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
      and public.realcheck_users_are_connected(
        case
          when c.participant_a = auth.uid() then c.participant_b
          else c.participant_a
        end
      )
  )
);

grant select on public.realcheck_messages to authenticated;
