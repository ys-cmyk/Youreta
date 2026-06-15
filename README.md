# Your ETA — RSVP & geofenced check-in

A small standalone web app: hosts create events, people RSVP, and RSVP'd guests
**check in** when they physically arrive (Foursquare-style geofence). Guests can
optionally **share live GPS** while en route and **set an ETA**. Think Luma + Foursquare.

This is a self-contained app and the only thing in this repo. It runs on port 3001.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4
- Supabase Postgres + Supabase Auth (email **magic link**) via `@supabase/ssr`
- Leaflet + OpenStreetMap (`react-leaflet`) — no map API key needed

## Setup

1. Install deps:
   ```bash
   npm install
   ```

2. Create `.env.local` (see `.env.local.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3001
   ```
   The tables are prefixed `ec_`, so they won't collide if you point this at a
   Supabase project shared with other apps.

3. Create the tables — pick whichever is easiest. They all apply the same
   schema (`ec_*` tables + Row Level Security policies).
   - **Supabase GitHub integration (automatic)**: the repo-root
     [`supabase/`](./supabase) folder holds a CLI migration
     (`supabase/migrations/*_init_rally.sql`) and `config.toml`. If your Supabase
     project is connected to this repo, the migration is applied to the project
     when changes land on the production branch, and the magic-link redirect URLs
     in `config.toml` (`site_url` / `additional_redirect_urls`) are applied too.
   - **Dashboard**: open the Supabase **SQL Editor**, paste
     [`supabase/checkin-schema.sql`](./supabase/checkin-schema.sql), run it.
   - **psql**: `psql "$SUPABASE_DB_URL" -f supabase/checkin-schema.sql`
     (the connection string is in Project Settings → Database).

   The Supabase CLI is also installed as a dev dependency, so `npx supabase ...`
   works in this folder (e.g. `npx supabase link` + `npx supabase db push` if you
   prefer a migration workflow, or `npx supabase start` for a fully local stack
   when Docker is available).

4. Allow the magic-link redirect. In Supabase dashboard →
   **Authentication → URL Configuration**:
   - Set **Site URL** to `http://localhost:3001`
   - Add `http://localhost:3001/auth/callback` to **Redirect URLs**
   - (Add your production URLs there too when you deploy.)
   - Make sure the **Email** auth provider is enabled.

5. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3001.

## Social sign-in setup (Google & Apple)

The login page offers **Continue with Google** and **Continue with Apple**
alongside the email magic link (Supabase OAuth, PKCE flow). They reuse the same
`/auth/callback` route as magic links, so no extra app code is needed — you only
need to create credentials with each provider and paste them into Supabase.

Both require **your own** Google Cloud and Apple Developer accounts.
`supabase/config.toml` already enables `[auth.external.google]` and
`[auth.external.apple]` and references the secrets via `env(...)` — no secrets
live in this repo. The Supabase callback URL both providers must trust is:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

(`<project-ref>` is the subdomain of your `NEXT_PUBLIC_SUPABASE_URL`.)

### Google

1. In the [Google Cloud Console](https://console.cloud.google.com/) →
   **APIs & Services → Credentials**, create an **OAuth client ID** of type
   **Web application**.
2. Under **Authorized redirect URIs**, add
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Copy the generated **Client ID** and **Client Secret**.
4. In the Supabase dashboard → **Authentication → Providers → Google**, enable
   the provider and paste the Client ID and Client Secret, then save.

### Apple

1. In the [Apple Developer](https://developer.apple.com/account/) portal:
   - Create an **App ID** with **Sign in with Apple** enabled.
   - Create a **Services ID** (this becomes your `client_id`) and enable
     **Sign in with Apple** on it. Under its configuration, set the
     **Return URL** to `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create a **Sign in with Apple key** (.p8) and note its **Key ID** and your
     **Team ID**.
2. Supabase needs the Services ID plus a **client secret JWT** generated from the
   .p8 key, Key ID, and Team ID (Supabase's Apple provider page explains the
   exact values it wants).
3. In the Supabase dashboard → **Authentication → Providers → Apple**, enable the
   provider, enter the Services ID and the generated secret, then save.

> For local CLI development, set the corresponding env vars referenced in
> `config.toml` (e.g. `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`,
> `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID`,
> `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`) before `npx supabase start`.

## How it works

- **Auth**: `/login` sends a magic link or starts a Google/Apple OAuth flow;
  `/auth/callback` exchanges the returned code for a session and creates a profile
  row (the same callback handles both flows). Middleware (`middleware.ts`)
  refreshes the session and redirects signed-out users to `/login`.
- **Host an event** (`/events/new`): fill in details and click the map to drop the
  venue pin; a slider sets the check-in radius.
- **Event page** (`/events/[id]`): RSVP (going/maybe/can't go), set an ETA, toggle
  live-location sharing, and check in.
- **Geofence is enforced server-side**: `POST /api/checkins` recomputes the
  Haversine distance from your reported position to the venue and refuses
  check-ins outside the radius — the client can't fake being there.
- **Live tracking**: while sharing is on (and you haven't checked in), the browser
  posts a location ping every 15s. The event page polls everyone's latest ping and
  shows them on the map and in the guest list with a live distance.

## Notes on testing GPS locally

- The Geolocation API requires a secure context — `localhost` works; a plain-HTTP
  LAN IP (e.g. `http://192.168.x.x`) will not return coordinates.
- To test the geofence without physically moving, use Chrome DevTools →
  **More tools → Sensors → Location** to spoof a coordinate inside/outside the
  radius.
- Use two browser profiles (or an incognito window) with two different emails to
  play host and guest simultaneously.
