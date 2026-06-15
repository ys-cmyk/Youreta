"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import PlaceAutocomplete, { type PlaceResult } from "@/components/PlaceAutocomplete";
import type { EventRow } from "@/lib/types";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-56 animate-pulse rounded-xl border border-white/10 bg-card" />
  ),
});

const inputClass =
  "w-full rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-accent";

export default function EditDestinationClient({ event }: { event: EventRow }) {
  const router = useRouter();
  const [name, setName] = useState(event.title);
  // Seed with the current location; only replaced if the host picks a new place.
  const [place, setPlace] = useState<PlaceResult>({
    label: event.venue_name || event.title,
    address: event.venue_address || "",
    lat: event.lat,
    lng: event.lng,
  });
  const [changingPlace, setChangingPlace] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
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
      setError(json.error ?? "Could not save changes.");
      return;
    }
    router.push(`/events/${event.id}`);
    router.refresh();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this destination? Everyone's ETAs and locations for it will be removed. This can't be undone."
      )
    ) {
      return;
    }
    setError("");
    setDeleting(true);
    const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not delete.");
      return;
    }
    router.push("/events");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Edit destination</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={place.label}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Destination</label>
          <p className="text-sm text-gray-300">
            {place.label}
            {place.address ? ` · ${place.address}` : ""}
          </p>
          {!changingPlace ? (
            <button
              type="button"
              onClick={() => setChangingPlace(true)}
              className="mt-2 text-sm text-accent-bright hover:underline"
            >
              Change location
            </button>
          ) : (
            <div className="mt-2">
              <PlaceAutocomplete onSelect={(p) => p && setPlace(p)} />
            </div>
          )}
        </div>

        <MapPicker value={{ lat: place.lat, lng: place.lng }} />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || deleting}
          className="w-full rounded-full bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-bright disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting || deleting}
          className="w-full rounded-full border border-red-500/40 px-4 py-3 font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete destination"}
        </button>
      </form>
    </div>
  );
}
