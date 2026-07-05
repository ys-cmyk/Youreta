import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    // getSession() reads the cookie without a network round-trip — the nav only
    // decides which links to show. Real auth enforcement (token validation +
    // refresh) already happened in the middleware's getUser() on this request,
    // so this is display-only and saves a Supabase auth call on every page.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch {
    // Never let the global nav take down every page over an auth/config hiccup.
    return null;
  }
}

export async function Nav() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-[1000] border-b border-white/10 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link
          href="/events"
          className="flex items-center gap-2 font-bold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="text-accent-bright">◎</span> Your ETA
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link
                href="/events"
                className="text-gray-300 transition-colors hover:text-white"
              >
                Destinations
              </Link>
              <Link
                href="/events/new"
                className="rounded-full bg-accent px-3 py-1.5 font-semibold text-white transition-colors hover:bg-accent-bright"
              >
                New destination
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-gray-400 transition-colors hover:text-white"
                  title={user.email ?? undefined}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="text-gray-300 transition-colors hover:text-white"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
