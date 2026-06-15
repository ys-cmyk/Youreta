"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/constants";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-72 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

const inputClass =
  "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-accent";

export default function NewEventPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const browserTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
  const [form, setForm] = useState({
    title: "",
    description: "",
    coverImageUrl: "",
    locationType: "in_person" as "in_person" | "virtual",
    virtualUrl: "",
    venueName: "",
    venueAddress: "",
    startsAt: "",
    endsAt: "",
    timezone: browserTz,
    radius: DEFAULT_RADIUS_M,
    capacity: "",
    waitlistEnabled: false,
    requiresApproval: false,
    visibility: "public" as "public" | "unlisted" | "private",
    isPaid: false,
    priceDollars: "",
    currency: "USD",
    category: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const isVirtual = form.locationType === "virtual";
    if (!isVirtual && !coords) {
      setError("Drop a pin on the map to set the venue location.");
      return;
    }
    if (isVirtual && !form.virtualUrl.trim()) {
      setError("Add the online meeting link for your virtual event.");
      return;
    }
    if (!form.startsAt) {
      setError("Pick a start time.");
      return;
    }
    setSubmitting(true);

    // Virtual events still satisfy the NOT NULL lat/lng columns; fall back to
    // 0,0 (and a wide geofence) when no pin was dropped.
    const lat = coords?.lat ?? 0;
    const lng = coords?.lng ?? 0;

    const priceCents =
      form.isPaid && form.priceDollars
        ? Math.round(Number(form.priceDollars) * 100)
        : null;

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        locationType: form.locationType,
        virtualUrl: isVirtual ? form.virtualUrl.trim() || null : null,
        venueName: form.venueName || null,
        venueAddress: form.venueAddress || null,
        lat,
        lng,
        geofenceRadiusM: Number(form.radius),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        timezone: form.timezone || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        waitlistEnabled: form.waitlistEnabled,
        requiresApproval: form.requiresApproval,
        visibility: form.visibility,
        isPaid: form.isPaid,
        priceCents,
        currency: form.isPaid ? form.currency || null : null,
        category: form.category.trim() || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(json.error ?? "Could not create event.");
      return;
    }
    router.push(`/events/${json.id}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Host an event</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Rooftop meetup"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="What's happening?"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Cover image URL</label>
            <input
              type="url"
              value={form.coverImageUrl}
              onChange={(e) => update("coverImageUrl", e.target.value)}
              placeholder="https://…/cover.jpg"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Category (optional)</label>
            <input
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="Meetup, Workshop…"
              className={inputClass}
            />
          </div>
        </div>

        {/* Location type ---------------------------------------------------- */}
        <div>
          <label className="mb-1 block text-sm text-gray-400">Location</label>
          <div className="mb-3 flex gap-2">
            {(["in_person", "virtual"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update("locationType", t)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  form.locationType === t
                    ? "bg-accent text-white"
                    : "border border-white/15 text-gray-300 hover:border-accent/60"
                }`}
              >
                {t === "in_person" ? "In person" : "Virtual"}
              </button>
            ))}
          </div>
        </div>

        {form.locationType === "virtual" ? (
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Online meeting link
            </label>
            <input
              type="url"
              value={form.virtualUrl}
              onChange={(e) => update("virtualUrl", e.target.value)}
              placeholder="https://zoom.us/j/…"
              className={inputClass}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Venue name</label>
                <input
                  value={form.venueName}
                  onChange={(e) => update("venueName", e.target.value)}
                  placeholder="The Roof"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Address</label>
                <input
                  value={form.venueAddress}
                  onChange={(e) => update("venueAddress", e.target.value)}
                  placeholder="123 Main St"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Venue location — click the map to drop a pin
              </label>
              <MapPicker value={coords} onChange={setCoords} radiusM={Number(form.radius)} />
              {coords && (
                <p className="mt-1 text-xs text-gray-500">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-400">
                Check-in radius: <span className="text-white">{form.radius} m</span>
              </label>
              <input
                type="range"
                min={MIN_RADIUS_M}
                max={500}
                step={10}
                value={form.radius}
                onChange={(e) => update("radius", Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
              <p className="text-xs text-gray-500">
                Guests can check in only within this distance (max {MAX_RADIUS_M} m).
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Starts</label>
            <input
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => update("startsAt", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Ends (optional)</label>
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => update("endsAt", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Time zone</label>
          <input
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            placeholder="America/New_York"
            className={inputClass}
          />
        </div>

        {/* Registration ---------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Capacity (optional)
            </label>
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => update("capacity", e.target.value)}
              placeholder="Unlimited"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) =>
                update("visibility", e.target.value as typeof form.visibility)
              }
              className={inputClass}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-card p-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => update("requiresApproval", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Require approval to register</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.waitlistEnabled}
              onChange={(e) => update("waitlistEnabled", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Enable waitlist once capacity is reached</span>
          </label>
        </div>

        {/* Ticketing ------------------------------------------------------- */}
        <div className="space-y-3 rounded-xl border border-white/10 bg-card p-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.isPaid}
              onChange={(e) => update("isPaid", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>Paid event</span>
          </label>
          {form.isPaid && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Price</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceDollars}
                  onChange={(e) => update("priceDollars", e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Currency</label>
                <input
                  value={form.currency}
                  onChange={(e) =>
                    update("currency", e.target.value.toUpperCase().slice(0, 3))
                  }
                  placeholder="USD"
                  className={inputClass}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Stored as event metadata — checkout/payment collection is a follow-up.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}
