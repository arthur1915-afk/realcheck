-- REALCHECK mutual photo challenge: private, server-controlled foundation.
-- Photos are uploaded by a trusted Edge Function using the service role.
-- Browser clients cannot create sessions, mark attempts as passed, or upload challenge photos.

create table if not exists public.realcheck_pose_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.realcheck_conversations(id) on delete cascade,
  participant_a uuid not null references auth.users(id) on delete cascade,
  participant_b uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','passed','failed')),
  current_attempt smallint not null default 1
    check (current_attempt between 1 and 3),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (participant_a <> participant_b),
  unique (conversation_id)
);

create table if not exists public.realcheck_pose_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.realcheck_pose_sessions(id) on delete cascade,
  attempt_number smallint not null check (attempt_number between 1 and 3),
  prompt_id text not null,
  prompt_text text not null,
  status text not null default 'active'
    check (status in ('active','passed','failed','expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, attempt_number),
  unique (session_id, prompt_id),
  check (expires_at > started_at)
);

create table if not exists public.realcheck_pose_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.realcheck_pose_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null unique,
  evaluation_status text not null default 'pending'
    check (evaluation_status in ('pending','passed','failed','expired')),
  submitted_at timestamptz not null default now(),
  evaluated_at timestamptz,
  unique (attempt_id, user_id)
);

create index if not exists realcheck_pose_sessions_participants_idx
  on public.realcheck_pose_sessions(participant_a, participant_b);
create index if not exists realcheck_pose_attempts_session_idx
  on public.realcheck_pose_attempts(session_id, attempt_number);
create index if not exists realcheck_pose_submissions_attempt_idx
  on public.realcheck_pose_submissions(attempt_id);

alter table public.realcheck_pose_sessions enable row level security;
alter table public.realcheck_pose_attempts enable row level security;
alter table public.realcheck_pose_submissions enable row level security;

drop policy if exists "pose sessions participants read" on public.realcheck_pose_sessions;
create policy "pose sessions participants read"
on public.realcheck_pose_sessions for select to authenticated
using (auth.uid() in (participant_a, participant_b));

drop policy if exists "pose attempts participants read" on public.realcheck_pose_attempts;
create policy "pose attempts participants read"
on public.realcheck_pose_attempts for select to authenticated
using (
  exists (
    select 1 from public.realcheck_pose_sessions s
    where s.id = realcheck_pose_attempts.session_id
      and auth.uid() in (s.participant_a, s.participant_b)
  )
);

drop policy if exists "pose submissions participants read" on public.realcheck_pose_submissions;
create policy "pose submissions participants read"
on public.realcheck_pose_submissions for select to authenticated
using (
  exists (
    select 1
    from public.realcheck_pose_attempts a
    join public.realcheck_pose_sessions s on s.id = a.session_id
    where a.id = realcheck_pose_submissions.attempt_id
      and auth.uid() in (s.participant_a, s.participant_b)
  )
);

-- No direct client writes: only trusted Edge Functions using service role may mutate these tables.
revoke all on public.realcheck_pose_sessions from anon, authenticated;
revoke all on public.realcheck_pose_attempts from anon, authenticated;
revoke all on public.realcheck_pose_submissions from anon, authenticated;
grant select on public.realcheck_pose_sessions to authenticated;
grant select on public.realcheck_pose_attempts to authenticated;
grant select on public.realcheck_pose_submissions to authenticated;

-- Private bucket. Edge Functions upload and issue short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('realcheck-challenge-photos', 'realcheck-challenge-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "challenge photos participants view" on storage.objects;
create policy "challenge photos participants view"
on storage.objects for select to authenticated
using (
  bucket_id = 'realcheck-challenge-photos'
  and exists (
    select 1
    from public.realcheck_pose_submissions sub
    join public.realcheck_pose_attempts a on a.id = sub.attempt_id
    join public.realcheck_pose_sessions s on s.id = a.session_id
    where sub.photo_path = storage.objects.name
      and auth.uid() in (s.participant_a, s.participant_b)
  )
);

-- Intentionally no authenticated INSERT/UPDATE/DELETE storage policies.
-- Photo paths must be created by the server after validating session membership and deadlines.
