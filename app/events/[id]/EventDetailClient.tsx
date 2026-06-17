"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

// ISO -> "HH:MM" for an <input type="time"> in the user's local zone.
function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// "HH:MM" (today, local) -> ISO. If that time already passed, assume tomorrow.
function isoFromTime(hhmm: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

// Minutes from now -> ISO.
function isoFromMinutes(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

// 1–2 uppercase initials for a participant avatar.
function avatarInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const [etaInput, setEtaInput] = useState(toTimeInput(initialMyRsvp?.eta ?? null));
  const [savingRsvp, setSavingRsvp] = useState(false);

  // --- Invite / share -----------------------------------------------------
  const [copied, setCopied] = useState(false);
  // Invite is expanded when you're the only one here (so you're nudged to
  // invite), and collapses to a compact bar once others have joined. The ETA
  // controls collapse to a one-line summary once you've set a time. Both keep
  // the map + everyone's ETAs as the focus.
  const [inviteOpen, setInviteOpen] = useState(initialParticipants.length <= 1);
  const [etaEditing, setEtaEditing] = useState(false);
  // Built on the client so the link + email href are ready for rendering.
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(`${window.location.origin}/events/${event.id}`);
  }, [event.id]);

  const mailtoHref = `mailto:?subject=${encodeURIComponent(
    `Share your ETA to ${event.title}`
  )}&body=${encodeURIComponent(
    `I'm headed to ${event.title}. Open this link to share your ETA and ` +
      `track each other on the way:\n\n${shareUrl}`
  )}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; the link stays visible to copy manually
    }
  }
  async function shareSheet() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `Share your ETA to ${event.title}`,
          url: shareUrl,
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
      const eta = next.eta !== undefined ? next.eta : myRsvp?.eta ?? null;
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
    [event.id, myRsvp, currentUserId]
  );

  // Opening an invite link makes you a participant automatically, so the
  // destination is shared to your account (it shows in your Destinations list)
  // and your ETA can be tracked. Location sharing defaults on, gated by the
  // browser's location permission; turn it off with the toggle below.
  const autoJoinAttempted = useRef(false);
  useEffect(() => {
    if (joined || savingRsvp || autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    saveRsvp({ shareLocation: true });
  }, [joined, savingRsvp, saveRsvp]);

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
        isMe,
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
          {isHost && (
            <Link
              href={`/events/${event.id}/edit`}
              className="shrink-0 text-xs text-gray-400 hover:text-white"
            >
              Edit destination
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {participants.length} {participants.length === 1 ? "person" : "people"} ·{" "}
          {arrivedCount} arrived
          {isHost ? " · you set this destination" : ""}
        </p>
      </header>

      {/* Invite / share */}
      {inviteOpen ? (
        <section className="rounded-xl border border-accent/30 bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">
                Invite people to share their ETA
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Anyone with this link can join and see everyone&apos;s live
                location and ETA.
              </p>
            </div>
            <button
              onClick={() => setInviteOpen(false)}
              className="shrink-0 text-xs text-gray-400 hover:text-white"
            >
              Hide
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
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
            <a
              href={mailtoHref}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-gray-200 hover:border-accent/60"
            >
              Email invite
            </a>
            <button
              onClick={shareSheet}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent/60"
            >
              Share…
            </button>
          </div>
        </section>
      ) : (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-card p-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-200">Invite people</div>
            <div className="truncate text-xs text-gray-500">
              Share the link so others can share their ETA
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={copyLink}
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:border-accent/60"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-bright"
            >
              Invite
            </button>
          </div>
        </section>
      )}

      {/* Your participation — collapses to a one-line summary once your ETA is
          set, so the map + everyone's ETAs get the screen. */}
      <section className="rounded-xl border border-white/10 bg-card p-4">
        {!joined ? (
          <>
            <h2 className="text-sm font-semibold text-gray-300">You</h2>
            <button
              disabled={savingRsvp}
              onClick={() => saveRsvp({ shareLocation: true })}
              className="mt-3 w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
            >
              {savingRsvp ? "Joining…" : "Join & share my ETA"}
            </button>
          </>
        ) : myRsvp?.eta && !etaEditing ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {avatarInitials("You")}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">You</div>
                <div className="text-xs text-gray-500">
                  ETA {formatTime(myRsvp.eta)} ·{" "}
                  {sharing ? "Sharing location" : "Not sharing"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setEtaEditing(true)}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-accent/60"
            >
              Edit
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">You</h2>
              {myRsvp?.eta && (
                <button
                  onClick={() => setEtaEditing(false)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Done
                </button>
              )}
            </div>
            <div className="mt-3 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm text-gray-400">Your ETA</label>
                  {myRsvp?.eta && (
                    <span className="text-xs font-medium text-accent-bright">
                      Arriving ~{formatTime(myRsvp.eta)}
                    </span>
                  )}
                </div>

                {/* One tap: arrive in N minutes from now */}
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 30, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={savingRsvp}
                      onClick={() => {
                        const iso = isoFromMinutes(m);
                        setEtaInput(toTimeInput(iso));
                        saveRsvp({ eta: iso });
                        setEtaEditing(false);
                      }}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-medium text-gray-200 hover:border-accent/60 disabled:opacity-50"
                    >
                      {m < 60 ? `${m} min` : "1 hr"}
                    </button>
                  ))}
                </div>

                {/* Or pick an exact arrival time */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">or arrive at</span>
                  <input
                    type="time"
                    value={etaInput}
                    onChange={(e) => setEtaInput(e.target.value)}
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-white focus:border-transparent focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="button"
                    disabled={savingRsvp || !etaInput}
                    onClick={() => {
                      saveRsvp({ eta: isoFromTime(etaInput) });
                      setEtaEditing(false);
                    }}
                    className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent/60 disabled:opacity-50"
                  >
                    Set
                  </button>
                  {myRsvp?.eta && (
                    <button
                      type="button"
                      disabled={savingRsvp}
                      onClick={() => {
                        setEtaInput("");
                        saveRsvp({ eta: null });
                      }}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Clear
                    </button>
                  )}
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
          </>
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
        <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-card">
          {participants.length === 0 && (
            <li className="p-4 text-sm text-gray-500">No one has joined yet.</li>
          )}
          {participants.map((p) => {
            const isYou = p.rsvp.user_id === currentUserId;
            const displayName = isYou ? "You" : p.name;
            const ping = livePings[p.rsvp.user_id];
            const dist = ping
              ? distanceMeters({ lat: ping.lat, lng: ping.lng }, destination)
              : null;
            const arrived = dist != null && dist <= ARRIVAL_RADIUS_M;
            const fresh =
              ping && now - new Date(ping.created_at).getTime() <= STALE_PING_MS;
            const avatarColor = arrived
              ? "var(--going)"
              : fresh
              ? "var(--accent)"
              : "var(--declined)";
            return (
              <li
                key={p.rsvp.id}
                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: avatarColor }}
                  >
                    {avatarInitials(displayName)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{displayName}</div>
                    <div className="text-xs text-gray-500">
                      {p.rsvp.eta ? `ETA ${formatTime(p.rsvp.eta)}` : "No ETA set"}
                    </div>
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
