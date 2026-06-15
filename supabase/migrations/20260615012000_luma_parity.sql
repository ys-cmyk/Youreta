-- ============================================================================
-- Luma field parity — additive columns on public.ec_events
-- ----------------------------------------------------------------------------
-- This migration ONLY adds new, nullable / safely-defaulted columns so the
-- already-deployed database and all existing rows keep working untouched.
-- No existing column is modified or dropped. Safe to run multiple times.
-- Mirror of the block appended to supabase/checkin-schema.sql.
-- ============================================================================

-- Cover image (lightweight: store a URL; file upload via Storage is a follow-up)
alter table public.ec_events add column if not exists cover_image_url text;

-- Location model: in-person (default, uses venue + lat/lng) vs virtual link.
-- Kept as a constrained text column (not an enum) so it is purely additive.
alter table public.ec_events add column if not exists location_type text
  not null default 'in_person'
  check (location_type in ('in_person', 'virtual'));
alter table public.ec_events add column if not exists virtual_url text;

-- Timezone the host entered the start/end times in (IANA name, e.g. "America/New_York").
alter table public.ec_events add column if not exists timezone text;

-- Capacity & waitlist.
alter table public.ec_events add column if not exists capacity integer
  check (capacity is null or capacity > 0);
alter table public.ec_events add column if not exists waitlist_enabled boolean
  not null default false;

-- Registration approval gate.
alter table public.ec_events add column if not exists requires_approval boolean
  not null default false;

-- Visibility: public (listed), unlisted (link-only), private.
alter table public.ec_events add column if not exists visibility text
  not null default 'public'
  check (visibility in ('public', 'unlisted', 'private'));

-- Lightweight ticketing metadata (real payments/checkout are a follow-up).
alter table public.ec_events add column if not exists is_paid boolean
  not null default false;
alter table public.ec_events add column if not exists price_cents integer
  check (price_cents is null or price_cents >= 0);
alter table public.ec_events add column if not exists currency text
  check (currency is null or char_length(currency) = 3);

-- Free-form category / tag for browsing.
alter table public.ec_events add column if not exists category text;
