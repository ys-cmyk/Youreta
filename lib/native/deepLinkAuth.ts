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

import { isNativePlatform } from "./backgroundLocation";

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

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  registerPlugin?: (name: string) => unknown;
};

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

const noop = () => {};

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
    const cap = getCapacitor();
    if (!isNativePlatform() || typeof cap?.registerPlugin !== "function") {
      return noop;
    }
    const app = cap.registerPlugin("App") as AppPlugin;
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
