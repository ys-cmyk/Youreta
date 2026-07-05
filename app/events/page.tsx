import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, LocationPing, Rsvp } from "@/lib/types";
import { distanceMeters } from "@/lib/geo";
import { ARRIVAL_RADIUS_M } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function DestinationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Destinations the user hosts, plus destinations they've joined — two
  // parallel queries; the joined set embeds the event through the rsvp->event
  // foreign key, avoiding a second sequential round-trip.
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
          .select("ec_events(*)")
          .eq("user_id", user.id)
          .returns<{ ec_events: EventRow | null }[]>()
      : Promise.resolve({ data: [] as { ec_events: EventRow | null }[] }),
  ]);

  const joined = (joinedRows ?? [])
    .map((r) => r.ec_events)
    .filter((e): e is EventRow => e !== null);

  const byId = new Map<string, EventRow>();
  for (const e of [...(hosted ?? []), ...joined]) byId.set(e.id, e);
  const destinations = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // The most recent destination becomes a live hero card: most users have ONE
  // plan at a time, so lead with its live state (people / arrived / next ETA)
  // rather than a flat list. Two small parallel queries just for the hero.
  const hero = destinations[0] ?? null;
  const rest = destinations.slice(1);
  let heroStats: { people: number; arrived: number; nextEta: string | null } | null =
    null;
  if (hero) {
    const now = Date.now();
    const pingCutoff = new Date(now - 15 * 60_000).toISOString();
    const [{ data: heroRsvps }, { data: heroPings }] = await Promise.all([
      supabase
        .from("ec_rsvps")
        .select("user_id, eta")
        .eq("event_id", hero.id)
        .returns<Pick<Rsvp, "user_id" | "eta">[]>(),
      supabase
        .from("ec_location_pings")
        .select("user_id, lat, lng, created_at")
        .eq("event_id", hero.id)
        .gte("created_at", pingCutoff)
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<Pick<LocationPing, "user_id" | "lat" | "lng" | "created_at">[]>(),
    ]);
    const latestByUser = new Map<string, { lat: number; lng: number }>();
    for (const p of heroPings ?? []) {
      if (!latestByUser.has(p.user_id)) latestByUser.set(p.user_id, p);
    }
    let arrived = 0;
    for (const pos of latestByUser.values()) {
      if (distanceMeters(pos, { lat: hero.lat, lng: hero.lng }) <= ARRIVAL_RADIUS_M) {
        arrived++;
      }
    }
    const upcoming = (heroRsvps ?? [])
      .map((r) => r.eta)
      .filter((e): e is string => !!e && new Date(e).getTime() > now - 60_000)
      .sort();
    heroStats = {
      people: heroRsvps?.length ?? 0,
      arrived,
      nextEta: upcoming[0] ?? null,
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Your destinations</h1>
        <Link
          href="/events/new"
          className="btn btn-primary min-h-10 shrink-0 px-4 text-sm"
        >
          <span className="sm:hidden">+ New</span>
          <span className="hidden sm:inline">+ New destination</span>
        </Link>
      </div>

      {destinations.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl">
            📍
          </div>
          <p className="font-semibold">No destinations yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-400">
            Create a destination, share the link, and track each other on the
            way.
          </p>
          <Link
            href="/events/new"
            className="btn btn-primary mt-6 min-h-11 px-5 text-sm shadow-lg shadow-accent/20"
          >
            Create your first destination
          </Link>
        </div>
      ) : (
        <>
          {hero && (
            <Link
              href={`/events/${hero.id}`}
              className="group relative mt-6 block overflow-hidden rounded-2xl border border-accent/40 bg-card p-5 transition-all duration-150 hover:border-accent/70 hover:shadow-lg hover:shadow-accent/10"
            >
              {/* Soft accent glow so the live plan reads as the main event. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl"
              />
              <div className="section-label">Happening now</div>
              <div className="mt-2 truncate text-xl font-bold tracking-tight">
                {hero.title}
              </div>
              {hero.venue_address && (
                <div className="mt-0.5 truncate text-sm text-gray-400">
                  📍 {hero.venue_address}
                </div>
              )}
              {heroStats && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="pill pill-accent">
                    {heroStats.people}{" "}
                    {heroStats.people === 1 ? "person" : "people"}
                  </span>
                  {heroStats.arrived > 0 && (
                    <span className="pill pill-going">
                      ✓ {heroStats.arrived} arrived
                    </span>
                  )}
                  {heroStats.nextEta && (
                    <span className="text-gray-400">
                      next ~{formatTime(heroStats.nextEta)}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-bright">
                Open live map
                <span
                  aria-hidden
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
            </Link>
          )}

          {rest.length > 0 && (
            <>
              <h2 className="section-label mt-8">Earlier</h2>
              <ul className="mt-3 space-y-3">
                {rest.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className="card group flex items-center justify-between gap-3 p-4 transition-all duration-150 hover:border-accent/60 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/20"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{e.title}</div>
                        {e.venue_address && (
                          <div className="mt-0.5 truncate text-sm text-gray-400">
                            📍 {e.venue_address}
                          </div>
                        )}
                      </div>
                      <span
                        aria-hidden
                        className="shrink-0 text-gray-500 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent-bright"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
