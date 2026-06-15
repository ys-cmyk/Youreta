"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlaceAutocomplete, { type PlaceResult } from "@/components/PlaceAutocomplete";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-56 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

const inputClass =
  "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-accent";

export default function NewDestinationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!place) {
      setError("Search for and select a destination.");
      return;
    }
    setSubmitting(true);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: name.trim() || place.label,
        venueName: place.label,
        venueAddress: place.address || null,
        lat: place.lat,
        lng: place.lng,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(json.error ?? "Could not create destination.");
      return;
    }
    router.push(`/events/${json.id}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">New destination</h1>
      <p className="mt-1 text-sm text-gray-400">
        Pick a place, share the link, and track each other on the way.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Destination</label>
          <PlaceAutocomplete onSelect={setPlace} />
          {place && (
            <p className="mt-1 text-xs text-gray-500">
              {place.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`}
            </p>
          )}
        </div>

        {place && (
          <MapPicker value={{ lat: place.lat, lng: place.lng }} />
        )}

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Name (optional)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={place?.label ?? "Defaults to the place name"}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create destination"}
        </button>
      </form>
    </div>
  );
}
