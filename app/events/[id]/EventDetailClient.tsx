"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { EventRow, LocationPing, Participant, Rsvp } from "@/lib/types";
import { distanceMeters, formatDistance } from "@/lib/geo";
import {
  ARRIVAL_RADIUS_M,
  ETA_AUTO_MIN_MOVE_M,
  ETA_AUTO_RECOMPUTE_MS,
  PING_INTERVAL_MS,
  STALE_PING_MS,
} from "@/lib/constants";
import type { LivePerson, MapFocus } from "@/components/LiveMap";
import {
  isNativePlatform,
  startBackgroundWatch,
  stopBackgroundWatch,
} from "@/lib/native/backgroundLocation";
import BackgroundLocationDisclosure from "@/components/BackgroundLocationDisclosure";

// How long location sharing stays on. "arrive" auto-stops once you reach the
// destination; the timed modes auto-stop after a fixed duration.
type ShareMode = "arrive" | "15m" | "1h";
const SHARE_DURATION_MS: Record<Exclude<ShareMode, "arrive">, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};
type ShareSetting = { mode: ShareMode; startedAt: number };

// How the current user's ETA is chosen. "auto" derives it from their live
// location (driving time to the destination, recomputed as they move);
// "manual" is a value they set explicitly via the chips / time picker.
type EtaMode = "auto" | "manual";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => <div className="card h-[26rem] animate-pulse" />,
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

// Whole minutes between now and an ETA, floored at 0. Used for the "· 12 min"
// suffix on the live ETA label.
function etaMinutesFromNow(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  return mins < 0 ? 0 : mins;
}

// Compact "time since" label for ping freshness, e.g. "12s", "2m", "1h".
function formatAgo(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
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
  const router = useRouter();

  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [myRsvp, setMyRsvp] = useState<Rsvp | null>(initialMyRsvp);
  const [etaInput, setEtaInput] = useState(toTimeInput(initialMyRsvp?.eta ?? null));
  const [savingRsvp, setSavingRsvp] = useState(false);

  // ETA source: auto (from live location) vs manual. Persisted per-event so a
  // reload keeps the user's choice. Defaults to auto.
  const [etaMode, setEtaMode] = useState<EtaMode>("auto");

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

  // --- Map focus (tap a person to fly to their marker) -------------------
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // --- Background-location prominent disclosure (native shell only) ------
  // Google Play requires an in-app disclosure with explicit accept BEFORE the
  // OS background-location permission prompt. null = not yet loaded from
  // storage (blocks both the dialog and the watcher for a tick), false = not
  // yet accepted (dialog shows while sharing is on), true = accepted (persisted
  // once, app-wide). Declining just flips sharing off — we ask again next time.
  const [bgConsent, setBgConsent] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setBgConsent(localStorage.getItem("yeta:bgloc-consent") === "granted");
    } catch {
      setBgConsent(false);
    }
  }, []);
  const acceptBgDisclosure = useCallback(() => {
    setBgConsent(true);
    try {
      localStorage.setItem("yeta:bgloc-consent", "granted");
    } catch {
      // storage blocked — consent holds for this session only
    }
  }, []);

  // The "You" controls section, so the mobile sticky bar can scroll to it.
  const youSectionRef = useRef<HTMLElement | null>(null);

  // --- Share-location duration (client-side only) ------------------------
  // Persisted per-event in localStorage so a reload continues the countdown.
  const shareStorageKey = `yeta:share:${event.id}`;
  const [shareSetting, setShareSetting] = useState<ShareSetting>({
    mode: "arrive",
    startedAt: Date.now(),
  });
  // Load the stored setting on mount. If sharing is already on but nothing is
  // stored, treat the start as now.
  const shareLoaded = useRef(false);
  useEffect(() => {
    if (shareLoaded.current) return;
    shareLoaded.current = true;
    try {
      const raw = localStorage.getItem(shareStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ShareSetting;
        if (
          parsed &&
          (parsed.mode === "arrive" ||
            parsed.mode === "15m" ||
            parsed.mode === "1h") &&
          typeof parsed.startedAt === "number"
        ) {
          setShareSetting(parsed);
          return;
        }
      }
    } catch {
      // corrupt/blocked storage — fall through to a fresh default
    }
    setShareSetting({ mode: "arrive", startedAt: Date.now() });
  }, [shareStorageKey]);

  // Persist whenever the setting changes (after the initial load).
  useEffect(() => {
    if (!shareLoaded.current) return;
    try {
      localStorage.setItem(shareStorageKey, JSON.stringify(shareSetting));
    } catch {
      // ignore storage failures; behavior degrades to in-memory only
    }
  }, [shareSetting, shareStorageKey]);

  // Pick a sharing duration. Changing the mode (re)starts the countdown now.
  const setShareMode = useCallback((mode: ShareMode) => {
    setShareSetting({ mode, startedAt: Date.now() });
  }, []);

  // --- Save participation (join / update eta / toggle sharing) -----------
  const saveRsvp = useCallback(
    async (next: { eta?: string | null; shareLocation?: boolean }) => {
      const wasJoined = myRsvp !== null;
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
        // Joining is what makes co-participants visible (reads are
        // members-only): re-run the server component so the full participant
        // list arrives without a manual reload.
        if (!wasJoined) router.refresh();
      }
    },
    [event.id, myRsvp, currentUserId, router]
  );

  // After a router.refresh() (e.g. right after auto-join), fold the freshly
  // fetched server participant list into state. My own row keeps its local
  // rsvp (state is the source of truth for my in-flight edits); rows the
  // server doesn't know about yet are preserved.
  useEffect(() => {
    setParticipants((prev) => {
      const mine = prev.find((p) => p.rsvp.user_id === currentUserId);
      const merged = initialParticipants.map((p) =>
        mine && p.rsvp.user_id === currentUserId ? { ...p, rsvp: mine.rsvp } : p
      );
      const known = new Set(initialParticipants.map((p) => p.rsvp.user_id));
      const extras = prev.filter((p) => !known.has(p.rsvp.user_id));
      return [...merged, ...extras];
    });
  }, [initialParticipants, currentUserId]);

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

  // --- Automatic live ETA from my location -------------------------------
  // Load the persisted ETA mode on mount.
  const etaModeStorageKey = `yeta:etamode:${event.id}`;
  const etaModeLoaded = useRef(false);
  useEffect(() => {
    if (etaModeLoaded.current) return;
    etaModeLoaded.current = true;
    try {
      const raw = localStorage.getItem(etaModeStorageKey);
      if (raw === "manual" || raw === "auto") {
        setEtaMode(raw);
        return;
      }
    } catch {
      // corrupt/blocked storage — fall through to the default
    }
    setEtaMode("auto");
  }, [etaModeStorageKey]);

  // Persist whenever the mode changes (after the initial load).
  useEffect(() => {
    if (!etaModeLoaded.current) return;
    try {
      localStorage.setItem(etaModeStorageKey, etaMode);
    } catch {
      // ignore storage failures; behavior degrades to in-memory only
    }
  }, [etaMode, etaModeStorageKey]);

  // Throttling state for the auto ETA: the coords/time of the last computation,
  // and a guard so it never fires concurrently.
  const lastEtaCalcRef = useRef<{ lat: number; lng: number; at: number } | null>(
    null
  );
  const etaComputingRef = useRef(false);

  const recomputeAutoEta = useCallback(
    async (force = false) => {
      if (etaComputingRef.current) return;
      const mine = livePings[currentUserId];
      if (!mine) return;
      const last = lastEtaCalcRef.current;
      if (!force && last) {
        const moved = distanceMeters(
          { lat: mine.lat, lng: mine.lng },
          { lat: last.lat, lng: last.lng }
        );
        const elapsed = Date.now() - last.at;
        if (moved < ETA_AUTO_MIN_MOVE_M && elapsed < ETA_AUTO_RECOMPUTE_MS) return;
      }
      etaComputingRef.current = true;
      try {
        const res = await fetch("/api/eta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { lat: mine.lat, lng: mine.lng },
            to: { lat: event.lat, lng: event.lng },
          }),
        });
        // Mark this position as computed even on non-2xx so we don't hammer the
        // endpoint on repeated failures.
        lastEtaCalcRef.current = { lat: mine.lat, lng: mine.lng, at: Date.now() };
        if (!res.ok) return;
        const json = await res.json();
        if (typeof json.durationSec === "number" && Number.isFinite(json.durationSec)) {
          const eta = new Date(Date.now() + json.durationSec * 1000).toISOString();
          saveRsvp({ eta });
        }
        // null / non-numeric duration: keep the last ETA value.
      } catch {
        // network error — degrade silently, keep the last ETA value
      } finally {
        etaComputingRef.current = false;
      }
    },
    [livePings, currentUserId, event.lat, event.lng, saveRsvp]
  );

  // Recompute when my own latest ping changes, while sharing + in auto mode.
  // The throttle inside recomputeAutoEta caps the call rate.
  useEffect(() => {
    if (!sharing || etaMode !== "auto") return;
    recomputeAutoEta();
  }, [sharing, etaMode, recomputeAutoEta]);

  // Switch back to automatic ETA and recompute immediately.
  const useLiveEta = useCallback(() => {
    setEtaMode("auto");
    lastEtaCalcRef.current = null;
    recomputeAutoEta(true);
  }, [recomputeAutoEta]);

  // --- Broadcast my location while sharing -------------------------------
  // Two transports, one effect:
  //
  // - Native shell (Capacitor): a background watcher from
  //   @capacitor-community/background-geolocation keeps delivering fixes (and
  //   keeps the app's JS alive) while the app is backgrounded / screen off.
  //   The watcher can fire far more often than we want to POST, so sends are
  //   throttled to at most one per PING_INTERVAL_MS via a last-sent ref.
  // - Plain browser: the original foreground setInterval + navigator
  //   .geolocation loop, unchanged (tab must stay open).
  //
  // Cleanup (sharing toggled off, unmount, or the share-duration auto-stop
  // below flipping share_location off via saveRsvp) tears down whichever
  // transport is active — the native watcher is removed via its id ref.
  // Note: on iOS the timed auto-stop's setTimeout fires on the next JS tick
  // the app gets; with the background watcher keeping the app alive for
  // location callbacks, that works even while backgrounded.
  const bgWatcherIdRef = useRef<string | null>(null);
  const lastPingSentAtRef = useRef(0);
  useEffect(() => {
    if (!sharing) return;
    let cancelled = false;

    async function postPing(loc: {
      lat: number;
      lng: number;
      accuracyM: number | null;
    }) {
      try {
        await fetch("/api/pings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            lat: loc.lat,
            lng: loc.lng,
            accuracyM: loc.accuracyM,
          }),
        });
      } catch {
        // ignore transient network errors; the next fix/tick retries
      }
    }

    if (isNativePlatform()) {
      // Native shell: background watcher instead of the foreground interval.
      // Blocked until the prominent disclosure below has been accepted (Play
      // policy) — accepting flips bgConsent, which re-runs this effect.
      if (bgConsent !== true) return;
      lastPingSentAtRef.current = 0;
      startBackgroundWatch((loc) => {
        if (cancelled) return;
        // Throttle: the watcher can fire per movement; POST at most once per
        // PING_INTERVAL_MS.
        const now = Date.now();
        if (now - lastPingSentAtRef.current < PING_INTERVAL_MS) return;
        lastPingSentAtRef.current = now;
        postPing(loc);
      }).then((id) => {
        if (!id) return;
        if (cancelled) {
          // Effect already cleaned up while the watcher was starting.
          stopBackgroundWatch(id);
          return;
        }
        bgWatcherIdRef.current = id;
      });
      return () => {
        cancelled = true;
        if (bgWatcherIdRef.current) {
          stopBackgroundWatch(bgWatcherIdRef.current);
          bgWatcherIdRef.current = null;
        }
      };
    }

    // Browser: existing foreground behavior, untouched.
    async function pushPing() {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        await postPing({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
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
  }, [sharing, event.id, bgConsent]);

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

  // --- Auto-stop sharing when the chosen duration / arrival is reached ----
  // Timed modes: turn off after the elapsed duration. "arrive": turn off once my
  // own latest ping is within ARRIVAL_RADIUS_M of the destination. Either way we
  // flip the existing share_location flag off via the API (no DB column added).
  const expiringShare = useRef(false);
  useEffect(() => {
    if (!sharing) {
      expiringShare.current = false;
      return;
    }
    function stop() {
      if (expiringShare.current) return;
      expiringShare.current = true;
      saveRsvp({ shareLocation: false });
    }

    if (shareSetting.mode === "arrive") {
      const mine = people.find((p) => p.isMe);
      if (mine?.arrived) stop();
      return;
    }

    const duration = SHARE_DURATION_MS[shareSetting.mode];
    const elapsed = Date.now() - shareSetting.startedAt;
    if (elapsed >= duration) {
      stop();
      return;
    }
    const t = setTimeout(stop, duration - elapsed);
    return () => clearTimeout(t);
  }, [sharing, shareSetting, people, saveRsvp]);

  // Tiny hint shown next to the toggle: remaining time, or "until you arrive".
  const shareHint = useMemo(() => {
    if (!sharing) return null;
    if (shareSetting.mode === "arrive") return "until you arrive";
    const remaining =
      SHARE_DURATION_MS[shareSetting.mode] - (now - shareSetting.startedAt);
    if (remaining <= 0) return "stopping…";
    return `stops in ${formatAgo(remaining)}`;
  }, [sharing, shareSetting, now]);

  // "Who's coming", ordered for usefulness: arrived first, then people actively
  // moving (nearest first), then those without a live location.
  const sortedParticipants = useMemo(() => {
    return participants
      .map((p) => {
        const ping = livePings[p.rsvp.user_id];
        const dist = ping
          ? distanceMeters({ lat: ping.lat, lng: ping.lng }, destination)
          : null;
        const arrived = dist != null && dist <= ARRIVAL_RADIUS_M;
        const fresh = ping
          ? now - new Date(ping.created_at).getTime() <= STALE_PING_MS
          : false;
        return { p, dist, arrived, fresh };
      })
      .sort((a, b) => {
        const rank = (x: { arrived: boolean; dist: number | null; fresh: boolean }) =>
          x.arrived ? 0 : x.dist != null && x.fresh ? 1 : 2;
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 1 && a.dist != null && b.dist != null) return a.dist - b.dist;
        return 0;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, livePings, now, destination.lat, destination.lng]);

  // Soonest upcoming arrival, for the header summary.
  const soonestEta = useMemo(() => {
    const upcoming = participants
      .map((p) => p.rsvp.eta)
      .filter((e): e is string => !!e && new Date(e).getTime() > now - 60_000)
      .sort();
    return upcoming[0] ?? null;
  }, [participants, now]);

  // Setup controls (your ETA) lead until you've set a time; afterward the map +
  // everyone's ETAs lead and your controls drop to a compact summary below.
  const youAtTop = !myRsvp?.eta;

  // The live ETA is active when the user is sharing and hasn't manually
  // overridden it. Used to label the ETA as automatic and to add a "live" tag.
  const autoEtaActive = sharing && etaMode === "auto";
  const myEtaMins = etaMinutesFromNow(myRsvp?.eta ?? null, now);

  // Expand the "You" controls and scroll them into view (used by the mobile
  // sticky bar's ETA action). Reuses the existing etaEditing state.
  const openEtaControls = useCallback(() => {
    setEtaEditing(true);
    requestAnimationFrame(() => {
      youSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const youSection = (
    <section ref={youSectionRef} className="card p-4">
      {!joined ? (
        <>
          <h2 className="section-label">You</h2>
          <button
            disabled={savingRsvp}
            onClick={() => saveRsvp({ shareLocation: true })}
            className="btn btn-primary mt-3 min-h-12 w-full px-4 shadow-lg shadow-accent/20"
          >
            {savingRsvp && <span className="spinner" aria-hidden />}
            {savingRsvp ? "Joining…" : "Join & share my ETA"}
          </button>
        </>
      ) : myRsvp?.eta && !etaEditing ? (
        <div key="you-summary" className="ec-expand flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              {avatarInitials("You")}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">You</span>
                {autoEtaActive && (
                  <span className="pill pill-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    Live
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                {autoEtaActive ? "Live ETA " : "ETA "}
                {formatTime(myRsvp.eta)}
                {autoEtaActive && myEtaMins != null ? ` · ${myEtaMins} min` : ""} ·{" "}
                {sharing ? "Sharing location" : "Not sharing"}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEtaEditing(true)}
            className="btn btn-secondary min-h-9 shrink-0 px-3.5 text-xs"
          >
            Edit
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="section-label">You</h2>
            {myRsvp?.eta && (
              <button
                onClick={() => setEtaEditing(false)}
                className="btn min-h-8 px-2.5 text-xs font-semibold text-gray-400 hover:text-white"
              >
                Done
              </button>
            )}
          </div>
          <div key="you-editing" className="ec-expand mt-3 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  Your ETA
                </label>
                {myRsvp?.eta && (
                  <span className="text-xs font-medium text-accent-bright">
                    {autoEtaActive ? "Live ETA ~" : "Arriving ~"}
                    {formatTime(myRsvp.eta)}
                    {autoEtaActive && myEtaMins != null ? ` · ${myEtaMins} min` : ""}
                  </span>
                )}
              </div>

              {/* Live vs manual ETA control (only meaningful while sharing). */}
              {sharing && (
                autoEtaActive ? (
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-bright" />
                    Live ETA — updates automatically as you move. Set a time below
                    to override.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={useLiveEta}
                    className="chip chip-on mb-2 min-h-9 px-3.5 text-xs font-semibold"
                  >
                    Use live ETA
                  </button>
                )
              )}

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
                      setEtaMode("manual");
                      saveRsvp({ eta: iso });
                      setEtaEditing(false);
                    }}
                    className="chip min-h-10 px-3.5 text-sm"
                  >
                    {m < 60 ? `${m} min` : "1 hr"}
                  </button>
                ))}
              </div>

              {/* Or pick an exact arrival time */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">or arrive at</span>
                <input
                  type="time"
                  value={etaInput}
                  onChange={(e) => setEtaInput(e.target.value)}
                  className="input min-h-10 w-auto px-3 py-1.5"
                />
                <button
                  type="button"
                  disabled={savingRsvp || !etaInput}
                  onClick={() => {
                    setEtaMode("manual");
                    saveRsvp({ eta: isoFromTime(etaInput) });
                    setEtaEditing(false);
                  }}
                  className="btn btn-secondary min-h-10 px-4 text-sm"
                >
                  Set
                </button>
                {myRsvp?.eta && (
                  <button
                    type="button"
                    disabled={savingRsvp}
                    onClick={() => {
                      setEtaInput("");
                      setEtaMode("auto");
                      saveRsvp({ eta: null });
                    }}
                    className="btn min-h-10 px-2.5 text-xs font-semibold text-gray-400 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={sharing}
                  disabled={savingRsvp}
                  onChange={(e) => {
                    if (e.target.checked) setShareMode(shareSetting.mode);
                    saveRsvp({ shareLocation: e.target.checked });
                  }}
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
                <span>Share my live location on the way</span>
                {shareHint && (
                  <span className="ml-auto shrink-0 text-xs text-accent-bright">
                    {shareHint}
                  </span>
                )}
              </label>

              {/* How long to keep sharing on. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
                <span className="text-xs text-gray-400">for</span>
                {(
                  [
                    ["arrive", "Until I arrive"],
                    ["15m", "15 min"],
                    ["1h", "1 hour"],
                  ] as [ShareMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setShareMode(mode)}
                    aria-pressed={shareSetting.mode === mode}
                    className={`chip min-h-9 px-3 text-xs ${
                      shareSetting.mode === mode ? "chip-on" : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="mt-2 pl-8 text-xs text-gray-500">
                On by default. Anyone with this destination&apos;s link can see
                your live location until sharing stops.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );

  const inviteSection = inviteOpen ? (
    <section key="invite-open" className="card ec-expand border-accent/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Invite people to share their ETA
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            Anyone with this link can join and see everyone&apos;s live location
            and ETA.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(false)}
          className="btn -mr-1 min-h-8 shrink-0 px-2.5 text-xs font-semibold text-gray-400 hover:text-white"
        >
          Hide
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 truncate text-sm text-gray-300"
        />
        <button
          onClick={copyLink}
          className="btn btn-primary min-h-11 shrink-0 px-4 text-sm"
        >
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <a
          href={mailtoHref}
          className="btn btn-secondary min-h-11 flex-1 px-4 text-sm"
        >
          Email invite
        </a>
        <button
          onClick={shareSheet}
          className="btn btn-secondary min-h-11 flex-1 px-4 text-sm"
        >
          Share…
        </button>
      </div>
    </section>
  ) : (
    <section
      key="invite-closed"
      className="card ec-expand flex items-center justify-between gap-3 p-3"
    >
      <div className="min-w-0 pl-1">
        <div className="text-sm font-semibold">Invite people</div>
        <div className="truncate text-xs text-gray-400">
          Share the link so others can share their ETA
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={copyLink}
          className={`btn btn-secondary min-h-10 px-3.5 text-sm ${
            copied ? "text-going" : ""
          }`}
        >
          {copied ? "✓ Copied" : "Copy link"}
        </button>
        <button
          onClick={() => setInviteOpen(true)}
          className="btn btn-primary min-h-10 px-3.5 text-sm"
        >
          Invite
        </button>
      </div>
    </section>
  );

  return (
    <div className="space-y-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      {sharing && bgConsent === false && isNativePlatform() && (
        <BackgroundLocationDisclosure
          onAccept={acceptBgDisclosure}
          onDecline={() => saveRsvp({ shareLocation: false })}
        />
      )}
      <header>
        <Link
          href="/events"
          className="inline-flex min-h-8 items-center rounded-lg text-xs text-gray-400 transition-colors hover:text-white"
        >
          ← Destinations
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
            {event.venue_name && (
              <p className="mt-1 text-sm text-gray-300">
                📍 {event.venue_name}
                {event.venue_address ? ` · ${event.venue_address}` : ""}
              </p>
            )}
          </div>
          {isHost && (
            <Link
              href={`/events/${event.id}/edit`}
              className="btn btn-secondary min-h-9 shrink-0 px-3.5 text-xs"
            >
              Edit
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {participants.length} {participants.length === 1 ? "person" : "people"}
          {" · "}
          {arrivedCount > 0 ? (
            <span className="font-medium text-going">
              {arrivedCount} arrived
            </span>
          ) : (
            "0 arrived"
          )}
          {soonestEta ? ` · next ~${formatTime(soonestEta)}` : ""}
        </p>
      </header>

      {/* Setup leads only until your ETA is set. */}
      {youAtTop && youSection}

      {/* Live map — the hero */}
      <section>
        <h2 className="section-label mb-2">
          Live map{" "}
          <span className="font-normal normal-case tracking-normal text-gray-500">
            · everyone on the way
          </span>
        </h2>
        <LiveMap destination={destination} people={people} focus={focus} />
      </section>

      {/* Who's coming */}
      <section>
        <h2 className="section-label mb-2">
          Who&apos;s coming{" "}
          <span className="font-normal text-gray-500">· {participants.length}</span>
        </h2>
        <ul className="card divide-y divide-white/10 overflow-hidden">
          {sortedParticipants.length === 0 && (
            <li className="p-4 text-sm text-gray-400">
              No one has joined yet — share the invite link below.
            </li>
          )}
          {sortedParticipants.map(({ p, dist, arrived, fresh }) => {
            const isYou = p.rsvp.user_id === currentUserId;
            const displayName = isYou ? "You" : p.name;
            const avatarColor = arrived
              ? "var(--going)"
              : fresh
              ? "var(--accent)"
              : "var(--declined)";
            const ping = livePings[p.rsvp.user_id];
            // Freshness derived from the latest ping vs the polled `now`.
            const agoLabel = ping
              ? `updated ${formatAgo(now - new Date(ping.created_at).getTime())} ago`
              : "no location yet";
            // Only people with a live location can be focused on the map.
            const canFocus = !!ping;
            const focusPerson = () => {
              if (!ping) return;
              setFocus({ lat: ping.lat, lng: ping.lng, key: Date.now() });
            };
            return (
              <li key={p.rsvp.id}>
                <div
                  role={canFocus ? "button" : undefined}
                  tabIndex={canFocus ? 0 : undefined}
                  onClick={canFocus ? focusPerson : undefined}
                  onKeyDown={
                    canFocus
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            focusPerson();
                          }
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 focus-visible:[outline-offset:-2px] ${
                    canFocus ? "cursor-pointer hover:bg-white/[0.05]" : ""
                  }`}
                  aria-label={
                    canFocus ? `Focus ${displayName} on the map` : undefined
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: avatarColor }}
                    >
                      {avatarInitials(displayName)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {displayName}
                        </span>
                        {isYou && autoEtaActive && (
                          <span className="pill pill-accent shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                            Live
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {p.rsvp.eta
                          ? `${isYou && autoEtaActive ? "Live ETA" : "ETA"} ${formatTime(
                              p.rsvp.eta
                            )}`
                          : "No ETA set"}
                        {" · "}
                        <span className="text-gray-500">{agoLabel}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {arrived ? (
                      <span className="pill pill-going">✓ Arrived</span>
                    ) : fresh && dist != null ? (
                      <span className="pill pill-accent">
                        {formatDistance(dist)} away
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Compact controls drop below once you're set up. */}
      {!youAtTop && youSection}
      {inviteSection}

      {/* Mobile-only sticky action bar: keep sharing + ETA reachable while the
          map fills the screen. Desktop relies on the inline "You" section. */}
      {joined && (
        <div
          className="fixed inset-x-0 bottom-0 z-[1000] border-t border-white/10 bg-background/85 backdrop-blur sm:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            <button
              type="button"
              disabled={savingRsvp}
              onClick={() => {
                if (!sharing) setShareMode(shareSetting.mode);
                saveRsvp({ shareLocation: !sharing });
              }}
              className={`btn min-h-11 flex-1 px-3 text-sm ${
                sharing ? "btn-primary" : "btn-secondary"
              }`}
              aria-pressed={sharing}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  sharing ? "ec-pulse-dot bg-white" : "bg-gray-500"
                }`}
              />
              {sharing ? "Sharing on" : "Sharing off"}
            </button>
            <button
              type="button"
              onClick={openEtaControls}
              className="btn btn-secondary min-h-11 flex-1 px-3 text-sm"
            >
              {myRsvp?.eta ? `ETA ${formatTime(myRsvp.eta)}` : "Set ETA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
