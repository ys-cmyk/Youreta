"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isNativePlatform,
  onAppUrlOpen,
  restorePkceVerifier,
  clearPkceBackup,
  closeInAppBrowser,
} from "@/lib/native/deepLinkAuth";

// Completes the auth flow inside the native shell. OAuth / magic-link
// verification happens in the external browser, which then lands on
// /auth/native-callback and hops into the app via
// `youreta://auth/callback?code=...&next=...`; we exchange the code for a
// session here in the WebView.
//
// PKCE note: the code_verifier was stored in the WebView's storage when the
// login page initiated the flow (signInWithOtp / signInWithOAuth), so
// `exchangeCodeForSession(code)` succeeds here in-app even though the code was
// minted via the external browser.
//
// Deep links can arrive REPEATEDLY for one sign-in: getLaunchUrl returns the
// same launch URL on every page load for the app process's lifetime, and
// completing sign-in itself navigates (a page load) — so an in-memory dedupe
// alone loops forever (sign in → navigate → re-read launch URL → repeat).
// Dedupe must survive page loads: persist the last-handled key.
const handledCodes = new Set<string>();
const HANDLED_KEY = "yeta:auth-handled";

function alreadyHandled(key: string): boolean {
  if (handledCodes.has(key)) return true;
  try {
    if (localStorage.getItem(HANDLED_KEY) === key) return true;
  } catch {
    // storage unavailable — in-memory dedupe still applies
  }
  return false;
}

function markHandled(key: string): void {
  handledCodes.add(key);
  try {
    localStorage.setItem(HANDLED_KEY, key);
  } catch {
    // best effort
  }
}

export function DeepLinkAuthHandler() {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!isNativePlatform()) return;

    let unsubscribe: (() => void) | null = null;
    let unmounted = false;

    const handleDeepLink = async (url: string) => {
      const parsed = parseAuthCallbackUrl(url);
      if (!parsed) return; // not an auth deep link; ignore

      // The deep link means sign-in finished in the in-app browser
      // (SFSafariViewController). Dismiss it now, best-effort, so the user
      // watches the "Finishing sign-in…" toast in the app itself rather than
      // behind the Safari sheet. No-op if it wasn't opened via the plugin.
      void closeInAppBrowser();

      const { code, next, accessToken, refreshToken } = parsed;
      const dedupeKey = accessToken ?? code;
      if (!dedupeKey) {
        setStatus("error");
        setDetail("The sign-in link was missing its credentials. Try again.");
        return;
      }
      if (alreadyHandled(dedupeKey)) return;
      // Mark BEFORE processing so even a failure can't re-fire in a loop; the
      // user retries by starting a fresh sign-in (which mints a new key).
      markHandled(dedupeKey);

      setStatus("working");
      setDetail("");
      try {
        const supabase = createClient();
        if (accessToken && refreshToken) {
          // Implicit-flow handoff: install the session directly — no PKCE
          // verifier involved, nothing to have survived in webview storage.
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setStatus("error");
            setDetail(error.message);
            return;
          }
        } else {
          // PKCE fallback: restore the verifier cookie if iOS dropped it,
          // then exchange the code.
          restorePkceVerifier();
          const { error } = await supabase.auth.exchangeCodeForSession(code!);
          if (error) {
            setStatus("error");
            setDetail(error.message);
            return;
          }
        }
        clearPkceBackup();
        // CapacitorCookies applies cookie writes through native storage
        // asynchronously; give the fresh session cookies a beat to land so
        // the middleware sees them on the very next request.
        await new Promise((r) => setTimeout(r, 400));
        // Only allow internal redirects: a single leading slash, never
        // "//host", so a crafted next can't bounce the user to another site.
        // Full page navigation (not router.push) so the middleware sees the
        // fresh cookies.
        const safeNext =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/events";
        // Ensure the in-app browser sheet is gone before we navigate
        // (harmless if it was already closed above).
        void closeInAppBrowser();
        window.location.assign(safeNext);
      } catch (e) {
        setStatus("error");
        setDetail(e instanceof Error ? e.message : "Unexpected error.");
      }
    };

    void onAppUrlOpen((url) => {
      void handleDeepLink(url);
    }).then((unsub) => {
      if (unmounted) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

    return () => {
      unmounted = true;
      unsubscribe?.();
    };
  }, []);

  if (status === "idle") return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-[2000] mx-auto max-w-sm rounded-xl border border-white/15 bg-card p-3 text-center text-sm shadow-xl shadow-black/50"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      {status === "working" ? (
        <span className="inline-flex items-center gap-2">
          <span className="spinner" aria-hidden />
          Finishing sign-in…
        </span>
      ) : (
        <span className="text-red-300">
          Sign-in didn&apos;t complete{detail ? `: ${detail}` : "."}{" "}
          <button
            className="font-semibold text-white underline"
            onClick={() => window.location.assign("/login")}
          >
            Try again
          </button>
        </span>
      )}
    </div>
  );
}

function parseAuthCallbackUrl(url: string): {
  code: string | null;
  next: string | null;
  accessToken: string | null;
  refreshToken: string | null;
} | null {
  // Expected shapes:
  //   youreta://auth/callback?code=...&next=...                      (PKCE)
  //   youreta://auth/callback#access_token=...&refresh_token=...&next=...
  if (!url.startsWith("youreta://")) return null;
  const withoutScheme = url.slice("youreta://".length);
  if (!withoutScheme.startsWith("auth/callback")) return null;

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const fragment =
    hashIndex !== -1 ? new URLSearchParams(url.slice(hashIndex + 1)) : null;
  const query =
    queryIndex !== -1 && (hashIndex === -1 || queryIndex < hashIndex)
      ? new URLSearchParams(
          url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex)
        )
      : null;

  return {
    code: query?.get("code") ?? null,
    next: fragment?.get("next") ?? query?.get("next") ?? null,
    accessToken: fragment?.get("access_token") ?? null,
    refreshToken: fragment?.get("refresh_token") ?? null,
  };
}
