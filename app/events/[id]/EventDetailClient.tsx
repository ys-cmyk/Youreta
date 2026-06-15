"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Attendee, EventRow, LocationPing, Rsvp, RsvpStatus } from "@/lib/types";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { PING_INTERVAL_MS, STALE_PING_MS } from "@/lib/constants";
import type { LivePerson } from "@/components/LiveMap";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-80 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

const STATUS_LABEL: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  declined: "Can't go",
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 5_000,
    });
  });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventDetailClient({
  event,
  currentUserId,
  isHost,
  initialAttendees,
  initialMyRsvp,
}: {
  event: EventRow;
  currentUserId: string;
  isHost: boolean;
  initialAttendees: Attendee[];
  initialMyRsvp: Rsvp | null;
}) {
  const venue = { lat: event.lat, lng: event.lng };

  const [myRsvp, setMyRsvp] = useState<Rsvp | null>(initialMyRsvp);
  const [etaInput, setEtaInput] = useState(toLocalInput(initialMyRsvp?.eta ?? null));
  const [savingRsvp, setSavingRsvp] = useState(false);

  const myInitialCheckin =
    initialAttendees.find((a) => a.rsvp.user_id === currentUserId)?.checkin ?? null;
  const [checkedIn, setCheckedIn] = useState(myInitialCheckin !== null);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [checkinOk, setCheckinOk] = useState<boolean | null>(
    myInitialCheckin ? true : null
  );
  const [checkingIn, setCheckingIn] = useState(false);

  // Live pings keyed by user_id (current position of everyone en route).
  const [livePings, setLivePings] = useState<Record<string, LocationPing>>(() => {
    const seed: Record<string, LocationPing> = {};
    for (const a of initialAttendees) if (a.lastPing) seed[a.rsvp.user_id] = a.lastPing;
    return seed;
  });

  const nameByUser = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of initialAttendees) m[a.rsvp.user_id] = a.name;
    return m;
  }, [initialAttendees]);

  // `now` is refreshed by the ping poll below so staleness/distance re-evaluate
  // over time without calling an impure clock during render.
  const [now, setNow] = useState(() => Date.now());

  const sharing = myRsvp?.share_location ?? false;

  // --- RSVP save ---------------------------------------------------------
  const saveRsvp = useCallback(
    async (next: { status?: RsvpStatus; eta?: string | null; shareLocation?: boolean }) => {
      const status = next.status ?? myRsvp?.status ?? "going";
      const eta =
        next.eta !== undefined
          ? next.eta
          : etaInput
          ? new Date(etaInput).toISOString()
          : null;
      const shareLocation = next.shareLocation ?? myRsvp?.share_location ?? false;

      setSavingRsvp(true);
      const res = await fetch("/api/rsvps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, status, eta, shareLocation }),
      });
      const json = await res.json();
      setSavingRsvp(false);
      if (res.ok) setMyRsvp(json.rsvp);
    },
    [event.id, etaInput, myRsvp]
  );

  // --- Check in ----------------------------------------------------------
  async function handleCheckIn() {
    setCheckingIn(true);
    setCheckinMsg("");
    try {
      const pos = await getPosition();
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCheckinOk(false);
        setCheckinMsg(json.error ?? "Check-in failed.");
      } else if (json.ok) {
        setCheckedIn(true);
        setCheckinOk(true);
        setCheckinMsg(`Checked in! You were ${formatDistance(json.distance_m)} away.`);
      } else {
        setCheckinOk(false);
        setCheckinMsg(
          `You're ${formatDistance(json.distance_m)} away — get within ${formatDistance(
            json.radius_m
          )} to check in.`
        );
      }
    } catch (err) {
      setCheckinOk(false);
      setCheckinMsg(
        err instanceof GeolocationPositionError || (err as Error)?.message
          ? "Couldn't get your location. Allow location access and try again."
          : "Check-in failed."
      );
    } finally {
      setCheckingIn(false);
    }
  }

  // --- Broadcast my location while sharing & not yet checked in ----------
  useEffect(() => {
    if (!sharing || checkedIn) return;
    let cancelled = false;

    async function pushPing() {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await fetch("/api/pings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? null,
          }),
        });
      } catch {
        // ignore transient geolocation errors; the next tick retries
      }
    }

    pushPing();
    const t = setInterval(pushPing, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sharing, checkedIn, event.id]);

  // --- Poll everyone's latest pings for the live map ---------------------
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/pings?eventId=${event.id}`);
      if (!res.ok || cancelled) return;
      const json = await res.json();
      const map: Record<string, LocationPing> = {};
      for (const p of json.pings as LocationPing[]) map[p.user_id] = p;
      setLivePings(map);
      setNow(Date.now());
    }
    poll();
    const t = setInterval(poll, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [event.id]);

  // --- Derived: live people for the map ----------------------------------
  const people: LivePerson[] = useMemo(() => {
    return Object.values(livePings).map((p) => {
      const stale = now - new Date(p.created_at).getTime() > STALE_PING_MS;
      const dist = distanceMeters({ lat: p.lat, lng: p.lng }, venue);
      const isMe = p.user_id === currentUserId;
      const baseName = nameByUser[p.user_id] ?? "Guest";
      return {
        id: p.user_id,
        name: isMe ? `${baseName} (you)` : baseName,
        lat: p.lat,
        lng: p.lng,
        stale,
        distanceLabel: formatDistance(dist),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePings, now, currentUserId, nameByUser, venue.lat, venue.lng]);

  const goingCount = initialAttendees.filter((a) => a.rsvp.status === "going").length;
  const checkedInCount = initialAttendees.filter((a) => a.checkin).length;

  const isVirtual = event.location_type === "virtual";
  const priceLabel =
    event.is_paid && event.price_cents != null
      ? `${(event.price_cents / 100).toLocaleString(undefined, {
          style: "currency",
          currency: event.currency || "USD",
        })}`
      : event.is_paid
      ? "Paid"
      : null;

  return (
    <div className="space-y-6">
      <header>
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            className="mb-4 h-48 w-full rounded-xl border border-white/10 object-cover"
          />
        )}
        <div className="text-xs uppercase tracking-wide text-accent-bright">
          {new Date(event.starts_at).toLocaleString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {event.timezone ? ` · ${event.timezone}` : ""}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{event.title}</h1>

        <div className="mt-2 flex flex-wrap gap-2">
          {event.category && (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-gray-200">
              {event.category}
            </span>
          )}
          {isVirtual && (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent-bright">
              Virtual
            </span>
          )}
          {event.visibility !== "public" && (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold capitalize text-gray-200">
              {event.visibility}
            </span>
          )}
          {priceLabel && (
            <span className="rounded-full bg-going/15 px-2.5 py-1 text-xs font-semibold text-going">
              {priceLabel}
            </span>
          )}
        </div>

        {isVirtual ? (
          event.virtual_url && (
            <p className="mt-2 text-gray-300">
              💻{" "}
              <a
                href={event.virtual_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent-bright underline underline-offset-2 hover:text-accent"
              >
                Join online
              </a>
            </p>
          )
        ) : (
          event.venue_name && (
            <p className="mt-1 text-gray-300">
              📍 {event.venue_name}
              {event.venue_address ? ` · ${event.venue_address}` : ""}
            </p>
          )
        )}

        {event.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">
            {event.description}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {goingCount} going
          {event.capacity != null ? ` / ${event.capacity}` : ""} · {checkedInCount}{" "}
          checked in
          {!isVirtual ? ` · check-in radius ${formatDistance(event.geofence_radius_m)}` : ""}
          {event.requires_approval ? " · approval required" : ""}
          {event.waitlist_enabled ? " · waitlist on" : ""}
          {isHost ? " · you host this" : ""}
        </p>
      </header>

      {/* RSVP + check-in panel */}
      <section className="rounded-xl border border-white/10 bg-card p-4">
        <h2 className="text-sm font-semibold text-gray-300">Your RSVP</h2>
        <div className="mt-3 flex gap-2">
          {(["going", "maybe", "declined"] as RsvpStatus[]).map((s) => {
            const active = myRsvp?.status === s;
            return (
              <button
                key={s}
                disabled={savingRsvp}
                onClick={() => saveRsvp({ status: s })}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-accent text-white"
                    : "border border-white/15 text-gray-300 hover:border-accent/60"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>

        {myRsvp && myRsvp.status !== "declined" && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Your ETA (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={etaInput}
                  onChange={(e) => setEtaInput(e.target.value)}
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-accent"
                />
                <button
                  disabled={savingRsvp}
                  onClick={() =>
                    saveRsvp({ eta: etaInput ? new Date(etaInput).toISOString() : null })
                  }
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent/60 disabled:opacity-50"
                >
                  Save ETA
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={sharing}
                disabled={savingRsvp || checkedIn}
                onChange={(e) => saveRsvp({ shareLocation: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                Share my live location while I&apos;m on the way
                {checkedIn && <span className="text-gray-500"> (stops after check-in)</span>}
              </span>
            </label>

            <div>
              <button
                disabled={checkingIn || checkedIn}
                onClick={handleCheckIn}
                className="w-full rounded-full bg-going px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {checkedIn ? "✓ Checked in" : checkingIn ? "Locating…" : "Check in"}
              </button>
              {checkinMsg && (
                <p
                  className={`mt-2 text-sm ${
                    checkinOk ? "text-going" : "text-amber-400"
                  }`}
                >
                  {checkinMsg}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Live map (in-person events only) */}
      {!isVirtual && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-300">
            Live map{" "}
            <span className="font-normal text-gray-500">
              · venue + people on the way
            </span>
          </h2>
          <LiveMap venue={venue} radiusM={event.geofence_radius_m} people={people} />
        </section>
      )}

      {/* Attendee list */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-300">
          Guests ({initialAttendees.length})
        </h2>
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-card">
          {initialAttendees.length === 0 && (
            <li className="p-4 text-sm text-gray-500">No RSVPs yet.</li>
          )}
          {initialAttendees.map((a) => {
            const ping = livePings[a.rsvp.user_id];
            const liveDist = ping
              ? formatDistance(distanceMeters({ lat: ping.lat, lng: ping.lng }, venue))
              : null;
            const enRouteFresh =
              ping && now - new Date(ping.created_at).getTime() <= STALE_PING_MS;
            return (
              <li key={a.rsvp.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {a.name}
                    {a.rsvp.user_id === currentUserId && (
                      <span className="text-gray-500"> (you)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {STATUS_LABEL[a.rsvp.status]}
                    {a.rsvp.eta && ` · ETA ${formatTime(a.rsvp.eta)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {a.checkin ? (
                    <span className="rounded-full bg-going/15 px-2.5 py-1 font-semibold text-going">
                      ✓ Checked in
                    </span>
                  ) : enRouteFresh && liveDist ? (
                    <span className="rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent-bright">
                      {liveDist} away
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
