-- ============================================================================
-- Fix: INSERT ... RETURNING blocked by the hardened read policies (2026-07-05)
--
-- The member-scoped select policies delegated entirely to
-- ec_is_event_member(), which re-queries the table. Inside the same statement
-- an INSERT's new row is not yet visible to that query, so the RETURNING
-- read-back failed with "new row violates row-level security policy":
--   - creating a destination (ec_events insert ... returning id)
--   - a fresh join       (ec_rsvps upsert ... returning *)
--
-- Fix: check the row's own columns first (visible during RETURNING), and fall
-- back to the membership lookup for co-participant visibility. Semantics are
-- otherwise identical to the hardening migration. Idempotent.
-- ============================================================================

drop policy if exists ec_events_read on public.ec_events;
create policy ec_events_read on public.ec_events
  for select to authenticated
  using (host_id = auth.uid() or public.ec_is_event_member(id));

drop policy if exists ec_rsvps_read on public.ec_rsvps;
create policy ec_rsvps_read on public.ec_rsvps
  for select to authenticated
  using (user_id = auth.uid() or public.ec_is_event_member(event_id));
