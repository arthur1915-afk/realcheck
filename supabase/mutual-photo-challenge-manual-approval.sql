-- REALCHECK: mutual human review for pose-photo submissions.
-- Run after mutual-photo-challenge-setup.sql.
-- Only the opposite participant can review a submission. Both users must submit
-- for the same attempt, and both must approve before the session passes.

alter table public.realcheck_pose_submissions
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending','approved','denied')),
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

create table if not exists public.realcheck_pose_prompts (
  id text primary key,
  category text not null,
  prompt_text text not null,
  enabled boolean not null default true
);

insert into public.realcheck_pose_prompts (id, category, prompt_text) values
('hands_three','Hand gestures','Hold up three fingers clearly toward the camera.'),
('peace_sign','Hand gestures','Make a peace sign beside your face.'),
('thumbs_up','Hand gestures','Give a thumbs-up beside your face.'),
('open_palm','Hand gestures','Hold one open palm up beside your face.'),
('fist','Hand gestures','Show a closed fist beside your shoulder.'),
('two_thumbs','Hand gestures','Show two thumbs up.'),
('point_up','Hand gestures','Point one index finger upward.'),
('point_side','Hand gestures','Point one index finger to your left.'),
('ok_sign','Hand gestures','Make an OK sign with one hand.'),
('cross_fingers','Hand gestures','Cross your index and middle fingers.'),
('rock_sign','Hand gestures','Make a rock-on hand sign.'),
('four_fingers','Hand gestures','Hold up four fingers on one hand.'),
('one_finger','Hand gestures','Hold up one index finger.'),
('finger_heart','Hand gestures','Make a small finger-heart gesture.'),
('both_palms','Hand gestures','Show both open palms toward the camera.'),
('smile','Face expressions','Give the camera a wide, natural smile.'),
('pout','Face expressions','Make a gentle pout with your lips.'),
('raised_brows','Face expressions','Raise both eyebrows while looking at the camera.'),
('cheeks','Face expressions','Puff out both cheeks.'),
('wink','Face expressions','Wink your left eye.'),
('eyes_wide','Face expressions','Open your eyes wide and look at the camera.'),
('closed_eyes','Face expressions','Close both eyes gently.'),
('laugh','Face expressions','Make a laughing expression.'),
('surprised','Face expressions','Make a surprised expression.'),
('neutral','Face expressions','Look directly at the camera with a neutral expression.'),
('nose_touch','Face and hand','Touch the tip of your nose with one index finger.'),
('chin_touch','Face and hand','Rest one index finger gently on your chin.'),
('left_cheek','Face and hand','Touch your left cheek with one finger.'),
('right_cheek','Face and hand','Touch your right cheek with one finger.'),
('left_ear','Face and hand','Touch your left ear with your left hand.'),
('right_ear','Face and hand','Touch your right ear with your right hand.'),
('temple','Face and hand','Touch your temple with one index finger.'),
('chin_two','Face and hand','Place two fingers gently under your chin.'),
('cheek_palm','Face and hand','Rest one palm lightly against your cheek.'),
('forehead_touch','Face and hand','Touch your forehead with one index finger.'),
('head_left','Head movement','Tilt your head slightly to the left.'),
('head_right','Head movement','Tilt your head slightly to the right.'),
('look_up','Head movement','Keep your face visible and look upward.'),
('look_down','Head movement','Keep your face visible and look downward.'),
('look_left','Head movement','Turn your face slightly to your left.'),
('look_right','Head movement','Turn your face slightly to your right.'),
('chin_up','Head movement','Lift your chin slightly while facing the camera.'),
('chin_down','Head movement','Lower your chin slightly while facing the camera.'),
('shoulder_left','Upper body','Raise your left shoulder slightly.'),
('shoulder_right','Upper body','Raise your right shoulder slightly.'),
('arms_crossed','Upper body','Cross your arms comfortably in front of your chest.'),
('hands_hips','Upper body','Place both hands on your hips.'),
('left_arm_up','Upper body','Raise your left arm beside your head.'),
('right_arm_up','Upper body','Raise your right arm beside your head.'),
('both_arms_up','Upper body','Raise both arms above your shoulders.'),
('hands_together','Upper body','Bring your palms together in front of your chest.'),
('hands_clasped','Upper body','Clasp both hands together below your chin.'),
('wave','Upper body','Wave one hand toward the camera.'),
('peace_cheek','Combined poses','Make a peace sign beside your left cheek and smile.'),
('thumb_headtilt','Combined poses','Give a thumbs-up and tilt your head slightly right.'),
('three_smile','Combined poses','Hold up three fingers and smile.'),
('palm_smile','Combined poses','Show an open palm beside your face and smile.'),
('chin_wink','Combined poses','Touch your chin with one finger and wink.'),
('both_thumbs_smile','Combined poses','Give two thumbs up and smile.'),
('point_cheek','Combined poses','Point to your right cheek and smile.'),
('hand_heart','Combined poses','Make a heart shape with both hands in front of your chest.'),
('wave_headtilt','Combined poses','Wave with your right hand and tilt your head left.'),
('fingers_cheek','Combined poses','Hold up two fingers beside your right cheek.')
on conflict (id) do update set
  category = excluded.category,
  prompt_text = excluded.prompt_text,
  enabled = true;

alter table public.realcheck_pose_prompts enable row level security;
revoke all on public.realcheck_pose_prompts from anon, authenticated;
grant select on public.realcheck_pose_prompts to authenticated;
drop policy if exists "pose prompts readable by signed-in users" on public.realcheck_pose_prompts;
create policy "pose prompts readable by signed-in users"
on public.realcheck_pose_prompts for select to authenticated using (enabled = true);

create or replace function public.review_realcheck_pose_submission(
  p_submission_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_submission public.realcheck_pose_submissions%rowtype;
  v_attempt public.realcheck_pose_attempts%rowtype;
  v_session public.realcheck_pose_sessions%rowtype;
  v_other_submission public.realcheck_pose_submissions%rowtype;
  v_next_prompt public.realcheck_pose_prompts%rowtype;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_submission
  from public.realcheck_pose_submissions
  where id = p_submission_id
  for update;

  if not found then raise exception 'Photo submission not found.'; end if;

  select * into v_attempt
  from public.realcheck_pose_attempts
  where id = v_submission.attempt_id
  for update;

  select * into v_session
  from public.realcheck_pose_sessions
  where id = v_attempt.session_id
  for update;

  if v_user not in (v_session.participant_a, v_session.participant_b)
     or v_user = v_submission.user_id then
    raise exception 'Only the other participant can review this photo.';
  end if;

  if v_session.status <> 'active' or v_attempt.status <> 'active' then
    raise exception 'This challenge attempt is no longer active.';
  end if;

  if now() >= v_attempt.expires_at then
    update public.realcheck_pose_attempts set status = 'expired', completed_at = now()
      where id = v_attempt.id;
    update public.realcheck_pose_submissions
      set evaluation_status = 'expired', review_status = 'denied'
      where attempt_id = v_attempt.id and review_status = 'pending';
    if v_attempt.attempt_number >= 3 then
      update public.realcheck_pose_sessions set status = 'failed', completed_at = now()
        where id = v_session.id;
      return jsonb_build_object('status','failed','message','The final challenge attempt expired. Chat remains locked.');
    end if;

    select * into v_next_prompt
    from public.realcheck_pose_prompts p
    where p.enabled
      and not exists (
        select 1 from public.realcheck_pose_attempts old
        where old.session_id = v_session.id and old.prompt_id = p.id
      )
    order by random()
    limit 1;

    if not found then
      update public.realcheck_pose_sessions set status = 'failed', completed_at = now()
        where id = v_session.id;
      return jsonb_build_object('status','failed','message','No unused challenge prompts remain. Chat remains locked.');
    end if;

    update public.realcheck_pose_sessions
      set current_attempt = v_attempt.attempt_number + 1
      where id = v_session.id;

    insert into public.realcheck_pose_attempts
      (session_id, attempt_number, prompt_id, prompt_text, status, started_at, expires_at)
    values
      (v_session.id, v_attempt.attempt_number + 1, v_next_prompt.id,
       v_next_prompt.prompt_text, 'active', now(), 'infinity'::timestamptz);

    return jsonb_build_object('status','next_attempt','attempt',v_attempt.attempt_number + 1,
      'prompt',v_next_prompt.prompt_text,'message','The previous attempt expired. A new shared prompt is ready.');
  end if;

  select * into v_other_submission
  from public.realcheck_pose_submissions
  where attempt_id = v_attempt.id and user_id <> v_submission.user_id
  for update;

  if not found then
    raise exception 'Both participants must submit a photo before either can review.';
  end if;

  if v_submission.review_status <> 'pending' then
    raise exception 'You have already reviewed this photo.';
  end if;

  update public.realcheck_pose_submissions
  set review_status = case when p_approve then 'approved' else 'denied' end,
      reviewed_by = v_user,
      reviewed_at = now(),
      evaluation_status = case when p_approve then 'passed' else 'failed' end,
      evaluated_at = now()
  where id = p_submission_id;

  if not p_approve then
    update public.realcheck_pose_attempts
      set status = 'failed', completed_at = now()
      where id = v_attempt.id;

    if v_attempt.attempt_number >= 3 then
      update public.realcheck_pose_sessions
        set status = 'failed', completed_at = now()
        where id = v_session.id;
      return jsonb_build_object('status','failed','attempt',v_attempt.attempt_number,
        'message','All three challenge attempts have been used. Chat remains locked.');
    end if;

    select * into v_next_prompt
    from public.realcheck_pose_prompts p
    where p.enabled
      and not exists (
        select 1 from public.realcheck_pose_attempts old
        where old.session_id = v_session.id and old.prompt_id = p.id
      )
    order by random()
    limit 1;

    if not found then
      update public.realcheck_pose_sessions
        set status = 'failed', completed_at = now()
        where id = v_session.id;
      return jsonb_build_object('status','failed','message','No unused challenge prompts remain. Chat remains locked.');
    end if;

    update public.realcheck_pose_sessions
      set current_attempt = v_attempt.attempt_number + 1
      where id = v_session.id;

    insert into public.realcheck_pose_attempts
      (session_id, attempt_number, prompt_id, prompt_text, status, started_at, expires_at)
    values
      (v_session.id, v_attempt.attempt_number + 1, v_next_prompt.id,
       v_next_prompt.prompt_text, 'active', now(), 'infinity'::timestamptz);

    return jsonb_build_object('status','next_attempt','attempt',v_attempt.attempt_number + 1,
      'prompt',v_next_prompt.prompt_text);
  end if;

  if v_other_submission.review_status = 'approved' then
    update public.realcheck_pose_attempts
      set status = 'passed', completed_at = now()
      where id = v_attempt.id;
    update public.realcheck_pose_sessions
      set status = 'passed', completed_at = now()
      where id = v_session.id;
    return jsonb_build_object('status','passed','message','Both participants approved. Chat is unlocked.');
  end if;

  return jsonb_build_object('status','awaiting_other_review',
    'message','Your approval is saved. Waiting for the other participant to approve your photo.');
end;
$$;

revoke all on function public.review_realcheck_pose_submission(uuid, boolean) from public, anon;
grant execute on function public.review_realcheck_pose_submission(uuid, boolean) to authenticated;
