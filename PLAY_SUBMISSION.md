# Google Play submission — Your ETA (`app.youreta`)

Everything to paste into Play Console once the developer account
(ysyair@gmail.com, personal) clears ID verification.

## Artifacts

| Item | Where |
| --- | --- |
| Signed release AAB (v1.0, versionCode 1) | `android/app/build/outputs/bundle/release/app-release.aab` |
| Upload keystore (gitignored — back it up!) | `android/keystore/youreta-upload.jks` + `android/keystore.properties` |
| 512×512 icon | `playstore-assets/icon-512.png` |
| 1024×500 feature graphic | `playstore-assets/feature-graphic-1024x500.png` |
| Phone screenshots (2:1, 1344×2688) | `playstore-assets/0*-play.png` |

## Store listing

- **App name:** Your ETA
- **Short description** (≤80 chars):
  > Share your live location and arrival time with friends until you get there.
- **Full description:**
  > Your ETA lets everyone heading to the same place share one live map and
  > real arrival times — no more "5 minutes away" texts.
  >
  > • Create a destination and share the invite link
  > • Everyone who joins appears on a shared live map
  > • ETAs update automatically from live location, or set yours by hand
  > • Sharing stops automatically when you arrive or when your timer runs out
  > • Your location is only ever visible to people in destinations you join
  >
  > Works for airport pickups, dinners, hikes, birthdays — anywhere people
  > trickle in and someone keeps asking "where are you?".
- **Category:** Maps & Navigation. **Contact email:** ysyair@gmail.com.
- **Privacy policy URL:** https://youreta.app/privacy

## Data safety form

- **Collected:** Location → Precise location: collected, NOT shared with third
  parties, ephemeral processing? No (stored). Purpose: App functionality.
  Optional (user toggles sharing).
- **Collected:** Personal info → Email address: collected, not shared.
  Purpose: Account management. Required.
- Data encrypted in transit: **Yes** (HTTPS/Supabase).
- Users can request deletion: **Yes** — in-app account deletion
  (Account page) and https://youreta.app/privacy.

## Background location declaration (Permissions declaration form)

- Permission: `ACCESS_BACKGROUND_LOCATION`.
- Core feature: sharing your live location and ETA with other participants of
  a destination you joined continues while the phone is locked / app is
  backgrounded; stops on arrival or timer expiry, or manually.
- In-app prominent disclosure: shown before the OS permission prompt the first
  time sharing turns on in the native app
  (`components/BackgroundLocationDisclosure.tsx`).
- **You must record a short demo video** (screen capture of the app showing the
  disclosure dialog → permission grant → the live-sharing feature), upload it
  to YouTube (unlisted is fine), and paste the link into the declaration form.

## Other Play Console steps

1. Content rating questionnaire: no violence/UGC concerns; app shares location
   with other users by design — answer the "shares location" question **Yes**.
2. Target audience: 18+ (simplest; avoids Families policy).
3. Ads: No.
4. App access: provide a test login (email+password) for Google review since
   sign-in is required.
5. **Personal-account gate:** run a closed test with ≥12 opted-in testers for
   14 consecutive days before production access is granted.

## Rebuilding the AAB

```sh
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

Bump `versionCode` in `android/app/build.gradle` for every new upload.
Signing uses `android/keystore.properties` when the signing config is wired
into `android/app/build.gradle` (or sign via Android Studio's
Build → Generate Signed Bundle).
