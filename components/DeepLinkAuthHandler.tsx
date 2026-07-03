"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isNativePlatform, onAppUrlOpen } from "@/lib/native/deepLinkAuth";

// Completes the auth flow inside the native shell. OAuth / magic-link
// verification happens in the external browser (Safari), which then redirects
// to `youreta://auth/callback?code=...&next=...`; iOS bounces that deep link
// back into the app, where we exchange the code for a session in the WebView.
//
// PKCE note: the code_verifier was stored in the WebView's storage when the
// login page initiated the flow (signInWithOtp / signInWithOAuth), so
// `exchangeCodeForSession(code)` succeeds here in-app even though the code was
// minted via the external browser.
//
// Renders nothing; mounted once in app/layout.tsx. No-ops in plain browsers.
export function DeepLinkAuthHandler() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let unsubscribe: (() => void) | null = null;
    let unmounted = false;

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

  return null;
}

async function handleDeepLink(url: string) {
  const parsed = parseAuthCallbackUrl(url);
  if (!parsed) return; // not an auth deep link; ignore

  const { code, next } = parsed;
  if (!code) {
    window.location.assign("/auth/auth-code-error");
    return;
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      window.location.assign("/auth/auth-code-error");
      return;
    }
    // Only allow internal redirects: a single leading slash, never "//host",
    // so a crafted next can't bounce the user to another site. Full page
    // navigation (not router.push) so the middleware sees the fresh cookies.
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/events";
    window.location.assign(safeNext);
  } catch {
    window.location.assign("/auth/auth-code-error");
  }
}

function parseAuthCallbackUrl(
  url: string
): { code: string | null; next: string | null } | null {
  // Expected shape: youreta://auth/callback?code=...&next=...
  if (!url.startsWith("youreta://")) return null;

  try {
    // Custom schemes parse fine with the WHATWG URL parser; the host+path of
    // "youreta://auth/callback" come through as host "auth", path "/callback".
    const u = new URL(url);
    const isAuthCallback =
      `${u.host}${u.pathname}` === "auth/callback" ||
      u.pathname === "//auth/callback";
    if (!isAuthCallback) return null;
    return {
      code: u.searchParams.get("code"),
      next: u.searchParams.get("next"),
    };
  } catch {
    // Fallback: manual parsing in case URL() rejects the custom scheme.
    const withoutScheme = url.slice("youreta://".length);
    if (!withoutScheme.startsWith("auth/callback")) return null;
    const queryIndex = url.indexOf("?");
    if (queryIndex === -1) return { code: null, next: null };
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    return { code: params.get("code"), next: params.get("next") };
  }
}
