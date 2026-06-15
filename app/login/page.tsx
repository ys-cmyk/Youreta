"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OAUTH_ENABLED } from "@/lib/supabase/env";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/events";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
    // On success the browser is redirected to the provider, so there is no
    // further state to update here.
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to Your ETA</h1>
      <p className="mt-2 text-sm text-gray-400">
        Set a destination, share your ETA, and track each other on the way. Sign
        in with a magic link — no password.
      </p>

      {status === "sent" ? (
        <div className="mt-8 rounded-xl border border-going/40 bg-going/10 p-4 text-sm">
          Check <span className="font-semibold">{email}</span> for a sign-in link.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/15 bg-transparent px-4 py-3 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-400">{message}</p>
          )}

          {OAUTH_ENABLED && (
          <>
          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-white/15" />
            <span className="text-xs uppercase tracking-wide text-gray-500">
              or
            </span>
            <span className="h-px flex-1 bg-white/15" />
          </div>

          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={status === "sending"}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white px-4 py-3 font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
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

          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            disabled={status === "sending"}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-black px-4 py-3 font-semibold text-white hover:bg-white/10 disabled:opacity-50"
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
