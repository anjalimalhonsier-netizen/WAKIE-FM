-- Wakie FM database schema. Run once in Supabase -> SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.song_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  requested_by text not null default 'Anonymous',
  normalized_key text not null,
  status text not null default 'queued'
    check (status in ('queued', 'playing', 'played', 'skipped')),
  votes integer not null default 0 check (votes >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index if not exists song_requests_one_active_duplicate
  on public.song_requests(normalized_key)
  where status in ('queued', 'playing');

create index if not exists song_requests_queue_order
  on public.song_requests(status, created_at);

create table if not exists public.song_votes (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.song_requests(id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  unique(song_id, voter_hash)
);

-- Only the server (using the Supabase service-role key) should access these tables.
alter table public.song_requests enable row level security;
alter table public.song_votes enable row level security;

-- Atomic voting: one vote per browser/device hash for each request.
create or replace function public.cast_song_vote(p_song_id uuid, p_voter_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from song_requests
    where id = p_song_id and status = 'queued'
  ) then
    return false;
  end if;

  insert into song_votes(song_id, voter_hash)
  values (p_song_id, p_voter_hash)
  on conflict (song_id, voter_hash) do nothing;

  if found then
    update song_requests set votes = votes + 1
    where id = p_song_id and status = 'queued';
    return true;
  end if;

  return false;
end;
$$;

-- Move the next queued request into Now Playing, finishing any previous track.
create or replace function public.dj_play_next()
returns setof public.song_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  next_id uuid;
begin
  update song_requests
    set status = 'played', finished_at = now()
    where status = 'playing';

  select id into next_id
    from song_requests
    where status = 'queued'
    order by votes desc, created_at asc
    limit 1
    for update skip locked;

  if next_id is null then
    return;
  end if;

  update song_requests
    set status = 'playing', started_at = now()
    where id = next_id;

  return query select * from song_requests where id = next_id;
end;
$$;

create or replace function public.dj_finish_current()
returns void
language sql
security definer
set search_path = public
as $$
  update song_requests
  set status = 'played', finished_at = now()
  where status = 'playing';
$$;

create or replace function public.dj_skip_current()
returns void
language sql
security definer
set search_path = public
as $$
  update song_requests
  set status = 'skipped', finished_at = now()
  where status = 'playing';
$$;

-- The API uses the service-role key. Do not expose it in browser code.


-- Prevent anonymous clients from invoking privileged database functions.
revoke all on function public.cast_song_vote(uuid, text) from public, anon, authenticated;
revoke all on function public.dj_play_next() from public, anon, authenticated;
revoke all on function public.dj_finish_current() from public, anon, authenticated;
revoke all on function public.dj_skip_current() from public, anon, authenticated;
grant execute on function public.cast_song_vote(uuid, text) to service_role;
grant execute on function public.dj_play_next() to service_role;
grant execute on function public.dj_finish_current() to service_role;
grant execute on function public.dj_skip_current() to service_role;
