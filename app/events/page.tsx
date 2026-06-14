import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function EventsPage() {
  const supabase = await createClient();
  // Show events starting from ~12h ago onward. Per-request current time is a
  // legitimate read in a server component rendered fresh on every request.
  // eslint-disable-next-line react-hooks/purity
  const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data } = await supabase
    .from("ec_events")
    .select("*")
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true })
    .returns<EventRow[]>();
  const upcoming = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Upcoming events</h1>
        <Link
          href="/events/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright"
        >
          + Host
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="mt-10 rounded-xl border border-white/10 bg-card p-8 text-center text-sm text-gray-400">
          No upcoming events yet.{" "}
          <Link href="/events/new" className="text-accent-bright hover:underline">
            Host the first one →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {upcoming.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="block rounded-xl border border-white/10 bg-card p-4 transition-colors hover:border-accent/60"
              >
                <div className="text-xs uppercase tracking-wide text-accent-bright">
                  {formatWhen(e.starts_at)}
                </div>
                <div className="mt-1 text-lg font-semibold">{e.title}</div>
                {e.venue_name && (
                  <div className="mt-0.5 text-sm text-gray-400">📍 {e.venue_name}</div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
