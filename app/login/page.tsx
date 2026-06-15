"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to Your ETA</h1>
      <p className="mt-2 text-sm text-gray-400">
        RSVP to events and check in when you arrive. Sign in with a magic link —
        no password.
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
