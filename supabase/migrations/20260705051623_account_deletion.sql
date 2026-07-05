-- ============================================================================
-- Account deletion  (2026-07-05)
--
-- Apple App Store guideline 5.1.1(v) requires an in-app way for a user to
-- delete their account. This adds a `security definer` RPC that deletes the
-- CURRENT user's auth.users row; the existing on-delete-cascade foreign keys
-- then remove everything tied to them:
--   ec_profiles.id            -> auth.users(id)  on delete cascade
--   ec_events.host_id         -> auth.users(id)  on delete cascade
--   ec_rsvps.user_id          -> auth.users(id)  on delete cascade
--   ec_checkins.user_id       -> auth.users(id)  on delete cascade
--   ec_location_pings.user_id -> auth.users(id)  on delete cascade
-- (and deleting a hosted ec_events row cascades to its rsvps/checkins/pings).
--
-- SECURITY DEFINER + `search_path = public, auth` lets the function reach
-- auth.users, but it only ever deletes auth.uid() — the caller's own row — so
-- an authenticated user can delete themselves and no one else.
--
-- Idempotent: safe to re-run (create or replace).
-- ============================================================================
create or replace function public.ec_delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.ec_delete_account() from public;
revoke all on function public.ec_delete_account() from anon;
grant execute on function public.ec_delete_account() to authenticated;
