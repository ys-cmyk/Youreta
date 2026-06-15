"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EventRow, LocationPing, Participant, Rsvp } from "@/lib/types";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { ARRIVAL_RADIUS_M, PING_INTERVAL_MS, STALE_PING_MS } from "@/lib/constants";
import type { LivePerson } from "@/components/LiveMap";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="h-80 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

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

// ISO -> value for a <input type="datetime-local"> in the user's local zone.
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
  initialParticipants,
  initialMyRsvp,
}: {
  event: EventRow;
  currentUserId: string;
  isHost: boolean;
  initialParticipants: Participant[];
  initialMyRsvp: Rsvp | null;
}) {
  const destination = { lat: event.lat, lng: event.lng };

  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [myRsvp, setMyRsvp] = useState<Rsvp | null>(initialMyRsvp);
  const [etaInput, setEtaInput] = useState(toLocalInput(initialMyRsvp?.eta ?? null));
  const [savingRsvp, setSavingRsvp] = useState(false);

  // --- Invite / share -----------------------------------------------------
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function destinationUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/events/${event.id}`;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(destinationUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; the link stays visible to copy manually
    }
  }
  function emailInvite() {
    const url = destinationUrl();
    const subject = encodeURIComponent(`Share your ETA to ${event.title}`);
    const body = encodeURIComponent(
      `I'm headed to ${event.title}. Open this link to share your ETA and ` +
        `track each other on the way:\n\n${url}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
  async function shareSheet() {
    const url = destinationUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `Share your ETA to ${event.title}`,
          url,
        });
        return;
      } catch {
        // user dismissed the share sheet
      }
    }
    copyLink();
  }

  // Live pings keyed by user_id (current position of everyone converging).
  const [livePings, setLivePings] = useState<Record<string, LocationPing>>(() => {
    const seed: Record<string, LocationPing> = {};
    for (const p of initialParticipants) if (p.lastPing) seed[p.rsvp.user_id] = p.lastPing;
    return seed;
  });

  const nameByUser = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of participants) m[p.rsvp.user_id] = p.name;
    return m;
  }, [participants]);

  const etaByUser = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const p of participants) m[p.rsvp.user_id] = p.rsvp.eta;
    return m;
  }, [participants]);

  // `now` is refreshed by the ping poll below so staleness/distance re-evaluate
  // over time without calling an impure clock during render.
  const [now, setNow] = useState(() => Date.now());

  const joined = myRsvp !== null;
  const sharing = myRsvp?.share_location ?? false;

  // --- Save participation (join / update eta / toggle sharing) -----------
  const saveRsvp = useCallback(
    async (next: { eta?: string | null; shareLocation?: boolean }) => {
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
        body: JSON.stringify({ eventId: event.id, eta, shareLocation }),
      });
      const json = await res.json();
      setSavingRsvp(false);
      if (res.ok) {
        const rsvp = json.rsvp as Rsvp;
        setMyRsvp(rsvp);
        // Reflect my latest row in the participant list immediately.
        setParticipants((prev) => {
          const mine = prev.find((p) => p.rsvp.user_id === currentUserId);
          if (mine) {
            return prev.map((p) =>
              p.rsvp.user_id === currentUserId ? { ...p, rsvp } : p
            );
          }
          return [...prev, { rsvp, name: "You", lastPing: null }];
        });
      }
    },
    [event.id, etaInput, myRsvp, currentUserId]
  );

  // --- Broadcast my location while sharing -------------------------------
  useEffect(() => {
    if (!sharing) return;
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
  }, [sharing, event.id]);

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
      const dist = distanceMeters({ lat: p.lat, lng: p.lng }, destination);
      const arrived = dist <= ARRIVAL_RADIUS_M;
      const isMe = p.user_id === currentUserId;
      const baseName = nameByUser[p.user_id] ?? "Guest";
      return {
        id: p.user_id,
        name: isMe ? `${baseName} (you)` : baseName,
        lat: p.lat,
        lng: p.lng,
        stale,
        arrived,
        distanceLabel: formatDistance(dist),
        etaLabel: etaByUser[p.user_id] ? formatTime(etaByUser[p.user_id]) : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePings, now, currentUserId, nameByUser, etaByUser, destination.lat, destination.lng]);

  const arrivedCount = people.filter((p) => p.arrived).length;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
            {event.venue_name && (
              <p className="mt-1 text-gray-300">
                📍 {event.venue_name}
                {event.venue_address ? ` · ${event.venue_address}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={() => setShareOpen((v) => !v)}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright"
          >
            Share your ETA
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {participants.length} {participants.length === 1 ? "person" : "people"} ·{" "}
          {arrivedCount} arrived
          {isHost ? " · you set this destination" : ""}
        </p>
      </header>

      {/* Invite / share */}
      {shareOpen && (
        <section className="rounded-xl border border-accent/30 bg-card p-4">
          <h2 className="text-sm font-semibold text-gray-200">
            Invite people to share their ETA
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Anyone with this link can join and see everyone&apos;s live location
            and ETA.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={destinationUrl()}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-gray-300"
            />
            <button
              onClick={copyLink}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={emailInvite}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent/60"
            >
              Email invite
            </button>
            <button
              onClick={shareSheet}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent/60"
            >
              Share…
            </button>
          </div>
        </section>
      )}

      {/* Your participation */}
      <section className="rounded-xl border border-white/10 bg-card p-4">
        <h2 className="text-sm font-semibold text-gray-300">You</h2>

        {!joined ? (
          <button
            disabled={savingRsvp}
            onClick={() => saveRsvp({ shareLocation: true })}
            className="mt-3 w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
          >
            {savingRsvp ? "Joining…" : "Join & share my ETA"}
          </button>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Your ETA</label>
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

            <div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={sharing}
                  disabled={savingRsvp}
                  onChange={(e) => saveRsvp({ shareLocation: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Share my live location on the way</span>
              </label>
              <p className="mt-1 pl-7 text-xs text-gray-500">
                On by default. Everyone with this destination&apos;s link can see
                your live location until you turn this off.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Live map */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-300">
          Live map{" "}
          <span className="font-normal text-gray-500">
            · destination + everyone on the way
          </span>
        </h2>
        <LiveMap destination={destination} people={people} />
      </section>

      {/* Participant list */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-300">
          Participants ({participants.length})
        </h2>
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-card">
          {participants.length === 0 && (
            <li className="p-4 text-sm text-gray-500">No one has joined yet.</li>
          )}
          {participants.map((p) => {
            const ping = livePings[p.rsvp.user_id];
            const dist = ping
              ? distanceMeters({ lat: ping.lat, lng: ping.lng }, destination)
              : null;
            const arrived = dist != null && dist <= ARRIVAL_RADIUS_M;
            const fresh =
              ping && now - new Date(ping.created_at).getTime() <= STALE_PING_MS;
            return (
              <li
                key={p.rsvp.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {p.rsvp.user_id === currentUserId ? "You" : p.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.rsvp.eta ? `ETA ${formatTime(p.rsvp.eta)}` : "No ETA set"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {arrived ? (
                    <span className="rounded-full bg-going/15 px-2.5 py-1 font-semibold text-going">
                      ✓ Arrived
                    </span>
                  ) : fresh && dist != null ? (
                    <span className="rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent-bright">
                      {formatDistance(dist)} away
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
