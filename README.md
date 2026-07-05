# Your ETA — shared destinations & live ETAs

A small standalone web app: a host creates a **destination** (a place set via an
address search) and shares the link. Everyone who opens it can **share their live
location** and/or **set an ETA**, and the whole group watches each other converge
on the destination on a **live map + list**, with each person's distance and ETA.
"Arrived" shows automatically when someone is within ~75 m.

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
- **New destination** (`/events/new`): search for a place with the keyless
  type-ahead (Photon / OpenStreetMap, no API key) and optionally give it a name; a
  map pin previews the spot.
- **Destination page** (`/events/[id]`): **Join**, **set an ETA**, and toggle
  **live-location sharing**. A live map shows the destination plus every
  participant's latest position, and a list shows each person's name, ETA, live
  distance, and an **Arrived** badge when they're within ~75 m.
- **Live tracking**: while sharing is on, the browser posts a location ping every
  15s. The page polls everyone's latest ping and recomputes the Haversine distance
  (`lib/geo.ts`) to the destination to drive the map, distances, and arrival state.
- **Swappable geocoder**: the address type-ahead can be swapped from Photon to
  Google Places later by replacing the fetch in `components/PlaceAutocomplete.tsx`
  (and adding the Google endpoint to `connect-src` in `next.config.ts`).

## Privacy & data retention

- **Who can see what — the link is the invite.** Destination details
  (title, address, coordinates), the participant list, ETAs, and live
  locations are visible **only to that destination's participants** (the host
  and everyone who joined). Signed-in users cannot enumerate or dump other
  people's destinations or ETAs: the row-level-security read policies on
  `ec_events` / `ec_rsvps` are member-scoped, and a `security definer` RPC
  (`ec_get_event`) lets a signed-in holder of a destination's unguessable
  link UUID fetch exactly that one destination so they can join. Opening the
  link auto-joins you, which is what grants visibility.
- **Location pings are auto-purged after 24 hours.** A daily `pg_cron` job
  (`ec-purge-old-pings`, 04:00 UTC) deletes pings older than 24 h, and the
  app additionally prunes your own stale pings each time you post a new one.
  Users can also delete their own pings at any time (RLS delete policy). The
  live map only ever uses the last 15 minutes.
- **Applying the hardening migration**: paste
  [`supabase/migrations/20260705031208_security_hardening.sql`](./supabase/migrations/20260705031208_security_hardening.sql)
  into the Supabase **SQL Editor** and run it (it's idempotent; the same
  block is also appended to
  [`supabase/checkin-schema.sql`](./supabase/checkin-schema.sql)), or let the
  Supabase **GitHub integration** apply it from `supabase/migrations/` when
  the branch lands. If the final `pg_cron` section errors because the
  extension isn't enabled, everything above it is already applied — enable
  pg_cron (Dashboard → Database → Extensions) and re-run that section, or
  rely on the app-side purge.

## Native apps (Capacitor)

The repo is scaffolded so you can build native iOS/Android **shell** apps that
load the live site (`https://youreta.app`). The shell uses
`capacitor.config.ts`, whose `server.url` points the native WebView at the
deployed app, so the apps always run the latest production site (and `webDir` is
just a placeholder — nothing is bundled).

The **`ios/` native project is committed** — including its location-permission
`Info.plist` keys and the **Background Modes → Location updates** setting — so it
builds after a fresh pull with no manual plist editing (Capacitor's own
`ios/.gitignore` keeps Pods/build artifacts out of the repo). The **`android/`**
project is not committed; generate it locally if you need it.

The Capacitor CLI requires **Node ≥ 22** (see `.nvmrc`); on Node 20 the `cap`
commands fail with a fatal version error.

Build iOS locally (macOS + Xcode):

```bash
nvm use                    # picks up .nvmrc → Node 22 (Capacitor CLI needs >=22)
npm install                # installs @capacitor/* (already in package.json)
npx cap sync ios           # ios/ is committed — just resync config + plugins
npx cap open ios           # in Xcode: set your signing Team, then Run
```

Build Android locally (needs Android Studio; `android/` is not committed):

```bash
nvm use
npm install
npx cap add android        # generates the android/ native project
npx cap sync android
npx cap open android       # open in Android Studio, then Run
```

Notes:

- **(a) Foreground location works out of the box.** The shell loads the live
  site, so the web app's `navigator.geolocation` works inside the WebView for
  foreground location sharing — no native code needed.
- **(b) Background location is wired in — one-time native setup below.** The
  app depends on
  [`@capacitor-community/background-geolocation`](https://github.com/capacitor-community/background-geolocation),
  and inside the native shell the destination page starts a background watcher
  while location sharing is on, so pings keep posting while the app is
  backgrounded or the screen is off (see `lib/native/backgroundLocation.ts`).
  After `npm install`, run `npx cap sync` so the plugin is copied into the
  `ios/` / `android/` native projects, then configure each project once:

  - **iOS (Xcode)**: the location setup is **already committed** in
    `ios/App/App/Info.plist` — both `NSLocationWhenInUseUsageDescription` and
    `NSLocationAlwaysAndWhenInUseUsageDescription` are set, and `UIBackgroundModes`
    includes `location` (equivalent to checking **Signing & Capabilities →
    Background Modes → Location updates**). The only manual step is selecting your
    **development Team** (and, if needed, a unique **Bundle Identifier**) under the
    **App** target → **Signing & Capabilities** so the app can run on a device.

    Apple requires the "Always" permission prompt flow — the plugin's
    `requestPermissions` handles it (iOS first grants While-Using, then offers
    the upgrade). While sharing in the background, users see the system
    blue/location indicator; that's expected.
  - **Android (Android Studio)**: add to
    `android/app/src/main/AndroidManifest.xml`:
    ```xml
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    ```
    The plugin runs a **foreground service** while a watcher is active, showing
    a persistent notification with the `backgroundTitle` / `backgroundMessage`
    text set in `lib/native/backgroundLocation.ts` ("Sharing location" /
    "Your ETA is sharing your live location.").

  The web build deliberately does **not** statically import any Capacitor
  packages — the bridge is accessed via the runtime-injected `window.Capacitor`
  global — so in plain browsers/PWA nothing changes: location sharing stays
  foreground-only (the tab must be open), exactly as before.
- **(c) Native sign-in uses a `youreta://` deep link.** Inside the native shell,
  OAuth and magic-link verification happen in the external browser (Safari),
  which can't set cookies in the app's WebView. So on native the login page
  sends `youreta://auth/callback?next=…` as the auth redirect instead of the
  https callback; iOS bounces that deep link back into the app (the scheme is
  registered via `CFBundleURLTypes` in `ios/App/App/Info.plist`), where
  `components/DeepLinkAuthHandler.tsx` receives it through the
  [`@capacitor/app`](https://capacitorjs.com/docs/apis/app) plugin's
  `appUrlOpen` event (bridged plugin-free in `lib/native/deepLinkAuth.ts`) and
  exchanges the code for a session in the WebView. After pulling this change:

  1. `npm install` (picks up the new `@capacitor/app` dependency), then
     `npx cap sync ios` so the plugin's native code is wired into the iOS
     project, then rebuild the app in Xcode.
  2. In the **Supabase dashboard** → **Authentication** → **URL Configuration**
     → **Redirect URLs**, add `youreta://auth/callback` (already added to
     `additional_redirect_urls` in `supabase/config.toml` for local dev).
- **(d) No-build alternative:** the app is also an installable PWA — open it in a
  mobile browser and use **Add to Home Screen** to get an app-like, installable
  experience with the app icon and standalone display, no native toolchain
  required.

## Notes on testing GPS locally

- The Geolocation API requires a secure context — `localhost` works; a plain-HTTP
  LAN IP (e.g. `http://192.168.x.x`) will not return coordinates.
- To test arrival without physically moving, use Chrome DevTools →
  **More tools → Sensors → Location** to spoof a coordinate near (within ~75 m of)
  or far from the destination.
- Use two browser profiles (or an incognito window) with two different emails to
  play host and participant simultaneously.
