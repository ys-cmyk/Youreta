import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-[1000] border-b border-white/10 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/events" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="text-accent-bright">◎</span> Rally
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/events" className="text-gray-300 hover:text-white">
                Events
              </Link>
              <Link
                href="/events/new"
                className="rounded-full bg-accent px-3 py-1.5 font-semibold text-white hover:bg-accent-bright"
              >
                Host event
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-gray-400 hover:text-white"
                  title={user.email ?? undefined}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-gray-300 hover:text-white">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
