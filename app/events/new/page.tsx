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
  const [form, setForm] = useState({
    title: "",
    description: "",
    venueName: "",
    venueAddress: "",
    startsAt: "",
    endsAt: "",
    radius: DEFAULT_RADIUS_M,
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!coords) {
      setError("Drop a pin on the map to set the venue location.");
      return;
    }
    if (!form.startsAt) {
      setError("Pick a start time.");
      return;
    }
    setSubmitting(true);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        venueName: form.venueName || null,
        venueAddress: form.venueAddress || null,
        lat: coords.lat,
        lng: coords.lng,
        geofenceRadiusM: Number(form.radius),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
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
