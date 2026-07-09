// Bridge to @capacitor/app for the native iOS/Android shell apps, used to
// receive `youreta://` deep links (the appUrlOpen event) so OAuth / magic-link
// redirects can complete the auth flow *inside* the app's WebView instead of
// stranding the session in the external browser.
//
// IMPORTANT: this module must never statically import from @capacitor/* —
// the web bundle stays plugin-free. Inside the native shell, the Capacitor
// bridge (and the registered plugin JS) are injected into the WebView at
// runtime as the `window.Capacitor` global; in plain browsers that global is
// simply undefined and every function here no-ops.

export { isNativePlatform } from "./backgroundLocation";

import {
  isNativePlatform,
  getNativePlugin,
  getCapacitor,
} from "./backgroundLocation";

type PluginListenerHandle = {
  remove: () => Promise<void>;
};

type AppPlugin = {
  addListener(
    eventName: "appUrlOpen",
    listener: (event: { url: string }) => void
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
  getLaunchUrl?: () => Promise<{ url?: string } | null | undefined>;
};

// @capacitor/browser — opens web content in an in-app browser
// (SFSafariViewController on iOS / Custom Tabs on Android) instead of handing
// off to the external system browser. Required for App Store Guideline 4:
// sign-in must stay inside the app, not bounce to Safari.
type BrowserPlugin = {
  open(options: {
    url: string;
    presentationStyle?: "fullscreen" | "popover";
  }): Promise<void>;
  close(): Promise<void>;
};

const noop = () => {};

// --- PKCE verifier belt-and-braces (native shell) ---------------------------
// @supabase/ssr keeps the PKCE code_verifier in a cookie, but iOS WKWebView
// flushes cookies to disk lazily — if the app is backgrounded/killed while the
// user signs in via the external browser, the freshly written verifier cookie
// can be lost, and the code exchange fails with "verifier not found". Back the
// verifier cookie(s) up to localStorage (flushed far more eagerly) right after
// initiating sign-in, and restore them just before the exchange.
const PKCE_BACKUP_KEY = "yeta:pkce-backup";

export function backupPkceVerifier(): void {
  try {
    if (!isNativePlatform()) return;
    const entries = document.cookie
      .split("; ")
      .filter((c) => c.includes("code-verifier"));
    if (entries.length) {
      localStorage.setItem(PKCE_BACKUP_KEY, JSON.stringify(entries));
    }
  } catch {
    // best effort only
  }
}

/** Restore the verifier cookie from backup if it's gone. True if present. */
export function restorePkceVerifier(): boolean {
  try {
    if (document.cookie.includes("code-verifier")) return true;
    const raw = localStorage.getItem(PKCE_BACKUP_KEY);
    if (!raw) return false;
    for (const entry of JSON.parse(raw) as string[]) {
      document.cookie = `${entry}; path=/; max-age=600; SameSite=Lax; Secure`;
    }
    return document.cookie.includes("code-verifier");
  } catch {
    return false;
  }
}

export function clearPkceBackup(): void {
  try {
    localStorage.removeItem(PKCE_BACKUP_KEY);
  } catch {
    // nothing to surface
  }
}

/**
 * True when the native shell can actually receive youreta:// deep links —
 * i.e. the @capacitor/app plugin is registered in this build. When a build
 * predates the plugin (or `npx cap sync ios` wasn't run), OAuth can never
 * complete in-app; callers use this to steer users to code sign-in instead.
 * Always false in plain browsers.
 */
export function isDeepLinkCapable(): boolean {
  try {
    if (!isNativePlatform()) return false;
    // Capable if the plugin resolves through either access path (the injected
    // Plugins map or registerPlugin) with a usable addListener.
    const app = getNativePlugin<AppPlugin>("App");
    if (app && typeof app.addListener === "function") return true;
    // Last resort: trust the bridge's own availability check.
    return getCapacitor()?.isPluginAvailable?.("App") === true;
  } catch {
    return false;
  }
}

/**
 * Present a URL in the in-app browser (SFSafariViewController on iOS / Custom
 * Tabs on Android) via @capacitor/browser, keeping sign-in inside the app
 * (App Store Guideline 4). Returns true when the plugin call was made, false
 * when the plugin isn't available in this build (plain browsers / older native
 * shells) — the caller then falls back to a plain navigation. Never throws.
 */
export async function openInAppBrowser(url: string): Promise<boolean> {
  try {
    const browser = getNativePlugin<BrowserPlugin>("Browser");
    if (typeof browser?.open !== "function") return false;
    await browser.open({ url, presentationStyle: "fullscreen" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Dismiss the in-app browser opened by `openInAppBrowser`. Fully guarded:
 * safe to call when nothing is open, and on Android `close()` may reject —
 * that's swallowed. Never throws.
 */
export async function closeInAppBrowser(): Promise<void> {
  try {
    const browser = getNativePlugin<BrowserPlugin>("Browser");
    await browser?.close?.();
  } catch {
    // best-effort dismissal; nothing to surface
  }
}

/**
 * Subscribe to the native `appUrlOpen` event (fired when the OS opens the app
 * via its custom URL scheme, e.g. `youreta://auth/callback?...`). Resolves to
 * an unsubscribe function. In plain browsers (or if anything goes wrong) it
 * resolves to a no-op unsubscribe and never throws.
 */
export async function onAppUrlOpen(
  cb: (url: string) => void
): Promise<() => void> {
  try {
    const app = getNativePlugin<AppPlugin>("App");
    if (typeof app?.addListener !== "function") return noop;

    // Cold start: if the OS opened the app *via* the deep link, the appUrlOpen
    // event fired before this subscription existed — the URL is only available
    // through getLaunchUrl(). Deliver it through the same callback.
    try {
      const launch = await app.getLaunchUrl?.();
      if (launch?.url) cb(launch.url);
    } catch {
      // best-effort; warm-open events still arrive via the listener below
    }

    const handle = await app.addListener("appUrlOpen", ({ url }) => {
      try {
        cb(url);
      } catch {
        // never let a callback error bubble into the native bridge
      }
    });

    return () => {
      try {
        void handle?.remove?.();
      } catch {
        // best-effort teardown; nothing to surface
      }
    };
  } catch {
    return noop;
  }
}
