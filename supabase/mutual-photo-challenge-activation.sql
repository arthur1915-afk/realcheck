-- REALCHECK: activate mutual pose challenge, accept private photo submissions,
-- and enforce the chat lock at the database layer.
-- Run after mutual-photo-challenge-setup.sql and mutual-photo-challenge-manual-approval.sql.

create or replace function public.realcheck_chat_is_unlocked(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.realcheck_pose_sessions s
    where s.conversation_id = p_conversation_id
      and s.status = 'passed'
      and auth.uid() in (s.participant_a, s.participant_b)
  );
$$;

revoke all on function public.realcheck_chat_is_unlocked(uuid) from public, anon;
grant execute on function public.realcheck_chat_is_unlocked(uuid) to authenticated;

alter table public.realcheck_pose_attempts
  add column if not exists participant_a_ready_at timestamptz,
  add column if not exists participant_b_ready_at timestamptz;

create or replace function public.begin_realcheck_pose_challenge(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_conversation public.realcheck_conversations%rowtype;
  v_session public.realcheck_pose_sessions%rowtype;
  v_attempt public.realcheck_pose_attempts%rowtype;
  v_prompt public.realcheck_pose_prompts%rowtype;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;

  select * into v_conversation
  from public.realcheck_conversations
  where id = p_conversation_id
    and v_user in (participant_a, participant_b)
  for share;
  if not found then raise exception 'Conversation not found.'; end if;

  if not public.realcheck_users_are_connected(
    case when v_conversation.participant_a = v_user
      then v_conversation.participant_b else v_conversation.participant_a end
  ) then raise exception 'This connection is no longer active.'; end if;

  insert into public.realcheck_pose_sessions
    (conversation_id, participant_a, participant_b, status, current_attempt, started_at)
  values
    (p_conversation_id, v_conversation.participant_a, v_conversation.participant_b,
     'pending', 1, now())
  on conflict (conversation_id) do nothing;

  select * into v_session
  from public.realcheck_pose_sessions
  where conversation_id = p_conversation_id
  for update;

  if v_session.status = 'passed' then
    return jsonb_build_object('status','passed','message','Both participants have completed verification. Chat is unlocked.');
  elsif v_session.status = 'failed' then
    return jsonb_build_object('status','failed','message','The three challenge attempts have been used. Chat remains locked.');
  end if;

  select * into v_attempt
  from public.realcheck_pose_attempts
  where session_id = v_session.id
    and status = 'active'
  order by attempt_number desc
  limit 1;

  if not found then
    if v_session.current_attempt > 3 then
      update public.realcheck_pose_sessions set status='failed', completed_at=now()
      where id=v_session.id;
      return jsonb_build_object('status','failed','message','No attempts remain.');
    end if;

    select * into v_prompt
    from public.realcheck_pose_prompts p
    where p.enabled
      and not exists (
        select 1 from public.realcheck_pose_attempts old
        where old.session_id=v_session.id and old.prompt_id=p.id
      )
    order by random()
    limit 1;

    if not found then raise exception 'No challenge prompts are available.'; end if;

    insert into public.realcheck_pose_attempts
      (session_id,attempt_number,prompt_id,prompt_text,status,started_at,expires_at)
    values
      (v_session.id,v_session.current_attempt,v_prompt.id,v_prompt.prompt_text,
       'active',now(),'infinity'::timestamptz)
    returning * into v_attempt;

    update public.realcheck_pose_sessions
    set status='active', started_at=coalesce(started_at,now())
    where id=v_session.id;
  end if;

  -- Each participant must reach this same attempt before its 20-second clock starts.
  if v_conversation.participant_a = v_user then
    update public.realcheck_pose_attempts
      set participant_a_ready_at = coalesce(participant_a_ready_at, now())
      where id = v_attempt.id returning * into v_attempt;
  else
    update public.realcheck_pose_attempts
      set participant_b_ready_at = coalesce(participant_b_ready_at, now())
      where id = v_attempt.id returning * into v_attempt;
  end if;

  if v_attempt.participant_a_ready_at is null
     or v_attempt.participant_b_ready_at is null then
    return jsonb_build_object(
      'status','waiting_for_partner',
      'session_id',v_session.id,
      'attempt_id',v_attempt.id,
      'attempt',v_attempt.attempt_number,
      'prompt_id',v_attempt.prompt_id,
      'prompt',v_attempt.prompt_text,
      'message','You are ready. Waiting for the other participant to join this attempt.'
    );
  end if;

  if v_attempt.expires_at = 'infinity'::timestamptz then
    update public.realcheck_pose_attempts
      set started_at = now(), expires_at = now() + interval '20 seconds'
      where id = v_attempt.id returning * into v_attempt;
  end if;

  if now() >= v_attempt.expires_at then
    update public.realcheck_pose_attempts set status='expired',completed_at=now()
    where id=v_attempt.id;
    if v_attempt.attempt_number >= 3 then
      update public.realcheck_pose_sessions set status='failed',completed_at=now()
      where id=v_session.id;
      return jsonb_build_object('status','failed','message','The final challenge attempt expired. Chat remains locked.');
    end if;
    update public.realcheck_pose_sessions set current_attempt=v_attempt.attempt_number+1
    where id=v_session.id;
    return public.begin_realcheck_pose_challenge(p_conversation_id);
  end if;

  return jsonb_build_object(
    'status','active',
    'session_id',v_session.id,
    'attempt_id',v_attempt.id,
    'attempt',v_attempt.attempt_number,
    'prompt_id',v_attempt.prompt_id,
    'prompt',v_attempt.prompt_text,
    'expires_at',v_attempt.expires_at
  );
end;
$$;

create or replace function public.register_realcheck_pose_submission(
  p_attempt_id uuid,
  p_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.realcheck_pose_attempts%rowtype;
  v_session public.realcheck_pose_sessions%rowtype;
  v_submission_id uuid;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  select * into v_attempt from public.realcheck_pose_attempts
  where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'active' or v_attempt.expires_at = 'infinity'::timestamptz or now() >= v_attempt.expires_at then
    raise exception 'This challenge has expired. Start the next attempt.';
  end if;
  select * into v_session from public.realcheck_pose_sessions
  where id=v_attempt.session_id for update;
  if v_user not in (v_session.participant_a,v_session.participant_b)
     or v_session.status <> 'active'
     or v_attempt.participant_a_ready_at is null
     or v_attempt.participant_b_ready_at is null then
    raise exception 'You are not allowed to submit to this challenge.';
  end if;
  if p_photo_path !~ ('^' || v_user::text || '/' || v_session.id::text || '/' || v_attempt.id::text || '/[^/]+[.](jpg|jpeg|png|webp)$') then
    raise exception 'Invalid private photo path.';
  end if;
  insert into public.realcheck_pose_submissions(attempt_id,user_id,photo_path)
  values(v_attempt.id,v_user,p_photo_path)
  returning id into v_submission_id;
  return v_submission_id;
end;
$$;

create or replace function public.realcheck_can_upload_pose_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.realcheck_pose_submissions sub
    join public.realcheck_pose_attempts a on a.id=sub.attempt_id
    join public.realcheck_pose_sessions s on s.id=a.session_id
    where sub.photo_path=p_object_name
      and sub.user_id=auth.uid()
      and a.status='active'
      and s.status='active'
      and now()<a.expires_at
  );
$$;

revoke all on function public.realcheck_can_upload_pose_photo(text) from public, anon;
grant execute on function public.realcheck_can_upload_pose_photo(text) to authenticated;

drop policy if exists "challenge photos owner upload" on storage.objects;
create policy "challenge photos owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id='realcheck-challenge-photos'
  and public.realcheck_can_upload_pose_photo(name)
);

revoke all on function public.begin_realcheck_pose_challenge(uuid) from public, anon;
revoke all on function public.register_realcheck_pose_submission(uuid,text) from public, anon;
grant execute on function public.begin_realcheck_pose_challenge(uuid) to authenticated;
grant execute on function public.register_realcheck_pose_submission(uuid,text) to authenticated;

-- Replace all existing message policies so the database, not just the UI,
-- prevents messages being read or sent before mutual verification passes.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname='public' and tablename='realcheck_messages'
  loop
    execute format('drop policy if exists %I on public.realcheck_messages',p.policyname);
  end loop;
end $$;

create policy "verified connection members read messages"
on public.realcheck_messages for select to authenticated
using (
  exists (
    select 1 from public.realcheck_conversations c
    where c.id=realcheck_messages.conversation_id
      and auth.uid() in (c.participant_a,c.participant_b)
      and public.realcheck_users_are_connected(
        case when c.participant_a=auth.uid() then c.participant_b else c.participant_a end
      )
      and public.realcheck_chat_is_unlocked(c.id)
  )
);

create policy "verified connection members send messages"
on public.realcheck_messages for insert to authenticated
with check (
  sender_id=auth.uid()
  and exists (
    select 1 from public.realcheck_conversations c
    where c.id=realcheck_messages.conversation_id
      and auth.uid() in (c.participant_a,c.participant_b)
      and public.realcheck_users_are_connected(
        case when c.participant_a=auth.uid() then c.participant_b else c.participant_a end
      )
      and public.realcheck_chat_is_unlocked(c.id)
  )
);

grant select, insert on public.realcheck_messages to authenticated;
