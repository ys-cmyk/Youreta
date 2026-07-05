// Bridge to @capacitor-community/background-geolocation for the native
// iOS/Android shell apps. The plugin keeps the app alive for location
// callbacks while it's backgrounded, so JS keeps running and pings keep
// flowing.
//
// IMPORTANT: this module must never statically import from @capacitor/* or
// @capacitor-community/* — the web bundle stays plugin-free. Inside the native
// shell, the Capacitor bridge (and the registered plugin JS) are injected into
// the WebView at runtime as the `window.Capacitor` global; in plain browsers
// that global is simply undefined and every function here no-ops.

type BackgroundGeolocationLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

type BackgroundGeolocationError = {
  message?: string;
  code?: string;
};

type BackgroundGeolocationPlugin = {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      location?: BackgroundGeolocationLocation,
      error?: BackgroundGeolocationError
    ) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  registerPlugin?: (name: string) => unknown;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: Record<string, unknown>;
};

export function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only when running inside the Capacitor native shell (not a browser). */
export function isNativePlatform(): boolean {
  try {
    return getCapacitor()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * Resolve a native plugin by name, trying both access paths: the injected
 * `Capacitor.Plugins.<Name>` proxy map (how remote-URL shells expose plugins)
 * first, then `registerPlugin(name)` (bundled runtimes). Returns null in
 * browsers or when the plugin isn't in this build.
 */
export function getNativePlugin<T>(name: string): T | null {
  try {
    const cap = getCapacitor();
    if (!isNativePlatform() || !cap) return null;
    const fromMap = cap.Plugins?.[name];
    if (fromMap) return fromMap as T;
    if (typeof cap.registerPlugin === "function") {
      return (cap.registerPlugin(name) as T) ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Start a background location watcher via the native plugin. Invokes
 * `onLocation` for each fix (also while the app is backgrounded / screen off).
 * Resolves with the watcher id to pass to `stopBackgroundWatch`, or null when
 * not running in the native shell or the plugin isn't available.
 */
export async function startBackgroundWatch(
  onLocation: (loc: { lat: number; lng: number; accuracyM: number | null }) => void,
  onError?: (msg: string) => void
): Promise<string | null> {
  try {
    const plugin = getNativePlugin<BackgroundGeolocationPlugin>(
      "BackgroundGeolocation"
    );
    if (typeof plugin?.addWatcher !== "function") return null;

    const id = await plugin.addWatcher(
      {
        backgroundMessage: "Your ETA is sharing your live location.",
        backgroundTitle: "Sharing location",
        requestPermissions: true,
        stale: false,
        distanceFilter: 25,
      },
      (location, error) => {
        if (error) {
          onError?.(error.message ?? "Background location error");
          return;
        }
        if (!location) return;
        onLocation({
          lat: location.latitude,
          lng: location.longitude,
          accuracyM:
            typeof location.accuracy === "number" ? location.accuracy : null,
        });
      }
    );
    return id ?? null;
  } catch (err) {
    onError?.(err instanceof Error ? err.message : "Background location error");
    return null;
  }
}

/** Stop a watcher started by `startBackgroundWatch`. Safe to call anywhere. */
export async function stopBackgroundWatch(id: string): Promise<void> {
  try {
    const plugin = getNativePlugin<BackgroundGeolocationPlugin>(
      "BackgroundGeolocation"
    );
    await plugin?.removeWatcher?.({ id });
  } catch {
    // best-effort teardown; nothing to surface
  }
}
