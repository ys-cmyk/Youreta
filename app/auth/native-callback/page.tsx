"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

// Native sign-in landing page. Supabase redirects the external browser here
// after verifying (this https URL is already on the redirect allow-list via
// the /** wildcard). Some browsers — Chrome on iOS in particular — silently
// block server redirects into custom schemes like youreta://, so this page
// attempts the hop automatically AND offers a tappable button (a user gesture
// is always allowed to open the app). The app's DeepLinkAuthHandler then
// exchanges the code in the WebView, where the PKCE verifier lives.
function NativeCallback() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const next = params.get("next") ?? "/events";

  const deepLink = useMemo(() => {
    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    qs.set("next", next);
    return `youreta://auth/callback?${qs.toString()}`;
  }, [code, next]);

  // Try the hop immediately — Safari honors this; Chrome needs the button.
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => {
      window.location.href = deepLink;
    }, 150);
    return () => clearTimeout(t);
  }, [code, deepLink]);

  if (!code) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-gray-400">
          This sign-in link is missing its code — request a new one from the
          app.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center py-12 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-bright to-accent text-2xl text-white shadow-lg shadow-accent/30">
        ◎
      </div>
      <h1 className="text-2xl font-bold tracking-tight">You&apos;re signed in</h1>
      <p className="mt-2 text-sm text-gray-400">
        One more tap to finish in the app.
      </p>
      <a href={deepLink} className="btn btn-primary mt-8 min-h-12 w-full px-4 shadow-lg shadow-accent/20">
        Open Your ETA
      </a>
      <p className="mt-4 text-xs text-gray-500">
        You can close this tab once the app opens.
      </p>
    </div>
  );
}

export default function NativeCallbackPage() {
  return (
    <Suspense fallback={null}>
      <NativeCallback />
    </Suspense>
  );
}
