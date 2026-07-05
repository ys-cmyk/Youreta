"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OAUTH_ENABLED, GOOGLE_ENABLED, APPLE_ENABLED } from "@/lib/supabase/env";
import {
  isNativePlatform,
  isDeepLinkCapable,
  backupPkceVerifier,
} from "@/lib/native/deepLinkAuth";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/events";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  // Code entry after the email is sent: the emailed 6-digit code signs the
  // user in directly via verifyOtp — no browser hop, no deep link. This is the
  // most reliable path inside the native shell, and a handy fallback anywhere.
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");
  // The emailed button is the primary path; the 6-digit code is a fallback
  // revealed on demand (e.g. when the link lands in the wrong browser/app).
  const [codeOpen, setCodeOpen] = useState(false);

  // Hidden diagnostics: triple-tap the brand mark to see how the native bridge
  // exposes plugins in this build. Harmless in browsers.
  const [diagTaps, setDiagTaps] = useState(0);
  // Also reachable without tapping: /login?debug=1
  const showDiag = diagTaps >= 3 || params.get("debug") === "1";
  function diagInfo(): string {
    try {
      const cap = (window as unknown as { Capacitor?: Record<string, unknown> })
        .Capacitor;
      if (!cap) return "no Capacitor global (plain browser)";
      const plugins = cap.Plugins ? Object.keys(cap.Plugins as object) : [];
      const avail = (
        cap.isPluginAvailable as ((n: string) => boolean) | undefined
      )?.("App");
      return JSON.stringify(
        {
          native: (cap.isNativePlatform as (() => boolean) | undefined)?.(),
          keys: Object.keys(cap),
          plugins,
          appAvailable: avail,
        },
        null,
        1
      );
    } catch (e) {
      return String(e);
    }
  }

  // In the native shell, OAuth can only complete if this build can receive
  // youreta:// deep links. If it can't (plugin missing from the build), hide
  // the provider buttons rather than offering a sign-in that dead-ends, and
  // steer to the email code instead. Evaluated after mount: window.Capacitor
  // is a runtime global.
  const [oauthUsable, setOauthUsable] = useState(true);
  useEffect(() => {
    if (isNativePlatform() && !isDeepLinkCapable()) setOauthUsable(false);
  }, []);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.trim();
    if (token.length < 6) {
      setOtpError("Enter the 6-digit code from the email.");
      return;
    }
    setVerifying(true);
    setOtpError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setOtpError(error.message);
      return;
    }
    const safeNext =
      next.startsWith("/") && !next.startsWith("//") ? next : "/events";
    window.location.assign(safeNext);
  }

  // Un-stick the buttons whenever the page becomes visible again (e.g. the
  // user comes back from the external browser that OAuth / a magic link opened
  // without completing sign-in). Harmless in plain browsers too.
  useEffect(() => {
    const unstick = () => {
      if (document.visibilityState === "visible") {
        setStatus((prev) => (prev === "sending" ? "idle" : prev));
      }
    };
    document.addEventListener("visibilitychange", unstick);
    window.addEventListener("pageshow", unstick);
    return () => {
      document.removeEventListener("visibilitychange", unstick);
      window.removeEventListener("pageshow", unstick);
    };
  }, []);

  // Where the auth provider should send the user after verifying.
  // - Browsers: back to this site's /auth/callback route (server-side
  //   exchange sets the session cookies).
  // - Native shell: verification happens in the external browser, which
  //   cannot set cookies in the app's WebView. Land on /auth/native-callback
  //   (an https page — always redirectable), which hops into the app via the
  //   youreta:// deep link, with an explicit button as the fallback: some
  //   browsers (Chrome on iOS) block automatic redirects into custom schemes
  //   but always allow a user tap. DeepLinkAuthHandler then exchanges the
  //   code in-app.
  function getRedirectTo(): string {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    if (isNativePlatform()) {
      return `${siteUrl}/auth/native-callback?next=${encodeURIComponent(next)}`;
    }
    return `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getRedirectTo() },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      // Guard the PKCE verifier against iOS webview cookie loss while the
      // user is off in their mail app / browser.
      backupPkceVerifier();
      setStatus("sent");
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setStatus("sending");
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getRedirectTo() },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    // Guard the PKCE verifier against iOS webview cookie loss while the user
    // is off in the external browser.
    backupPkceVerifier();
    // On success the OAuth flow navigates away — in browsers this tab is
    // replaced; in the native shell the system browser opens on top and this
    // page keeps running. Reset shortly after the hand-off so the buttons are
    // never left permanently disabled (harmless if navigation already left).
    window.setTimeout(() => {
      setStatus((prev) => (prev === "sending" ? "idle" : prev));
    }, 3000);
  }

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-12">
      {/* Subtle brand gradient glow behind the heading. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-12 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="text-center">
        <button
          type="button"
          aria-label="Your ETA"
          onClick={() => setDiagTaps((n) => n + 1)}
          className="mx-auto mb-5 flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-accent-bright to-accent text-2xl text-white shadow-lg shadow-accent/30"
        >
          ◎
        </button>
        {showDiag && (
          <pre className="mx-auto mt-2 max-w-full overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-2 text-left text-[10px] text-gray-400">
            {diagInfo()}
          </pre>
        )}
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Your ETA</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-gray-400">
          Set a destination, share your ETA, and track each other on the way.
          Sign in with a magic link — no password.
        </p>
      </div>

      {status === "sent" ? (
        <div className="ec-expand mt-8 space-y-4">
          <div className="rounded-2xl border border-going/40 bg-going/10 p-4 text-center text-sm">
            <span className="font-semibold text-going">✓</span> Check{" "}
            <span className="font-semibold">{email}</span> and tap the sign-in
            button in the email.
          </div>
          {!codeOpen ? (
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="mx-auto block text-center text-sm text-gray-400 underline-offset-2 transition-colors hover:text-white hover:underline"
            >
              Link not working? Enter the 6-digit code instead
            </button>
          ) : (
          <form onSubmit={handleVerifyOtp} className="ec-expand space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                setOtpError("");
              }}
              placeholder="6-digit code"
              className="input px-4 py-3 text-center text-lg tracking-[0.4em]"
              aria-label="6-digit sign-in code"
            />
            <button
              type="submit"
              disabled={verifying || otp.length < 6}
              className="btn btn-primary min-h-12 w-full px-4 shadow-lg shadow-accent/20"
            >
              {verifying && <span className="spinner" aria-hidden />}
              {verifying ? "Signing in…" : "Sign in with code"}
            </button>
            {otpError && (
              <p className="ec-expand rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
                {otpError}
              </p>
            )}
          </form>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input px-4 py-3"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="btn btn-primary min-h-12 w-full px-4 shadow-lg shadow-accent/20"
          >
            {status === "sending" && <span className="spinner" aria-hidden />}
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {status === "error" && (
            <p className="ec-expand rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
              {message}
            </p>
          )}

          {OAUTH_ENABLED && !oauthUsable && (
            <p className="pt-2 text-center text-xs text-gray-500">
              Google sign-in needs the latest app version — use the email code
              above for now.
            </p>
          )}
          {OAUTH_ENABLED && oauthUsable && (
          <>
          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-wider text-gray-500">
              or
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {GOOGLE_ENABLED && (
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={status === "sending"}
            className="btn min-h-12 w-full gap-3 bg-white px-4 text-gray-900 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
              />
            </svg>
            Continue with Google
          </button>
          )}

          {APPLE_ENABLED && (
          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            disabled={status === "sending"}
            className="btn min-h-12 w-full gap-3 border border-white/20 bg-black px-4 text-white hover:border-white/40"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M16.37 12.78c.03 3.24 2.84 4.31 2.87 4.33-.02.07-.45 1.54-1.48 3.05-.9 1.31-1.83 2.61-3.29 2.64-1.44.03-1.9-.85-3.54-.85-1.65 0-2.16.82-3.52.88-1.42.05-2.5-1.42-3.4-2.72-1.86-2.68-3.28-7.58-1.37-10.88.95-1.64 2.64-2.68 4.48-2.71 1.39-.03 2.7.94 3.54.94.85 0 2.44-1.16 4.11-.99.7.03 2.66.28 3.92 2.13-.1.06-2.34 1.37-2.31 4.08zM13.7 4.36c.75-.91 1.25-2.17 1.11-3.43-1.08.04-2.38.72-3.15 1.62-.69.8-1.3 2.08-1.14 3.31 1.2.09 2.43-.61 3.18-1.5z" />
            </svg>
            Continue with Apple
          </button>
          )}
          </>
          )}
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
