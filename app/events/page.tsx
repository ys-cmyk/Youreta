import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Destinations the user hosts, plus destinations they've joined.
  const [{ data: hosted }, { data: joinedRows }] = await Promise.all([
    user
      ? supabase
          .from("ec_events")
          .select("*")
          .eq("host_id", user.id)
          .returns<EventRow[]>()
      : Promise.resolve({ data: [] as EventRow[] }),
    user
      ? supabase
          .from("ec_rsvps")
          .select("event_id")
          .eq("user_id", user.id)
          .returns<{ event_id: string }[]>()
      : Promise.resolve({ data: [] as { event_id: string }[] }),
  ]);

  const joinedIds = (joinedRows ?? []).map((r) => r.event_id);
  const { data: joined } = joinedIds.length
    ? await supabase
        .from("ec_events")
        .select("*")
        .in("id", joinedIds)
        .returns<EventRow[]>()
    : { data: [] as EventRow[] };

  const byId = new Map<string, EventRow>();
  for (const e of [...(hosted ?? []), ...(joined ?? [])]) byId.set(e.id, e);
  const destinations = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Your destinations</h1>
        <Link
          href="/events/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright"
        >
          + New
        </Link>
      </div>

      {destinations.length === 0 ? (
        <div className="mt-10 rounded-xl border border-white/10 bg-card p-8 text-center text-sm text-gray-400">
          No destinations yet.{" "}
          <Link href="/events/new" className="text-accent-bright hover:underline">
            Create one →
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {destinations.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="block rounded-xl border border-white/10 bg-card p-4 transition-colors hover:border-accent/60"
              >
                <div className="text-lg font-semibold">{e.title}</div>
                {e.venue_address && (
                  <div className="mt-0.5 text-sm text-gray-400">
                    📍 {e.venue_address}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
