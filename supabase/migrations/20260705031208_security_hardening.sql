-- ============================================================================
-- Security hardening (2026-07-05)
--
-- 1. ec_events / ec_rsvps reads become participant-scoped: `select *` no
--    longer dumps every destination (title, address, exact coordinates) or
--    everyone's participation + ETAs — you only see events you host or joined.
-- 2. The invite flow ("the link is the key") keeps working: a signed-in user
--    who knows an event's unguessable UUID fetches exactly that one row via
--    the `ec_get_event(eid)` RPC, joins via the unchanged ec_rsvps insert
--    policy, and is then a member (so the normal selects work).
-- 3. ec_location_pings gains retention: users may delete their own pings, a
--    daily pg_cron job purges pings older than 24 h, and the app also prunes
--    a user's own stale pings on every new ping insert.
--
-- Idempotent: safe to re-run (create or replace / drop policy if exists).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper predicate: is the current user the event's host, or do they have
--    an rsvp row for it? SECURITY DEFINER so RLS policies can call it without
--    recursing into the very policies being evaluated.
-- ---------------------------------------------------------------------------
create or replace function public.ec_is_event_member(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ec_events e
    where e.id = eid and e.host_id = auth.uid()
  )
  or exists (
    select 1 from public.ec_rsvps r
    where r.event_id = eid and r.user_id = auth.uid()
  );
$$;

revoke all on function public.ec_is_event_member(uuid) from public;
revoke all on function public.ec_is_event_member(uuid) from anon;
grant execute on function public.ec_is_event_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. ec_events: members-only select. Bulk enumeration is dead — `select *`
--    returns only events you host or joined.
-- ---------------------------------------------------------------------------
drop policy if exists ec_events_read on public.ec_events;
create policy ec_events_read on public.ec_events
  for select to authenticated
  using (public.ec_is_event_member(id));

-- Invite capability: a signed-in user who knows the unguessable event UUID
-- (i.e. was sent the link) can fetch exactly that one row by primary key.
-- SECURITY DEFINER bypasses the members-only policy for this single lookup;
-- knowing the UUID *is* the capability, and UUIDs cannot be enumerated.
create or replace function public.ec_get_event(eid uuid)
returns setof public.ec_events
language sql
stable
security definer
set search_path = public
as $$
  select * from public.ec_events where id = eid;
$$;

revoke all on function public.ec_get_event(uuid) from public;
revoke all on function public.ec_get_event(uuid) from anon;
grant execute on function public.ec_get_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ec_rsvps: members-only select (participant list + ETAs are visible only
--    to people in the same event). Insert/update/delete stay own-row-only —
--    in particular the insert policy still lets a not-yet-member insert their
--    own rsvp for any event id: that IS the join for a UUID-holding invitee.
-- ---------------------------------------------------------------------------
drop policy if exists ec_rsvps_read on public.ec_rsvps;
create policy ec_rsvps_read on public.ec_rsvps
  for select to authenticated
  using (public.ec_is_event_member(event_id));

-- ---------------------------------------------------------------------------
-- 4a. ec_location_pings: users may delete their own pings (there was no
--     delete policy at all before). This also lets the app prune a user's own
--     stale pings after each insert (belt-and-braces retention).
-- ---------------------------------------------------------------------------
drop policy if exists ec_pings_delete on public.ec_location_pings;
create policy ec_pings_delete on public.ec_location_pings
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4b. Retention: purge pings older than 24 hours, daily at 04:00 UTC.
--
-- NOTE — pg_cron: this section is LAST on purpose. If the `create extension`
-- line errors (pg_cron not available/enabled on this project), everything
-- above has already been applied; retention then relies on the app-side purge
-- in app/api/pings/route.ts, which deletes the posting user's own pings older
-- than 24 h on every new ping. To enable pg_cron on Supabase: Dashboard →
-- Database → Extensions → pg_cron, then re-run just this section.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $do$
declare
  jid bigint;
begin
  -- Unschedule first so re-running this migration doesn't error or duplicate.
  select jobid into jid from cron.job where jobname = 'ec-purge-old-pings';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'ec-purge-old-pings',
    '0 4 * * *',
    $job$delete from public.ec_location_pings where created_at < now() - interval '24 hours'$job$
  );
end
$do$;
