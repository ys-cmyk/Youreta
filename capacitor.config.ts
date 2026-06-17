import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the iOS/Android shell apps. The native shell loads the
// deployed web app from the remote URL below (see `server.url`), so it always
// runs the latest production site.
//
// NOTE: `webDir` is required by Capacitor but is only a placeholder here — we do
// NOT bundle the web build into the native app; we load the remote URL instead.
// `public` is a valid existing folder so `npx cap sync` is happy.
const config: CapacitorConfig = {
  appId: "app.youreta",
  appName: "Your ETA",
  webDir: "public",
  server: {
    url: "https://youreta.vercel.app",
    cleartext: false,
  },
};

export default config;
