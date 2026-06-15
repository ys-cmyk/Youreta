-- ============================================================================
-- Event Check-in app schema  ("Your ETA")
-- All tables are prefixed `ec_` so they never collide with the existing
-- agent-protocol tables (agents / protocol_logs / replies / ...).
-- Run this in the Supabase SQL editor against the same project.
-- ============================================================================

-- RSVP status as a small enum
do $$ begin
  create type ec_rsvp_status as enum ('going', 'maybe', 'declined');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: human-readable identity for an auth user (so attendee lists don't
-- show raw UUIDs). Populated on first sign-in by the /auth/callback handler.
-- ---------------------------------------------------------------------------
create table if not exists public.ec_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table if not exists public.ec_events (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  description       text,
  venue_name        text,
  venue_address     text,
  lat               double precision not null,
  lng               double precision not null,
  geofence_radius_m integer not null default 150 check (geofence_radius_m between 10 and 5000),
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_ec_events_host   on public.ec_events(host_id);
create index if not exists idx_ec_events_starts on public.ec_events(starts_at);

-- ---------------------------------------------------------------------------
-- RSVPs (one per user per event)
-- ---------------------------------------------------------------------------
create table if not exists public.ec_rsvps (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.ec_events(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         ec_rsvp_status not null default 'going',
  eta            timestamptz,
  share_location boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_ec_rsvps_event on public.ec_rsvps(event_id);

-- ---------------------------------------------------------------------------
-- Check-ins (one per user per event) — proximity is validated server-side
-- before insert; distance_m records how far away they were.
-- ---------------------------------------------------------------------------
create table if not exists public.ec_checkins (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.ec_events(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  distance_m  double precision not null,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists idx_ec_checkins_event on public.ec_checkins(event_id);

-- ---------------------------------------------------------------------------
-- Live location pings (the "en route" trail). Latest ping per user = current.
-- ---------------------------------------------------------------------------
create table if not exists public.ec_location_pings (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.ec_events(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ec_pings_event_time on public.ec_location_pings(event_id, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.ec_profiles       enable row level security;
alter table public.ec_events         enable row level security;
alter table public.ec_rsvps          enable row level security;
alter table public.ec_checkins       enable row level security;
alter table public.ec_location_pings enable row level security;

-- Profiles: anyone signed-in can read names; you can only write your own row.
drop policy if exists ec_profiles_read   on public.ec_profiles;
drop policy if exists ec_profiles_insert on public.ec_profiles;
drop policy if exists ec_profiles_update on public.ec_profiles;
create policy ec_profiles_read   on public.ec_profiles for select to authenticated using (true);
create policy ec_profiles_insert on public.ec_profiles for insert to authenticated with check (id = auth.uid());
create policy ec_profiles_update on public.ec_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Events: anyone signed-in can read; only the host manages their own events.
drop policy if exists ec_events_read   on public.ec_events;
drop policy if exists ec_events_insert on public.ec_events;
drop policy if exists ec_events_update on public.ec_events;
drop policy if exists ec_events_delete on public.ec_events;
create policy ec_events_read   on public.ec_events for select to authenticated using (true);
create policy ec_events_insert on public.ec_events for insert to authenticated with check (host_id = auth.uid());
create policy ec_events_update on public.ec_events for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy ec_events_delete on public.ec_events for delete to authenticated using (host_id = auth.uid());

-- RSVPs: anyone signed-in can read (attendee list); you manage only your own.
drop policy if exists ec_rsvps_read   on public.ec_rsvps;
drop policy if exists ec_rsvps_insert on public.ec_rsvps;
drop policy if exists ec_rsvps_update on public.ec_rsvps;
drop policy if exists ec_rsvps_delete on public.ec_rsvps;
create policy ec_rsvps_read   on public.ec_rsvps for select to authenticated using (true);
create policy ec_rsvps_insert on public.ec_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy ec_rsvps_update on public.ec_rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ec_rsvps_delete on public.ec_rsvps for delete to authenticated using (user_id = auth.uid());

-- Check-ins: anyone signed-in can read (who's here); you insert only your own.
drop policy if exists ec_checkins_read   on public.ec_checkins;
drop policy if exists ec_checkins_insert on public.ec_checkins;
drop policy if exists ec_checkins_update on public.ec_checkins;
create policy ec_checkins_read   on public.ec_checkins for select to authenticated using (true);
create policy ec_checkins_insert on public.ec_checkins for insert to authenticated with check (user_id = auth.uid());
create policy ec_checkins_update on public.ec_checkins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pings: you insert only your own; readable by yourself, the event host, OR
-- anyone who has RSVP'd to the same event (so attendees see each other live).
drop policy if exists ec_pings_insert on public.ec_location_pings;
drop policy if exists ec_pings_read   on public.ec_location_pings;
create policy ec_pings_insert on public.ec_location_pings
  for insert to authenticated with check (user_id = auth.uid());
create policy ec_pings_read on public.ec_location_pings
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.ec_events e
               where e.id = ec_location_pings.event_id and e.host_id = auth.uid())
    or exists (select 1 from public.ec_rsvps r
               where r.event_id = ec_location_pings.event_id and r.user_id = auth.uid())
  );

-- ============================================================================
-- Luma field parity — additive columns on public.ec_events
-- (mirror of supabase/migrations/20260615012000_luma_parity.sql)
-- All columns are nullable or safely-defaulted; nothing existing is changed.
-- ============================================================================
alter table public.ec_events add column if not exists cover_image_url text;

alter table public.ec_events add column if not exists location_type text
  not null default 'in_person'
  check (location_type in ('in_person', 'virtual'));
alter table public.ec_events add column if not exists virtual_url text;

alter table public.ec_events add column if not exists timezone text;

alter table public.ec_events add column if not exists capacity integer
  check (capacity is null or capacity > 0);
alter table public.ec_events add column if not exists waitlist_enabled boolean
  not null default false;

alter table public.ec_events add column if not exists requires_approval boolean
  not null default false;

alter table public.ec_events add column if not exists visibility text
  not null default 'public'
  check (visibility in ('public', 'unlisted', 'private'));

alter table public.ec_events add column if not exists is_paid boolean
  not null default false;
alter table public.ec_events add column if not exists price_cents integer
  check (price_cents is null or price_cents >= 0);
alter table public.ec_events add column if not exists currency text
  check (currency is null or char_length(currency) = 3);

alter table public.ec_events add column if not exists category text;
