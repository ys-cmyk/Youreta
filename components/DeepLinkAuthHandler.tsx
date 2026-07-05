"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isNativePlatform,
  onAppUrlOpen,
  restorePkceVerifier,
  clearPkceBackup,
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
// Deep links can arrive twice for one sign-in (getLaunchUrl on cold start +
// the appUrlOpen event), so codes are deduped. Progress and failure are shown
// in a small toast — a silent failure looks like "nothing happened".
const handledCodes = new Set<string>();

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

      const { code, next, accessToken, refreshToken } = parsed;
      const dedupeKey = accessToken ?? code;
      if (!dedupeKey) {
        setStatus("error");
        setDetail("The sign-in link was missing its credentials. Try again.");
        return;
      }
      if (handledCodes.has(dedupeKey)) return;
      handledCodes.add(dedupeKey);

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
        // Only allow internal redirects: a single leading slash, never
        // "//host", so a crafted next can't bounce the user to another site.
        // Full page navigation (not router.push) so the middleware sees the
        // fresh cookies.
        const safeNext =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/events";
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
